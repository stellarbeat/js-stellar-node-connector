import {ConnectionManager, PeerNode} from "../../src";
import {Connection} from "../../src";
import {xdr} from "stellar-base";
import StellarMessage = xdr.StellarMessage;
import {getConfigFromEnv} from "../../src";

let connectionManager: ConnectionManager;
let connectionToServer: Connection;

beforeAll(() => {
    connectionManager = new ConnectionManager(true, getConfigFromEnv());
    connectionManager.acceptIncomingConnections(11623, '127.0.0.1');
    connectionToServer = connectionManager.connect('127.0.0.1', 11623);
})
afterAll(() => {
    connectionManager.stopAcceptingIncomingConnections();
    connectionToServer.destroy();
})

test("connect", (done) => {
    let pingPongCounter = 0;
    connectionManager.on("connection", (connection) => {
        connection.on("connect", () => {
            console.log("Fully connected to client");
        });
        connection.on("data", (stellarMessage: StellarMessage) => {
            //pong
            connection.sendStellarMessage(StellarMessage.getScpQuorumset(Buffer.alloc(32)))
        })
    });


    connectionToServer
        .on('connect', () => {
            console.log('Fully connected to server');
            //ping
            connectionToServer.sendStellarMessage(StellarMessage.getScpQuorumset(Buffer.alloc(32)))
        }).on('data', (stellarMessage: StellarMessage) => {
            pingPongCounter++;
            if(pingPongCounter > 100)
                done()
            else
                connectionToServer.sendStellarMessage(StellarMessage.getScpQuorumset(Buffer.alloc(32)))
    })
})