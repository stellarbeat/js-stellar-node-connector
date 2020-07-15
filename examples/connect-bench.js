const Node = require("@stellarbeat/js-stellar-domain").Node;
const ConnectionManager = require("../lib").ConnectionManager;
const StellarBase = require('stellar-base');

console.time("run");
let connectionManager = new ConnectionManager(
    true,
    onHandshakeCompleted,
    onPeersReceived,
    onLoadTooHighReceived,
    onSCPStatementReceivedCallback,
    onQuorumSetReceived,
    onNodeDisconnected
);
let keyPair = StellarBase.Keypair.random(); //use a random keypair to identify this script
let timeout = 3000;



main();

function main() {

    if (process.argv.length <= 2) {
        console.log("Parameters: " + "NODE_IP(required) " + "NODE_PORT(default: 11625) " + "TIMEOUT(ms, default:60000)");
        process.exit(-1);
    }

    let ip = process.argv[2];

    let port = process.argv[3];
    if (!port) {
        port = 11625;
    } else {
        port = parseInt(port);
    }
    let node = new Node(ip, port);

    let timeoutParam = process.argv[4];

    if (timeoutParam) {
        timeout = parseInt(timeoutParam);
    }
    connect(keyPair, node, timeout)

}

function connect(keyPair, node, timeout) {
    console.time(node.key)
    connectionManager.connect(
        keyPair,
        node,
        timeout
    );

}

function onSCPStatementReceivedCallback(connection, scpStatement) {
}

function onHandshakeCompleted(connection) {
    console.log("[COMMAND]: connection established");
    console.timeEnd(connection.toNode.key);
    connectionManager.disconnect(connection)
    setTimeout(() => {
        connect(keyPair, connection.toNode, timeout)
    }, 1000)
}

function onPeersReceived(peers, connection) {
    //console.log('[COMMAND]: peers received:');
    /*peers.forEach(peer => {
        console.log(JSON.stringify(peer));
    });*/
}

function onLoadTooHighReceived(connection) {
    console.log("[COMMAND]: Node load too high, exiting");
    process.exit(-1);
}

function onQuorumSetReceived(connection, quorumSet) {
}

function onNodeDisconnected(connection) {
    console.log("[COMMAND]: Node disconnected, exiting");
}