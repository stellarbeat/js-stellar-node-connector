// 
const StellarBase = require('stellar-base');
const nacl = require("tweetnacl");
const crypto = require("crypto");
const Connection = require('./../entities/connection');
const QuorumSet = require('./../entities/quorum-set');

module.exports = {

    createScpQuorumSetMessage(hash){
        return new StellarBase.xdr.StellarMessage.getScpQuorumset(hash);
    },

    createGetPeersMessage(){
        return new StellarBase.xdr.StellarMessage.getPeer();
    },

    createAuthMessage: function () {
        let auth = new StellarBase.xdr.Auth({unused: 1});
        return new StellarBase.xdr.StellarMessage.auth(auth);
    },

    createHelloMessage: function (connection,
                                  stellarNetworkId) {
        let hello = new StellarBase.xdr.Hello({ //todo: hardcoded data should come from connection 'fromNode'
            ledgerVersion: 9,
            overlayVersion: 5,
            overlayMinVersion: 5,
            networkId: stellarNetworkId,
            versionStr: 'v9.1.0',
            listeningPort: 11625,
            peerId: connection.keyPair.xdrPublicKey(),
            cert: connection.getAuthCert(),
            nonce: connection.localNonce
        });

        return new StellarBase.xdr.StellarMessage.hello(hello);
    },

    isLoadErrorMessage: function (errorMessage) {
        return errorMessage.code().value === StellarBase.xdr.ErrorCode.fromName("errLoad").value;
    },

    getIpFromPeerAddress: function (peerAddress) {
        return peerAddress.ip().get()[0] +
            '.' + peerAddress.ip().get()[1] +
            '.' + peerAddress.ip().get()[2] +
            '.' + peerAddress.ip().get()[3];
    },

    getQuorumSetFromMessage: function(scpQuorumSetMessage) {
        let quorumSet = new QuorumSet(
            StellarBase.hash(scpQuorumSetMessage.toXDR()).toString('base64'),
            scpQuorumSetMessage.threshold()
        );

        scpQuorumSetMessage.validators().forEach(validator => {
            quorumSet.validators.push(StellarBase.StrKey.encodeEd25519PublicKey(validator.get()));
        });

        scpQuorumSetMessage.innerSets().forEach(innerQuorumSet => {
            quorumSet.innerQuorumSets.push(
                this.getQuorumSetFromMessage(innerQuorumSet)
            );
        });

        return quorumSet;
    },

    updateNodeInformation: function(helloMessage, connection) { //todo callback
        console.log('[CONNECTION] ' + connection.toNode.key + ': Updating toNode information from HELLO message');

        connection.toNode.publicKey = StellarBase.StrKey.encodeEd25519PublicKey(helloMessage.peerId().get());
        connection.toNode.ledgerVersion = helloMessage.ledgerVersion();
        connection.toNode.overlayVersion = helloMessage.overlayVersion();
        connection.toNode.overlayMinVersion = helloMessage.overlayMinVersion();
        connection.toNode.networkId = helloMessage.networkId().toString('base64');
        connection.toNode.versionStr = helloMessage.versionStr();
        connection.remoteNonce = helloMessage.nonce();
        connection.remotePublicKey = helloMessage.cert().pubkey().key();
    }


};