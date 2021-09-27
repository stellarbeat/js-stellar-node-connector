import { FastSigning, hash, Keypair, Networks } from 'stellar-base';

import * as net from 'net';
import { Connection } from './connection/connection';

import { ConnectionAuthentication } from './connection/connection-authentication';
import { NodeConfig } from './node-config';
import { EventEmitter } from 'events';
import { Server, Socket } from 'net';
import * as P from 'pino';

export type NodeInfo = {
	ledgerVersion: number;
	overlayVersion: number;
	overlayMinVersion: number;
	versionString: string;
	networkId?: string;
};

/**
 * Supports two operations: connect to a node, and accept connections from other nodes.
 * In both cases it returns Connection instances that produce and consume StellarMessages
 */
export class Node extends EventEmitter {
	protected logger!: P.Logger;
	public keyPair: Keypair;
	protected connectionAuthentication: ConnectionAuthentication;
	protected config: NodeConfig;
	protected server?: Server;

	constructor(
		usePublicNetwork = true, //todo: refactor to network string in node config
		config: NodeConfig,
		logger?: P.Logger
	) {
		super();
		this.config = config;

		if (!logger) {
			logger = this.initializeDefaultLogger();
		}

		this.logger = logger.child({ app: 'Connector' });

		if (this.config.privateKey) {
			try {
				this.keyPair = Keypair.fromSecret(this.config.privateKey);
			} catch (error) {
				throw new Error('Invalid private key');
			}
		} else {
			this.keyPair = Keypair.random();
		}
		this.logger.info('Using public key: ' + this.keyPair.publicKey());

		let networkId: Buffer;
		if (usePublicNetwork) {
			networkId = hash(Buffer.from(Networks.PUBLIC));
		} else {
			networkId = hash(Buffer.from(Networks.TESTNET));
		}

		if (!FastSigning) {
			this.logger.debug('warning', 'FastSigning not enabled');
		}

		this.connectionAuthentication = new ConnectionAuthentication(
			this.keyPair,
			networkId
		);
	}

	setLogger(logger: P.Logger): void {
		this.logger = logger;
	}

	protected initializeDefaultLogger(): P.Logger {
		return P({
			level: process.env.LOG_LEVEL || 'info',
			base: undefined
		});
	}

	/*
	 * Connect to a node
	 */
	connectTo(ip: string, port: number): Connection {
		const socket = new net.Socket();

		const connection = new Connection(
			{
				ip: ip,
				port: port,
				keyPair: this.keyPair,
				localNodeInfo: {
					ledgerVersion: this.config.nodeInfo.ledgerVersion,
					overlayVersion: this.config.nodeInfo.overlayVersion,
					overlayMinVersion: this.config.nodeInfo.overlayMinVersion,
					versionString: this.config.nodeInfo.versionString
				},
				listeningPort: this.config.listeningPort,
				remoteCalledUs: false,
				receiveTransactionMessages: this.config.receiveTransactionMessages,
				receiveSCPMessages: this.config.receiveSCPMessages
			},
			socket,
			this.connectionAuthentication,
			this.logger
		);

		this.logger.debug({ remote: connection.remoteAddress }, 'Connect');
		connection.connect();

		return connection;
	}

	/*
	 * Start accepting connections from other nodes.
	 * emits connection event with a Connection instance on a new incoming connection
	 */
	acceptIncomingConnections(port?: number, host?: string): void {
		if (!this.server) {
			this.server = new Server();
			this.server.on('connection', (socket) =>
				this.onIncomingConnection(socket)
			);
			this.server.on('error', (err) => this.emit('error', err));
			this.server.on('close', () => this.emit('close'));
			this.server.on('listening', () => this.emit('listening'));
		}

		if (!this.server.listening) this.server.listen(port, host);
	}

	stopAcceptingIncomingConnections(callback?: (err?: Error) => void): void {
		if (this.server) this.server.close(callback);
		else if (callback) callback();
	}

	public get listening(): boolean {
		if (this.server) return this.server.listening;
		else return false;
	}

	protected onIncomingConnection(socket: Socket): void {
		if (socket.remoteAddress === undefined || socket.remotePort === undefined)
			return; //this can happen when socket is immediately destroyed

		const connection = new Connection(
			{
				ip: socket.remoteAddress,
				port: socket.remotePort,
				keyPair: this.keyPair,
				localNodeInfo: {
					ledgerVersion: this.config.nodeInfo.ledgerVersion,
					overlayVersion: this.config.nodeInfo.overlayVersion,
					overlayMinVersion: this.config.nodeInfo.overlayMinVersion,
					versionString: this.config.nodeInfo.versionString
				},
				listeningPort: this.config.listeningPort,
				remoteCalledUs: true,
				receiveTransactionMessages: this.config.receiveTransactionMessages,
				receiveSCPMessages: this.config.receiveSCPMessages
			},
			socket,
			this.connectionAuthentication,
			this.logger
		);
		this.emit('connection', connection);
	}
}
