import {hash, Networks} from "stellar-base";

const StellarBase = require('stellar-base');
import {Node, QuorumSet} from"@stellarbeat/js-stellar-domain";
import * as net from 'net';
import xdrService from './xdr-service';
import messageService from "./message-service";
import {Connection} from "./connection";
import * as winston from "winston";
require('dotenv').config();
import {SCPStatement} from './scp-statement';

export class ConnectionManager {
    _sockets: Map<string, net.Socket>;
    _onHandshakeCompletedCallback: (connection: Connection) => void;
    _onPeersReceivedCallback: (peers: Array<Node>, connection: Connection) => void;
    _onLoadTooHighCallback: (connection: Connection) => void;
    _onQuorumSetReceivedCallback: (connection: Connection, quorumSet: QuorumSet) => void;
    _onNodeDisconnectedCallback: (connection: Connection) => void;
    _onSCPStatementReceivedCallback: (connection: Connection, SCPStatement: SCPStatement) => void;
    _logger: any;
    _dataBuffers:Array<Buffer>;
    _timeouts: Map<string, any>;
    _network: string;

    constructor(
        usePublicNetwork: boolean = true,
        onHandshakeCompletedCallback: (connection: Connection) => void,
        onPeersReceivedCallback: (peers: Array<Node>, connection: Connection) => void,
        onLoadTooHighCallback: (connection: Connection) => void,
        onSCPStatementReceivedCallback: (connection: Connection, SCPStatement: SCPStatement) => void,
        onQuorumSetReceivedCallback: (connection: Connection, quorumSet: QuorumSet) => void,
        onNodeDisconnectedCallback: (connection: Connection) => void,
        logger
    ) {
        this._sockets = new Map();
        this._onHandshakeCompletedCallback = onHandshakeCompletedCallback;
        this._onPeersReceivedCallback = onPeersReceivedCallback;
        this._onLoadTooHighCallback = onLoadTooHighCallback;
        this._onQuorumSetReceivedCallback = onQuorumSetReceivedCallback;
        this._onNodeDisconnectedCallback = onNodeDisconnectedCallback;
        this._onSCPStatementReceivedCallback = onSCPStatementReceivedCallback;

        this._dataBuffers = [];
        this._timeouts = new Map();
        if (usePublicNetwork) {
            this._network = Networks.PUBLIC
        } else {
            this._network = Networks.TESTNET
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

    setTimeout(connection: Connection, durationInMilliseconds: number) {
        this._timeouts.set(connection.toNode.key, setTimeout(() => {
            this._logger.log('debug','[CONNECTION] ' + connection.toNode.key + ': Listen timeout reached, disconnecting');
            this._sockets.get(connection.toNode.key).destroy();
        }, durationInMilliseconds));
    }

    connect(keyPair: any /*StellarBase.Keypair*/, toNode: Node, durationInMilliseconds: number) { //todo 'fromNode that encapsulates keypair'
        toNode.active = false; //when we can connect to it, or it is overloaded, we mark it as active
        toNode.overLoaded = false; //only when we receive an overloaded message, we mark it as overloaded
        let socket = new net.Socket();
        socket.setTimeout(2500);
        let connection = new Connection(keyPair, toNode);
        this._sockets.set(connection.toNode.key, socket);
        this.setTimeout(connection, durationInMilliseconds);

        socket
            .on('connect', () => {
                this._logger.log('info','[CONNECTION] ' + connection.toNode.key + ': Connected');
                this.initiateHandShake(connection);
            })
            .on('data', (data) => {
                this._logger.log('debug','[CONNECTION] ' + connection.toNode.key + ': Data received.');
                this.handleData(data, connection);
            })
            .on('error', (err:any) => {
                if (err.code === "ENOTFOUND") {
                    this._logger.log('info',"[CONNECTION] " + connection.toNode.key + " Socket error. No device found at this address.");
                } else if (err.code === "ECONNREFUSED") {
                    this._logger.log('info',"[CONNECTION] " + connection.toNode.key + " Socket error. Connection refused with message: " + err.message);
                } else {
                    this._logger.log('info',"[CONNECTION] " + connection.toNode.key + " Socket error." + err.message);
                }
                if(this._sockets.get(connection.toNode.key)) {
                    clearTimeout(this._timeouts.get(connection.toNode.key));
                    this._sockets.delete(connection.toNode.key);
                    this._onNodeDisconnectedCallback(connection);
                }
            })
            .on('disconnect', function () {
                this._logger.log('info',"[CONNECTION] " + connection.toNode.key + " Node disconnected.");
            })
            .on('close', () => {
                this._logger.log('info',"[CONNECTION] " + connection.toNode.key + " Node closed connection");
                if(this._sockets.get(connection.toNode.key)) {
                    clearTimeout(this._timeouts.get(connection.toNode.key));
                    this._sockets.delete(connection.toNode.key);
                    this._onNodeDisconnectedCallback(connection);
                }
            })
            .on('timeout', () => {
                this._logger.log('info',"[CONNECTION] " + connection.toNode.key + " Node took too long to respond, disconnecting");
                socket.destroy();
            });

        this._logger.log('info','[CONNECTION] ' + connection.toNode.key + ': Connect');
        socket.connect(connection.toNode.port, connection.toNode.ip);
    }

    pause(connection: Connection) {
        clearTimeout(this._timeouts.get(connection.toNode.key));
        this._sockets.get(connection.toNode.key).pause();
    }

    resume(connection: Connection, durationInMilliseconds: number) {
        this._timeouts.set(connection.toNode.key, durationInMilliseconds);
        this._sockets.get(connection.toNode.key).resume();
    }
    
    disconnect(connection: Connection) {
        clearTimeout(this._timeouts.get(connection.toNode.key));
        this._sockets.get(connection.toNode.key).end();
    }

    initiateHandShake(connection: Connection) {
        this._logger.log('info',"[CONNECTION] " + connection.toNode.key + ": Initiate handshake");
        this.sendHello(connection);
    }

    sendHello(connection: Connection) {
        this._logger.log('debug',"[CONNECTION] " + connection.toNode.key + ": Send HELLO message");
        this.writeMessageToSocket(
            connection,
            //@ts-ignore
            messageService.createHelloMessage(connection, hash(this._network)),
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

    handleData(data: Buffer, connection: Connection) {
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
                let scpStatement = SCPStatement.fromXdr(authenticatedMessage.message().get().statement());

                this._onSCPStatementReceivedCallback(
                    connection,
                    scpStatement
                );

                break;

            case 'transaction':
                this._logger.log('debug','[CONNECTION] ' + connection.toNode.key + ': Authenticated message contains a transaction message.');
                //let transaction = new Transaction(authenticatedMessage.message().get());
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
                this._logger.log('debug','[CONNECTION] ' + connection.toNode.key + ': unhandled message type received: ' + authenticatedMessage.message()
                    .arm());
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

    sendGetScpStatus(connection: Connection, ledgerSequence:number) {
        this._logger.log('debug','[CONNECTION] ' + connection.toNode.key + ': Sending GET SCP STATUS message for ledger: ' + ledgerSequence);

        this.writeMessageToSocket(
            connection,
            messageService.createGetScpStatusMessage(ledgerSequence)
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

    writeMessageToSocket(connection: Connection, message: any /*StellarBase.xdr.StellarMessage*/, handShakeComplete: boolean = true) {
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