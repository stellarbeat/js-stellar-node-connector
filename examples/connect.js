const SCPStatement = require("../lib").SCPStatement;
const PeerNode = require("../lib").PeerNode;
const ConnectionManager = require("../lib").ConnectionManager;
const getConfigFromEnv = require("../lib").getConfigFromEnv;
const StellarBase = require('stellar-base');

let connectionManager = new ConnectionManager(
    true,
    getConfigFromEnv()
);

connect();

function connect() {

    if (process.argv.length <= 2) {
        console.log("Parameters: " + "NODE_IP(required) " + "NODE_PORT(default: 11625) ");
        process.exit(-1);
    }

    let ip = process.argv[2];

    let port = process.argv[3];
    if (!port) {
        port = 11625;
    } else {
        port = parseInt(port);
    }

    let connection = connectionManager.connect(ip, port);
    connection
        .on('connect', () => {
            console.log('Connected to Stellar Node: ' + connection.toNode.key);
        })
        .on('data', (data) => {
            console.log(data);
        })
        .on('error', (err) => {
            console.log(err);
        })
        .on('close', () => {
            console.log("closed connection");
        })
        .on('timeout', () => {
            console.log("timeout");
            connection.destroy();
        });
}