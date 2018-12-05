"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const nacl = require("tweetnacl");
const bignumber_js_1 = require("bignumber.js");
const crypto = require("crypto");
const StellarBase = require('stellar-base');
const curve = require('curve25519-n');
class Connection {
    constructor(keyPair /*StellarBase.Keypair*/, toNode) {
        this._keyPair = keyPair;
        this._secretKey = curve.makeSecretKey(nacl.randomBytes(32));
        this._localPublicKey = curve.derivePublicKey(this._secretKey);
        this._localNonce = StellarBase.hash(bignumber_js_1.default.random());
        this._localSequence = StellarBase.xdr.Uint64.fromString("0");
        //this._remoteSequence = StellarBase.xdr.Uint64.fromString("0");
        this._toNode = toNode;
    }
    get keyPair() {
        return this._keyPair;
    }
    get toNode() {
        return this._toNode;
    }
    get secretKey() {
        return this._secretKey;
    }
    get localPublicKey() {
        return this._localPublicKey;
    }
    get localNonce() {
        return this._localNonce;
    }
    set localNonce(value) {
        this._localNonce = value;
    }
    get localSequence() {
        return this._localSequence;
    }
    get remoteSequence() {
        return this._remoteSequence;
    }
    set remoteSequence(value /*StellarBase.xdr.Uint64*/) {
        this._remoteSequence = value;
    }
    get remotePublicKey() {
        return this._remotePublicKey;
    }
    set remotePublicKey(value) {
        this._remotePublicKey = value;
    }
    get remoteNonce() {
        return this._remoteNonce;
    }
    set remoteNonce(value) {
        this._remoteNonce = value;
    }
    increaseLocalSequenceByOne() {
        let seq = new bignumber_js_1.default(this._localSequence).add(1);
        this._localSequence = StellarBase.xdr.Uint64.fromString(seq.toString());
    }
    deriveSharedKey() {
        if (!this._sharedKey) {
            let sharedKey = curve.deriveSharedSecret(this.secretKey, this.remotePublicKey);
            let buf = Buffer.from(sharedKey); // bytes buffer
            buf = Buffer.concat([buf, this.localPublicKey, this.remotePublicKey]);
            let zeroSalt = Buffer.alloc(32);
            this._sharedKey = crypto.createHmac('SHA256', zeroSalt).update(buf).digest();
        }
        return this._sharedKey;
    }
    getSendingMacKey() {
        let buf = Buffer.concat([
            Buffer.from([0]),
            this.localNonce,
            this.remoteNonce,
            Buffer.from([1])
        ]);
        let sharedKey = this.deriveSharedKey();
        return crypto.createHmac('SHA256', sharedKey).update(buf).digest();
    }
    getAuthCert() {
        let curve25519PublicKey = new StellarBase.xdr.Curve25519Public({
            key: this.localPublicKey
        });
        let now = new Date();
        let expirationDateInSecondsSinceEpoch = Math.round(now.getTime() / 1000) + 3600;
        let expiration = StellarBase.xdr.Uint64.fromString(expirationDateInSecondsSinceEpoch.toString());
        let rawSigData = this.getRawSignatureData(curve25519PublicKey, expiration);
        let sha256RawSigData = StellarBase.hash(rawSigData);
        let signature = this.keyPair.sign(sha256RawSigData); //sign with the crawler key!!
        return new StellarBase.xdr.AuthCert({
            pubkey: curve25519PublicKey,
            expiration: expiration,
            sig: signature
        });
    }
    getRawSignatureData(curve25519PublicKey /*StellarBase.xdr.Curve25519Public*/, expiration /*StellarBase.xdr.Uint64*/) {
        return Buffer.concat([
            StellarBase.Network.current().networkId(),
            StellarBase.xdr.EnvelopeType.envelopeTypeAuth().toXDR(),
            expiration.toXDR(),
            curve25519PublicKey.toXDR()
        ]);
    }
    authenticateMessage(message /*StellarBase.xdr.StellarMessage*/, handShakeComplete = true) {
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
        return authenticatedMessage;
    }
    getMacForAuthenticatedMessage(message /*StellarBase.xdr.StellarMessage*/) {
        if (!this.remotePublicKey) {
            return new StellarBase.xdr.HmacSha256Mac({
                mac: Buffer.alloc(32) // empty mac for hello message
            });
        }
        let sendingMacKey = this.getSendingMacKey();
        let sendingMac = crypto.createHmac('SHA256', sendingMacKey).update(Buffer.concat([
            this.localSequence.toXDR(),
            message.toXDR()
        ])).digest();
        return new StellarBase.xdr.HmacSha256Mac({
            mac: sendingMac
        });
    }
}
exports.Connection = Connection;
//# sourceMappingURL=connection.js.map