import BigNumber from "bignumber.js";
import {PeerNode} from "../peer-node"; //todo reduce dependency?
import {Keypair, xdr} from "stellar-base";
import {err, ok, Result} from "neverthrow";
import {Socket} from 'net';
import {ConnectionAuthentication} from "./connection-authentication";
import {createSHA256Hmac, verifyHmac} from "../crypto-helper";
import {Duplex} from "stream";
import {Logger} from "winston";
import xdrMessageCreator from "./handshake-message-creator";
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

export type ConnectionOptions = {
    ip: string;
    port: number;
    keyPair: Keypair;
    ledgerVersion: number;
    overlayVersion: number;
    overlayMinVersion: number;
    versionString: string;
    listeningPort?: number;
    remoteCalledUs: boolean;
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
export class Connection extends Duplex {

    public toNode: PeerNode;//todo remove dependency
    protected keyPair: Keypair;
    protected localLedgerVersion: number;
    protected localOverlayVersion: number;
    protected localOverlayMinVersion: number;
    protected localVersionString: string;
    protected localListeningPort: number = 11625;
    protected remotePublicKeyECDH?: Buffer;
    protected localNonce: Buffer;
    protected remoteNonce?: Buffer;
    protected localSequence: Buffer;
    protected remoteSequence: Buffer;
    protected sendingMacKey?: Buffer;
    protected receivingMacKey?: Buffer;
    protected lengthNextMessage: number = 0;
    protected processTransactions: boolean = false;
    protected reading: boolean = false;
    protected readState: ReadState = ReadState.ReadyForLength;
    protected handshakeState: HandshakeState = HandshakeState.CONNECTING;
    protected remoteCalledUs: boolean = true;
    readonly connectionAuthentication: ConnectionAuthentication;
    protected socket: Socket;
    protected logger: Logger;

    //todo: dedicated connectionConfig
    constructor(connectionOptions: ConnectionOptions, socket: Socket, connectionAuth: ConnectionAuthentication, logger: Logger) {
        super({objectMode: true});
        this.toNode = new PeerNode(connectionOptions.ip, connectionOptions.port);
        this.socket = socket; //if we initiate, could we create the socket here?
        if(this.socket.readable)
            this.handshakeState = HandshakeState.CONNECTED;
        this.remoteCalledUs = connectionOptions.remoteCalledUs;
        this.socket.setTimeout(2500);
        this.connectionAuthentication = connectionAuth;
        this.keyPair = connectionOptions.keyPair;
        this.localNonce = StellarBase.hash(BigNumber.random().toString());
        this.localSequence = Buffer.alloc(8);
        this.remoteSequence = Buffer.alloc(8);

        this.localVersionString = connectionOptions.versionString;
        this.localLedgerVersion = connectionOptions.ledgerVersion;
        this.localOverlayVersion = connectionOptions.overlayVersion;
        this.localOverlayMinVersion = connectionOptions.overlayMinVersion;

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
    
    public remoteHostInfo(){
        return this.socket.remoteAddress + ":"+ this.socket.remotePort + (this.remoteCalledUs ? "(callee)" : "(caller)");
    }

    public connect() {
        this.handshakeState = HandshakeState.CONNECTING;
        this.socket.connect(this.toNode.port, this.toNode.ip);
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
        this.logger.debug("Connected to socket", {'host': this.remoteHostInfo()});
        this.handshakeState = HandshakeState.CONNECTED;
        let result = this.sendHello();
        if (result.isErr()){
            this.logger.error(result.error.message,
                {'host': this.remoteHostInfo()});
            this.socket.destroy(result.error);
        }
    }

    protected onReadable() {
        this.logger.debug('Rcv readable event',
            {'host': this.remoteHostInfo()});

        //a socket can receive a 'readable' event when already processing a previous readable event.
        // Because the same internal read buffer is processed (the running whilst loop will also loop over the new data),
        // we can safely ignore it.
        if (this.reading) {
            this.logger.debug('Ignoring, already reading',
                {'host': this.remoteHostInfo()});
            return;
        }

        this.reading = true;
        //a socket is a duplex stream. It has a write buffer (when we write messages to the socket, to be sent to the peer). And it has a read buffer, data we have to read from the socket, data that is sent by the peer to us. If we don't read the data (or too slow), we will exceed the readableHighWatermark of the socket. This will make the socket stop receiving data or using tcp to signal to the sender that we want to receive the data slower.
        if (this.socket.readableLength >= this.socket.readableHighWaterMark)
            this.logger.debug('Socket buffer exceeding high watermark',
                {'host': this.remoteHostInfo()});

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
                    // When our internal buffer reaches the high watermark, the underlying tcp protocol will signal the sender that we can't handle the traffic.
                    this.logger.debug('Reading blocked',
                        {'host': this.remoteHostInfo()});
                    this.reading = false;
                }

                if (processError || !this.reading) {
                    done(processError);
                } else {
                    setTimeout(() => done(null), 0);//there is data left, but we want to give other sockets a go in the event loop
                }
            }, (error) => {//function gets called when we are no longer reading
                if (error) {
                    this.logger.error(error.message, {'host': this.remoteHostInfo()});
                    this.socket.destroy(error);
                }

                this.logger.debug('handled messages in chunk: ' + processedMessages,
                    {'host': this.remoteHostInfo()});
            }
        );
    }

    protected processNextMessage(): Result<boolean, Error> {
        //If size bytes are not available to be read, null will be returned unless the stream has ended, in which case all of the data remaining in the internal buffer will be returned.
        let data = this.socket.read(this.lengthNextMessage);
        if (!data) {
            this.logger.debug('Not enough data left in buffer',
                {'host': this.remoteHostInfo()});
            return ok(false);
        }

        let result = parseAuthenticatedMessageXDR(data);//if transactions are not required, we avoid parsing them to objects and verifying the macs to gain performance
        if (result.isErr()) {
            return err(result.error);
        }

        let authenticatedMessageV0XDR = result.value;
        let messageType = authenticatedMessageV0XDR.messageTypeXDR.readInt32BE(0);
        this.logger.debug('Rcv msg of type: ' + messageType + ' with seq: ' + authenticatedMessageV0XDR.sequenceNumberXDR.readInt32BE(4),
            {'host': this.remoteHostInfo()});

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
                    this.logger.debug('Consumer cannot handle load, stop reading from socket', {'host': this.remoteHostInfo()});
                    this.readState = ReadState.Blocked;
                    return ok(false);
                }//our read buffer is full, meaning the consumer did not process the messages timely
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
            {'host': this.remoteHostInfo()});
        let data = this.socket.read(4);
        if (data) {
            this.lengthNextMessage = xdrBufferConverter.getMessageLengthFromXDRBuffer(data);
            this.logger.debug('Next msg length: ' + this.lengthNextMessage,
                {'host': this.remoteHostInfo()});
            return true;
        } else {
            this.logger.debug('Not enough data left in buffer',
                {'host': this.remoteHostInfo()});
            return false;
            //we stay in the ReadyForLength state until the next readable event
        }
    }

    //return true if handling was successful, false if consumer was overloaded, Error on error
    protected handleStellarMessage(stellarMessage: StellarMessage): Result<boolean, Error> {
        switch (stellarMessage.switch()) {
            case MessageType.hello():
                this.logger.debug('rcv hello msg',
                    {'host': this.remoteHostInfo()});

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
                    {'host': this.remoteHostInfo()});
                let completedHandshakeResult = this.completeHandshake();
                if(completedHandshakeResult.isErr())
                    return err(completedHandshakeResult.error);
                return ok(true);
            case MessageType.transaction():
                this.logger.debug('rcv transaction msg',
                    {'host': this.remoteHostInfo()});
                return ok(true);
            default: // we push the message to our readable buffer
                return ok(this.push(stellarMessage));
        }
    }

    protected sendHello(): Result<void, Error> {
        this.logger.debug("send HELLO",
            {'host': this.remoteHostInfo()});
        let certResult = xdrMessageCreator.createAuthCert(this.connectionAuthentication);
        if (certResult.isErr())
            return err(certResult.error);

        let helloResult = xdrMessageCreator.createHelloMessage(
            this.keyPair.xdrPublicKey(),
            this.localNonce,
            certResult.value,
            this.connectionAuthentication.networkId,
            this.localLedgerVersion,
            this.localOverlayVersion,
            this.localOverlayMinVersion,
            this.localVersionString,
            this.localListeningPort
        );

        if (helloResult.isErr()) {
            return err(helloResult.error);
        }

        this.write(
            //@ts-ignore
            helloResult.value
        );

        return ok(undefined);
    }

    protected completeHandshake(): Result<void, Error> {
        if(this.remoteCalledUs){
            let authResult = this.sendAuthMessage();
            if(authResult.isErr())
                return err(authResult.error);
        }

        this.logger.debug("Handshake Completed",
            {'host': this.remoteHostInfo()});
        this.handshakeState = HandshakeState.COMPLETED
        this.socket.setTimeout(30000);

        this.emit("connect");
        this.emit("ready");

        return ok(undefined);
    }

    /**
    * Convenience method that encapsulates write. Pass callback that will be invoked when message is successfully sent.
     * Returns: <boolean> false if the stream wishes for the calling code to wait for the 'drain' event to be emitted before continuing to write additional data; otherwise true.
     */
    public sendStellarMessage(message: StellarMessage, cb?: (error: Error | null | undefined) => void): boolean {
        return this.write(message, cb);
    }

    protected sendAuthMessage(): Result<void, Error> {
        this.logger.debug('send auth msg',
            {'host': this.remoteHostInfo()});

        let authMessageResult = xdrMessageCreator.createAuthMessage();
        if(authMessageResult.isErr())
            return err(authMessageResult.error);

        this.write(
            authMessageResult.value
        );

        return ok(undefined);
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

            if (message.switch() !== MessageType.hello() && message.switch() !== MessageType.errorMsg())
                this.increaseLocalSequenceByOne();

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
            this.toNode.updateFromHelloMessage(hello); //todo: send this information with 'connect event'
            this.sendingMacKey = this.connectionAuthentication.getSendingMacKey(this.localNonce, this.remoteNonce, this.remotePublicKeyECDH, !this.remoteCalledUs);
            this.receivingMacKey = this.connectionAuthentication.getReceivingMacKey(this.localNonce, this.remoteNonce, this.remotePublicKeyECDH, !this.remoteCalledUs);
            return ok(undefined);
        }catch (error){
            return err(error);
        }

    }

    public _read() {
        if (this.handshakeState !== HandshakeState.COMPLETED) {
            return;
        }

        if (this.readState === ReadState.Blocked) {//the consumer wants to read again
            this.logger.debug('ReadState unblocked by consumer',
                {'host': this.remoteHostInfo()});
            this.readState = ReadState.ReadyForLength;
        }
        // Trigger a read but wait until the end of the event loop.
        // This is necessary when reading in paused mode where
        // _read was triggered by stream.read() originating inside
        // a "readable" event handler. Attempting to push more data
        // synchronously will not trigger another "readable" event.
        setImmediate(() => this.onReadable());
    }

    public _write(message: StellarMessage, encoding: string, callback: (error?: Error | null) => void):void {
        let authenticatedMessageResult = this.authenticateMessage(message);
        if(authenticatedMessageResult.isErr())
            return callback(authenticatedMessageResult.error);

        let bufferResult = xdrBufferConverter.getXdrBufferFromMessage(authenticatedMessageResult.value);
        if (bufferResult.isErr()) {
            return callback(bufferResult.error);
        }

        this.logger.debug('Writing msg to socket: ' + bufferResult.value.toString('base64'), {'host': this.remoteHostInfo()});
        if (!this.socket.write(bufferResult.value)) {
            this.socket.once('drain', callback); //respecting backpressure
        } else {
            process.nextTick(callback);
        }
    }

    _final(cb: any) {
        this.socket.end(cb);
    }
}