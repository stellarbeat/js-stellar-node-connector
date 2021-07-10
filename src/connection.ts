import BigNumber from "bignumber.js";
import * as crypto from "crypto";

const StellarBase = require('stellar-base');
import {PeerNode} from "./peer-node";
import {Keypair, xdr} from "stellar-base";
import {err, ok, Result} from "neverthrow";
import {Socket} from 'net';
import {ConnectionAuthentication} from "./connection-authentication";
import {createHmac} from "./crypto";

//todo connectionState

export class Connection { //todo: introduce 'fromNode'
    _keyPair: any; //StellarBase.Keypair;
    _toNode: PeerNode;
    _remotePublicKeyECDH?: Buffer;
    _localNonce: Buffer;
    _remoteNonce?: Buffer;
    _localSequence: Buffer;
    _remoteSequence: Buffer;
    handshakeCompleted: boolean = false;
    socket: Socket;
    connectionAuthentication: ConnectionAuthentication;
    sendingMacKey?: Buffer;
    receivingMacKey?: Buffer;

    constructor(keyPair: Keypair, toNode: PeerNode, socket: Socket, connectionAuth: ConnectionAuthentication) {
        this.socket = socket;
        this.connectionAuthentication = connectionAuth;
        this._keyPair = keyPair;
        this._localNonce = StellarBase.hash(BigNumber.random().toString());
        this._localSequence = Buffer.alloc(8);
        this._remoteSequence = Buffer.alloc(8);
        this._toNode = toNode;
    }

    get keyPair(): any /*StellarBase.Keypair*/ {
        return this._keyPair;
    }

    get toNode(): PeerNode {
        return this._toNode;
    }

    get localNonce(): Buffer {
        return this._localNonce;
    }

    set localNonce(value: Buffer) {
        this._localNonce = value;
    }

    get localSequence(): Buffer {
        return this._localSequence;
    }

    get remoteSequence() {
        return this._remoteSequence;
    }

    get remotePublicKeyECDH(): Buffer | undefined {
        return this._remotePublicKeyECDH;
    }

    get remoteNonce(): Buffer | undefined {
        return this._remoteNonce;
    }

    set remoteNonce(value: Buffer | undefined) {
        this._remoteNonce = value;
    }

    increaseLocalSequenceByOne() {
        this._localSequence = this.increaseBufferByOne(this.localSequence);
    }

    protected increaseBufferByOne(buf: Buffer){
        for (var i = buf.length - 1; i >= 0; i--) {
            if (buf[i]++ !== 255) break;
        }
        return buf;
    }
    increaseRemoteSequenceByOne() {
        this._remoteSequence = this.increaseBufferByOne(this.localSequence);
    }

    authenticateMessage(message: xdr.StellarMessage): Result<xdr.AuthenticatedMessage, Error> {
        try {
            let xdrAuthenticatedMessageV1 = new StellarBase.xdr.AuthenticatedMessageV0({
                sequence: xdr.Uint64.fromXDR(this.localSequence),
                message: message,
                mac: this.getMacForAuthenticatedMessage(message)
            });

            let authenticatedMessage = new StellarBase.xdr.AuthenticatedMessage(0);
            authenticatedMessage.set(0, xdrAuthenticatedMessageV1);

            return ok(authenticatedMessage);
        } catch (error) {
            return err(error);
        }
    }

    getMacForAuthenticatedMessage(message: xdr.StellarMessage) {
        let mac;
        if (this.remotePublicKeyECDH === undefined)
            mac = Buffer.alloc(32);
        else
            mac = createHmac(message.toXDR(), this.localSequence, this.sendingMacKey!);

        return new StellarBase.xdr.HmacSha256Mac({
            mac: mac
        });
    }

    processHelloMessage(hello: xdr.Hello): Result<void, Error> {
        if (!this.connectionAuthentication.verifyRemoteAuthCert(new Date(), hello.peerId().value(), hello.cert()))
            return err(new Error("Invalid auth cert"));

        this.remoteNonce = hello.nonce();
        this._remotePublicKeyECDH = hello.cert().pubkey().key();
        this.toNode.updateFromHelloMessage(hello);
        this.sendingMacKey = this.connectionAuthentication.getSendingMacKey(this.localNonce, this.remoteNonce, this._remotePublicKeyECDH);
        this.receivingMacKey = this.connectionAuthentication.getReceivingMacKey(this.localNonce, this.remoteNonce, this._remotePublicKeyECDH);

        return ok(undefined);
    }
}