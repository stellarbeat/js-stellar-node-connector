import {
    createSCPEnvelopeSignature,
    createStatementXDRSignature,
    verifySCPEnvelopeSignature
} from "../src/stellar-message-service";
import {xdr, Keypair, Networks, hash, sign} from "stellar-base";

test("It should create and verify envelope signatures correctly", ()=>{
    let keyPair = Keypair.random();
    console.log(keyPair.secret());
    console.log(keyPair.rawSecretKey());
    let commit = new xdr.ScpBallot({counter: 1, value: Buffer.alloc(32)});
    let externalize = new xdr.ScpStatementExternalize({
        commit: commit,
        nH: 1,
        commitQuorumSetHash: Buffer.alloc(32)
    })
    let pledges = xdr.ScpStatementPledges.scpStExternalize(externalize);

    let statement = new xdr.ScpStatement(
        {
            nodeId: xdr.PublicKey.publicKeyTypeEd25519(keyPair.rawPublicKey()),
            slotIndex: xdr.Uint64.fromString("1"),
            pledges: pledges
        }
    )

    let signatureResult = createSCPEnvelopeSignature(statement, keyPair.rawPublicKey(), keyPair.rawSecretKey(), hash(Buffer.from(Networks.PUBLIC)));
    if(signatureResult.isErr()){
        expect(signatureResult.isErr()).toBeFalsy();
    } else {
        let envelope = new xdr.ScpEnvelope({statement: statement, signature: signatureResult.value})
        let result = verifySCPEnvelopeSignature(envelope, hash(Buffer.from(Networks.PUBLIC)));
        expect(result.isOk()).toBeTruthy();
        if(result.isOk())
            expect(result.value).toBeTruthy();
    }
})