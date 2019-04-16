/// <reference types="node" />
import { Connection } from './connection';
import { QuorumSet } from '@stellarbeat/js-stellar-domain';
declare const _default: {
    createScpQuorumSetMessage(hash: Buffer): any;
    createGetPeersMessage(): any;
    createAuthMessage: () => any;
    createHelloMessage: (connection: Connection, stellarNetworkId: string) => any;
    isLoadErrorMessage: (errorMessage: any) => boolean;
    getIpFromPeerAddress: (peerAddress: any) => string;
    getQuorumSetFromMessage: (scpQuorumSetMessage: any) => QuorumSet;
    updateNodeInformation: (helloMessage: any, connection: Connection) => void;
};
export default _default;
