// 
const QuorumSet = require('./quorum-set');
const StellarBase = require('stellar-base');

class Node {

    constructor(ip, port, publicKey = undefined, ledgerVersion = undefined,
                overlayVersion = undefined, overlayMinVersion = undefined,
                networkId = undefined, versionStr = undefined,
                quorumSet = null
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

    set ip(value) {
        this._ip = value;
    }

    get port() {
        return this._port;
    }

    set port(value) {
        this._port = value;
    }

    get publicKey() {
        return this._publicKey;
    }

    set publicKey(value) {
        this._publicKey = value;
    }

    get ledgerVersion() {
        return this._ledgerVersion;
    }

    set ledgerVersion(value) {
        this._ledgerVersion = value;
    }

    get overlayVersion() {
        return this._overlayVersion;
    }

    set overlayVersion(value) {
        this._overlayVersion = value;
    }

    get overlayMinVersion() {
        return this._overlayMinVersion;
    }

    set overlayMinVersion(value) {
        this._overlayMinVersion = value;
    }

    get networkId() {
        return this._networkId;
    }

    set networkId(value) {
        this._networkId = value;
    }

    get versionStr() {
        return this._versionStr;
    }

    set versionStr(value) {
        this._versionStr = value;
    }

    get quorumSet(){
        return this._quorumSet;
    }

    set quorumSet(value) {
        this._quorumSet = value;
    }


    toJSON() {
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

    static fromJSON(node) {
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