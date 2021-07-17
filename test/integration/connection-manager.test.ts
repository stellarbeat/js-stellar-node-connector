import {ConnectionManager, PeerNode} from "../../src";
import ConnectionServer from "../../src/connection-server";
import Connection from "../../src/connection/connection";

let server: ConnectionServer;
let connectionManager: ConnectionManager;
let connectionToServer: Connection;

beforeAll(() => {
    connectionManager = new ConnectionManager(true);
    server = connectionManager.createConnectionServer();
    server.listen(11623, '127.0.0.1', undefined, () => {});
    connectionToServer = connectionManager.connect(new PeerNode('127.0.0.1', 11623));
})
afterAll(()=> {
    server.close();
})

test("connect", (done) => {
    server.on("connection", (connection) => {
        connection.on("connect", () => {
            console.log("Fully connected to client");
        });
    });

    connectionToServer
        .on('connect', () => {
            console.log('Fully connected to server');
            done();
        })
} )