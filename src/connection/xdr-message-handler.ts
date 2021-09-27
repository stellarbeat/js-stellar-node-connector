/*
Fast way to determine message type without parsing the whole xdr through the StellarBase xdr class
 */
import { ok, err, Result } from 'neverthrow';

export interface AuthenticatedMessageV0 {
	sequenceNumberXDR: Buffer;
	messageTypeXDR: Buffer;
	stellarMessageXDR: Buffer;
	macXDR: Buffer;
}

export function parseAuthenticatedMessageXDR(
	messageXDR: Buffer
): Result<AuthenticatedMessageV0, Error> {
	const messageVersionXDR = messageXDR.slice(0, 4);
	if (messageVersionXDR.readInt32BE(0) !== 0) {
		//we only support v0
		return err(new Error('Unsupported message version'));
	}
	const sequenceNumberXDR = messageXDR.slice(4, 12);
	const messageTypeXDR = messageXDR.slice(12, 16);
	const stellarMessageXDR = messageXDR.slice(16, messageXDR.length - 32);
	//mac has length 32 bytes and is only remaining structure in xdr after stellar message
	//https://github.com/stellar/stellar-core/blob/7cf753cb37530d1ed372a7091fadd233d2f1604a/src/xdr/Stellar-overlay.x#L226
	//another approach would be to get the length by messageType
	const macXDR = messageXDR.slice(messageXDR.length - 32);

	return ok({
		sequenceNumberXDR: sequenceNumberXDR,
		messageTypeXDR: messageTypeXDR,
		stellarMessageXDR: stellarMessageXDR,
		macXDR: macXDR
	});
}
