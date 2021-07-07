import {FastSigning, hash, Networks, xdr} from "stellar-base";

import {QuorumSet} from "@stellarbeat/js-stellar-domain";
import * as net from 'net';
import xdrBufferConverter from './xdr-buffer-converter';
import xdrMessageCreator from "./xdr-message-creator";
import {Connection} from "./connection";
import * as winston from "winston";

require('dotenv').config();
import {SCPStatement} from './scp-statement';
import {PeerNode} from "./peer-node";
import {Logger} from "winston";
import BigNumber from "bignumber.js";
import {pool, WorkerPool} from 'workerpool';
import MessageType = xdr.MessageType;
import {getQuorumSetFromMessage, parseAuthenticatedMessageXDR} from "./xdr-message-handler";
import * as LRUCache from "lru-cache";
import AuthenticatedMessage = xdr.AuthenticatedMessage;
import StellarMessage = xdr.StellarMessage;

export class ConnectionManager {
    _sockets: Map<string, net.Socket>;
    _onHandshakeCompletedCallback: (connection: Connection) => void;
    _onPeersReceivedCallback: (peers: Array<PeerNode>, connection: Connection) => void;
    _onLoadTooHighCallback: (connection: Connection) => void;
    _onQuorumSetReceivedCallback: (connection: Connection, quorumSet: QuorumSet) => void;
    _onNodeDisconnectedCallback: (connection: Connection) => void;
    _onSCPStatementReceivedCallback: (connection: Connection, SCPStatement: SCPStatement) => void;
    _logger!: Logger;
    _dataBuffers: Map<string, Buffer> = new Map<string, Buffer>();
    _timeouts: Map<string, any>;
    _network: string;
    protected networkBuffer: Buffer;
    protected pool: WorkerPool;
    protected processedEnvelopes = new LRUCache(5000);

    constructor(
        usePublicNetwork: boolean = true,
        onHandshakeCompletedCallback: (connection: Connection) => void,
        onPeersReceivedCallback: (peers: Array<PeerNode>, connection: Connection) => void,
        onLoadTooHighCallback: (connection: Connection) => void,
        onSCPStatementReceivedCallback: (connection: Connection, SCPStatement: SCPStatement) => void,
        onQuorumSetReceivedCallback: (connection: Connection, quorumSet: QuorumSet) => void,
        onNodeDisconnectedCallback: (connection: Connection) => void,
        logger: Logger
    ) {
        this._sockets = new Map();
        this._onHandshakeCompletedCallback = onHandshakeCompletedCallback;
        this._onPeersReceivedCallback = onPeersReceivedCallback;
        this._onLoadTooHighCallback = onLoadTooHighCallback;
        this._onQuorumSetReceivedCallback = onQuorumSetReceivedCallback;
        this._onNodeDisconnectedCallback = onNodeDisconnectedCallback;
        this._onSCPStatementReceivedCallback = onSCPStatementReceivedCallback;

        this._timeouts = new Map();
        if (usePublicNetwork) {
            this._network = Networks.PUBLIC
        } else {
            this._network = Networks.TESTNET
        }

        //@ts-ignore
        this.networkBuffer = hash(this._network);
        if (!logger) {
            this.initializeDefaultLogger();
        } else {
            this._logger = logger.child({app: 'Connector'});
        }

        if (!FastSigning) {
            this._logger.log('warning', 'FastSigning not enabled',
                {'app': 'Connector'});
        }

        this.pool = pool(__dirname + '/worker/stellar-message-xdr-handler.js');
    }

    setLogger(logger: any) {
        this._logger = logger;
    }

    initializeDefaultLogger() {
        this._logger = winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
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

    async terminate() {
        await this.pool.terminate();
    }

    setTimeout(connection: Connection, durationInMilliseconds: number) {
        this._timeouts.set(connection.toNode.key, setTimeout(() => {
            this._logger.log('debug', 'Listen timeout reached, disconnecting',
                {'host': connection.toNode.key});
            let socket = this._sockets.get(connection.toNode.key);
            if (socket)
                socket.destroy();
        }, durationInMilliseconds));
    }

    connect(keyPair: any /*StellarBase.Keypair*/, toNode: PeerNode, durationInMilliseconds: number) { //todo 'fromNode that encapsulates keypair'
        let socket = new net.Socket();
        socket.setTimeout(2500);
        let connection = new Connection(keyPair, toNode);
        this._sockets.set(connection.toNode.key, socket);
        this.setTimeout(connection, durationInMilliseconds);

        socket
            .on('connect', () => {
                this._logger.log('debug', 'Connected',
                    {'host': connection.toNode.key});
                this.initiateHandShake(connection);
            })
            .on('data', (data) => {
                this._logger.log('debug', 'Rcv data',
                    {'host': connection.toNode.key});
                this.handleData(data, connection);
            })
            .on('error', (err: any) => {
                this._logger.log('info', "Socket error: " + err.code,
                    {'host': connection.toNode.key});

                if (this._sockets.get(connection.toNode.key)) {
                    clearTimeout(this._timeouts.get(connection.toNode.key));
                    this._sockets.delete(connection.toNode.key);
                    this._onNodeDisconnectedCallback(connection);
                }
            })
            .on('close', () => {
                this._logger.log('info', "Connection closed",
                    {'host': connection.toNode.key});
                if (this._sockets.get(connection.toNode.key)) {
                    clearTimeout(this._timeouts.get(connection.toNode.key));
                    this._sockets.delete(connection.toNode.key);
                    this._onNodeDisconnectedCallback(connection);
                }
            })
            .on('timeout', () => {
                this._logger.log('info', "Connection timeout",
                    {'host': connection.toNode.key});
                socket.destroy();
            });

        this._logger.log('info', 'Connect',
            {'host': connection.toNode.key});
        socket.connect(connection.toNode.port, connection.toNode.ip);
    }

    pause(connection: Connection) {
        clearTimeout(this._timeouts.get(connection.toNode.key));
        let socket = this._sockets.get(connection.toNode.key);
        if (socket)
            socket.pause();
    }

    resume(connection: Connection, durationInMilliseconds: number) {
        if (this._sockets.get(connection.toNode.key)) {
            let socket = this._sockets.get(connection.toNode.key);
            if (socket) {
                socket.resume();
                this.setTimeout(connection, durationInMilliseconds);
            }
        }
    }

    disconnect(connection: Connection) {
        clearTimeout(this._timeouts.get(connection.toNode.key));
        let socket = this._sockets.get(connection.toNode.key);
        if (socket) {
            socket.end();
            socket.destroy();
        }
    }

    initiateHandShake(connection: Connection) {
        this._logger.log('debug', "Initiate handshake",
            {'host': connection.toNode.key});
        this.sendHello(connection);
    }

    sendHello(connection: Connection) {
        this._logger.log('debug', "send HELLO",
            {'host': connection.toNode.key});
        this.writeMessageToSocket(
            connection,
            //@ts-ignore
            xdrMessageCreator.createHelloMessage(connection, hash(this._network)),
            false
        );
    }

    continueHandshake(connection: Connection): void {
        this._logger.log('debug', "send AUTH",
            {'host': connection.toNode.key});
        this.sendAuthMessage(connection);
    }

    finishHandshake(connection: Connection): void {
        let socket = this._sockets.get(connection.toNode.key);
        if (socket)
            socket.setTimeout(30000);
        this._logger.log('info', "handshake completed",
            {'host': connection.toNode.key});
        this._onHandshakeCompletedCallback(connection);
    }

    handleData(data: Buffer, connection: Connection) {
        let buffer = undefined;
        let previousBuffer = this._dataBuffers.get(connection.toNode.key);
        if (previousBuffer && previousBuffer.length > 0) {
            buffer = Buffer.concat([previousBuffer, data]);
        } else {
            buffer = data;
        }

        let xdrMessage: Buffer | null = null;
        try {
            let messageLength = xdrBufferConverter.getMessageLengthFromXDRBuffer(buffer);
            while (xdrBufferConverter.xdrBufferContainsCompleteMessage(buffer, messageLength)) {
                [xdrMessage, buffer] = xdrBufferConverter.getMessageFromXdrBuffer(buffer, messageLength);
                this.handleAuthenticatedMessageXDR(xdrMessage, connection);
                messageLength = xdrBufferConverter.getMessageLengthFromXDRBuffer(buffer);
            }
            this._dataBuffers.set(connection.toNode.key, buffer);
        } catch (exception) {
            this._logger.log('error', 'Exception while parsing msg buffer' + exception,
                {'host': connection.toNode.key});
        }
    }

    handleAuthenticatedMessageXDR(authenticatedMessageXDR: Buffer, connection: Connection) {
        let result = parseAuthenticatedMessageXDR(authenticatedMessageXDR);
        if (result.isErr()) {
            this._logger.debug('rcv invalid authenticated msg', {'host': connection.toNode.key});
            return;
        }
        let stellarMessageXDR = result.value.stellarMessageXDR;

        try {
            let messageType = xdr.Int32.fromXDR(result.value.messageTypeXDR);
            switch (result.value.messageTypeXDR.readInt32BE(0)) {
                case MessageType.hello().value:
                    this._logger.log('debug', 'Rcv hello msg',
                        {'host': connection.toNode.key});
                    //we parse the xdr in the main thread, because this is a priority message
                    let hello = xdr.Hello.fromXDR(stellarMessageXDR);//.value();
                    connection.processHelloMessage(hello);
                    this.continueHandshake(connection);
                    break;

                case MessageType.auth().value:
                    this._logger.log('debug', 'rcv auth msg',
                        {'host': connection.toNode.key});
                    this.finishHandshake(connection);
                    break;

                //we handle a scp quorum set message immediately. However this could be better handled with 'dont have' message parsing.
                case MessageType.scpQuorumset().value:
                    this._logger.log('debug', 'rcv scpQuorumSet msg',
                        {'host': connection.toNode.key});
                    let scpQuorumSet = xdr.ScpQuorumSet.fromXDR(stellarMessageXDR);

                    try {
                        this._onQuorumSetReceivedCallback(
                            connection,
                            getQuorumSetFromMessage(scpQuorumSet)
                        );
                    } catch (exception) {
                        this._logger.log('debug', exception);
                    }

                    break;

                case MessageType.errorMsg().value:
                    let error = xdr.Error.fromXDR(stellarMessageXDR);
                    if (error.code() === xdr.ErrorCode.errLoad()) {
                        this._logger.log('info', 'rcv high load msg',
                            {'host': connection.toNode.key});
                        if (this._onLoadTooHighCallback)
                            this._onLoadTooHighCallback(connection);
                    }
                    break;

                //queued worker pool messages
                case MessageType.peers().value:
                    this._logger.log('debug', 'rcv peer msg',
                        {'host': connection.toNode.key});
                    this.pool.proxy()
                        .then(worker => {
                            return worker.handlePeersMessageXDR(stellarMessageXDR, this.networkBuffer);
                        })
                        .then((peers) => {
                            //@ts-ignore
                                this._onPeersReceivedCallback(peers, connection);
                            }
                        ).catch(error => {
                        this._logger.error('Error parsing peers msg',
                            {'host': connection.toNode.key, 'error': error.message});
                    });
                    break;
                case MessageType.scpMessage().value:
                    this._logger.debug('rcv scp msg', {'host': connection.toNode.key});
                    if (this.processedEnvelopes.has(stellarMessageXDR.toString('base64'))) {
                        return;
                    }
                    this.processedEnvelopes.set(stellarMessageXDR.toString('base64'), 1);
                    this.pool.proxy()
                        .then(worker => {
                            return worker.handleSCPMessageXDR(stellarMessageXDR, this.networkBuffer)
                        })
                        .then((message) => {
                            //@ts-ignore
                                this._onSCPStatementReceivedCallback(connection, message);
                            }
                        ).catch(error => {
                        this._logger.error('Error parsing scp msg',
                            {'host': connection.toNode.key, 'error': error.message});
                    });

                    break;

                //todo: define in app settings if transactions should be processed.
                case MessageType.transaction().value://transaction
                    this._logger.log('debug', 'rcv transaction msg',
                            {'host': connection.toNode.key});
                    break;

                default:
                    this._logger.log('debug', 'rcv unsupported msg type' + messageType,
                        {'host': connection.toNode.key});
            }
        } catch
            (e) {
            console.log(e)
        }

    }

    sendGetQuorumSet(hash: Buffer, connection: Connection) {
        this._logger.log('debug', 'send get quorum set',
            {'host': connection.toNode.key});

        this.writeMessageToSocket(
            connection,
            xdrMessageCreator.createScpQuorumSetMessage(hash)
        );
    }

    sendGetScpStatus(connection: Connection, ledgerSequence: number = 0) {
        this._logger.log('debug', 'send get scp status for ledger: ' + ledgerSequence,
            {'host': connection.toNode.key});

        this.writeMessageToSocket(
            connection,
            xdrMessageCreator.createGetScpStatusMessage(ledgerSequence)
        );
    }

    sendGetPeers(connection: Connection) {
        this._logger.log('debug', 'send get peers msg',
            {'host': connection.toNode.key});

        this.writeMessageToSocket(
            connection,
            xdrMessageCreator.createGetPeersMessage()
        );
    }

    sendAuthMessage(connection: Connection) {
        this._logger.log('debug', 'send auth msg',
            {'host': connection.toNode.key});

        this.writeMessageToSocket(
            connection,
            xdrMessageCreator.createAuthMessage(),
            false
        );
    }

    writeMessageToSocket(connection: Connection, message: StellarMessage, handShakeComplete: boolean = true
    ) {
        let socket = this._sockets.get(connection.toNode.key);

        if (socket) {
            socket.write(
                xdrBufferConverter.getXdrBufferFromMessage(
                    connection.authenticateMessage(message, handShakeComplete)
                )
            );
        }
    }
}