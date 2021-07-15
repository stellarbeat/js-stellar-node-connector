import BigNumber from "bignumber.js";

const StellarBase = require('stellar-base');
import {PeerNode} from "../peer-node"; //todo reduce dependency?
import {Keypair, xdr} from "stellar-base";
import {err, ok, Result} from "neverthrow";
import {Socket} from 'net';
import {ConnectionAuthentication} from "./connection-authentication";
import {createSHA256Hmac, verifyHmac} from "../crypto-helper";
import {Duplex} from "stream";
import {Logger} from "winston";
import xdrMessageCreator from "./handshake-message-creator";
import {Config} from "../config";
import StellarMessage = xdr.StellarMessage;
import MessageType = xdr.MessageType;
import * as net from "net";
import xdrBufferConverter from "./xdr-buffer-converter";
import * as async from "async";
import {
    parseAuthenticatedMessageXDR
} from "./xdr-message-handler"

/**
 * Duplex stream that wraps a tcp socket and handles the handshake to a stellar core node and all authentication verification of overlay messages.
 * https://github.com/stellar/stellar-core/blob/9c3e67776449ae249aa811e99cbd6eee202bd2b6/src/xdr/Stellar-overlay.x#L219
 * It returns xdr.StellarMessages to the consumer.
 * It accepts xdr.StellarMessages when handshake is completed and wraps them in a correct AuthenticatedMessage before sending
 *
 * todo add connectionState for cleaner code
 * inspired by https://www.derpturkey.com/extending-tcp-socket-in-node-js/
 */
export default class Connection extends Duplex {

    readonly toNode: PeerNode;
    readonly connectionAuthentication: ConnectionAuthentication;
    protected keyPair: Keypair;
    protected remotePublicKeyECDH?: Buffer;
    protected localNonce: Buffer;
    protected remoteNonce?: Buffer;
    protected localSequence: Buffer;
    protected remoteSequence: Buffer;
    protected handshakeCompleted: boolean = false;
    protected socket: Socket;
    protected logger: Logger;
    protected sendingMacKey?: Buffer;
    protected receivingMacKey?: Buffer;
    protected parseMessageLength: boolean = true;
    protected lengthNextMessage: number = 0;
    protected networkIDBuffer: Buffer;
    protected config: Config;
    protected processTransactions: boolean = false;
    protected reading: boolean = false;

    //todo: dedicated connectionConfig
    constructor(keyPair: Keypair, toNode: PeerNode, socket: Socket, connectionAuth: ConnectionAuthentication, networkIDBuffer: Buffer, config: Config, logger: Logger) {
        super({objectMode: true});
        this.socket = socket;
        this.socket.setTimeout(2500);
        this.connectionAuthentication = connectionAuth;
        this.networkIDBuffer = networkIDBuffer;
        this.config = config;
        this.keyPair = keyPair;
        this.localNonce = StellarBase.hash(BigNumber.random().toString());
        this.localSequence = Buffer.alloc(8);
        this.remoteSequence = Buffer.alloc(8);
        this.toNode = toNode;

        this.socket.on("close", hadError => this.emit("close", hadError));
        this.socket.on("connect", () => this.onConnected());
        this.socket.on("drain", () => this.emit("drain"));
        this.socket.on("end", () => this.emit("end"));
        this.socket.on("error", error => this.emit("error", error));
        this.socket.on("lookup", (e, a, f, h) => this.emit("lookup", e, a, f, h));
        this.socket.on("readable", () => this.onReadable());
        this.socket.on("timeout", () => this.emit("timeout"));

        this.logger = logger;
    }

    public connect() {
        this.socket.connect(this.toNode.port, this.toNode.ip);
    }

    public isConnected() {
        return this.handshakeCompleted;
    }

    public end() {
        this.socket.end();
        return this;
    }

    public destroy(error?: Error) {
        this.socket.destroy(error);
        return this;
    }

    //todo handshakeMessage should be derived from state
    public sendStellarMessage(message: StellarMessage, handshakeMessage: boolean = false): Result<void, Error> {

        if (handshakeMessage && this.handshakeCompleted)
            return err(new Error("Cannot send msg, handshake already completed"));

        if (!handshakeMessage && this.handshakeCompleted)
            return err(new Error("Cannot send msg, handshake not yet completed"));

        let authMsgResult = this.authenticateMessage(message);
        if (message.switch() !== MessageType.hello())
            this.increaseLocalSequenceByOne();

        if (authMsgResult.isErr())
            return err(authMsgResult.error);

        let result = this.writeMessageToSocket(this.socket, authMsgResult.value);
        if (result.isErr())
            return err(result.error);

        return ok(result.value);
    }

    /**
     * Fires when the socket has connected. This method initiates the
     * handshake and if there is a failure, terminates the connection.
     */
    protected onConnected() {
        let result = this.initiateHandShake();
        if (result.isErr())
            this.logger.debug('error', result.error.message,
                {'host': this.toNode.key});
    }

    protected onReadable() {
        this.logger.debug('Rcv readable event',
            {'host': this.toNode.key});

        if (this.reading) {
            this.logger.debug('Ignoring, already reading');
            return;
        }

        this.reading = true;

        if (this.socket.readableLength >= this.socket.readableHighWaterMark)
            this.logger.debug('Socket buffer exceeding high watermark',
                {'host': this.toNode.key});

        let handledMessages = 0;
        async.whilst((cb) => {// async loop to interleave sockets, otherwise handling all the messages in the buffer is blocking
                return cb(null, this.reading);
            },
            (done) => {
                if (this.parseMessageLength) {
                    this.logger.debug('Parsing msg length',
                        {'host': this.toNode.key});
                    let data = this.socket.read(4);
                    if (data) {
                        this.lengthNextMessage = xdrBufferConverter.getMessageLengthFromXDRBuffer(data);
                        this.logger.debug('Next msg length: ' + this.lengthNextMessage,
                            {'host': this.toNode.key});
                        this.parseMessageLength = false;
                    } else {
                        this.reading = false;
                        this.logger.debug('Not enough data left in chunk',
                            {'host': this.toNode.key});
                    }
                }

                if (!this.parseMessageLength) {
                    //If size bytes are not available to be read, null will be returned unless the stream has ended, in which case all of the data remaining in the internal buffer will be returned.
                    let data = this.socket.read(this.lengthNextMessage);
                    if (!data) {
                        this.reading = false;
                        this.logger.debug('Not enough data left in chunk',
                            {'host': this.toNode.key});
                    } else {
                        let result = parseAuthenticatedMessageXDR(data);//if transactions are not required, we avoid parsing them to objects and verifying the macs to gain performance
                        if (result.isErr()) {
                            return done(new Error('Invalid authenticated msg'));
                        }
                        let authenticatedMessageV0XDR = result.value;

                        let messageType = authenticatedMessageV0XDR.messageTypeXDR.readInt32BE(0);
                        this.logger.debug('Rcv msg of type: ' + messageType + ' with seq: ' + authenticatedMessageV0XDR.sequenceNumberXDR.readInt32BE(4),
                            {'host': this.toNode.key});
                        if (messageType !== MessageType.hello().value && messageType !== MessageType.errorMsg().value) {
                            if (!this.remoteSequence.equals(authenticatedMessageV0XDR.sequenceNumberXDR)) {//must be handled on main thread because workers could mix up order of messages.
                                return done(new Error('Wrong sequence number'));
                            }
                            this.increaseRemoteSequenceByOne();

                            if (messageType !== MessageType.transaction().value) {//we ignore transaction msg for the moment
                                let verified = verifyHmac(authenticatedMessageV0XDR.macXDR, this.receivingMacKey!, data.slice(4, data.length - 32));
                                if (!verified) {
                                    return done(new Error('Wrong hmac'));
                                }
                            }
                        }

                        handledMessages++;
                        this.lengthNextMessage = 0;
                        this.parseMessageLength = true;

                        if (!(!this.processTransactions && messageType === MessageType.transaction().value)) {
                            this.handleStellarMessage(StellarMessage.fromXDR(data.slice(12, data.length - 32)));
                        }

                    }
                }

                if (this.reading){
                    setTimeout(() => done(null),0);//there is data left, but we want to give other sockets a go at the event loop
                }
                else{
                    done(null);//no more reading, we run the callback immediately
                }

            }, (error) => {
                if (error) {
                    this.logger.error(error.message, {'host': this.toNode.key});
                    this.reading = false;
                    this.socket.destroy();
                }
                if (!this.reading) {
                    this.logger.debug('handled messages in chunk: ' + handledMessages);
                }
            }
        );
    }

    protected handleStellarMessage(stellarMessage: StellarMessage) {
        switch (stellarMessage.switch()) {
            case MessageType.hello():
                this.logger.debug('handle hello msg',
                    {'host': this.toNode.key});

                let helloProcessedResult = this.processHelloMessage(stellarMessage.hello());
                if (helloProcessedResult.isOk())
                    this.continueHandshake();
                else {
                    this.logger.info(helloProcessedResult.error.message,
                        {'host': this.toNode.key});
                    this.destroy();
                }
                break;

            case MessageType.auth():
                this.logger.debug('handle auth msg',
                    {'host': this.toNode.key});
                this.finishHandshake();
                break;
            case MessageType.transaction():
                this.logger.debug('handle transaction msg',
                    {'host': this.toNode.key});
                break;
            default:
                this.push(stellarMessage);//todo backpressure
        }

    }

    protected initiateHandShake(): Result<void, Error> {
        this.logger.debug("send HELLO",
            {'host': this.toNode.key});
        let certResult = xdrMessageCreator.createAuthCert(this.connectionAuthentication);
        if (certResult.isErr())
            return err(certResult.error);

        let helloResult = xdrMessageCreator.createHelloMessage(
            this.keyPair.xdrPublicKey(),
            this.localNonce,
            certResult.value,
            this.networkIDBuffer,
            this.config.ledgerVersion,
            this.config.overlayVersion,
            this.config.overlayMinVersion,
            this.config.versionString,
            this.config.listeningPort
        );

        if (helloResult.isErr()) {
            return err(helloResult.error);
        }

        let result = this.sendStellarMessage(
            //@ts-ignore
            helloResult.value,
            true
        );

        if (result.isErr()) {
            return (err(result.error));
        }

        return ok(undefined);
    }


    protected continueHandshake(): void {
        this.logger.debug("send AUTH",
            {'host': this.toNode.key});
        this.sendAuthMessage();
    }

    protected finishHandshake(): void {
        this.logger.info("Fully connected",
            {'host': this.toNode.key});
        this.handshakeCompleted = true;
        this.socket.setTimeout(30000);
        this.emit("connect");
        this.emit("ready");
    }

    protected sendAuthMessage() {
        this.logger.debug('send auth msg',
            {'host': this.toNode.key});

        let result = this.sendStellarMessage(
            xdrMessageCreator.createAuthMessage(),
        );

        if (result.isErr())
            this.logger.debug('send auth msg failed',
                {'host': this.toNode.key, error: result.error.message});
    }

    protected increaseLocalSequenceByOne() {
        this.localSequence = this.increaseBufferByOne(this.localSequence);
    }

    protected increaseBufferByOne(buf: Buffer) { //todo: move to helper
        for (let i = buf.length - 1; i >= 0; i--) {
            if (buf[i]++ !== 255) break;
        }
        return buf;
    }

    protected increaseRemoteSequenceByOne() {
        this.remoteSequence = this.increaseBufferByOne(this.remoteSequence);
    }

    protected authenticateMessage(message: xdr.StellarMessage): Result<xdr.AuthenticatedMessage, Error> {
        try {
            let xdrAuthenticatedMessageV1 = new StellarBase.xdr.AuthenticatedMessageV0({
                sequence: xdr.Uint64.fromXDR(this.localSequence),
                message: message,
                mac: this.getMacForAuthenticatedMessage(message)
            });

            let authenticatedMessage = new StellarBase.xdr.AuthenticatedMessage(0);
            authenticatedMessage.set(0, xdrAuthenticatedMessageV1);

            return ok(authenticatedMessage);
        } catch (error) {
            return err(error);
        }
    }

    protected getMacForAuthenticatedMessage(message: xdr.StellarMessage) {
        let mac;
        if (this.remotePublicKeyECDH === undefined)
            mac = Buffer.alloc(32);
        else
            mac = createSHA256Hmac(Buffer.concat([
                this.localSequence,
                message.toXDR()
            ]), this.sendingMacKey!);

        return new StellarBase.xdr.HmacSha256Mac({
            mac: mac
        });
    }

    protected processHelloMessage(hello: xdr.Hello): Result<void, Error> {
        if (!this.connectionAuthentication.verifyRemoteAuthCert(new Date(), hello.peerId().value(), hello.cert()))
            return err(new Error("Invalid auth cert"));

        this.remoteNonce = hello.nonce();
        this.remotePublicKeyECDH = hello.cert().pubkey().key();
        this.toNode.updateFromHelloMessage(hello);
        this.sendingMacKey = this.connectionAuthentication.getSendingMacKey(this.localNonce, this.remoteNonce, this.remotePublicKeyECDH);
        this.receivingMacKey = this.connectionAuthentication.getReceivingMacKey(this.localNonce, this.remoteNonce, this.remotePublicKeyECDH);

        return ok(undefined);
    }

    protected writeMessageToSocket(socket: net.Socket, message: xdr.AuthenticatedMessage): Result<void, Error> {
        if (!socket.writable)
            return err(new Error("Socket not writable"));

        let bufferResult = xdrBufferConverter.getXdrBufferFromMessage(message);
        if (bufferResult.isErr()) {
            return err(bufferResult.error);
        }

        if (!socket.write(bufferResult.value)) //todo: implement callback to notify when command was sent successfully.
            return err(new Error("Could not write to socket"));

        return ok(undefined);
    }

    //socket methods
    _read() {

    }

    /*_write(stellarMessage, encoding, cb) {
        //validate
        //authenticate
        //write
   }*/

    _final(cb: any) {
        this.socket.end(cb);
    }
}