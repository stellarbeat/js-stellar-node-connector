import BigNumber from "bignumber.js";
import * as crypto from "crypto";
const StellarBase = require('stellar-base');
import * as sodium from 'sodium-native'
import {PeerNode} from "./peer-node";
import {Keypair, xdr} from "stellar-base";
import {err, ok, Result} from "neverthrow";
import {Socket} from 'net';

export class Connection { //todo: introduce 'fromNode'
    _keyPair: any; //StellarBase.Keypair;
    _toNode: PeerNode;
    _secretKey: Buffer;
    _localPublicKey: Buffer;
    _remotePublicKey?: Buffer;
    _localNonce: Buffer;
    _remoteNonce?: Buffer;
    _localSequence: any;//StellarBase.xdr.Uint64;
    _remoteSequence: any; //StellarBase.xdr.Uint64;
    _sharedKey?: Buffer;
    handshakeCompleted: boolean = false;
    socket: Socket;

    constructor(keyPair: Keypair, toNode: PeerNode, socket: Socket) {
        this.socket = socket;
        this._keyPair = keyPair;
        this._secretKey = Buffer.alloc(sodium.crypto_box_PUBLICKEYBYTES);
        sodium.crypto_sign_ed25519_sk_to_curve25519(this._secretKey, Buffer.concat([this._keyPair.rawSecretKey(), this._keyPair.rawPublicKey()]));
        this._localPublicKey = Buffer.alloc(sodium.crypto_box_SECRETKEYBYTES);
        sodium.crypto_sign_ed25519_pk_to_curve25519(this._localPublicKey, this._keyPair.rawPublicKey());
        this._localNonce = StellarBase.hash(BigNumber.random().toString());
        this._localSequence = StellarBase.xdr.Uint64.fromString("0");
        //this._remoteSequence = StellarBase.xdr.Uint64.fromString("0");
        this._toNode = toNode;
    }

    get keyPair(): any /*StellarBase.Keypair*/ {
        return this._keyPair;
    }

    get toNode(): PeerNode {
        return this._toNode;
    }

    get secretKey(): Buffer {
        return this._secretKey;
    }

    get localPublicKey(): Buffer {
        return this._localPublicKey;
    }

    get localNonce(): Buffer {
        return this._localNonce;
    }

    set localNonce(value: Buffer) {
        this._localNonce = value;
    }

    get localSequence(): any /*StellarBase.xdr.Uint64*/ {
        return this._localSequence;
    }

    get remoteSequence() {
        return this._remoteSequence;
    }

    set remoteSequence(value: any /*StellarBase.xdr.Uint64*/) {
        this._remoteSequence = value;
    }

    get remotePublicKey(): Buffer | undefined {
        return this._remotePublicKey;
    }

    set remotePublicKey(value: Buffer | undefined) {
        this._remotePublicKey = value;
    }

    get remoteNonce(): Buffer | undefined {
        return this._remoteNonce;
    }

    set remoteNonce(value: Buffer | undefined) {
        this._remoteNonce = value;
    }

    increaseLocalSequenceByOne() {
        let seq = new BigNumber(this._localSequence).plus(1);
        this._localSequence = StellarBase.xdr.Uint64.fromString(seq.toString());
    }

    deriveSharedKey () {
        if(!this._sharedKey) {
            let buf = Buffer.alloc(32);
                sodium.crypto_scalarmult(buf,this.secretKey, this.remotePublicKey!);
            //let buf = Buffer.from(sharedKey); // bytes buffer

            buf = Buffer.concat([buf, this.localPublicKey, this.remotePublicKey!]);
            let zeroSalt = Buffer.alloc(32);

            this._sharedKey = crypto.createHmac('SHA256', zeroSalt).update(buf).digest();
        }

        return this._sharedKey;
    }

    getSendingMacKey () {
        let buf = Buffer.concat([
            Buffer.from([0]), //uint8_t = 1 char = 1 byte
            this.localNonce,
            this.remoteNonce!,
            Buffer.from([1])
        ]);

        let sharedKey = this.deriveSharedKey();

        return crypto.createHmac('SHA256', sharedKey).update(buf).digest();
    }

    getAuthCert (stellarNetworkId: Buffer) {
        let curve25519PublicKey = new StellarBase.xdr.Curve25519Public({
            key: this.localPublicKey
        });

        let now = new Date();
        let expirationDateInSecondsSinceEpoch = Math.round(now.getTime() / 1000) + 3600;

        let expiration = StellarBase.xdr.Uint64.fromString(expirationDateInSecondsSinceEpoch.toString());
        let rawSigData = this.getRawSignatureData(curve25519PublicKey, expiration, stellarNetworkId);
        let sha256RawSigData = StellarBase.hash(rawSigData);
        let signature = this.keyPair.sign(sha256RawSigData); //sign with the crawler key!!

        return new StellarBase.xdr.AuthCert({
            pubkey: curve25519PublicKey,
            expiration: expiration,
            sig: signature
        });
    }

    getRawSignatureData(curve25519PublicKey: any /*StellarBase.xdr.Curve25519Public*/, expiration: any /*StellarBase.xdr.Uint64*/, stellarNetworkId: Buffer) {
        return Buffer.concat([
            //@ts-ignore
            stellarNetworkId,
            StellarBase.xdr.EnvelopeType.envelopeTypeAuth().toXDR(),
            expiration.toXDR(),
            curve25519PublicKey.toXDR()
        ]);
    }

    authenticateMessage(message: xdr.StellarMessage, handShakeComplete:boolean = true): Result<xdr.AuthenticatedMessage, Error>{
        try {
            if (handShakeComplete) {
                this.increaseLocalSequenceByOne();
            }
            let xdrAuthenticatedMessageV1 = new StellarBase.xdr.AuthenticatedMessageV0({
                sequence: this.localSequence,
                message: message,
                mac: this.getMacForAuthenticatedMessage(message)
            });

            let authenticatedMessage = new StellarBase.xdr.AuthenticatedMessage(0);
            authenticatedMessage.set(0, xdrAuthenticatedMessageV1);

            return ok(authenticatedMessage);
        }catch (error) {
            return err(error);
        }
    }

    getMacForAuthenticatedMessage(message: any /*StellarBase.xdr.StellarMessage*/) {
        if(!this.remotePublicKey){
            return new StellarBase.xdr.HmacSha256Mac({
                mac: Buffer.alloc(32) // empty mac for hello message
            })
        }

        let sendingMacKey = this.getSendingMacKey();
        let sendingMac =
            crypto.createHmac('SHA256', sendingMacKey).update(
                Buffer.concat([
                    this.localSequence.toXDR(),
                    message.toXDR()
                ])
            ).digest();

        return new StellarBase.xdr.HmacSha256Mac({
            mac: sendingMac
        });
    }

    processHelloMessage(hello: xdr.Hello){
        this.remoteNonce = hello.nonce();
        this.remotePublicKey = hello.cert().pubkey().key();
        this.toNode.updateFromHelloMessage(hello);
    }
}