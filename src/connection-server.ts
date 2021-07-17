import { EventEmitter } from "events";
import {Server, Socket} from "net";
import Connection from "./connection/connection";
import {Keypair} from "stellar-base";
import {ConnectionAuthentication} from "./connection/connection-authentication";
import {Config} from "./config";
import {Logger} from "winston";

//experimental: at the moment only used for integration tests
export default class ConnectionServer extends EventEmitter{
    public server: Server;
    protected keyPair: Keypair;
    protected connectionAuthentication: ConnectionAuthentication;
    protected config: Config;
    protected logger: Logger;

    constructor(keyPair: Keypair, connectionAuthentication: ConnectionAuthentication, config: Config, logger: Logger) {
        super();
        this.keyPair = keyPair;
        this.connectionAuthentication = connectionAuthentication;
        this.config = config;
        this.logger = logger;
        this.server = new Server();
        this.server.on("connection", (socket) => this.onConnection(socket));
        this.server.on("error", err => this.emit("error", err));
        this.server.on("close", () => this.emit("close"));
        this.server.on("listening", () => this.emit("listening"));
    }

    protected onConnection(socket: Socket) {
        let connection = new Connection(this.keyPair, socket, this.connectionAuthentication, this.config, this.logger, true);
        this.emit("connection", connection);
    }

    public close(callback?: (err?: Error) => void): this {
        this.server.close(callback);

        return this;
    }

    public listen(port?: number, hostname?: string, backlog?: number, listeningListener?: () => void): this {
        this.server.listen(port, hostname, backlog, listeningListener);
        this.logger.debug("Server listening on: " + hostname + ":" + port);
        return this;
    }
}