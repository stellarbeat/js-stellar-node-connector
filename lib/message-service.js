"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const StellarBase = require('stellar-base');
const js_stellar_domain_1 = require("@stellarbeat/js-stellar-domain");
exports.default = {
    createScpQuorumSetMessage(hash) {
        return new StellarBase.xdr.StellarMessage.getScpQuorumset(hash);
    },
    createGetPeersMessage() {
        return new StellarBase.xdr.StellarMessage.getPeer();
    },
    createAuthMessage: function () {
        let auth = new StellarBase.xdr.Auth({ unused: 1 });
        return new StellarBase.xdr.StellarMessage.auth(auth);
    },
    createHelloMessage: function (connection, stellarNetworkId) {
        let hello = new StellarBase.xdr.Hello({
            ledgerVersion: 10,
            overlayVersion: 10,
            overlayMinVersion: 5,
            networkId: stellarNetworkId,
            versionStr: 'v10.0.0',
            listeningPort: 11625,
            peerId: connection.keyPair.xdrPublicKey(),
            cert: connection.getAuthCert(),
            nonce: connection.localNonce
        });
        return new StellarBase.xdr.StellarMessage.hello(hello);
    },
    isLoadErrorMessage: function (errorMessage /*StellarBase.xdr.StellarMessage*/) {
        return errorMessage.code().value === StellarBase.xdr.ErrorCode.fromName("errLoad").value;
    },
    getIpFromPeerAddress: function (peerAddress /*StellarBase.xdr.PeerAddress*/) {
        return peerAddress.ip().get()[0] +
            '.' + peerAddress.ip().get()[1] +
            '.' + peerAddress.ip().get()[2] +
            '.' + peerAddress.ip().get()[3];
    },
    getQuorumSetFromMessage: function (scpQuorumSetMessage /*StellarBase.xdr.StellarMessage*/) {
        let quorumSet = new js_stellar_domain_1.QuorumSet(StellarBase.hash(scpQuorumSetMessage.toXDR()).toString('base64'), scpQuorumSetMessage.threshold());
        scpQuorumSetMessage.validators().forEach(validator => {
            quorumSet.validators.push(StellarBase.StrKey.encodeEd25519PublicKey(validator.get()));
        });
        scpQuorumSetMessage.innerSets().forEach(innerQuorumSet => {
            quorumSet.innerQuorumSets.push(this.getQuorumSetFromMessage(innerQuorumSet));
        });
        return quorumSet;
    },
    updateNodeInformation: function (helloMessage /*StellarBase.xdr.StellarMessage*/, connection) {
        connection.toNode.publicKey = StellarBase.StrKey.encodeEd25519PublicKey(helloMessage.peerId().get());
        connection.toNode.ledgerVersion = helloMessage.ledgerVersion();
        connection.toNode.overlayVersion = helloMessage.overlayVersion();
        connection.toNode.overlayMinVersion = helloMessage.overlayMinVersion();
        connection.toNode.networkId = helloMessage.networkId().toString('base64');
        connection.toNode.versionStr = helloMessage.versionStr().toString();
        connection.remoteNonce = helloMessage.nonce();
        connection.remotePublicKey = helloMessage.cert().pubkey().key();
        if (connection.toNode.dateDiscovered === undefined) {
            connection.toNode.dateDiscovered = new Date();
            connection.toNode.dateUpdated = connection.toNode.dateDiscovered;
        }
        else {
            connection.toNode.dateUpdated = new Date();
        }
    }
};
//# sourceMappingURL=message-service.js.map