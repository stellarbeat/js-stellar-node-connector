// 
const Node = require('@stellarbeat/js-stellar-domain').Node;
const nacl = require("tweetnacl");
const BigNumber = require("bignumber.js");
const StellarBase = require('stellar-base');
const crypto = require("crypto");

class Connection { //todo: introduce 'fromNode'

    constructor(keyPair, toNode) {
        this._keyPair = keyPair;
        this._secretKey = nacl.randomBytes(32); //CURVE25519 keypair
        this._localPublicKey = nacl.scalarMult.base(this._secretKey);
        this._localNonce = StellarBase.hash(BigNumber.random());
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

    set remoteSequence(value) {
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
        let seq = new BigNumber(this._localSequence).add(1);
        this._localSequence = StellarBase.xdr.Uint64.fromString(seq.toString());
    }

    deriveSharedKey () {
        let sharedKey = nacl.scalarMult(this.secretKey, this.remotePublicKey); //uint8 array
        let buf = new Buffer(sharedKey); // bytes buffer

        buf = Buffer.concat([buf, this.localPublicKey, this.remotePublicKey]);
        let zeroSalt = Buffer.alloc(32);

        return crypto.createHmac('SHA256', zeroSalt).update(buf).digest();
    }

    getSendingMacKey () {
        let buf = Buffer.concat([
            new Buffer([0]), //uint8_t = 1 char = 1 byte
            this.localNonce,
            this.remoteNonce,
            new Buffer([1])
        ]);

        let sharedKey = this.deriveSharedKey();

        return crypto.createHmac('SHA256', sharedKey).update(buf).digest();
    }

    getAuthCert () {
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

    getRawSignatureData(curve25519PublicKey, expiration) {
        return Buffer.concat([
            StellarBase.Network.current().networkId(),
            StellarBase.xdr.EnvelopeType.envelopeTypeAuth().toXDR(),
            expiration.toXDR(),
            curve25519PublicKey.toXDR()
        ]);
    }

    authenticateMessage(message, handShakeComplete = true) {
        if(handShakeComplete){
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

    getMacForAuthenticatedMessage(message) {
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
}

module.exports = Connection;