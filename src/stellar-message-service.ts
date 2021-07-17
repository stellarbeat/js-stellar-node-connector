/*
Fast way to determine message type without parsing the whole xdr through the StellarBase xdr class todo: improve doc
 */
import {hash, StrKey, xdr} from "stellar-base";
import {ok, err, Result} from 'neverthrow'
import PeerAddress = xdr.PeerAddress;
import {QuorumSet} from "@stellarbeat/js-stellar-domain";
import {verifySignature} from "./crypto-helper";
import ScpEnvelope = xdr.ScpEnvelope;

/*
Todo: worker in singleton class, and call from here. So we can verifyStatement instead of statementXDR
 */
export function verifyStatementXDRSignature(statementXDR: Buffer, peerId: Buffer, signature: Buffer, network: Buffer): Result<boolean, Error> {
    try {
        let body = Buffer.concat([network, Buffer.from([0, 0, 0, 1]), statementXDR]);
        return ok(verifySignature(peerId, signature, body));
    } catch (error) {
        return err(error);
    }
}

export function verifySCPEnvelopeSignature(scpEnvelope: ScpEnvelope, network: Buffer): Result<boolean, Error> {
    return verifyStatementXDRSignature(
        scpEnvelope.statement().toXDR(),
        scpEnvelope.statement().nodeId().value(),
        scpEnvelope.signature(),
        network
    );
}

export function getQuorumSetFromMessage(scpQuorumSetMessage: xdr.ScpQuorumSet): Result<QuorumSet, Error> {
    try {
        return ok(getQuorumSetFromMessageRecursive(scpQuorumSetMessage));
    } catch (error) {
        return err(error);
    }
}

function getQuorumSetFromMessageRecursive(scpQuorumSetMessage: xdr.ScpQuorumSet): QuorumSet {
    let quorumSet = new QuorumSet(
        hash(scpQuorumSetMessage.toXDR()).toString('base64'),
        scpQuorumSetMessage.threshold()
    );

    scpQuorumSetMessage.validators().forEach((validator: any) => {
        quorumSet.validators.push(StrKey.encodeEd25519PublicKey(validator.get()));
    });

    scpQuorumSetMessage.innerSets().forEach((innerQuorumSet: any) => {
        quorumSet.innerQuorumSets.push(
            getQuorumSetFromMessageRecursive(innerQuorumSet)
        );
    });

    return quorumSet;
}

export function getIpFromPeerAddress(peerAddress: xdr.PeerAddress) {
    let peerAddressIp = peerAddress.ip().value();
    return peerAddressIp[0] +
        '.' + peerAddressIp[1] +
        '.' + peerAddressIp[2] +
        '.' + peerAddressIp[3];
}
