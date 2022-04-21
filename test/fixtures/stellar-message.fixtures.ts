import { hash, Keypair, Networks, xdr } from 'stellar-base';
import { createSCPEnvelopeSignature } from '../../src';

export function createDummyExternalizeMessage(keyPair: Keypair) {
	const commit = new xdr.ScpBallot({ counter: 1, value: Buffer.alloc(32) });
	const externalize = new xdr.ScpStatementExternalize({
		commit: commit,
		nH: 1,
		commitQuorumSetHash: Buffer.alloc(32)
	});
	const pledges = xdr.ScpStatementPledges.scpStExternalize(externalize);

	const statement = new xdr.ScpStatement({
		nodeId: xdr.PublicKey.publicKeyTypeEd25519(keyPair.rawPublicKey()),
		slotIndex: xdr.Uint64.fromString('1'),
		pledges: pledges
	});

	const signatureResult = createSCPEnvelopeSignature(
		statement,
		keyPair.rawPublicKey(),
		keyPair.rawSecretKey(),
		hash(Buffer.from(Networks.PUBLIC))
	);

	if (signatureResult.isErr()) {
		throw signatureResult.error;
	}

	const envelope = new xdr.ScpEnvelope({
		statement: statement,
		signature: signatureResult.value
	});

	return xdr.StellarMessage.scpMessage(envelope);
}
