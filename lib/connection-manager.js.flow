// @flow
import type Socket from 'net';

const StellarBase = require('stellar-base');
const Node = require("@stellarbeat/js-stellar-domain").Node;
const QuorumSet = require("@stellarbeat/js-stellar-domain").QuorumSet;
const net = require('net');
const xdrService = require('./xdr-service');
const messageService = require("./message-service");
const Connection = require("./connection");
const winston = require("winston");
require('dotenv').config();
const Transaction = require('stellar-base').Transaction;
const ScpStatement = require('./scp-statement');

class ConnectionManager {
    _sockets: Map<string, Socket>;
    _onHandshakeCompletedCallback: (connection: Connection) => void;
    _onPeersReceivedCallback: (peers: Array<Node>, connection: Connection) => void;
    _onLoadTooHighCallback: (connection: Connection) => void;
    _onQuorumSetHashDetectedCallback: (connection: Connection, quorumSetHash: string, quorumSetOwnerPublicKey: string) => void;
    _onQuorumSetReceivedCallback: (connection: Connection, quorumSet: QuorumSet) => void;
    _onNodeDisconnectedCallback: (connection: Connection) => void;
    _logger: any;
    _dataBuffers:Array<Buffer>;

    constructor(
        usePublicNetwork: boolean = true,
        onHandshakeCompletedCallback: (connection: Connection) => void,
        onPeersReceivedCallback: (peers: Array<Node>, connection: Connection) => void,
        onLoadTooHighCallback: (connection: Connection) => void,
        onQuorumSetHashDetectedCallback: (connection: Connection, quorumSetHash: string, quorumSetOwnerPublicKey: string) => void,
        onQuorumSetReceivedCallback: (connection: Connection, quorumSet: QuorumSet) => void,
        onNodeDisconnectedCallback: (connection: Connection) => void,
        logger
    ) {
        this._sockets = new Map();
        this._onHandshakeCompletedCallback = onHandshakeCompletedCallback;
        this._onPeersReceivedCallback = onPeersReceivedCallback;
        this._onLoadTooHighCallback = onLoadTooHighCallback;
        this._onQuorumSetHashDetectedCallback = onQuorumSetHashDetectedCallback;
        this._onQuorumSetReceivedCallback = onQuorumSetReceivedCallback;
        this._onNodeDisconnectedCallback = onNodeDisconnectedCallback;
        this._dataBuffers = [];
        if (usePublicNetwork) {
            StellarBase.Network.usePublicNetwork();
        } else {
            StellarBase.Network.useTestNetwork();
        }

        if(!logger) {
            this.initializeDefaultLogger();
        } else {
            this._logger = logger;
        }
    }

    setLogger(logger: any) {
        this._logger = logger;
    }

    initializeDefaultLogger() {
        this._logger = winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.timestamp({
                    format: 'YYYY-MM-DD HH:mm:ss'
                }),
                winston.format.printf(info => `[${info.level}] ${info.timestamp} ${info.message}`)
            ),
            transports: [
                new winston.transports.Console()
            ]
        });
    }

    connect(keyPair: StellarBase.Keypair, toNode: Node, durationInMilliseconds: number) { //todo 'fromNode that encapsulates keypair'
        toNode.active = false; //when we can connect to it, or it is overloaded, we mark it as active
        toNode.overLoaded = false; //only when we receive an overloaded message, we mark it as overloaded
        let socket = new net.Socket();
        socket.setTimeout(2000);
        let connection = new Connection(keyPair, toNode);
        this._sockets.set(connection.toNode.key, socket);
        let timeout = setTimeout(() => {
            this._logger.log('debug','[CONNECTION] ' + connection.toNode.key + ': Listen timeout reached, disconnecting');
            socket.destroy();
        }, durationInMilliseconds);

        socket
            .on('connect', () => {
                this._logger.log('info','[CONNECTION] ' + connection.toNode.key + ': Connected');
                this.initiateHandShake(connection);
            })
            .on('data', (data) => {
                this._logger.log('debug','[CONNECTION] ' + connection.toNode.key + ': Data received.');
                this.handleData(data, connection);
            })
            .on('error', (err) => {
                if (err.code === "ENOTFOUND") {
                    this._logger.log('info',"[CONNECTION] " + connection.toNode.key + " Socket error. No device found at this address.");
                } else if (err.code === "ECONNREFUSED") {
                    this._logger.log('info',"[CONNECTION] " + connection.toNode.key + " Socket error. Connection refused with message: " + err.message);
                } else {
                    this._logger.log('info',"[CONNECTION] " + connection.toNode.key + " Socket error." + err.message);
                }
            })
            .on('disconnect', function () {
                this._logger.log('info',"[CONNECTION] " + connection.toNode.key + " Node disconnected.");
            })
            .on('close', () => {
                this._logger.log('info',"[CONNECTION] " + connection.toNode.key + " Node closed connection");
                clearTimeout(timeout);
                this._sockets.delete(connection.toNode.key);
                this._onNodeDisconnectedCallback(connection);
            })
            .on('timeout', () => {
                this._logger.log('info',"[CONNECTION] " + connection.toNode.key + " Node took too long to respond, disconnecting");
                socket.destroy();
            });

        this._logger.log('info','[CONNECTION] ' + connection.toNode.key + ': Connect');
        socket.connect(connection.toNode.port, connection.toNode.ip);
    }

    initiateHandShake(connection: Connection) {
        this._logger.log('info',"[CONNECTION] " + connection.toNode.key + ": Initiate handshake");
        this.sendHello(connection);
    }

    sendHello(connection: Connection) {
        this._logger.log('debug',"[CONNECTION] " + connection.toNode.key + ": Send HELLO message");
        this.writeMessageToSocket(
            connection,
            messageService.createHelloMessage(connection, StellarBase.Network.current().networkId()),
            false
        );
    }

    continueHandshake(connection: Connection): void {
        this._logger.log('debug',"[CONNECTION] " + connection.toNode.key + ": Continue handshake");
        this.sendAuthMessage(connection);
    }

    finishHandshake(connection: Connection): void {
        this._sockets.get(connection.toNode.key).setTimeout(30000);
        this._logger.log('info',"[CONNECTION] " + connection.toNode.key + ": Finish handshake, marking node as active");
        connection.toNode.active = true;
        this._onHandshakeCompletedCallback(connection);
    }

    handleData(data: ArrayBuffer, connection: Connection) {
        let buffer = undefined;

        if(this._dataBuffers[connection.toNode.key]) {
            buffer = Buffer.concat([this._dataBuffers[connection.toNode.key], data]);
        } else {
            buffer = data;
        }
        let xdrMessage = null;
        try {
            while (xdrService.xdrBufferContainsNextMessage(buffer)) {
                [xdrMessage, buffer] = xdrService.getNextMessageFromXdrBuffer(buffer);
                let authenticatedMessage = StellarBase.xdr.AuthenticatedMessage.fromXDR(xdrMessage).get();
                this._logger.log('debug','[CONNECTION] ' + connection.toNode.key + ': data contains an authenticated message.');
                this.handleReceivedAuthenticatedMessage(authenticatedMessage, connection);
            }
            this._dataBuffers[connection.toNode.key] = buffer;
        }
        catch (exception) {
            this._logger.log('debug','[CONNECTION] ' + connection.toNode.key + ': Exception ' + exception);
        }
    }

    handleReceivedAuthenticatedMessage(authenticatedMessage, connection: Connection) {
        switch (authenticatedMessage.message().arm()) {

            case 'hello':
                this._logger.log('debug','[CONNECTION] ' + connection.toNode.key + ': Authenticated message contains a HELLO message.');
                this._logger.log('debug','[CONNECTION] ' + connection.toNode.key + ': Updating toNode information from HELLO message');
                messageService.updateNodeInformation(
                    authenticatedMessage.message().get(),
                    connection
                );
                this.continueHandshake(connection);
                break;

            case 'auth':
                this._logger.log('debug','[CONNECTION] ' + connection.toNode.key + ': Authenticated message contains an AUTH message.');
                this.finishHandshake(connection);
                break;

            case 'peers':
                this._logger.log('debug','[CONNECTION] ' + connection.toNode.key + ': Authenticated message contains a PEERS message.');
                this.handleReceivedPeersMessage(authenticatedMessage.message().get(), connection);
                break;

            case 'error':
                this._logger.log('debug','[CONNECTION] ' + connection.toNode.key + ': Authenticated message contains a an error message: ' + authenticatedMessage.message().get().code().name);
                if (messageService.isLoadErrorMessage(authenticatedMessage.message().get())) {
                    connection.toNode.active = true; //a node could be overloaded for a (very) short time period, so if we cannot complete a handshake because of this, we mark it as active.
                    connection.toNode.overLoaded = true;
                    if (this._onLoadTooHighCallback)
                        this._onLoadTooHighCallback(connection);
                }
                break;

            case 'envelope':
                this._logger.log('debug','[CONNECTION] ' + connection.toNode.key + ': Authenticated message contains an envelope message.');
                let statement = ScpStatement.fromXdr(authenticatedMessage.message().get().statement());

                this._onQuorumSetHashDetectedCallback(
                    connection,
                    statement.quorumSetHash,
                    statement.nodeId
                );
                break;

            case 'transaction':
                this._logger.log('debug','[CONNECTION] ' + connection.toNode.key + ': Authenticated message contains a transaction message.');
                let transaction = new Transaction(authenticatedMessage.message().get());
                break; //todo callback

            case 'qSet':
                this._logger.log('debug','[CONNECTION] ' + connection.toNode.key + ': Authenticated message contains a scpQuorumset message.');

                try {
                    this._onQuorumSetReceivedCallback(
                        connection,
                        messageService.getQuorumSetFromMessage(authenticatedMessage.message().get())
                    );
                } catch (exception) {
                    this._logger.log('debug',exception);
                }

                break; //todo callback

            default:
                this._logger.log('debug','[CONNECTION] ' + connection.toNode.key + ': unhandled message type received: ' + authenticatedMessage.message().arm());
        }

    }

    handleReceivedPeersMessage(peersMessage, connection: Connection) {
        this._logger.log('debug','[CONNECTION] ' + connection.toNode.key + ': PEERS message contains ' + peersMessage.length + " peers");

        this._onPeersReceivedCallback(peersMessage.map((peerAddress) => {
            return new Node(
                messageService.getIpFromPeerAddress(peerAddress),
                peerAddress.port()
            )
        }), connection);
    }

    sendGetQuorumSet(hash: Buffer, connection: Connection) {
        this._logger.log('debug','[CONNECTION] ' + connection.toNode.key + ': Sending GET SCP QUORUM SET message');

        this.writeMessageToSocket(
            connection,
            messageService.createScpQuorumSetMessage(hash)
        );
    }

    sendGetPeers(connection: Connection) {
        this._logger.log('debug','[CONNECTION] ' + connection.toNode.key + ': Sending GET PEERS message');

        this.writeMessageToSocket(
            connection,
            messageService.createGetPeersMessage()
        );
    }

    sendAuthMessage(connection: Connection) {
        this._logger.log('debug','[CONNECTION] ' + connection.toNode.key + ': Sending AUTH message');

        this.writeMessageToSocket(
            connection,
            messageService.createAuthMessage(),
            false
        );
    }

    writeMessageToSocket(connection: Connection, message: StellarBase.xdr.StellarMessage, handShakeComplete: boolean = true) {
        let socket = this._sockets.get(connection.toNode.key);
        if (socket) {
            socket.write(
                xdrService.getXdrBufferFromMessage(
                    connection.authenticateMessage(message, handShakeComplete)
                )
            );
        }
    }
}

module.exports = ConnectionManager;