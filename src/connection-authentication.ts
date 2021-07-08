import {Keypair} from "stellar-base";
import * as sodium from 'sodium-native'
import * as crypto from "crypto";

type Curve25519SecretBuffer = Buffer;
type Curve25519PublicBuffer = Buffer;

export class ConnectionAuthentication { //todo: introduce 'fromNode'
    secretKeyECDH: Curve25519SecretBuffer;
    publicKeyECDH: Curve25519PublicBuffer;
    sharedKeys: Map<string, Buffer> = new Map();

    constructor(keyPair: Keypair) {
        this.secretKeyECDH = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
        sodium.crypto_sign_ed25519_sk_to_curve25519(this.secretKeyECDH, Buffer.concat([keyPair.rawSecretKey(), keyPair.rawPublicKey()]));
        this.publicKeyECDH = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
        sodium.crypto_sign_ed25519_pk_to_curve25519(this.publicKeyECDH, keyPair.rawPublicKey());
    }

    getSharedKey(remotePublicKeyECDH: Curve25519PublicBuffer) {//we are the connector initiators
        let remotePublicKeyECDHString = remotePublicKeyECDH.toString();
        let sharedKey = this.sharedKeys.get(remotePublicKeyECDHString);
        if(!sharedKey) {
            let buf = Buffer.alloc(32);
                sodium.crypto_scalarmult(buf,this.secretKeyECDH, remotePublicKeyECDH);
            //let buf = Buffer.from(sharedKey); // bytes buffer

            buf = Buffer.concat([buf, this.publicKeyECDH, remotePublicKeyECDH]);
            let zeroSalt = Buffer.alloc(32);

            sharedKey = crypto.createHmac('SHA256', zeroSalt).update(buf).digest();
            this.sharedKeys.set(remotePublicKeyECDHString, sharedKey);
        }

        return sharedKey;
    }
}