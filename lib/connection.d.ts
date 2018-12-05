/// <reference types="node" />
import { Node } from '@stellarbeat/js-stellar-domain';
export declare class Connection {
    _keyPair: any;
    _toNode: Node;
    _secretKey: Buffer;
    _localPublicKey: Buffer;
    _remotePublicKey: Buffer;
    _localNonce: Buffer;
    _remoteNonce: Buffer;
    _localSequence: any;
    _remoteSequence: any;
    _sharedKey: Buffer;
    constructor(keyPair: any, toNode: Node);
    readonly keyPair: any;
    readonly toNode: Node;
    readonly secretKey: Buffer;
    readonly localPublicKey: Buffer;
    localNonce: Buffer;
    readonly localSequence: any;
    remoteSequence: any;
    remotePublicKey: Buffer;
    remoteNonce: Buffer;
    increaseLocalSequenceByOne(): void;
    deriveSharedKey(): Buffer;
    getSendingMacKey(): Buffer;
    getAuthCert(): any;
    getRawSignatureData(curve25519PublicKey: any, expiration: any): Buffer;
    authenticateMessage(message: any, handShakeComplete?: boolean): any;
    getMacForAuthenticatedMessage(message: any): any;
}
