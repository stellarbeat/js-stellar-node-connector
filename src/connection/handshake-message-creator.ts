import {xdr} from "stellar-base";
import {err, ok, Result} from "neverthrow";
import AuthCert = xdr.AuthCert;
import Hello = xdr.Hello;
import {ConnectionAuthentication} from "./connection-authentication";
import Auth = xdr.Auth;

const StellarBase = require('stellar-base');

export default {
    createAuthMessage: function (): Result<Auth, Error>{
        try{
            let auth = new StellarBase.xdr.Auth({unused: 1});
            return ok(new StellarBase.xdr.StellarMessage.auth(auth));
        } catch (error){
            return err(new Error("Auth msg create failed: " + error.message));
        }
    },

    createHelloMessage: function (peerId: xdr.PublicKey,
                                  nonce: Buffer,
                                  authCert: xdr.AuthCert,
                                  stellarNetworkId: Buffer,
                                  ledgerVersion: number,
                                  overlayVersion: number,
                                  overlayMinVersion: number,
                                  versionStr: string,
                                  listeningPort: number
    ): Result<Hello, Error> {
        try {
            let hello = new StellarBase.xdr.Hello({
                ledgerVersion: ledgerVersion,
                overlayVersion: overlayVersion,
                overlayMinVersion: overlayMinVersion,
                networkId: stellarNetworkId,
                versionStr: versionStr,
                listeningPort: listeningPort,
                peerId: peerId,
                cert: authCert,
                nonce: nonce
            });

            return ok(new StellarBase.xdr.StellarMessage.hello(hello));
        } catch (error){
            return err(new Error("createHelloMessage failed: " + error.message));
        }
    },

    createAuthCert: function (connectionAuthentication: ConnectionAuthentication): Result<AuthCert, Error> {
        try {
            let curve25519PublicKey = new StellarBase.xdr.Curve25519Public({
                key: connectionAuthentication.publicKeyECDH
            });

            return ok(new StellarBase.xdr.AuthCert({
                pubkey: curve25519PublicKey,
                expiration: connectionAuthentication.authCert.expiration,
                sig: connectionAuthentication.authCert.signature
            }));
        } catch (error) {
            return err(new Error("createAuthCert failed: " + error.message));
        }
    }
};