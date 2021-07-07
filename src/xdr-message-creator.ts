import {xdr} from "stellar-base";
import {Connection} from './connection';
import {QuorumSet} from '@stellarbeat/js-stellar-domain';

const StellarBase = require('stellar-base');

export default {

    createScpQuorumSetMessage(hash:Buffer){
        return new StellarBase.xdr.StellarMessage.getScpQuorumset(hash);
    },

    createGetPeersMessage(){
        return new StellarBase.xdr.StellarMessage.getPeer();
    },

    createGetScpStatusMessage(ledgerSequence:number = 0){
        return new StellarBase.xdr.StellarMessage.getScpState(ledgerSequence);
    },

    createAuthMessage: function () {
        let auth = new StellarBase.xdr.Auth({unused: 1});
        return new StellarBase.xdr.StellarMessage.auth(auth);
    },

    createHelloMessage: function (connection: Connection,
                                  stellarNetworkId: Buffer) {
        let hello = new StellarBase.xdr.Hello({ //todo: hardcoded data should come from connection 'fromNode'
            ledgerVersion: 17,
            overlayVersion: 17,
            overlayMinVersion: 16,
            networkId: stellarNetworkId,
            versionStr: 'v15.0.0',
            listeningPort: 11625,
            peerId: connection.keyPair.xdrPublicKey(),
            cert: connection.getAuthCert(stellarNetworkId),
            nonce: connection.localNonce
        });

        return new StellarBase.xdr.StellarMessage.hello(hello);
    },


};