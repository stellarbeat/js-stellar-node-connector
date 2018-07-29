const Node = require("../entities/node");
const Connection = require("../entities/connection");
const QuorumSet = require("../entities/quorum-set");
const ConnectionManager = require("../services/connection-manager");
const StellarBase = require('stellar-base');

connect();

function connect() {
    if (process.argv.length <= 2) {
        console.log("Parameters: " + "NODE_IP(required) " + "NODE_PORT(default: 11625) " + "TIMEOUT(ms, default:60000)" );
        process.exit(-1);
    }

    let ip = process.argv[2];

    let port = process.argv[3];
    if(!port) {
        port = 11625;
    } else {
        port =  parseInt(port);
    }
    let node = new Node(ip, port);

    let timeout = process.argv[4];
    if(!timeout){
        timeout = 60000;
    } else {
        timeout =  parseInt(timeout);
    }

    let connectionManager = new ConnectionManager(
        true,
        onHandshakeCompleted,
        onPeersReceived,
        onLoadTooHighReceived,
        onQuorumSetHashDetected,
        onQuorumSetReceived,
        onNodeDisconnected
    );

    let keyPair = StellarBase.Keypair.random(); //use a random keypair to identify this script
    connectionManager.connect(
        keyPair,
        node,
        timeout
    );
}

function onHandshakeCompleted(connection: Connection) {
    console.log("[COMMAND]: connection established");
    console.log(connection.toNode)
}

function onPeersReceived(peers:Array<Node>, connection:Connection) {
    console.log('[COMMAND]: peers received:');
    peers.forEach(peer => {
        console.log(peer)
    });
}

function onLoadTooHighReceived(connection: Connection) {
    console.log("[COMMAND]: Node load too high, exiting");
    process.exit(-1);
}

function onQuorumSetHashDetected(connection:Connection, quorumSetHash:string, quorumSetOwnerPublicKey:string) {

}

function onQuorumSetReceived(connection:Connection, quorumSet:QuorumSet) {

}

function onNodeDisconnected(connection: Connection) {
    console.log("[COMMAND]: Node disconnected, exiting");
    process.exit(-1);
}