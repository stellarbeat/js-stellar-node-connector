import {ConnectionManager, PeerNode} from "../../src";
import ConnectionServer from "../../src/connection-server";
import Connection from "../../src/connection/connection";
import {xdr} from "stellar-base";
import StellarMessage = xdr.StellarMessage;

let server: ConnectionServer;
let connectionManager: ConnectionManager;
let connectionToServer: Connection;

beforeAll(() => {
    connectionManager = new ConnectionManager(true);
    server = connectionManager.createConnectionServer();
    server.listen(11623, '127.0.0.1', undefined, () => {
    });
    connectionToServer = connectionManager.connect(new PeerNode('127.0.0.1', 11623));
})
afterAll(() => {
    server.close();
    connectionToServer.destroy();
})

test("connect", (done) => {
    let pingPongCounter = 0;
    server.on("connection", (connection) => {
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