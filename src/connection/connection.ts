import BigNumber from 'bignumber.js';
import { hash, Keypair, StrKey, xdr } from 'stellar-base';
import { err, ok, Result } from 'neverthrow';
import { Socket } from 'net';
import { ConnectionAuthentication } from './connection-authentication';
import { createSHA256Hmac, verifyHmac } from '../crypto-helper';
import { Duplex } from 'stream';
import xdrMessageCreator from './handshake-message-creator';
import xdrBufferConverter from './xdr-buffer-converter';
import * as async from 'async';
import {
	AuthenticatedMessageV0,
	parseAuthenticatedMessageXDR
} from './xdr-message-handler';
import * as P from 'pino';
import { NodeInfo } from '../node';
import { FlowController } from './flow-controller';
import StellarMessage = xdr.StellarMessage;
import MessageType = xdr.MessageType;
import { mapUnknownToError } from '../map-unknown-to-error';

type PublicKey = string;

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
	localNodeInfo: NodeInfo;
	listeningPort?: number;
	remoteCalledUs: boolean;
	receiveTransactionMessages: boolean;
	receiveSCPMessages: boolean;
	maxFloodMessageCapacity: number;
};

export type StellarMessageWork = {
	stellarMessage: StellarMessage;
	done: () => void; //flow control: call when done processing
};

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
	protected keyPair: Keypair;
	protected localListeningPort = 11625;
	protected remotePublicKeyECDH?: Buffer;
	protected localNonce: Buffer;
	protected remoteNonce?: Buffer;
	protected localSequence: Buffer;
	protected remoteSequence: Buffer;
	protected sendingMacKey?: Buffer;
	protected receivingMacKey?: Buffer;
	protected lengthNextMessage = 0;
	protected reading = false;
	protected readState: ReadState = ReadState.ReadyForLength;
	protected handshakeState: HandshakeState = HandshakeState.CONNECTING;
	protected remoteCalledUs = true;
	protected receiveTransactionMessages = true;
	protected receiveSCPMessages = true;
	public localNodeInfo: NodeInfo;
	public remoteNodeInfo?: NodeInfo;
	public sendMoreMsgReceivedCounter = 0;
	public remoteIp: string;
	public remotePort: number;

	public remotePublicKey?: string;
	public remotePublicKeyRaw?: Buffer;

	private flowController: FlowController;

	constructor(
		connectionOptions: ConnectionOptions,
		private socket: Socket,
		private readonly connectionAuthentication: ConnectionAuthentication,
		private logger: P.Logger
	) {
		super({ objectMode: true });
		this.remoteIp = connectionOptions.ip;
		this.remotePort = connectionOptions.port;
		this.socket = socket; //if we initiate, could we create the socket here?
		if (this.socket.readable) this.handshakeState = HandshakeState.CONNECTED;
		this.remoteCalledUs = connectionOptions.remoteCalledUs;
		this.socket.setTimeout(2500);
		this.connectionAuthentication = connectionAuthentication;
		this.keyPair = connectionOptions.keyPair;
		this.localNonce = hash(Buffer.from(BigNumber.random()));
		this.localSequence = Buffer.alloc(8);
		this.remoteSequence = Buffer.alloc(8);

		this.localNodeInfo = connectionOptions.localNodeInfo;
		this.receiveSCPMessages = connectionOptions.receiveSCPMessages;
		this.receiveTransactionMessages =
			connectionOptions.receiveTransactionMessages;

		this.flowController = new FlowController(
			connectionOptions.maxFloodMessageCapacity
		);

		this.socket.on('close', (hadError) => this.emit('close', hadError));
		this.socket.on('connect', () => this.onConnected());
		this.socket.on('drain', () => this.emit('drain'));
		this.socket.on('end', () => this.emit('end'));
		this.socket.on('error', (error) => this.emit('error', error));
		this.socket.on('lookup', (e, a, f, h) => this.emit('lookup', e, a, f, h));
		this.socket.on('readable', () => this.onReadable());
		this.socket.on('timeout', () => this.emit('timeout'));

		this.logger = logger;
	}

	get localPublicKey(): PublicKey {
		return this.keyPair.publicKey();
	}

	get localPublicKeyRaw(): Buffer {
		return this.keyPair.rawPublicKey();
	}

	get remoteAddress(): string {
		return this.remoteIp + ':' + this.remotePort;
	}

	get localAddress(): string {
		return this.socket.localAddress + ':' + this.socket.localPort;
	}

	public connect(): void {
		this.handshakeState = HandshakeState.CONNECTING;
		this.socket.connect(this.remotePort, this.remoteIp);
	}

	public isConnected(): boolean {
		return this.handshakeState === HandshakeState.COMPLETED;
	}

	public end(): this {
		this.socket.end();
		return this;
	}

	public destroy(error?: Error): this {
		this.socket.destroy(error);
		return this;
	}

	/**
	 * Fires when the socket has connected. This method initiates the
	 * handshake and if there is a failure, terminates the connection.
	 */
	protected onConnected(): void {
		this.logger.debug(
			{
				remote: this.remoteAddress,
				local: this.localAddress
			},
			'Connected to socket, initiating handshake'
		);
		this.handshakeState = HandshakeState.CONNECTED;
		const result = this.sendHello();
		if (result.isErr()) {
			this.logger.error(
				{ remote: this.remoteAddress, local: this.localAddress },
				result.error.message
			);
			this.socket.destroy(result.error);
		}
	}

	protected onReadable(): void {
		this.logger.trace(
			{ remote: this.remoteAddress, local: this.localAddress },
			'Rcv readable event'
		);

		//a socket can receive a 'readable' event when already processing a previous readable event.
		// Because the same internal read buffer is processed (the running whilst loop will also loop over the new data),
		// we can safely ignore it.
		if (this.reading) {
			this.logger.trace(
				{ remote: this.remoteAddress, local: this.localAddress },
				'Ignoring, already reading'
			);
			return;
		}

		this.reading = true;
		//a socket is a duplex stream. It has a write buffer (when we write messages to the socket, to be sent to the peer). And it has a read buffer, data we have to read from the socket, data that is sent by the peer to us. If we don't read the data (or too slow), we will exceed the readableHighWatermark of the socket. This will make the socket stop receiving data or using tcp to signal to the sender that we want to receive the data slower.
		if (this.socket.readableLength >= this.socket.readableHighWaterMark)
			this.logger.debug(
				{
					remote: this.remoteAddress,
					local: this.localAddress
				},
				'Socket buffer exceeding high watermark'
			);

		let processedMessages = 0;
		async.whilst(
			(cb) => {
				// async loop to interleave sockets, otherwise handling all the messages in the buffer is a blocking loop
				return cb(null, this.reading);
			},
			(done) => {
				let processError = null;

				if (this.readState === ReadState.ReadyForLength) {
					if (this.processNextMessageLength()) {
						this.readState = ReadState.ReadyForMessage;
					} else {
						this.reading = false; //we stop processing the buffer
					}
				}

				if (this.readState === ReadState.ReadyForMessage) {
					this.processNextMessage()
						.map((containedAMessage) => {
							if (containedAMessage) {
								this.readState = ReadState.ReadyForLength;
								processedMessages++;
							} else this.reading = false;
						})
						.mapErr((error) => {
							processError = error;
							this.reading = false;
						});
				}
				if (this.readState === ReadState.Blocked) {
					//we don't process anymore messages because consumer cant handle it.
					// When our internal buffer reaches the high watermark, the underlying tcp protocol will signal the sender that we can't handle the traffic.
					this.logger.debug(
						{ remote: this.remoteAddress, local: this.localAddress },
						'Reading blocked'
					);
					this.reading = false;
				}

				if (processError || !this.reading) {
					done(processError); //end the loop
				} else if (processedMessages % 10 === 0) {
					//if ten messages are sequentially processed, we give control back to event loop
					setImmediate(() => done(null)); //other sockets will be able to process messages
				} else done(null); //another iteration
			},
			(err) => {
				//function gets called when we are no longer reading
				if (err) {
					const error = mapUnknownToError(err);
					this.logger.error(
						{ remote: this.remoteAddress, local: this.localAddress },
						error.message
					);
					this.socket.destroy(error);
				}

				this.logger.trace(
					{
						remote: this.remoteAddress,
						local: this.localAddress
					},
					'handled messages in chunk: ' + processedMessages
				);
			}
		);
	}

	protected processNextMessage(): Result<boolean, Error> {
		//If size bytes are not available to be read, null will be returned unless the stream has ended, in which case all of the data remaining in the internal buffer will be returned.
		const data = this.socket.read(this.lengthNextMessage);
		if (!data || data.length !== this.lengthNextMessage) {
			this.logger.trace(
				{
					remote: this.remoteAddress,
					local: this.localAddress
				},
				'Not enough data left in buffer'
			);
			return ok(false);
		}

		const result = parseAuthenticatedMessageXDR(data); //if transactions are not required, we avoid parsing them to objects and verifying the macs to gain performance
		if (result.isErr()) {
			return err(result.error);
		}

		const authenticatedMessageV0XDR = result.value;
		const messageType = authenticatedMessageV0XDR.messageTypeXDR.readInt32BE(0);
		this.logger.trace(
			{
				remote: this.remoteAddress,
				local: this.localAddress
			},
			'Rcv msg of type: ' +
				messageType +
				' with seq: ' +
				authenticatedMessageV0XDR.sequenceNumberXDR.readInt32BE(4)
		);

		this.logger.trace(
			{
				remote: this.remoteAddress,
				local: this.localAddress
			},
			'Rcv ' + messageType
		);

		if (
			messageType === MessageType.transaction().value &&
			!this.receiveTransactionMessages
		) {
			this.increaseRemoteSequenceByOne();
			this.doneProcessing(MessageType.transaction());
			return ok(true);
		}

		if (
			messageType === MessageType.scpMessage().value &&
			!this.receiveSCPMessages
		) {
			this.increaseRemoteSequenceByOne();
			return ok(true);
		}

		if (
			this.handshakeState >= HandshakeState.GOT_HELLO &&
			messageType !== MessageType.errorMsg().value
		) {
			const result = this.verifyAuthentication(
				authenticatedMessageV0XDR,
				messageType,
				data.slice(4, data.length - 32)
			);
			this.increaseRemoteSequenceByOne();
			if (result.isErr()) return err(result.error);
		}

		let stellarMessage: xdr.StellarMessage;
		try {
			stellarMessage = StellarMessage.fromXDR(data.slice(12, data.length - 32));
		} catch (error) {
			if (error instanceof Error) return err(error);
			else return err(new Error('Error converting xdr to StellarMessage'));
		}

		const handleStellarMessageResult =
			this.handleStellarMessage(stellarMessage);
		if (handleStellarMessageResult.isErr()) {
			return err(handleStellarMessageResult.error);
		}
		if (!handleStellarMessageResult.value) {
			this.logger.debug(
				{
					remote: this.remoteAddress,
					local: this.localAddress
				},
				'Consumer cannot handle load, stop reading from socket'
			);
			this.readState = ReadState.Blocked;
			return ok(false);
		} //our read buffer is full, meaning the consumer did not process the messages timely

		return ok(true);
	}

	protected verifyAuthentication(
		authenticatedMessageV0XDR: AuthenticatedMessageV0,
		messageType: number,
		body: Buffer
	): Result<void, Error> {
		if (
			!this.remoteSequence.equals(authenticatedMessageV0XDR.sequenceNumberXDR)
		) {
			//must be handled on main thread because workers could mix up order of messages.
			return err(new Error('Invalid sequence number'));
		}

		try {
			if (
				this.receivingMacKey &&
				!verifyHmac(
					authenticatedMessageV0XDR.macXDR,
					this.receivingMacKey,
					body
				)
			) {
				return err(new Error('Invalid hmac'));
			}
		} catch (error) {
			if (error instanceof Error) return err(error);
			else return err(new Error('Error verifying authentication'));
		}

		return ok(undefined);
	}

	protected processNextMessageLength(): boolean {
		this.logger.trace(
			{ remote: this.remoteAddress, local: this.localAddress },
			'Parsing msg length'
		);
		const data = this.socket.read(4);
		if (data) {
			this.lengthNextMessage =
				xdrBufferConverter.getMessageLengthFromXDRBuffer(data);
			this.logger.trace(
				{
					remote: this.remoteAddress,
					local: this.localAddress
				},
				'Next msg length: ' + this.lengthNextMessage
			);
			return true;
		} else {
			this.logger.trace(
				{
					remote: this.remoteAddress,
					local: this.localAddress
				},
				'Not enough data left in buffer'
			);
			return false;
			//we stay in the ReadyForLength state until the next readable event
		}
	}

	//return true if handling was successful, false if consumer was overloaded, Error on error
	protected handleStellarMessage(
		stellarMessage: StellarMessage
	): Result<boolean, Error> {
		switch (stellarMessage.switch()) {
			case MessageType.hello(): {
				const processHelloMessageResult = this.processHelloMessage(
					stellarMessage.hello()
				);
				if (processHelloMessageResult.isErr()) {
					return err(processHelloMessageResult.error);
				}
				this.handshakeState = HandshakeState.GOT_HELLO;

				let result: Result<void, Error>;
				if (this.remoteCalledUs) result = this.sendHello();
				else result = this.sendAuthMessage();

				if (result.isErr()) {
					return err(result.error);
				}
				return ok(true);
			}

			case MessageType.auth(): {
				const completedHandshakeResult = this.completeHandshake();
				if (completedHandshakeResult.isErr())
					return err(completedHandshakeResult.error);
				return ok(true);
			}

			case MessageType.sendMore(): {
				this.sendMoreMsgReceivedCounter++; //server send more functionality not implemented; only for testing purposes;
				return ok(true);
			}

			default:
				// we push non-handshake messages to our readable buffer for our consumers
				this.logger.debug(
					{
						remote: this.remoteAddress,
						local: this.localAddress
					},
					'Rcv ' + stellarMessage.switch().name
				);

				return ok(
					this.push({
						stellarMessage: stellarMessage,
						done: () => this.doneProcessing(stellarMessage.switch())
					} as StellarMessageWork)
				);
		}
	}

	protected sendHello(): Result<void, Error> {
		this.logger.trace(
			{ remote: this.remoteAddress, local: this.localAddress },
			'send HELLO'
		);
		const certResult = xdrMessageCreator.createAuthCert(
			this.connectionAuthentication
		);
		if (certResult.isErr()) return err(certResult.error);

		const helloResult = xdrMessageCreator.createHelloMessage(
			this.keyPair.xdrPublicKey(),
			this.localNonce,
			certResult.value,
			this.connectionAuthentication.networkId,
			this.localNodeInfo.ledgerVersion,
			this.localNodeInfo.overlayVersion,
			this.localNodeInfo.overlayMinVersion,
			this.localNodeInfo.versionString,
			this.localListeningPort
		);

		if (helloResult.isErr()) {
			return err(helloResult.error);
		}

		this.write(helloResult.value);

		return ok(undefined);
	}

	protected completeHandshake(): Result<void, Error> {
		if (this.remoteCalledUs) {
			const authResult = this.sendAuthMessage();
			if (authResult.isErr()) return err(authResult.error);
		}

		this.logger.debug(
			{ remote: this.remoteAddress, local: this.localAddress },
			'Handshake Completed'
		);
		this.handshakeState = HandshakeState.COMPLETED;
		this.socket.setTimeout(30000);

		this.emit('connect', this.remotePublicKey, this.remoteNodeInfo);
		this.emit('ready');

		if (!this.remoteNodeInfo)
			throw new Error('No remote overlay version after handshake');

		this.flowController.initialize(this.remoteNodeInfo.overlayVersion);
		this.doneProcessing();

		return ok(undefined);
	}

	protected doneProcessing(messageType?: MessageType): void {
		if (!this.flowController.sendMore(messageType)) return;

		const sendMore = new xdr.SendMore({
			numMessages: this.flowController.maxFloodMessageCapacity
		});
		this.sendStellarMessage(xdr.StellarMessage.sendMore(sendMore));
	}

	/**
	 * Convenience method that encapsulates write. Pass callback that will be invoked when message is successfully sent.
	 * Returns: <boolean> false if the stream wishes for the calling code to wait for the 'drain' event to be emitted before continuing to write additional data; otherwise true.
	 */
	public sendStellarMessage(
		message: StellarMessage,
		cb?: (error: Error | null | undefined) => void
	): boolean {
		this.logger.info(
			{ remote: this.remoteAddress, local: this.localAddress },
			'send ' + message.switch().name
		);
		return this.write(message, cb);
	}

	protected sendAuthMessage(): Result<void, Error> {
		this.logger.trace(
			{ remote: this.remoteAddress, local: this.localAddress },
			'send auth'
		);

		const authMessageResult = xdrMessageCreator.createAuthMessage();
		if (authMessageResult.isErr()) return err(authMessageResult.error);

		this.write(authMessageResult.value);

		return ok(undefined);
	}

	protected increaseLocalSequenceByOne(): void {
		this.localSequence = this.increaseBufferByOne(this.localSequence);
	}

	protected increaseBufferByOne(buf: Buffer): Buffer {
		//todo: move to helper
		for (let i = buf.length - 1; i >= 0; i--) {
			if (buf[i]++ !== 255) break;
		}
		return buf;
	}

	protected increaseRemoteSequenceByOne(): void {
		this.remoteSequence = this.increaseBufferByOne(this.remoteSequence);
	}

	protected authenticateMessage(
		message: xdr.StellarMessage
	): Result<xdr.AuthenticatedMessage, Error> {
		try {
			const xdrAuthenticatedMessageV0 = new xdr.AuthenticatedMessageV0({
				sequence: xdr.Uint64.fromXDR(this.localSequence),
				message: message,
				mac: this.getMacForAuthenticatedMessage(message)
			});

			//@ts-ignore wrong type information. Because the switch is a number, not an enum, it does not work as advertised.
			// We have to create the union object through the constructor https://github.com/stellar/js-xdr/blob/892b662f98320e1221d8f53ff17c6c10442e086d/src/union.js#L9
			// However the constructor type information is also missing.
			const authenticatedMessage = new xdr.AuthenticatedMessage(
				//@ts-ignore
				0,
				xdrAuthenticatedMessageV0
			);

			if (
				message.switch() !== MessageType.hello() &&
				message.switch() !== MessageType.errorMsg()
			)
				this.increaseLocalSequenceByOne();

			return ok(authenticatedMessage);
		} catch (error) {
			if (error instanceof Error)
				return err(new Error('authenticateMessage failed: ' + error.message));
			else return err(new Error('authenticateMessage failed'));
		}
	}

	protected getMacForAuthenticatedMessage(
		message: xdr.StellarMessage
	): xdr.HmacSha256Mac {
		let mac;
		if (
			this.remotePublicKeyECDH === undefined ||
			this.sendingMacKey === undefined
		)
			mac = Buffer.alloc(32);
		else
			mac = createSHA256Hmac(
				Buffer.concat([this.localSequence, message.toXDR()]),
				this.sendingMacKey
			);

		return new xdr.HmacSha256Mac({
			mac: mac
		});
	}

	protected processHelloMessage(hello: xdr.Hello): Result<void, Error> {
		if (
			!this.connectionAuthentication.verifyRemoteAuthCert(
				new Date(),
				hello.peerId().value(),
				hello.cert()
			)
		)
			return err(new Error('Invalid auth cert'));
		try {
			this.remoteNonce = hello.nonce();
			this.remotePublicKeyECDH = hello.cert().pubkey().key();
			this.remotePublicKey = StrKey.encodeEd25519PublicKey(
				hello.peerId().value()
			);
			this.remotePublicKeyRaw = hello.peerId().value();
			this.remoteNodeInfo = {
				ledgerVersion: hello.ledgerVersion(),
				overlayVersion: hello.overlayVersion(),
				overlayMinVersion: hello.overlayMinVersion(),
				versionString: hello.versionStr().toString(),
				networkId: hello.networkId().toString('base64')
			};
			this.sendingMacKey = this.connectionAuthentication.getSendingMacKey(
				this.localNonce,
				this.remoteNonce,
				this.remotePublicKeyECDH,
				!this.remoteCalledUs
			);
			this.receivingMacKey = this.connectionAuthentication.getReceivingMacKey(
				this.localNonce,
				this.remoteNonce,
				this.remotePublicKeyECDH,
				!this.remoteCalledUs
			);
			return ok(undefined);
		} catch (error) {
			if (error instanceof Error) return err(error);
			else return err(new Error('Error processing hello message'));
		}
	}

	public _read(): void {
		if (this.handshakeState !== HandshakeState.COMPLETED) {
			return;
		}

		if (this.readState === ReadState.Blocked) {
			//the consumer wants to read again
			this.logger.trace(
				{
					remote: this.remoteAddress,
					local: this.localAddress
				},
				'ReadState unblocked by consumer'
			);
			this.readState = ReadState.ReadyForLength;
		}
		// Trigger a read but wait until the end of the event loop.
		// This is necessary when reading in paused mode where
		// _read was triggered by stream.read() originating inside
		// a "readable" event handler. Attempting to push more data
		// synchronously will not trigger another "readable" event.
		setImmediate(() => this.onReadable());
	}

	public _write(
		message: StellarMessage,
		encoding: string,
		callback: (error?: Error | null) => void
	): void {
		this.logger.trace(
			{
				remote: this.remoteAddress,
				local: this.localAddress
			},
			'write ' + message.switch().name + ' to socket'
		);

		const authenticatedMessageResult = this.authenticateMessage(message);
		if (authenticatedMessageResult.isErr()) {
			this.logger.error(
				{
					remote: this.remoteAddress,
					local: this.localAddress
				},
				authenticatedMessageResult.error.message
			);
			return callback(authenticatedMessageResult.error);
		}
		const bufferResult = xdrBufferConverter.getXdrBufferFromMessage(
			authenticatedMessageResult.value
		);
		if (bufferResult.isErr()) {
			this.logger.error(
				{ remote: this.remoteAddress, local: this.localAddress },
				bufferResult.error.message
			);
			return callback(bufferResult.error);
		}

		this.logger.trace(
			{
				remote: this.remoteAddress,
				local: this.localAddress
			},
			'Write msg xdr: ' + bufferResult.value.toString('base64')
		);
		if (!this.socket.write(bufferResult.value)) {
			this.socket.once('drain', callback); //respecting backpressure
		} else {
			process.nextTick(callback);
		}
	}

	_final(cb?: () => void): void {
		this.socket.end(cb);
	}
}
