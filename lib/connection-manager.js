// 

const StellarBase = require('stellar-base');
const Node = require("@stellarbeat/js-stellar-domain").Node;
const QuorumSet = require("@stellarbeat/js-stellar-domain").QuorumSet;
const net = require('net');
const xdrService = require('./xdr-service');
const messageService = require("./message-service");
const Connection = require("./connection");

class ConnectionManager {

    constructor(
        usePublicNetwork = true,
        onHandshakeCompletedCallback,
        onPeersReceivedCallback,
        onLoadTooHighCallback,
        onQuorumSetHashDetectedCallback,
        onQuorumSetReceivedCallback,
        onNodeDisconnectedCallback
    ) {
        this._sockets = new Map();
        this._onHandshakeCompletedCallback = onHandshakeCompletedCallback;
        this._onPeersReceivedCallback = onPeersReceivedCallback;
        this._onLoadTooHighCallback = onLoadTooHighCallback;
        this._onQuorumSetHashDetectedCallback = onQuorumSetHashDetectedCallback;
        this._onQuorumSetReceivedCallback = onQuorumSetReceivedCallback;
        this._onNodeDisconnectedCallback = onNodeDisconnectedCallback;

        if(usePublicNetwork) {
            StellarBase.Network.usePublicNetwork();
        } else {
            StellarBase.Network.useTestNetwork();
        }
    }

    connect(keyPair, toNode, durationInMilliseconds){ //todo 'fromNode that encapsulates keypair'
        let socket = new net.Socket();
        socket.setTimeout(30000);
        let connection = new Connection(keyPair, toNode);
        this._sockets.set(connection.toNode.key, socket);
        let timeout = setTimeout(() => {
            console.log('[CONNECTION] ' + connection.toNode.key + ': Listen timeout reached, disconnecting');
            socket.destroy();
        }, durationInMilliseconds);

        socket
            .on('connect', () => {
                console.log('[CONNECTION] ' + connection.toNode.key + ': Connected');
                this.initiateHandShake(connection);
            })
            .on('data', (data) => {
                console.log('[CONNECTION] ' + connection.toNode.key + ': Data received.');
                this.handleData(data, connection);
            })
            .on('error', (err) => {
                if (err.code === "ENOTFOUND") {
                    console.log("[CONNECTION] " + connection.toNode.key + " Socket error. No device found at this address.");
                } else if (err.code === "ECONNREFUSED") {
                    console.log("[CONNECTION] " + connection.toNode.key + " Socket error. Connection refused with message: " + err.message);
                } else {
                    console.log("[CONNECTION] " + connection.toNode.key + " Socket error." + err.message);
                }
            })
            .on('disconnect', function () {
                console.log("[CONNECTION] " + connection.toNode.key + " Node disconnected.");
            })
            .on('close', () => {
                console.log("[CONNECTION] " + connection.toNode.key + " Node closed connection");
                clearTimeout(timeout);
                this._sockets.delete(connection.toNode.key);
                this._onNodeDisconnectedCallback(connection);
            })
            .on('timeout', () => {
                console.log("[CONNECTION] " + connection.toNode.key + " Node took too long to respond, disconnecting");
                socket.destroy();
            });

        console.log('[CONNECTION] ' + connection.toNode.key + ': Connect');
        socket.connect(connection.toNode.port, connection.toNode.ip);
    }

    initiateHandShake(connection) {
        console.log("[CONNECTION] " + connection.toNode.key + ": Initiate handshake");
        this.sendHello(connection);
    }

    sendHello(connection) {
        console.log("[CONNECTION] " + connection.toNode.key + ": Send HELLO message");
        this.writeMessageToSocket(
            connection,
            messageService.createHelloMessage(connection, StellarBase.Network.current().networkId()),
            false
        );
    }

    continueHandshake(connection) {
        console.log("[CONNECTION] " + connection.toNode.key + ": Continue handshake");
        this.sendAuthMessage(connection);
    }

    finishHandshake(connection) {
        console.log("[CONNECTION] " + connection.toNode.key + ": Finish handshake");

        this._onHandshakeCompletedCallback(connection);
    }

    handleData(data, connection) {
        let buffer = Buffer.from(data);//, 0, 2);

        try {
            while(buffer !== null) {
                let xdrMessage = null;
                [xdrMessage, buffer] = xdrService.getMessageFromXdrBuffer(buffer);
                let authenticatedMessage = StellarBase.xdr.AuthenticatedMessage.fromXDR(xdrMessage).get();
                console.log('[CONNECTION] ' + connection.toNode.key + ': data contains an authenticated message.');
                this.handleReceivedAuthenticatedMessage(authenticatedMessage, connection);
            }
        }
        catch (exception) {
            console.log('[CONNECTION] ' + connection.toNode.key + ': data does not contain an authenticated message, ignoring...');
        }
    }

    handleReceivedAuthenticatedMessage(authenticatedMessage, connection) {
        switch (authenticatedMessage.message().arm()) {

            case 'hello':
                console.log('[CONNECTION] ' + connection.toNode.key + ': Authenticated message contains a HELLO message.');
                messageService.updateNodeInformation(
                    authenticatedMessage.message().get(),
                    connection
                );
                this.continueHandshake(connection);
                break;

            case 'auth':
                console.log('[CONNECTION] ' + connection.toNode.key + ': Authenticated message contains an AUTH message.');
                this.finishHandshake(connection);
                break;

            case 'peers':
                console.log('[CONNECTION] ' + connection.toNode.key + ': Authenticated message contains a PEERS message.');
                this.handleReceivedPeersMessage(authenticatedMessage.message().get(), connection);
                break;

            case 'error':
                console.log('[CONNECTION] ' + connection.toNode.key + ': Authenticated message contains a an error message: ' + authenticatedMessage.message().get().code().name);
                if(messageService.isLoadErrorMessage(authenticatedMessage.message().get())){
                    if(this._onLoadTooHighCallback)
                        this._onLoadTooHighCallback(connection);
                }
                break;

            case 'envelope':
                console.log('[CONNECTION] ' + connection.toNode.key + ': Authenticated message contains an envelope message.');
                //todo logging
                    this._onQuorumSetHashDetectedCallback(
                        connection,
                        authenticatedMessage.message().get().statement().pledges().value().quorumSetHash().toString('base64'),
                        StellarBase.StrKey.encodeEd25519PublicKey(authenticatedMessage.message().get().statement().nodeId().get())
                    );
                break;

            case 'transaction':
                console.log('[CONNECTION] ' + connection.toNode.key + ': Authenticated message contains a transaction message.');
                break; //todo callback

            case 'qSet':
                console.log('[CONNECTION] ' + connection.toNode.key + ': Authenticated message contains a scpQuorumset message.');

                try{
                        this._onQuorumSetReceivedCallback(
                            connection,
                            messageService.getQuorumSetFromMessage(authenticatedMessage.message().get())
                        );
                } catch (exception) {
                    console.log(exception);
                    process.exit(0);
                }

                break; //todo callback

            default:
                console.log('[CONNECTION] ' + connection.toNode.key + ': unhandled message type received: ' + authenticatedMessage.message().arm());
        }

    }

    handleReceivedPeersMessage(peersMessage, connection) {
        console.log('[CONNECTION] ' + connection.toNode.key + ': PEERS message contains '+ peersMessage.length + " peers");

        this._onPeersReceivedCallback(peersMessage.map((peerAddress) => {
            return new Node(
                messageService.getIpFromPeerAddress(peerAddress),
                peerAddress.port()
            )
        }), connection);
    }

    sendGetQuorumSet(hash, connection) {
        console.log('[CONNECTION] ' + connection.toNode.key + ': Sending GET SCP QUORUM SET message');

        this.writeMessageToSocket(
            connection,
            messageService.createScpQuorumSetMessage(hash)
        );
    }

    sendGetPeers(connection) {
        console.log('[CONNECTION] ' + connection.toNode.key + ': Sending GET PEERS message');

        this.writeMessageToSocket(
            connection,
            messageService.createGetPeersMessage()
        );
    }

    sendAuthMessage(connection) {
        console.log('[CONNECTION] ' + connection.toNode.key + ': Sending AUTH message');

        this.writeMessageToSocket(
            connection,
            messageService.createAuthMessage(),
            false
        );
    }

    writeMessageToSocket(connection, message, handShakeComplete=true){
        let socket = this._sockets.get(connection.toNode.key);
        if(socket){
            socket.write(
                xdrService.getXdrBufferFromMessage(
                    connection.authenticateMessage(message, handShakeComplete)
                )
            );
        }
    }
}

module.exports = ConnectionManager;