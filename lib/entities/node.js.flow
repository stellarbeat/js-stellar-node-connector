// @flow
const QuorumSet = require('./quorum-set');
const StellarBase = require('stellar-base');

class Node {
    _ip:string;
    _port:number;
    _publicKey:?string;
    _ledgerVersion:?string;
    _overlayVersion:?string;
    _overlayMinVersion:?string;
    _networkId:?string;
    _versionStr:?string;
    _quorumSet: ?QuorumSet;

    constructor(ip:string, port:number, publicKey:?string = undefined, ledgerVersion:?string = undefined,
                overlayVersion:?string = undefined, overlayMinVersion:?string = undefined,
                networkId:?string = undefined, versionStr:?string = undefined,
                quorumSet:?QuorumSet = null
    ) {
        this._ip = ip;
        this._port = port;
        this._publicKey = publicKey;
        this._ledgerVersion = ledgerVersion;
        this._overlayVersion = overlayVersion;
        this._overlayMinVersion = overlayMinVersion;
        this._networkId = networkId;
        this._versionStr = versionStr;
        this._quorumSet = quorumSet;
    }

    get key() {
        return this._ip + ":" + this._port;
    }

    get ip() {
        return this._ip;
    }

    set ip(value:string) {
        this._ip = value;
    }

    get port() {
        return this._port;
    }

    set port(value:number) {
        this._port = value;
    }

    get publicKey() {
        return this._publicKey;
    }

    set publicKey(value:string) {
        this._publicKey = value;
    }

    get ledgerVersion() {
        return this._ledgerVersion;
    }

    set ledgerVersion(value:string) {
        this._ledgerVersion = value;
    }

    get overlayVersion() {
        return this._overlayVersion;
    }

    set overlayVersion(value:string) {
        this._overlayVersion = value;
    }

    get overlayMinVersion() {
        return this._overlayMinVersion;
    }

    set overlayMinVersion(value:string) {
        this._overlayMinVersion = value;
    }

    get networkId() {
        return this._networkId;
    }

    set networkId(value:string) {
        this._networkId = value;
    }

    get versionStr() {
        return this._versionStr;
    }

    set versionStr(value:string) {
        this._versionStr = value;
    }

    get quorumSet(){
        return this._quorumSet;
    }

    set quorumSet(value:QuorumSet) {
        this._quorumSet = value;
    }


    toJSON():Object {
        return {
            ip: this.ip,
            port: this.port,
            publicKey: this.publicKey,
            ledgerVersion: this.ledgerVersion,
            overlayVersion: this.overlayVersion,
            overlayMinVersion: this.overlayMinVersion,
            networkId: this.networkId,
            versionStr: this.versionStr,
            quorumSet: this.quorumSet
        };
    };

    static fromJSON(node:string):Node {
        let nodeObject = JSON.parse(node);
        return new Node(
            nodeObject.ip, nodeObject.port, nodeObject.publicKey,
            nodeObject.ledgerVersion, nodeObject.overlayVersion,
            nodeObject.overlayMinVersion, nodeObject.networkId, nodeObject.versionStr,
            QuorumSet.fromJSON(nodeObject.quorumSet)
        );
    }
}

module.exports = Node;