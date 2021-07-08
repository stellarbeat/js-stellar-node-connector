import {xdr} from "stellar-base";
import {Connection} from './connection';
import {err, ok, Result} from "neverthrow";
import AuthCert = xdr.AuthCert;
import Hello = xdr.Hello;

const StellarBase = require('stellar-base');

export default {

    createScpQuorumSetMessage(hash: Buffer) {
        return new StellarBase.xdr.StellarMessage.getScpQuorumset(hash);
    },

    createGetPeersMessage() {
        return new StellarBase.xdr.StellarMessage.getPeer();
    },

    createGetScpStatusMessage(ledgerSequence: number = 0) {
        return new StellarBase.xdr.StellarMessage.getScpState(ledgerSequence);
    },

    createAuthMessage: function () {
        let auth = new StellarBase.xdr.Auth({unused: 1});
        return new StellarBase.xdr.StellarMessage.auth(auth);
    },

    createHelloMessage: function (connection: Connection,
                                  stellarNetworkId: Buffer): Result<Hello, Error> {
        try {
            let certResult = this.createAuthCert(connection);
            if(certResult.isErr())
                return err(certResult.error);

            let hello = new StellarBase.xdr.Hello({ //todo: hardcoded data
                ledgerVersion: 17,
                overlayVersion: 17,
                overlayMinVersion: 16,
                networkId: stellarNetworkId,
                versionStr: 'v15.0.0',
                listeningPort: 11625,
                peerId: connection.keyPair.xdrPublicKey(),
                cert: certResult.value,
                nonce: connection.localNonce
            });

            return ok(new StellarBase.xdr.StellarMessage.hello(hello));
        } catch (error){
            return err(error);
        }
    },

    createAuthCert: function (connection: Connection): Result<AuthCert, Error> {
        try {
            let curve25519PublicKey = new StellarBase.xdr.Curve25519Public({
                key: connection.connectionAuthentication.publicKeyECDH
            });

            return ok(new StellarBase.xdr.AuthCert({
                pubkey: curve25519PublicKey,
                expiration: connection.connectionAuthentication.authCert.expiration,
                sig: connection.connectionAuthentication.authCert.signature
            }));
        } catch (error) {
            return err(error);
        }
    }
};