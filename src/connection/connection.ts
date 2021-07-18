import BigNumber from "bignumber.js";
import {PeerNode} from "../peer-node"; //todo reduce dependency?
import {Keypair, xdr} from "stellar-base";
import {err, ok, Result} from "neverthrow";
import * as net from 'net';
import {Socket} from 'net';
import {ConnectionAuthentication} from "./connection-authentication";
import {createSHA256Hmac, verifyHmac} from "../crypto-helper";
import {Duplex} from "stream";
import {Logger} from "winston";
import xdrMessageCreator from "./handshake-message-creator";
import {Config} from "../config";
import xdrBufferConverter from "./xdr-buffer-converter";
import * as async from "async";
import {AuthenticatedMessageV0, parseAuthenticatedMessageXDR} from "./xdr-message-handler"

const StellarBase = require('stellar-base');
import StellarMessage = xdr.StellarMessage;
import MessageType = xdr.MessageType;

enum ReadState {
    ReadyForLength,
    ReadyForMessage,
    Blocked
}

enum HandshakeState {
    CONNECTING,
    CONNECTED,
    GOT_HELLO,
    COMPLETED
}

/**
 * Duplex stream that wraps a tcp socket and handles the handshake to a stellar core node and all authentication verification of overlay messages. It encapsulates incoming and outgoing connections to and from stellar nodes.
 *
 * https://github.com/stellar/stellar-core/blob/9c3e67776449ae249aa811e99cbd6eee202bd2b6/src/xdr/Stellar-overlay.x#L219
 * It returns xdr.StellarMessages to the consumer.
 * It accepts xdr.StellarMessages when handshake is completed and wraps them in a correct AuthenticatedMessage before sending
 *
 * inspired by https://www.derpturkey.com/extending-tcp-socket-in-node-js/
 */
export default class Connection extends Duplex {

    public toNode?: PeerNode;
    readonly connectionAuthentication: ConnectionAuthentication;
    protected keyPair: Keypair;
    protected remotePublicKeyECDH?: Buffer;
    protected localNonce: Buffer;
    protected remoteNonce?: Buffer;
    protected localSequence: Buffer;
    protected remoteSequence: Buffer;
    protected socket: Socket;
    protected logger: Logger;
    protected sendingMacKey?: Buffer;
    protected receivingMacKey?: Buffer;
    protected lengthNextMessage: number = 0;
    protected config: Config;
    protected processTransactions: boolean = false;
    protected reading: boolean = false;
    protected readState: ReadState = ReadState.ReadyForLength;
    protected handshakeState: HandshakeState = HandshakeState.CONNECTING;
    protected remoteCalledUs: boolean = true;

    //todo: dedicated connectionConfig
    constructor(keyPair: Keypair, socket: Socket, connectionAuth: ConnectionAuthentication, config: Config, logger: Logger, remoteCalledUs: boolean = false) {
        super({objectMode: true});
        this.socket = socket; //if we initiate, could we create the socket here?
        if(this.socket.readable)
            this.handshakeState = HandshakeState.CONNECTED;
        this.remoteCalledUs = remoteCalledUs;
        this.socket.setTimeout(2500);
        this.connectionAuthentication = connectionAuth;
        this.config = config;
        this.keyPair = keyPair;
        this.localNonce = StellarBase.hash(BigNumber.random().toString());
        this.localSequence = Buffer.alloc(8);
        this.remoteSequence = Buffer.alloc(8);

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
    
    public hostInfo(){
        return this.socket.remoteAddress + ":"+ this.socket.remotePort + (this.remoteCalledUs ? "(callee)" : "(caller)");
    }

    public connect(toNode: PeerNode) {
        this.toNode = toNode;
        this.handshakeState = HandshakeState.CONNECTING;
        this.socket.connect(toNode.port, toNode.ip);
    }

    public isConnected() {
        return this.handshakeState === HandshakeState.COMPLETED;
    }

    public end() {
        this.socket.end();
        return this;
    }

    public destroy(error?: Error) {
        this.socket.destroy(error);
        return this;
    }

    /**
     * Fires when the socket has connected. This method initiates the
     * handshake and if there is a failure, terminates the connection.
     */
    protected onConnected() {
        this.logger.debug("Connected to socket", {'host': this.hostInfo()});
        this.handshakeState = HandshakeState.CONNECTED;
        let result = this.sendHello();
        if (result.isErr()){
            this.logger.error(result.error.message,
                {'host': this.hostInfo()});
            this.socket.destroy();
        }
    }

    protected onReadable() {
        this.logger.debug('Rcv readable event',
            {'host': this.hostInfo()});

        //a socket can receive a 'readable' event when already processing a previous readable event.
        // Because the same internal read buffer is processed (the running whilst loop will also loop over the new data),
        // we can safely ignore it.
        if (this.reading) {
            this.logger.debug('Ignoring, already reading');
            return;
        }

        this.reading = true;

        if (this.socket.readableLength >= this.socket.readableHighWaterMark)
            this.logger.debug('Socket buffer exceeding high watermark',
                {'host': this.hostInfo()});

        let processedMessages = 0;
        async.whilst((cb) => {// async loop to interleave sockets, otherwise handling all the messages in the buffer is a blocking loop
                return cb(null, this.reading);
            },
            (done) => {
                let processError = null;

                if (this.readState === ReadState.ReadyForLength) {
                    if (this.processNextMessageLength()) {
                        this.readState = ReadState.ReadyForMessage;
                    } else {
                        this.reading = false;//we stop processing the buffer
                    }
                }

                if (this.readState === ReadState.ReadyForMessage) {
                    this.processNextMessage()
                        .map(containedAMessage => {
                            if (containedAMessage) {
                                this.readState = ReadState.ReadyForLength;
                                processedMessages++;
                            } else
                                this.reading = false;
                        }).mapErr((error) => {
                            processError = error;
                            this.reading = false;
                    })
                }
                if(this.readState === ReadState.Blocked) {
                    //we don't process anymore messages because consumer cant handle it.
                    // When our internal buffer reaches the highwatermark, the underlying tcp protocol will signal the sender that we can't handle the traffic.
                    this.logger.debug('Reading blocked');
                    this.reading = false;
                }

                if (processError || !this.reading) {
                    done(processError);
                } else {
                    setTimeout(() => done(null), 0);//there is data left, but we want to give other sockets a go in the event loop
                }
            }, (error) => {//function gets called when we are no longer reading
                if (error) {
                    this.logger.error(error.message, {'host': this.hostInfo()});
                    this.socket.destroy();
                }

                this.logger.debug('handled messages in chunk: ' + processedMessages);
            }
        );
    }

    protected processNextMessage(): Result<boolean, Error> {
        //If size bytes are not available to be read, null will be returned unless the stream has ended, in which case all of the data remaining in the internal buffer will be returned.
        let data = this.socket.read(this.lengthNextMessage);
        if (!data) {
            this.logger.debug('Not enough data left in buffer',
                {'host': this.hostInfo()});
            return ok(false);
        }

        let result = parseAuthenticatedMessageXDR(data);//if transactions are not required, we avoid parsing them to objects and verifying the macs to gain performance
        if (result.isErr()) {
            return err(result.error);
        }

        let authenticatedMessageV0XDR = result.value;
        let messageType = authenticatedMessageV0XDR.messageTypeXDR.readInt32BE(0);
        this.logger.debug('Rcv msg of type: ' + messageType + ' with seq: ' + authenticatedMessageV0XDR.sequenceNumberXDR.readInt32BE(4),
            {'host': this.hostInfo()});

        if (this.handshakeState >= HandshakeState.GOT_HELLO && messageType !== MessageType.errorMsg().value) {
            let result = this.verifyAuthentication(authenticatedMessageV0XDR, messageType, data.slice(4, data.length - 32));
            this.increaseRemoteSequenceByOne();
            if (result.isErr())
                return err(result.error);
        }

        if (!(!this.processTransactions && messageType === MessageType.transaction().value)) {
            try {
                let result = this.handleStellarMessage(StellarMessage.fromXDR(data.slice(12, data.length - 32)));
                if(result.isErr())
                    return err(result.error);
                if(!result.value){
                    this.logger.debug('Consumer cannot handle load, blocked reading', {'host': this.hostInfo()});
                    this.readState = ReadState.Blocked;
                    return ok(false);
                }//could not push message to consumer because of backpressure
            } catch (error) {
                return err(error);
            }
        }

        return ok(true);
    }

    protected verifyAuthentication(authenticatedMessageV0XDR: AuthenticatedMessageV0, messageType: number, body: Buffer): Result<void, Error> {
        if (!this.remoteSequence.equals(authenticatedMessageV0XDR.sequenceNumberXDR)) {//must be handled on main thread because workers could mix up order of messages.
            return err(new Error('Invalid sequence number'));
        }

        if (messageType !== MessageType.transaction().value) {//we ignore transaction msg for the moment
            if (!verifyHmac(authenticatedMessageV0XDR.macXDR, this.receivingMacKey!, body)) {
                return err(new Error('Invalid hmac'));
            }
        }

        return ok(undefined);
    }

    protected processNextMessageLength() {
        this.logger.debug('Parsing msg length',
            {'host': this.hostInfo()});
        let data = this.socket.read(4);
        if (data) {
            this.lengthNextMessage = xdrBufferConverter.getMessageLengthFromXDRBuffer(data);
            this.logger.debug('Next msg length: ' + this.lengthNextMessage,
                {'host': this.hostInfo()});
            return true;
        } else {
            this.logger.debug('Not enough data left in buffer',
                {'host': this.hostInfo()});
            return false;
            //we stay in the ReadyForLength state until the next readable event
        }
    }

    //return true if handling was succesfull, false if consumer was overloaded, Error on error
    protected handleStellarMessage(stellarMessage: StellarMessage): Result<boolean, Error> {
        switch (stellarMessage.switch()) {
            case MessageType.hello():
                this.logger.debug('rcv hello msg',
                    {'host': this.hostInfo()});

                let processHelloMessageResult = this.processHelloMessage(stellarMessage.hello());
                if (processHelloMessageResult.isErr()) {
                    return err(processHelloMessageResult.error);
                }
                this.handshakeState = HandshakeState.GOT_HELLO;

                let result: Result<void, Error>;
                if(this.remoteCalledUs) result = this.sendHello();
                else result = this.sendAuthMessage();

                if (result.isErr()){
                   return err(result.error);
                }
                return ok(true);
            case MessageType.auth():
                this.logger.debug('rcv auth msg',
                    {'host': this.hostInfo()});
                let completedHandshakeResult = this.completeHandshake();
                if(completedHandshakeResult.isErr())
                    return err(completedHandshakeResult.error);
                return ok(true);
            case MessageType.transaction():
                this.logger.debug('rcv transaction msg',
                    {'host': this.hostInfo()});
                return ok(true);
            default: // we push the message to the consumer
                return ok(this.push(stellarMessage));
        }
    }

    protected sendHello(): Result<void, Error> {
        this.logger.debug("send HELLO",
            {'host': this.hostInfo()});
        let certResult = xdrMessageCreator.createAuthCert(this.connectionAuthentication);
        if (certResult.isErr())
            return err(certResult.error);

        let helloResult = xdrMessageCreator.createHelloMessage(
            this.keyPair.xdrPublicKey(),
            this.localNonce,
            certResult.value,
            this.connectionAuthentication.networkId,
            this.config.ledgerVersion,
            this.config.overlayVersion,
            this.config.overlayMinVersion,
            this.config.versionString,
            this.config.listeningPort
        );

        if (helloResult.isErr()) {
            return err(helloResult.error);
        }

        return this.sendStellarMessage(
            //@ts-ignore
            helloResult.value
        );
    }

    protected completeHandshake(): Result<void, Error> {
        if(this.remoteCalledUs){
            let authResult = this.sendAuthMessage();
            if(authResult.isErr())
                return err(authResult.error);
        }

        this.logger.debug("Handshake Completed",
            {'host': this.hostInfo()});
        this.handshakeState = HandshakeState.COMPLETED
        this.socket.setTimeout(30000);

        this.emit("connect");
        this.emit("ready");

        return ok(undefined);
    }

    public sendStellarMessage(message: StellarMessage): Result<void, Error> {
        this.logger.debug("Sending message of type: " + message.switch().name,
            {'host': this.hostInfo()});
        let authMsgResult = this.authenticateMessage(message);
        if (message.switch() !== MessageType.hello() && message.switch() !== MessageType.errorMsg())
            this.increaseLocalSequenceByOne();

        if (authMsgResult.isErr())
            return err(authMsgResult.error);

        let result = this.writeMessageToSocket(this.socket, authMsgResult.value);
        if (result.isErr()){
            return err(result.error);
        }

        return ok(result.value);
    }

    protected sendAuthMessage(): Result<void, Error> {
        this.logger.debug('send auth msg',
            {'host': this.hostInfo()});

        let authMessageResult = xdrMessageCreator.createAuthMessage();
        if(authMessageResult.isErr())
            return err(authMessageResult.error);

        return this.sendStellarMessage(
            //@ts-ignore
            authMessageResult.value
        );
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
            return err(new Error("authenticateMessage failed: " + error.message));
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

        try {
            this.remoteNonce = hello.nonce();
            this.remotePublicKeyECDH = hello.cert().pubkey().key();
            this.toNode = new PeerNode(this.socket.remoteAddress!, this.socket.remotePort!);
            this.toNode.updateFromHelloMessage(hello);
            this.sendingMacKey = this.connectionAuthentication.getSendingMacKey(this.localNonce, this.remoteNonce, this.remotePublicKeyECDH, !this.remoteCalledUs);
            this.receivingMacKey = this.connectionAuthentication.getReceivingMacKey(this.localNonce, this.remoteNonce, this.remotePublicKeyECDH, !this.remoteCalledUs);
            return ok(undefined);
        }catch (error){
            return err(error);
        }

    }

    protected writeMessageToSocket(socket: net.Socket, message: xdr.AuthenticatedMessage): Result<void, Error> {
        if (!socket.writable)
            return err(new Error("Socket not writable"));

        let bufferResult = xdrBufferConverter.getXdrBufferFromMessage(message);
        if (bufferResult.isErr()) {
            return err(bufferResult.error);
        }

        this.logger.debug('Writing msg to buffer: ' + bufferResult.value.toString('base64'), {'host': this.hostInfo()});
        if (!socket.write(bufferResult.value)) //todo backpressure
            return err(new Error("Could not write to socket"));

        return ok(undefined);
    }

    //socket methods
    public _read() {
        if (this.handshakeState !== HandshakeState.COMPLETED) {
            return;
        }

        if (this.readState === ReadState.Blocked) {//the consumer wants to read again
            this.logger.debug('ReadState unblocked by consumer',
                {'host': this.hostInfo()});
            this.readState = ReadState.ReadyForLength;
        }
        // Trigger a read but wait until the end of the event loop.
        // This is necessary when reading in paused mode where
        // _read was triggered by stream.read() originating inside
        // a "readable" event handler. Attempting to push more data
        // synchronously will not trigger another "readable" event.
        setImmediate(() => this.onReadable());
    }

    public _write(message: StellarMessage, encoding: string, cb: (err: Error) => void) {
        let result = this.sendStellarMessage(message);
        if(result.isErr())
            cb(result.error);
    }

    _final(cb: any) {
        this.socket.end(cb);
    }
}