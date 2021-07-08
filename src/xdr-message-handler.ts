/*
Fast way to determine message type without parsing the whole xdr through the StellarBase xdr class todo: improve doc
 */
import {crypto_sign_verify_detached} from "sodium-native";
import {hash, StrKey, xdr} from "stellar-base";
import {ok, err, Result} from 'neverthrow'
import * as jsXdr from "js-xdr";
import PeerAddress = xdr.PeerAddress;
import {Cursor} from "js-xdr/lib/cursor.js";
import {SCPStatement} from "./scp-statement";
import {PeerNode} from "./peer-node";
import {QuorumSet} from "@stellarbeat/js-stellar-domain";

export function parseAuthenticatedMessageXDR(messageXDR: Buffer): Result<{
    sequenceNumberXDR: Buffer,
    messageTypeXDR: Buffer,
    stellarMessageXDR: Buffer,
    macXDR: Buffer
}, Error> {
    let messageVersionXDR = messageXDR.slice(0, 4);
    if (messageVersionXDR.readInt32BE(0) !== 0) {//we only support v0
        return err(new Error("Unsupported message version"));
    }
    let sequenceNumberXDR = messageXDR.slice(4, 12);
    let messageTypeXDR = messageXDR.slice(12, 16);
    let stellarMessageXDR = messageXDR.slice(16, messageXDR.length - 32);
    //hmac has length 32 bytes and is only remaining structure in xdr after stellar message
    //https://github.com/stellar/stellar-core/blob/7cf753cb37530d1ed372a7091fadd233d2f1604a/src/xdr/Stellar-overlay.x#L226
    //another approach would be to get the length by messageType
    let macXDR = messageXDR.slice(messageXDR.length - 32);

    return ok({
        sequenceNumberXDR: sequenceNumberXDR,
        messageTypeXDR: messageTypeXDR,
        stellarMessageXDR: stellarMessageXDR,
        macXDR: macXDR
    })
}

export function verifySignature(publicKey: Buffer, signature: Buffer, message: Buffer): Result<boolean, Error> {
    try {
        return ok(crypto_sign_verify_detached(signature, message, publicKey));
    } catch (e: any) {
        return err(new Error(e.message));
    }
}

export function handleSCPQuorumSetMessageXDR(scpQuorumSetMessageXDR: Buffer): Result<QuorumSet, Error>{
    try{
        let scpQuorumSet = xdr.ScpQuorumSet.fromXDR(scpQuorumSetMessageXDR);

        return ok(getQuorumSetFromMessage(scpQuorumSet));
    } catch (error){
        return err(error);
    }


}

export function handleSCPMessageXDR(scpMessageXDR: Buffer, network: Buffer): Result<SCPStatement, Error> {
    try {
        let scpEnvelope = xdr.ScpEnvelope.fromXDR(scpMessageXDR);
        //todo: could be optimized by handling the fromXDR ourselves with buffer slices, so we don't have to toXDR the statement below
        let body = Buffer.concat([network, Buffer.from([0, 0, 0, 1]), scpEnvelope.statement().toXDR()]);
        if (verifySignature(scpEnvelope.statement().nodeId().value(), scpEnvelope.signature(), body)) {
            return SCPStatement.fromXdr(scpEnvelope.statement());
        }
        return err(new Error("Invalid signature"));
    } catch (error) {
        return err(error);
    }
}

export function handlePeersMessageXDR(peersMessageXDR: Buffer): Result<PeerNode[], Error> {
    try {
        let varArray = new jsXdr.VarArray(PeerAddress);
        let cursor = new Cursor(peersMessageXDR);
        let peers: PeerAddress[] = varArray.read(cursor);

        let peerNodes = peers.map(peer => {
                return new PeerNode(
                    getIpFromPeerAddress(peer),
                    peer.port()
                )
            }
        )

        return ok(peerNodes);
    } catch (error) {
        return err(error);
    }
}

export function getQuorumSetFromMessage(scpQuorumSetMessage: xdr.ScpQuorumSet) {
    let quorumSet = new QuorumSet(
        hash(scpQuorumSetMessage.toXDR()).toString('base64'),
        scpQuorumSetMessage.threshold()
    );

    scpQuorumSetMessage.validators().forEach((validator:any) => {
        quorumSet.validators.push(StrKey.encodeEd25519PublicKey(validator.get()));//todo: slow
    });

    scpQuorumSetMessage.innerSets().forEach((innerQuorumSet:any) => {
        quorumSet.innerQuorumSets.push(
            getQuorumSetFromMessage(innerQuorumSet)
        );
    });

    return quorumSet;
}

export function getIpFromPeerAddress (peerAddress: xdr.PeerAddress) {
    let peerAddressIp = peerAddress.ip().value();
    return peerAddressIp[0] +
        '.' + peerAddressIp[1] +
        '.' + peerAddressIp[2] +
        '.' + peerAddressIp[3];
}
