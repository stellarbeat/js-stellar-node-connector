/// <reference types="node" />
import { Node, QuorumSet } from "@stellarbeat/js-stellar-domain";
import * as net from 'net';
import { Connection } from "./connection";
export declare class ConnectionManager {
    _sockets: Map<string, net.Socket>;
    _onHandshakeCompletedCallback: (connection: Connection) => void;
    _onPeersReceivedCallback: (peers: Array<Node>, connection: Connection) => void;
    _onLoadTooHighCallback: (connection: Connection) => void;
    _onQuorumSetHashDetectedCallback: (connection: Connection, quorumSetHash: string, quorumSetOwnerPublicKey: string) => void;
    _onQuorumSetReceivedCallback: (connection: Connection, quorumSet: QuorumSet) => void;
    _onNodeDisconnectedCallback: (connection: Connection) => void;
    _logger: any;
    _dataBuffers: Array<Buffer>;
    _timeouts: Map<string, any>;
    constructor(usePublicNetwork: boolean, onHandshakeCompletedCallback: (connection: Connection) => void, onPeersReceivedCallback: (peers: Array<Node>, connection: Connection) => void, onLoadTooHighCallback: (connection: Connection) => void, onQuorumSetHashDetectedCallback: (connection: Connection, quorumSetHash: string, quorumSetOwnerPublicKey: string) => void, onQuorumSetReceivedCallback: (connection: Connection, quorumSet: QuorumSet) => void, onNodeDisconnectedCallback: (connection: Connection) => void, logger: any);
    setLogger(logger: any): void;
    initializeDefaultLogger(): void;
    setTimeout(connection: Connection, durationInMilliseconds: number): void;
    connect(keyPair: any, toNode: Node, durationInMilliseconds: number): void;
    pause(connection: Connection): void;
    resume(connection: Connection, durationInMilliseconds: number): void;
    initiateHandShake(connection: Connection): void;
    sendHello(connection: Connection): void;
    continueHandshake(connection: Connection): void;
    finishHandshake(connection: Connection): void;
    handleData(data: Buffer, connection: Connection): void;
    handleReceivedAuthenticatedMessage(authenticatedMessage: any, connection: Connection): void;
    handleReceivedPeersMessage(peersMessage: any, connection: Connection): void;
    sendGetQuorumSet(hash: Buffer, connection: Connection): void;
    sendGetPeers(connection: Connection): void;
    sendAuthMessage(connection: Connection): void;
    writeMessageToSocket(connection: Connection, message: any, handShakeComplete?: boolean): void;
}
