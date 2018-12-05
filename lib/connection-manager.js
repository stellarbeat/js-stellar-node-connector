"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const StellarBase = require('stellar-base');
const js_stellar_domain_1 = require("@stellarbeat/js-stellar-domain");
const net = require("net");
const xdr_service_1 = require("./xdr-service");
const message_service_1 = require("./message-service");
const connection_1 = require("./connection");
const winston = require("winston");
require('dotenv').config();
const Transaction = require('stellar-base').Transaction;
const scp_statement_1 = require("./scp-statement");
class ConnectionManager {
    constructor(usePublicNetwork = true, onHandshakeCompletedCallback, onPeersReceivedCallback, onLoadTooHighCallback, onQuorumSetHashDetectedCallback, onQuorumSetReceivedCallback, onNodeDisconnectedCallback, logger) {
        this._sockets = new Map();
        this._onHandshakeCompletedCallback = onHandshakeCompletedCallback;
        this._onPeersReceivedCallback = onPeersReceivedCallback;
        this._onLoadTooHighCallback = onLoadTooHighCallback;
        this._onQuorumSetHashDetectedCallback = onQuorumSetHashDetectedCallback;
        this._onQuorumSetReceivedCallback = onQuorumSetReceivedCallback;
        this._onNodeDisconnectedCallback = onNodeDisconnectedCallback;
        this._dataBuffers = [];
        this._timeouts = new Map();
        if (usePublicNetwork) {
            StellarBase.Network.usePublicNetwork();
        }
        else {
            StellarBase.Network.useTestNetwork();
        }
        if (!logger) {
            this.initializeDefaultLogger();
        }
        else {
            this._logger = logger;
        }
    }
    setLogger(logger) {
        this._logger = logger;
    }
    initializeDefaultLogger() {
        this._logger = winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: winston.format.combine(winston.format.colorize(), winston.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss'
            }), winston.format.printf(info => `[${info.level}] ${info.timestamp} ${info.message}`)),
            transports: [
                new winston.transports.Console()
            ]
        });
    }
    setTimeout(connection, durationInMilliseconds) {
        this._timeouts.set(connection.toNode.key, setTimeout(() => {
            this._logger.log('debug', '[CONNECTION] ' + connection.toNode.key + ': Listen timeout reached, disconnecting');
            this._sockets.get(connection.toNode.key).destroy();
        }, durationInMilliseconds));
    }
    connect(keyPair /*StellarBase.Keypair*/, toNode, durationInMilliseconds) {
        toNode.active = false; //when we can connect to it, or it is overloaded, we mark it as active
        toNode.overLoaded = false; //only when we receive an overloaded message, we mark it as overloaded
        let socket = new net.Socket();
        socket.setTimeout(2000);
        let connection = new connection_1.Connection(keyPair, toNode);
        this._sockets.set(connection.toNode.key, socket);
        this.setTimeout(connection, durationInMilliseconds);
        socket
            .on('connect', () => {
            this._logger.log('info', '[CONNECTION] ' + connection.toNode.key + ': Connected');
            this.initiateHandShake(connection);
        })
            .on('data', (data) => {
            this._logger.log('debug', '[CONNECTION] ' + connection.toNode.key + ': Data received.');
            this.handleData(data, connection);
        })
            .on('error', (err) => {
            if (err.code === "ENOTFOUND") {
                this._logger.log('info', "[CONNECTION] " + connection.toNode.key + " Socket error. No device found at this address.");
            }
            else if (err.code === "ECONNREFUSED") {
                this._logger.log('info', "[CONNECTION] " + connection.toNode.key + " Socket error. Connection refused with message: " + err.message);
            }
            else {
                this._logger.log('info', "[CONNECTION] " + connection.toNode.key + " Socket error." + err.message);
            }
        })
            .on('disconnect', function () {
            this._logger.log('info', "[CONNECTION] " + connection.toNode.key + " Node disconnected.");
        })
            .on('close', () => {
            this._logger.log('info', "[CONNECTION] " + connection.toNode.key + " Node closed connection");
            clearTimeout(this._timeouts.get(connection.toNode.key));
            this._sockets.delete(connection.toNode.key);
            this._onNodeDisconnectedCallback(connection);
        })
            .on('timeout', () => {
            this._logger.log('info', "[CONNECTION] " + connection.toNode.key + " Node took too long to respond, disconnecting");
            socket.destroy();
        });
        this._logger.log('info', '[CONNECTION] ' + connection.toNode.key + ': Connect');
        socket.connect(connection.toNode.port, connection.toNode.ip);
    }
    pause(connection) {
        clearTimeout(this._timeouts.get(connection.toNode.key));
        this._sockets.get(connection.toNode.key).pause();
    }
    resume(connection, durationInMilliseconds) {
        this._timeouts.set(connection.toNode.key, durationInMilliseconds);
        this._sockets.get(connection.toNode.key).resume();
    }
    initiateHandShake(connection) {
        this._logger.log('info', "[CONNECTION] " + connection.toNode.key + ": Initiate handshake");
        this.sendHello(connection);
    }
    sendHello(connection) {
        this._logger.log('debug', "[CONNECTION] " + connection.toNode.key + ": Send HELLO message");
        this.writeMessageToSocket(connection, message_service_1.default.createHelloMessage(connection, StellarBase.Network.current().networkId()), false);
    }
    continueHandshake(connection) {
        this._logger.log('debug', "[CONNECTION] " + connection.toNode.key + ": Continue handshake");
        this.sendAuthMessage(connection);
    }
    finishHandshake(connection) {
        this._sockets.get(connection.toNode.key).setTimeout(30000);
        this._logger.log('info', "[CONNECTION] " + connection.toNode.key + ": Finish handshake, marking node as active");
        connection.toNode.active = true;
        this._onHandshakeCompletedCallback(connection);
    }
    handleData(data, connection) {
        let buffer = undefined;
        if (this._dataBuffers[connection.toNode.key]) {
            buffer = Buffer.concat([this._dataBuffers[connection.toNode.key], data]);
        }
        else {
            buffer = data;
        }
        let xdrMessage = null;
        try {
            while (xdr_service_1.default.xdrBufferContainsNextMessage(buffer)) {
                [xdrMessage, buffer] = xdr_service_1.default.getNextMessageFromXdrBuffer(buffer);
                let authenticatedMessage = StellarBase.xdr.AuthenticatedMessage.fromXDR(xdrMessage).get();
                this._logger.log('debug', '[CONNECTION] ' + connection.toNode.key + ': data contains an authenticated message.');
                this.handleReceivedAuthenticatedMessage(authenticatedMessage, connection);
            }
            this._dataBuffers[connection.toNode.key] = buffer;
        }
        catch (exception) {
            this._logger.log('debug', '[CONNECTION] ' + connection.toNode.key + ': Exception ' + exception);
        }
    }
    handleReceivedAuthenticatedMessage(authenticatedMessage, connection) {
        switch (authenticatedMessage.message().arm()) {
            case 'hello':
                this._logger.log('debug', '[CONNECTION] ' + connection.toNode.key + ': Authenticated message contains a HELLO message.');
                this._logger.log('debug', '[CONNECTION] ' + connection.toNode.key + ': Updating toNode information from HELLO message');
                message_service_1.default.updateNodeInformation(authenticatedMessage.message().get(), connection);
                this.continueHandshake(connection);
                break;
            case 'auth':
                this._logger.log('debug', '[CONNECTION] ' + connection.toNode.key + ': Authenticated message contains an AUTH message.');
                this.finishHandshake(connection);
                break;
            case 'peers':
                this._logger.log('debug', '[CONNECTION] ' + connection.toNode.key + ': Authenticated message contains a PEERS message.');
                this.handleReceivedPeersMessage(authenticatedMessage.message().get(), connection);
                break;
            case 'error':
                this._logger.log('debug', '[CONNECTION] ' + connection.toNode.key + ': Authenticated message contains a an error message: ' + authenticatedMessage.message().get().code().name);
                if (message_service_1.default.isLoadErrorMessage(authenticatedMessage.message().get())) {
                    connection.toNode.active = true; //a node could be overloaded for a (very) short time period, so if we cannot complete a handshake because of this, we mark it as active.
                    connection.toNode.overLoaded = true;
                    if (this._onLoadTooHighCallback)
                        this._onLoadTooHighCallback(connection);
                }
                break;
            case 'envelope':
                this._logger.log('debug', '[CONNECTION] ' + connection.toNode.key + ': Authenticated message contains an envelope message.');
                let statement = scp_statement_1.SCPStatement.fromXdr(authenticatedMessage.message().get().statement());
                this._onQuorumSetHashDetectedCallback(connection, statement.quorumSetHash, statement.nodeId);
                break;
            case 'transaction':
                this._logger.log('debug', '[CONNECTION] ' + connection.toNode.key + ': Authenticated message contains a transaction message.');
                let transaction = new Transaction(authenticatedMessage.message().get());
                break; //todo callback
            case 'qSet':
                this._logger.log('debug', '[CONNECTION] ' + connection.toNode.key + ': Authenticated message contains a scpQuorumset message.');
                try {
                    this._onQuorumSetReceivedCallback(connection, message_service_1.default.getQuorumSetFromMessage(authenticatedMessage.message().get()));
                }
                catch (exception) {
                    this._logger.log('debug', exception);
                }
                break; //todo callback
            default:
                this._logger.log('debug', '[CONNECTION] ' + connection.toNode.key + ': unhandled message type received: ' + authenticatedMessage.message().arm());
        }
    }
    handleReceivedPeersMessage(peersMessage, connection) {
        this._logger.log('debug', '[CONNECTION] ' + connection.toNode.key + ': PEERS message contains ' + peersMessage.length + " peers");
        this._onPeersReceivedCallback(peersMessage.map((peerAddress) => {
            return new js_stellar_domain_1.Node(message_service_1.default.getIpFromPeerAddress(peerAddress), peerAddress.port());
        }), connection);
    }
    sendGetQuorumSet(hash, connection) {
        this._logger.log('debug', '[CONNECTION] ' + connection.toNode.key + ': Sending GET SCP QUORUM SET message');
        this.writeMessageToSocket(connection, message_service_1.default.createScpQuorumSetMessage(hash));
    }
    sendGetPeers(connection) {
        this._logger.log('debug', '[CONNECTION] ' + connection.toNode.key + ': Sending GET PEERS message');
        this.writeMessageToSocket(connection, message_service_1.default.createGetPeersMessage());
    }
    sendAuthMessage(connection) {
        this._logger.log('debug', '[CONNECTION] ' + connection.toNode.key + ': Sending AUTH message');
        this.writeMessageToSocket(connection, message_service_1.default.createAuthMessage(), false);
    }
    writeMessageToSocket(connection, message /*StellarBase.xdr.StellarMessage*/, handShakeComplete = true) {
        let socket = this._sockets.get(connection.toNode.key);
        if (socket) {
            socket.write(xdr_service_1.default.getXdrBufferFromMessage(connection.authenticateMessage(message, handShakeComplete)));
        }
    }
}
exports.ConnectionManager = ConnectionManager;
//# sourceMappingURL=connection-manager.js.map