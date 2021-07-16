import {FastSigning, hash, Keypair, Networks, xdr} from "stellar-base";

import {QuorumSet} from "@stellarbeat/js-stellar-domain";
import * as net from 'net';
import xdrMessageCreator from "./connection/handshake-message-creator";
import Connection from "./connection/connection";
import * as winston from "winston";
import * as pino from "pino";

require('dotenv').config();
import {PeerNode} from "./peer-node";
import {Logger} from "winston";
import {pool, WorkerPool} from 'workerpool';
import MessageType = xdr.MessageType;
import * as LRUCache from "lru-cache";
import StellarMessage = xdr.StellarMessage;
import {err, ok, Result} from "neverthrow";
import {ConnectionAuthentication} from "./connection/connection-authentication";
import {verifyHmac} from "./crypto-helper";
import {Config, getConfig} from "./config";
import {getIpFromPeerAddress, getQuorumSetFromMessage, verifyStatementXDRSignature} from "./stellar-message-service";

type nodeKey = string;

export class ConnectionManager {
    _onNodeConnectedCallback: (node: PeerNode) => void;
    _onPeersReceivedCallback: (peers: Array<PeerNode>, node: PeerNode) => void;
    _onLoadTooHighCallback: (node: PeerNode) => void;
    _onQuorumSetReceivedCallback: (quorumSet: QuorumSet, node: PeerNode) => void;
    _onNodeDisconnectedCallback: (node: PeerNode) => void;
    _onSCPStatementReceivedCallback: (SCPStatement: xdr.ScpStatement, node: PeerNode) => void;

    protected logger!: Logger;
    protected dataBuffers: Map<string, Buffer> = new Map<string, Buffer>();
    protected network: string;
    protected connections: Map<nodeKey, Connection> = new Map();
    protected keyPair: Keypair;
    protected networkIDBuffer: Buffer;
    protected pool: WorkerPool;
    protected processedEnvelopes = new LRUCache(5000);
    protected connectionAuthication: ConnectionAuthentication;
    protected config: Config;

    constructor(
        usePublicNetwork: boolean = true,
        _onNodeConnectedCallback: (node: PeerNode) => void,
        onPeersReceivedCallback: (peers: Array<PeerNode>, node: PeerNode) => void,
        onLoadTooHighCallback: (node: PeerNode) => void,
        onSCPStatementReceivedCallback: (SCPStatement: xdr.ScpStatement, node: PeerNode) => void,
        onQuorumSetReceivedCallback: (quorumSet: QuorumSet, node: PeerNode) => void,
        onNodeDisconnectedCallback: (node: PeerNode) => void,
        logger: Logger
    ) {
        this.config = getConfig();

        if (!logger) {
            this.initializeDefaultLogger();
        } else {
            this.logger = logger.child({app: 'Connector'});
        }
        this._onNodeConnectedCallback = _onNodeConnectedCallback;
        this._onPeersReceivedCallback = onPeersReceivedCallback;
        this._onLoadTooHighCallback = onLoadTooHighCallback;
        this._onQuorumSetReceivedCallback = onQuorumSetReceivedCallback;
        this._onNodeDisconnectedCallback = onNodeDisconnectedCallback;
        this._onSCPStatementReceivedCallback = onSCPStatementReceivedCallback;
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


        if (usePublicNetwork) {
            this.network = Networks.PUBLIC
        } else {
            this.network = Networks.TESTNET
        }

        //@ts-ignore
        this.networkIDBuffer = hash(this.network);


        if (!FastSigning) {
            this.logger.debug('warning', 'FastSigning not enabled',
                {'app': 'Connector'});
        }

        this.connectionAuthication = new ConnectionAuthentication(this.keyPair, this.networkIDBuffer);
        this.pool = pool(__dirname + '/worker/crypto-worker.js');
    }

    setLogger(logger: any) {
        this.logger = logger;
    }

    protected initializeDefaultLogger() {
       // this.logger = require('pino')();
        //return;//todo: winston is creating blocking issues
        this.logger = winston.createLogger({
            level: this.config.logLevel,
            transports: [
                new winston.transports.Console({
                    silent: false
                })
            ],
            defaultMeta: {
                app: 'Connector'
            }
        });
    }

    connect(toNode: PeerNode) {
        let socket = new net.Socket();

        let connection = new Connection(this.keyPair, toNode, socket, this.connectionAuthication, this.networkIDBuffer, this.config, this.logger);

        connection
            .on('connect', () => {
                this.logger.info('Connected to Stellar Node',
                    {'host': connection.toNode.key});
                this._onNodeConnectedCallback(connection.toNode);
            })
            .on('data', (data: StellarMessage) => {
                this.handleStellarMessage(data, connection);
            })
            .on('error', (err: any) => {
                this.logger.info( "Socket error: " + err.code,
                    {'host': connection.toNode.key});
            })
            .on('close', () => {
                this.logger.info( "Connection closed",
                    {'host': connection.toNode.key});
                this.connections.delete(connection.toNode.key);
                this._onNodeDisconnectedCallback(connection.toNode);
            })
            .on('timeout', () => {
                this.logger.info( "Connection timeout, closing",
                    {'host': connection.toNode.key});
                socket.destroy();
            });

        this.logger.info( 'Connect',
            {'host': connection.toNode.key});

        connection.connect();

        this.connections.set(connection.toNode.key, connection);
    }

    async terminate() {
        await this.pool.terminate();
    }

    disconnect(node: PeerNode): Result<void, Error> {
        this.logger.debug('disconnect requested',
            {'host': node.key});
        let connection = this.connections.get(node.key);
        if (!connection)
            return err(new Error("No active connection"));

        connection.destroy();

        return ok(undefined);
    }

    sendGetQuorumSet(node: PeerNode, hash: Buffer): Result<void, Error> {
        this.logger.debug('send get quorum set',
            {'host': node.key});

        let result = this.sendStellarMessage(
            node, StellarMessage.getScpQuorumset(hash)
        );

        if (result.isErr())
            return err(result.error);

        return ok(undefined);
    }

    sendGetScpStatus(node: PeerNode, ledgerSequence: number = 0): Result<void, Error> {
        this.logger.debug( 'send get scp status for ledger: ' + ledgerSequence,
            {'host': node.key});

        let result = this.sendStellarMessage(
            node,
            StellarMessage.getScpState(ledgerSequence)
        )

        if (result.isErr())
            return err(result.error);

        return ok(undefined);
    }

    sendGetPeers(node: PeerNode): Result<void, Error> {
        this.logger.debug( 'send get peers msg',
            {'host': node.key});

        let result = this.sendStellarMessage(
            node,
            StellarMessage.getPeers()
        )

        if (result.isErr())
            return err(result.error);

        return ok(undefined);
    }

    isNodeConnected(node: PeerNode) {//for the outside world, a node is connected when it has completed a handshake
        let connection = this.connections.get(node.key);
        if (!connection)
            return false;

        return connection.isConnected();
    }

    protected handleStellarMessage(stellarMessage: xdr.StellarMessage, connection: Connection) {
        try {
            switch (stellarMessage.switch()) {
                //we handle a scp quorum set message immediately. However this could be better handled with 'dont have' message parsing.
                case MessageType.scpQuorumset():
                    console.time("scpq")
                    this.logger.debug( 'rcv scpQuorumSet msg',
                        {'host': connection.toNode.key});
                    let quorumSetResult = getQuorumSetFromMessage(stellarMessage.qSet());
                    if(quorumSetResult.isErr()) {
                        this.logger.error('Invalid scpQuorumSet msg',
                            {'host': connection.toNode.key, error: quorumSetResult.error.message});
                        connection.destroy();
                    } else {
                        this._onQuorumSetReceivedCallback(quorumSetResult.value, connection.toNode);
                    }
                    console.timeEnd("scpq")
                    break;

                case MessageType.errorMsg():
                    if (stellarMessage.error().code() === xdr.ErrorCode.errLoad()) {
                        this.logger.info('info', 'rcv high load msg',
                            {'host': connection.toNode.key});
                        if (this._onLoadTooHighCallback)
                            this._onLoadTooHighCallback(connection.toNode);
                    } else {
                        this.logger.info('info', 'Error msg received',
                            {'host': connection.toNode.key, error: stellarMessage.error().msg()});
                    }//todo: return error
                    break;

                //queued worker pool messages
                case MessageType.peers():
                    console.time("peer")
                    this.logger.debug( 'rcv peer msg',
                        {'host': connection.toNode.key});
                    this._onPeersReceivedCallback(stellarMessage.peers().map(peer => {
                        return new PeerNode(
                            getIpFromPeerAddress(peer),
                            peer.port()
                        )
                    }), connection.toNode);
                    console.timeEnd("peer")
                    break;

                case MessageType.scpMessage():
                    this.logger.debug('rcv scp msg', {'host': connection.toNode.key});
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
                                        {'host': connection.toNode.key});
                                }
                            }
                        ).catch(error => {
                        this.logger.error('Error parsing scp msg',
                            {'host': connection.toNode.key, 'error': error.message});
                    });

                    break;

                //todo: define in app settings if transactions should be processed.
                case MessageType.transaction()://transaction
                    this.logger.debug( 'rcv transaction msg',
                        {'host': connection.toNode.key});
                    break;

                default:
                    this.logger.debug( 'rcv unsupported msg type' + stellarMessage.switch().name,
                        {'host': connection.toNode.key});
            }
        } catch
            (e) {
            console.debug(e)
        }

    }

    protected sendAuthMessage(connection: Connection) {
        this.logger.debug( 'send auth msg',
            {'host': connection.toNode.key});
    }

    protected sendStellarMessage(node: PeerNode, message: StellarMessage): Result<void, Error> {
        let connection = this.connections.get(node.key);
        if (!connection)
            return err(new Error("No active connection"));

        return connection.sendStellarMessage(message)
    }
}