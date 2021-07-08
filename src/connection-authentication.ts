import {hash, Keypair, xdr} from "stellar-base";
import * as sodium from 'sodium-native'
import * as crypto from "crypto";
import EnvelopeType = xdr.EnvelopeType;
import Uint64 = xdr.Uint64;
import Auth = xdr.Auth;
import UnsignedHyper = xdr.UnsignedHyper;
import {PeerNode} from "./peer-node";
import {verifySignature} from "./xdr-message-handler";
import BigNumber from "bignumber.js";

type Curve25519SecretBuffer = Buffer;
type Curve25519PublicBuffer = Buffer;

interface AuthCert {
    publicKeyECDH: Curve25519PublicBuffer,
    expiration: UnsignedHyper,
    signature: Buffer
}

export class ConnectionAuthentication { //todo: introduce 'fromNode'
    secretKeyECDH: Curve25519SecretBuffer;
    publicKeyECDH: Curve25519PublicBuffer;
    sharedKeys: Map<string, Buffer> = new Map();
    authCert: AuthCert;
    networkId: Buffer;
    keyPair: Keypair;

    constructor(keyPair: Keypair, networkId: Buffer) {
        this.networkId = networkId;
        this.keyPair = keyPair;
        this.secretKeyECDH = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
        sodium.crypto_sign_ed25519_sk_to_curve25519(this.secretKeyECDH, Buffer.concat([keyPair.rawSecretKey(), keyPair.rawPublicKey()]));
        this.publicKeyECDH = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
        sodium.crypto_sign_ed25519_pk_to_curve25519(this.publicKeyECDH, keyPair.rawPublicKey());
        this.authCert = this.createAuthCert(new Date()); //todo: expiration
    }

    getSharedKey(remotePublicKeyECDH: Curve25519PublicBuffer) {//we are the connector initiators
        let remotePublicKeyECDHString = remotePublicKeyECDH.toString();
        let sharedKey = this.sharedKeys.get(remotePublicKeyECDHString);
        if(!sharedKey) {
            let buf = Buffer.alloc(32);
                sodium.crypto_scalarmult(buf,this.secretKeyECDH, remotePublicKeyECDH);

            buf = Buffer.concat([buf, this.publicKeyECDH, remotePublicKeyECDH]);
            let zeroSalt = Buffer.alloc(32);

            sharedKey = crypto.createHmac('SHA256', zeroSalt).update(buf).digest();
            this.sharedKeys.set(remotePublicKeyECDHString, sharedKey);
        }

        return sharedKey;
    }

    public createAuthCert(time:Date): AuthCert {
        let expirationDateInSecondsSinceEpoch = Math.round(time.getTime() / 1000) + 3600;
        let expiration = Uint64.fromString(expirationDateInSecondsSinceEpoch.toString());
        let rawSigData = Buffer.concat([
            //@ts-ignore
            this.networkId,
            //@ts-ignore
            EnvelopeType.envelopeTypeAuth().toXDR(),
            expiration.toXDR(),
            this.publicKeyECDH
        ]);
        let sha256RawSigData = hash(rawSigData);
        let signature = this.keyPair.sign(sha256RawSigData);

        return {
            publicKeyECDH: this.publicKeyECDH,
            expiration: expiration,
            signature: signature
        }
    }

    public verifyRemoteAuthCert(time: Date, remotePublicKey: Buffer, authCert: xdr.AuthCert){
        //@ts-ignore
        let expiration = new BigNumber(authCert.expiration());
        if(expiration.lt(Math.round(time.getTime() / 1000))){
            return false;
        }

        let rawSigData = Buffer.concat([
            //@ts-ignore
            this.networkId,
            //@ts-ignore
            EnvelopeType.envelopeTypeAuth().toXDR(),
            //@ts-ignore
            authCert.expiration().toXDR(),
            authCert.pubkey().key()
        ]);
        let sha256RawSigData = hash(rawSigData);

        return verifySignature(remotePublicKey, authCert.sig(), sha256RawSigData);
    }
}