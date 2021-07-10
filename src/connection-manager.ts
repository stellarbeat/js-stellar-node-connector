import {FastSigning, hash, Keypair, Networks, xdr} from "stellar-base";

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
import {pool, WorkerPool} from 'workerpool';
import MessageType = xdr.MessageType;
import {
    handleErrorMessageXDR,
    handleHelloMessageXDR,
    handleSCPQuorumSetMessageXDR,
    parseAuthenticatedMessageXDR
} from "./xdr-message-handler";
import * as LRUCache from "lru-cache";
import StellarMessage = xdr.StellarMessage;
import {err, ok, Result} from "neverthrow";
import AuthenticatedMessage = xdr.AuthenticatedMessage;
import {ConnectionAuthentication} from "./connection-authentication";

type nodeKey = string;

export class ConnectionManager {
    _onNodeConnectedCallback: (node: PeerNode) => void;
    _onPeersReceivedCallback: (peers: Array<PeerNode>, node: PeerNode) => void;
    _onLoadTooHighCallback: (node: PeerNode) => void;
    _onQuorumSetReceivedCallback: (quorumSet: QuorumSet, node: PeerNode) => void;
    _onNodeDisconnectedCallback: (node: PeerNode) => void;
    _onSCPStatementReceivedCallback: (SCPStatement: SCPStatement, node: PeerNode) => void;

    protected logger!: Logger;
    protected dataBuffers: Map<string, Buffer> = new Map<string, Buffer>();
    protected network: string;
    protected activeConnections: Map<nodeKey, Connection> = new Map(); //a node is connected when handshake is completed
    protected keyPair: Keypair;
    protected networkBuffer: Buffer;
    protected pool: WorkerPool;
    protected processedEnvelopes = new LRUCache(5000);
    protected connectionAuthication: ConnectionAuthentication;

    constructor(
        usePublicNetwork: boolean = true,
        _onNodeConnectedCallback: (node: PeerNode) => void,
        onPeersReceivedCallback: (peers: Array<PeerNode>, node: PeerNode) => void,
        onLoadTooHighCallback: (node: PeerNode) => void,
        onSCPStatementReceivedCallback: (SCPStatement: SCPStatement, node: PeerNode) => void,
        onQuorumSetReceivedCallback: (quorumSet: QuorumSet, node: PeerNode) => void,
        onNodeDisconnectedCallback: (node: PeerNode) => void,
        logger: Logger
    ) {
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
        let privateKey = process.env.CONNECTION_PRIVATE_KEY;
        if (privateKey) {
            try {
                this.keyPair = Keypair.fromSecret(privateKey);
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
        this.networkBuffer = hash(this.network);


        if (!FastSigning) {
            this.logger.log('warning', 'FastSigning not enabled',
                {'app': 'Connector'});
        }

        this.connectionAuthication = new ConnectionAuthentication(this.keyPair, this.networkBuffer);
        this.pool = pool(__dirname + '/worker/stellar-message-xdr-handler.js');
    }

    setLogger(logger: any) {
        this.logger = logger;
    }

    protected initializeDefaultLogger() {
        this.logger = winston.createLogger({
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

    connect(toNode: PeerNode) {
        let socket = new net.Socket();
        let socketTimeoutString = process.env.SOCKET_TIMEOUT;
        if (socketTimeoutString && !isNaN(parseInt(socketTimeoutString))) {
            socket.setTimeout(parseInt(socketTimeoutString));
        } else {
            socket.setTimeout(2500);
        }

        let connection = new Connection(this.keyPair, toNode, socket, this.connectionAuthication);

        socket
            .on('connect', () => {
                this.logger.log('debug', 'Socket connection established',
                    {'host': connection.toNode.key});
                this.initiateHandShake(connection);
            })
            .on('data', (data) => {
                this.logger.log('debug', 'Rcv data',
                    {'host': connection.toNode.key});
                this.handleData(data, connection);
            })
            .on('error', (err: any) => {
                this.logger.log('info', "Socket error: " + err.code,
                    {'host': connection.toNode.key});
            })
            .on('close', () => {
                this.logger.log('info', "Connection closed",
                    {'host': connection.toNode.key});
                this.activeConnections.delete(connection.toNode.key);
                this._onNodeDisconnectedCallback(connection.toNode);
            })
            .on('timeout', () => {
                this.logger.log('info', "Connection timeout, closing",
                    {'host': connection.toNode.key});
                socket.destroy();
            });

        this.logger.log('info', 'Connect',
            {'host': connection.toNode.key});
        socket.connect(connection.toNode.port, connection.toNode.ip);
        this.activeConnections.set(connection.toNode.key, connection);
    }

    async terminate() {
        await this.pool.terminate();
    }

    pause(node: PeerNode): Result<void, Error> {
        let connection = this.activeConnections.get(node.key);
        if (!connection)
            return err(new Error("No active connection"));

        connection.socket.pause();

        return ok(undefined);
    }

    resume(node: PeerNode): Result<void, Error> {
        let connection = this.activeConnections.get(node.key);
        if (!connection)
            return err(new Error("No active connection"));

        connection.socket.resume();
        return ok(undefined);

    }

    disconnect(node: PeerNode): Result<void, Error> {
        this.logger.log('debug', 'disconnect requested',
            {'host': node.key});
        let connection = this.activeConnections.get(node.key);
        if (!connection)
            return err(new Error("No active connection"));

        connection.socket.destroy();

        return ok(undefined);
    }

    sendGetQuorumSet(node: PeerNode, hash: Buffer): Result<void, Error> {
        this.logger.log('debug', 'send get quorum set',
            {'host': node.key});

        let result = this.sendStellarMessage(
            node,
            xdrMessageCreator.createScpQuorumSetMessage(hash)
        );

        if (result.isErr())
            return err(result.error);

        return ok(undefined);
    }

    sendGetScpStatus(node: PeerNode, ledgerSequence: number = 0): Result<void, Error> {
        this.logger.log('debug', 'send get scp status for ledger: ' + ledgerSequence,
            {'host': node.key});

        let result = this.sendStellarMessage(
            node,
            xdrMessageCreator.createGetScpStatusMessage(ledgerSequence)
        )

        if (result.isErr())
            return err(result.error);

        return ok(undefined);
    }

    sendGetPeers(node: PeerNode): Result<void, Error> {
        this.logger.log('debug', 'send get peers msg',
            {'host': node.key});

        let result = this.sendStellarMessage(
            node,
            xdrMessageCreator.createGetPeersMessage()
        )

        if (result.isErr())
            return err(result.error);

        return ok(undefined);
    }

    isNodeConnected(node: PeerNode) {//for the outside world, a node is connected when it has completed a handshake
        let connection = this.activeConnections.get(node.key);
        if (!connection)
            return false;

        return connection.handshakeCompleted;
    }

    protected initiateHandShake(connection: Connection) {
        this.logger.log('debug', "send HELLO",
            {'host': connection.toNode.key});
        let helloResult = xdrMessageCreator.createHelloMessage(connection, this.networkBuffer);
        if (helloResult.isErr()) {
            this.logger.log('error', "error creating hello msg",
                {'host': connection.toNode.key, error: helloResult.error});
            return;
        }

        let result = this.sendStellarMessage(
            connection.toNode,
            //@ts-ignore
            helloResult.value,
            true
        );

        if (result.isErr())
            this.logger.log('error', 'send hello msg failed',
                {'host': connection.toNode.key, error: result.error.message});
    }

    protected continueHandshake(connection: Connection): void {
        this.logger.log('debug', "send AUTH",
            {'host': connection.toNode.key});
        this.sendAuthMessage(connection);
    }

    protected finishHandshake(connection: Connection): void {
        this.logger.log('info', "Fully connected",
            {'host': connection.toNode.key});
        connection.handshakeCompleted = true;
        this._onNodeConnectedCallback(connection.toNode);
    }

    protected handleData(data: Buffer, connection: Connection) {
        let buffer;
        let previousBuffer = this.dataBuffers.get(connection.toNode.key);
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
            this.dataBuffers.set(connection.toNode.key, buffer);
        } catch (exception) {
            this.logger.log('error', 'Exception while parsing msg buffer' + exception,
                {'host': connection.toNode.key});
        }
    }

    protected handleAuthenticatedMessageXDR(authenticatedMessageXDR: Buffer, connection: Connection) {
        let result = parseAuthenticatedMessageXDR(authenticatedMessageXDR);
        if (result.isErr()) {
            this.logger.debug('rcv invalid authenticated msg', {'host': connection.toNode.key});
            return;
        }

        try {
            let stellarMessageXDR = result.value.stellarMessageXDR;

            if(!connection.remoteSequence.equals(result.value.sequenceNumberXDR)) {//must be handled on main thread because workers could mix up order of messages.
                this.logger.log('debug', 'Drop msg with wrong seq number',
                    {
                        'host': connection.toNode.key, 'expected': connection.remoteSequence.toString(),
                        'received': xdr.Uint64.fromXDR(result.value.sequenceNumberXDR).toString()
                    });
                return;
            }

           let data = Buffer.concat([
                result.value.sequenceNumberXDR,
                result.value.messageTypeXDR,
                result.value.stellarMessageXDR
            ]);

            let messageType = result.value.messageTypeXDR.readInt32BE(0);
            if(messageType !== MessageType.hello().value && messageType !== MessageType.errorMsg().value){
                connection.increaseRemoteSequenceByOne();
                let verified = connection.connectionAuthentication.verifyMac(result.value.macXDR, connection.receivingMacKey!, data);
                if(!verified){
                    this.logger.log('debug', 'Drop msg with invalid mac',
                        {
                            'host': connection.toNode.key
                        });
                    return;
                }
            }

            switch (messageType) {
                case MessageType.hello().value:
                    this.logger.log('debug', 'Rcv hello msg',
                        {'host': connection.toNode.key});
                    //we parse the xdr in the main thread, because this is a priority message
                    let helloResult = handleHelloMessageXDR(stellarMessageXDR, connection);
                    if(helloResult.isOk())
                        this.continueHandshake(connection);
                    else {
                        this.logger.log('info', 'Error handling hello',
                            {'host': connection.toNode.key});
                        connection.socket.destroy();
                    }
                    break;
                case MessageType.auth().value:
                    this.logger.log('debug', 'rcv auth msg',
                        {'host': connection.toNode.key});
                    this.finishHandshake(connection);
                    break;

                //we handle a scp quorum set message immediately. However this could be better handled with 'dont have' message parsing.
                case MessageType.scpQuorumset().value:
                    this.logger.log('debug', 'rcv scpQuorumSet msg',
                        {'host': connection.toNode.key});
                    let quorumSetResult = handleSCPQuorumSetMessageXDR(stellarMessageXDR);
                    if (quorumSetResult.isErr()) {
                        this.logger.log('debug', 'Error parsing qset msg',
                            {'host': connection.toNode.key, 'error': quorumSetResult.error.message});
                    } else {
                        this._onQuorumSetReceivedCallback(
                            quorumSetResult.value, connection.toNode
                        );
                    }
                    break;

                case MessageType.errorMsg().value:
                    let errorResult = handleErrorMessageXDR(stellarMessageXDR);
                    if(errorResult.isErr()){
                        this.logger.log('debug', 'Error parsing error msg',
                            {'host': connection.toNode.key}, errorResult.error);
                    }else if (errorResult.value.code() === xdr.ErrorCode.errLoad()) {
                        this.logger.log('info', 'rcv high load msg',
                            {'host': connection.toNode.key});
                        if (this._onLoadTooHighCallback)
                            this._onLoadTooHighCallback(connection.toNode);
                    } else {
                        this.logger.log('info', 'Error msg received',
                            {'host': connection.toNode.key, error: errorResult.value.msg().toString()});
                    }
                    break;

                //queued worker pool messages
                case MessageType.peers().value:
                    this.logger.log('debug', 'rcv peer msg',
                        {'host': connection.toNode.key});
                    this.pool.proxy()
                        .then(worker => {
                            return worker.handlePeersMessageXDR(stellarMessageXDR, this.networkBuffer);
                        })
                        .then((peers) => {
                                //@ts-ignore
                                this._onPeersReceivedCallback(peers, connection.toNode);
                            }
                        ).catch(error => {
                        this.logger.error('Error parsing peers msg',
                            {'host': connection.toNode.key, 'error': error.message});
                    });
                    break;
                case MessageType.scpMessage().value:
                    this.logger.debug('rcv scp msg', {'host': connection.toNode.key});
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
                                this._onSCPStatementReceivedCallback(message, connection.toNode);
                            }
                        ).catch(error => {
                        this.logger.error('Error parsing scp msg',
                            {'host': connection.toNode.key, 'error': error.message});
                    });

                    break;

                //todo: define in app settings if transactions should be processed.
                case MessageType.transaction().value://transaction
                    this.logger.log('debug', 'rcv transaction msg',
                        {'host': connection.toNode.key});
                    break;

                default:
                    this.logger.log('debug', 'rcv unsupported msg type' + messageType,
                        {'host': connection.toNode.key});
            }
        } catch
            (e) {
            console.log(e)
        }

    }

    protected sendAuthMessage(connection: Connection) {
        this.logger.log('debug', 'send auth msg',
            {'host': connection.toNode.key});

        let result = this.sendStellarMessage(
            connection.toNode,
            xdrMessageCreator.createAuthMessage(),
            true
        );

        if (result.isErr())
            this.logger.log('debug', 'send auth msg failed',
                {'host': connection.toNode.key, error: result.error.message});
    }

    protected sendStellarMessage(node: PeerNode, message: StellarMessage, handshakeMessage: boolean = false): Result<void, Error> {
        let connection = this.activeConnections.get(node.key);
        if (!connection)
            return err(new Error("No active connection"));

        if (handshakeMessage && connection.handshakeCompleted)
            return err(new Error("Cannot send msg, handshake already completed"));

        if (!handshakeMessage && !connection.handshakeCompleted)
            return err(new Error("Cannot send msg, handshake not yet completed"));

        let authMsgResult = connection.authenticateMessage(message);
        if (message.switch() !== MessageType.hello())
            connection.increaseLocalSequenceByOne();

        if (authMsgResult.isErr())
            return err(authMsgResult.error);

        let result = this.writeMessageToSocket(connection.socket, authMsgResult.value);
        if (result.isErr())
            return err(result.error);

        return ok(result.value);
    }

    protected writeMessageToSocket(socket: net.Socket, message: AuthenticatedMessage): Result<void, Error> {
        if (!socket.writable)
            return err(new Error("Socket not writable"));

        let bufferResult = xdrBufferConverter.getXdrBufferFromMessage(message);
        if(bufferResult.isErr()){
            return err(bufferResult.error);
        }

        if (!socket.write(bufferResult.value)) //todo: implement callback to notify when command was sent successfully.
            return err(new Error("Could not write to socket"));

        return ok(undefined);
    }
}