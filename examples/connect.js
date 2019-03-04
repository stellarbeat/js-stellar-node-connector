const Node = require("@stellarbeat/js-stellar-domain").Node;
const ConnectionManager = require("../lib").ConnectionManager;
const StellarBase = require('stellar-base');

let connectionManager = new ConnectionManager(
    true,
    onHandshakeCompleted,
    onPeersReceived,
    onLoadTooHighReceived,
    onQuorumSetHashDetected,
    onQuorumSetReceived,
    onNodeDisconnected
);

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
        timeout = 10000;
    } else {
        timeout =  parseInt(timeout);
    }

    let keyPair = StellarBase.Keypair.random(); //use a random keypair to identify this script
    connectionManager.connect(
        keyPair,
        node,
        timeout
    );

}

function onHandshakeCompleted(connection) {
    console.log("[COMMAND]: connection established");
    console.log(JSON.stringify(connection.toNode));
    /*connectionManager.pause(connection);
    setTimeout(() => {
        connectionManager.resume(connection, 10000);
    }, 15000)*/
}

function onPeersReceived(peers, connection) {
    console.log('[COMMAND]: peers received:');
    peers.forEach(peer => {
        console.log(JSON.stringify(peer));
    });
}

function onLoadTooHighReceived(connection) {
    console.log("[COMMAND]: Node load too high, exiting");
    process.exit(-1);
}

function onQuorumSetHashDetected(connection, quorumSetHash, quorumSetOwnerPublicKey) {

}

function onQuorumSetReceived(connection, quorumSet) {

}

function onNodeDisconnected(connection) {
    console.log("[COMMAND]: Node disconnected, exiting");
}