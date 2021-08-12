const ConnectionManager = require("../lib").ConnectionManager;
const getConfigFromEnv = require("../lib").getConfigFromEnv;

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
    let port = 11625;

    let portArg = process.argv[3];
    if (portArg) {
        port = parseInt(portArg);
    }

    let connection = connectionManager.connect(ip, port);
    connection
        .on('connect', (peer) => {
            console.log('Connected to Stellar Node: ' + peer.key);
        })
        .on('data', (data) => {
            console.log(data.switch().name);
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