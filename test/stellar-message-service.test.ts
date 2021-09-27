import {
    createSCPEnvelopeSignature,
    verifySCPEnvelopeSignature
} from "../src";
import {xdr, Keypair, Networks, hash} from "stellar-base";

test("It should create and verify envelope signatures correctly", ()=>{
    const keyPair = Keypair.random();
    const commit = new xdr.ScpBallot({counter: 1, value: Buffer.alloc(32)});
    const externalize = new xdr.ScpStatementExternalize({
        commit: commit,
        nH: 1,
        commitQuorumSetHash: Buffer.alloc(32)
    })
    const pledges = xdr.ScpStatementPledges.scpStExternalize(externalize);

    const statement = new xdr.ScpStatement(
        {
            nodeId: xdr.PublicKey.publicKeyTypeEd25519(keyPair.rawPublicKey()),
            slotIndex: xdr.Uint64.fromString("1"),
            pledges: pledges
        }
    )

    const signatureResult = createSCPEnvelopeSignature(statement, keyPair.rawPublicKey(), keyPair.rawSecretKey(), hash(Buffer.from(Networks.PUBLIC)));
    if(signatureResult.isErr()){
        expect(signatureResult.isErr()).toBeFalsy();
    } else {
        const envelope = new xdr.ScpEnvelope({statement: statement, signature: signatureResult.value})
        const result = verifySCPEnvelopeSignature(envelope, hash(Buffer.from(Networks.PUBLIC)));
        expect(result.isOk()).toBeTruthy();
        if(result.isOk())
            expect(result.value).toBeTruthy();
    }
})