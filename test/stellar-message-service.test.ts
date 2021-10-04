import {
	createSCPEnvelopeSignature,
	getQuorumSetFromMessage,
	verifySCPEnvelopeSignature
} from '../src';
import { xdr, Keypair, Networks, hash } from 'stellar-base';

it('should create and verify envelope signatures correctly', () => {
	const keyPair = Keypair.random();
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
		expect(signatureResult.isErr()).toBeFalsy();
	} else {
		const envelope = new xdr.ScpEnvelope({
			statement: statement,
			signature: signatureResult.value
		});
		const result = verifySCPEnvelopeSignature(
			envelope,
			hash(Buffer.from(Networks.PUBLIC))
		);
		expect(result.isOk()).toBeTruthy();
		if (result.isOk()) expect(result.value).toBeTruthy();
	}
});
it('should transform quorumset correctly', function () {
	const quorumSetBuffer = Buffer.from(
		'AAAACgAAAAcAAAAAAAAACQAAAAIAAAADAAAAAAFdGFUq2t7rTo0wWu9k/6rxa0T+pf6CHmBj2vO56O1XAAAAACtw/kFMcHkbypQPj/G/SAsV8eWuRNtbQIo9kimhTJklAAAAADF88fn7/Qdf5AnejN22xxQnBxZIgcsq0VC/dFJbol8/AAAAAAAAAAIAAAADAAAAAALFJZ5Gu3RxX6evZlFupBENfCKbFy8HGJOsqYaXrFMrAAAAAIwdS0o2ARfVAN/PjN6xZrGaEuD0t7zToaDF6Z5B9peZAAAAAJnoMfsa4vmDNtUy8T76WXcr2up7H7MouQjkXcMmro3YAAAAAAAAAAMAAAAFAAAAAANLAi7Z6GdWn+x4zmK4IspnZakCCcfQZEyflPbKll7aAAAAACxvBigpTgmzVqp4CsCq0rZsbpwng2M7MHI38IGhKKrlAAAAAFaWt2CucvNouAYniCiCbacMYpTGlVK3TqKyoNF3RcOeAAAAAJF6qaV6rVYpKqq1XjVfHyYvW2GjLyQnfuwoC9gxe9N0AAAAAKqeZ9NHs6k4xGyfccNU5FR9ibBWKHbKT8Fe201ml4gTAAAAAAAAAAIAAAADAAAAAAOzZQT1wYtc2aDZwzClWkJWLJpI30Fambscye2nuM5LAAAAAEMIT2RFJXikXpmoI1QbLV965WY23JwAVgktgJ6c9ZK7AAAAAO9FFMb/rJF8AiH2mj1qZ1vZf9CTGjC5sSUu8WcVe5ZbAAAAAAAAAAIAAAADAAAAAAaweClXqq3sjNIHBm/r6o1RY6yR5HqkHJCaZtEEdMUfAAAAADPN/Tz0hFfkg11MNisvWV3/3TyFQUjJNY5VqfZfvQp7AAAAAP0swruxE0PvumzqtRK6SzUT696ryM+Q/YLWj+cgAti2AAAAAAAAAAIAAAADAAAAABXs9pU1KyIrzyOEDCUSnPpEhDvj27a5ZIG1KirxrXRfAAAAAFMKIvR3Lya8FJ+cNeaJjXTX3wCSqBxw3WYftnPvFVHeAAAAALsrraBmxcawytPurkd8D0zc8+XENcygJRlcKnh8UFvHAAAAAAAAAAIAAAADAAAAADEP2bl6LBZeQDc+D0s21t3EWLRE8cFv+Nm4LnuXojWuAAAAAGSOjdK+CEZXk+NquAzFdel7ao9eLVNWGuH1IhUhYgPFAAAAAGoDBgM8mjoqhyF2+omrrrN2fuD5JXRY/DidtZfRdw53AAAAAAAAAAIAAAADAAAAADfZ7/rdH6ulYtH+xq/VYrOUFXqtv3OwpUqUgGipFia1AAAAAKyVM4Q0zJpWVqJG8UCOI/qzycVUgcOBYZudyfD7OI7mAAAAANViLMmkYquQRtnOU92Rv7mLQfQ6hViSTr7J17PDZzF1AAAAAAAAAAMAAAAFAAAAADsphZX0B3KMw/aYQ61nzN40f/TbyuHqRF07FIzwsGPWAAAAAD8yPEEcFI+mC4b5mkYsVzg64Eg1bwhZsrAJCPlB4VggAAAAAIrmk1sAf48LuMuYqijEm9AEg5B2Fy7VsuJOEyo5E/BxAAAAAO8A7cxkPMMbm32KHNglUEI6ZRWVBgzmcQWhlRJaEOROAAAAAPsLErXhs5nB/PBjevRUYxi38TMxR/LbCU2ivvBEXjyTAAAAAA==',
		'base64'
	);
	const stellarMessage = xdr.StellarMessage.fromXDR(quorumSetBuffer);
	const result = getQuorumSetFromMessage(stellarMessage.qSet());
	expect(result.isOk()).toBeTruthy();
	if (!result.isOk()) return;
	expect(result.value.innerQuorumSets).toHaveLength(9);
	expect(result.value.threshold).toEqual(7);
	expect(result.value.validators).toHaveLength(0);
});
