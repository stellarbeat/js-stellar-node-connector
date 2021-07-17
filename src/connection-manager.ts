import {FastSigning, hash, Keypair, Networks, xdr} from "stellar-base";

import * as net from 'net';
import Connection from "./connection/connection";
import * as winston from "winston";

require('dotenv').config();
import {PeerNode} from "./peer-node";
import {Logger} from "winston";
import {ConnectionAuthentication} from "./connection/connection-authentication";
import {Config, getConfig} from "./config";
import ConnectionServer from "./connection-server";

type nodeKey = string;

export class ConnectionManager {
    protected logger!: Logger;
    protected keyPair: Keypair;
    protected connectionAuthication: ConnectionAuthentication;
    protected config: Config;

    constructor(
        usePublicNetwork: boolean = true,//todo config
        logger?: Logger
    ) {
        this.config = getConfig();

        if (!logger) {
            this.initializeDefaultLogger();
        } else {
            this.logger = logger.child({app: 'Connector'});
        }

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
            this.logger.debug('warning', 'FastSigning not enabled',
                {'app': 'Connector'});
        }

        //@ts-ignore
        this.connectionAuthication = new ConnectionAuthentication(this.keyPair, networkId);
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

        let connection = new Connection(this.keyPair, socket, this.connectionAuthication, this.config, this.logger);

        this.logger.info( 'Connect',
            {'host': connection.toNode?.key});

        connection.connect(toNode);

        return connection;
    }

    createConnectionServer() {
        return new ConnectionServer(this.keyPair, this.connectionAuthication, this.config, this.logger);
    }

    /*protected handleStellarMessage(stellarMessage: xdr.StellarMessage, connection: Connection) {
        try {
            switch (stellarMessage.switch()) {
                //we handle a scp quorum set message immediately. However this could be better handled with 'dont have' message parsing.
                case MessageType.scpQuorumset():
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
                    break;

                case MessageType.errorMsg():
                    if (stellarMessage.error().code() === xdr.ErrorCode.errLoad()) {
                        this.logger.info('info', 'rcv high load msg',
                            {'host': connection.toNode.key});
                    } else {
                        this.logger.info('Error msg received',
                            {'host': connection.toNode.key, error: stellarMessage.error().msg().toString()});
                    }//todo: return error
                    break;

                //queued worker pool messages
                case MessageType.peers():
                    this.logger.debug( 'rcv peer msg',
                        {'host': connection.toNode.key});
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
    }*/
}