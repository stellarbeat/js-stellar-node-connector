import {FastSigning, hash, Keypair, Networks, xdr} from "stellar-base";

import * as net from 'net';
import {Connection} from "./connection/connection";

require('dotenv').config();
import {ConnectionAuthentication} from "./connection/connection-authentication";
import {NodeConfig} from "./node-config";
import {EventEmitter} from "events";
import {Server, Socket} from "net";
import * as P from "pino";

export type NodeInfo = {
    ledgerVersion: number,
    overlayVersion: number,
    overlayMinVersion: number,
    versionString: string,
    networkId?: string
}
/**
 * Supports two operations: connect to a node, and accept connections from other nodes.
 * In both cases it returns Connection instances that produce and consume StellarMessages
 */
export class Node extends EventEmitter {
    protected logger!: P.Logger;
    protected keyPair: Keypair;
    protected connectionAuthentication: ConnectionAuthentication;
    protected config: NodeConfig;
    protected server?: Server;

    constructor(
        usePublicNetwork: boolean = true,//todo: refactor to network string in node config
        config: NodeConfig,
        logger?: P.Logger
    ) {
        super();
        this.config = config;

        if (!logger) {
            logger = this.initializeDefaultLogger();
        }

        this.logger = logger.child({app: 'Connector'});

        if (this.config.privateKey) {
            try {
                this.keyPair = Keypair.fromSecret(this.config.privateKey);
            } catch (error) {
                throw new Error("Invalid private key");
            }
        } else {
            this.keyPair = Keypair.random();
        }
        this.logger.info("Using public key: " + this.keyPair.publicKey());

        let networkId: Buffer;
        if (usePublicNetwork) {
            //@ts-ignore
            networkId = hash(Networks.PUBLIC)
        } else {
            //@ts-ignore
            networkId = hash(Networks.PUBLIC)
        }

        if (!FastSigning) {
            this.logger.debug('warning', 'FastSigning not enabled');
        }

        //@ts-ignore
        this.connectionAuthentication = new ConnectionAuthentication(this.keyPair, networkId);
    }

    setLogger(logger: any) {
        this.logger = logger;
    }

    protected initializeDefaultLogger(): P.Logger {
        return P({
            level: process.env.LOG_LEVEL || 'info',
            base: undefined,
        });
    }

    /*
    * Connect to a node
     */
    connectTo(ip: string, port: number): Connection {
        let socket = new net.Socket();

        let connection = new Connection({
            ip: ip,
            port: port,
            keyPair: this.keyPair,
            localNodeInfo: {
                ledgerVersion: this.config.nodeInfo.ledgerVersion,
                overlayVersion: this.config.nodeInfo.overlayVersion,
                overlayMinVersion: this.config.nodeInfo.overlayMinVersion,
                versionString: this.config.nodeInfo.versionString,
            },
            listeningPort: this.config.listeningPort,
            remoteCalledUs: false,
            receiveTransactionMessages: this.config.receiveTransactionMessages,
            receiveSCPMessages: this.config.receiveSCPMessages
        }, socket, this.connectionAuthentication, this.logger);

        this.logger.debug({'peer': connection.remoteAddress()}, 'Connect');

        connection.connect();

        return connection;
    }

    /*
    * Start accepting connections from other nodes.
    * emits connection event with a Connection instance on a new incoming connection
    */
    acceptIncomingConnections(port?: number, host?: string) {
        if (!this.server) {
            this.server = new Server();
            this.server.on("connection", (socket) => this.onIncomingConnection(socket));
            this.server.on("error", err => this.emit("error", err));
            this.server.on("close", () => this.emit("close"));
            this.server.on("listening", () => this.emit("listening"));
        }

        if (!this.server.listening)
            this.server.listen(port, host)
    }

    stopAcceptingIncomingConnections() {
        if (this.server)
            this.server.close();
    }

    protected onIncomingConnection(socket: Socket) {
        let connection = new Connection({
            ip: socket.remoteAddress!,
            port: socket.remotePort!,
            keyPair: this.keyPair,
            localNodeInfo: {
                ledgerVersion: this.config.nodeInfo.ledgerVersion,
                overlayVersion: this.config.nodeInfo.overlayVersion,
                overlayMinVersion: this.config.nodeInfo.overlayMinVersion,
                versionString: this.config.nodeInfo.versionString,
            },
            listeningPort: this.config.listeningPort,
            remoteCalledUs: true,
            receiveTransactionMessages: this.config.receiveTransactionMessages,
            receiveSCPMessages: this.config.receiveSCPMessages
        }, socket, this.connectionAuthentication, this.logger);
        this.emit("connection", connection);
    }

    /*protected handleStellarMessage(stellarMessage: xdr.StellarMessage, connection: Connection) {
        try {
            switch (stellarMessage.switch()) {
                //we handle a scp quorum set message immediately. However this could be better handled with 'dont have' message parsing.
                case MessageType.scpQuorumset():
                    this.logger.debug( 'rcv scpQuorumSet msg',
                        {'peer': connection.toNode.key});
                    let quorumSetResult = getQuorumSetFromMessage(stellarMessage.qSet());
                    if(quorumSetResult.isErr()) {
                        this.logger.error('Invalid scpQuorumSet msg',
                            {'peer': connection.toNode.key, error: quorumSetResult.error.message});
                        connection.destroy();
                    } else {
                        this._onQuorumSetReceivedCallback(quorumSetResult.value, connection.toNode);
                    }
                    break;

                case MessageType.errorMsg():
                    if (stellarMessage.error().code() === xdr.ErrorCode.errLoad()) {
                        this.logger.info('info', 'rcv high load msg',
                            {'peer': connection.toNode.key});
                    } else {
                        this.logger.info('Error msg received',
                            {'peer': connection.toNode.key, error: stellarMessage.error().msg().toString()});
                    }//todo: return error
                    break;

                //queued worker pool messages
                case MessageType.peers():
                    this.logger.debug( 'rcv peer msg',
                        {'peer': connection.toNode.key});
                    this._onPeersReceivedCallback(stellarMessage.peers().map(peer => {
                        return new PeerNode(
                            getIpFromPeerAddress(peer),
                            peer.port()
                        )
                    }), connection.toNode);
                    break;

                case MessageType.dontHave():
                    console.log(stellarMessage.dontHave().type());
                    console.log(stellarMessage.dontHave().reqHash().toString('base64'));
                    break;

                case MessageType.scpMessage():
                    this.logger.debug('rcv scp msg', {'peer': connection.toNode.key});
                    let signature = stellarMessage.envelope().signature().toString();
                    if (this.processedEnvelopes.has(signature)) {
                        return;
                    }
                    this.processedEnvelopes.set(signature, 1);
                    this.pool.proxy()
                        .then(worker => {
                            return worker.verifyStatementXDRSignature(
                                stellarMessage.envelope().statement().toXDR(),
                                stellarMessage.envelope().statement().nodeId().value(),
                                stellarMessage.envelope().signature(),
                                this.networkIDBuffer);
                        })
                        .then((verified) => {
                            //@ts-ignore
                                if (verified)
                                    return this._onSCPStatementReceivedCallback(stellarMessage.envelope().statement(), connection.toNode);
                                else {
                                    this.logger.error('Invalid signature',
                                        {'peer': connection.toNode.key});
                                }
                            }
                        ).catch(error => {
                        this.logger.error('Error parsing scp msg',
                            {'peer': connection.toNode.key, 'error': error.message});
                    });

                    break;

                case MessageType.transaction()://transaction
                    this.logger.debug( 'rcv transaction msg',
                        {'peer': connection.toNode.key});
                    break;

                default:
                    this.logger.debug( 'rcv unsupported msg type' + stellarMessage.switch().name,
                        {'peer': connection.toNode.key});
            }
        } catch
            (e) {
            console.debug(e)
        }
    }*/
}