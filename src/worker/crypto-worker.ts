import { worker } from 'workerpool';
import { Result } from 'neverthrow';
import { verifyStatementXDRSignature } from '../stellar-message-service';

function verifyStatementXDRSignatureWorker(
	statementXDR: Buffer,
	peerId: Buffer,
	signature: Buffer,
	network: Buffer
): boolean {
	return handleResult(
		verifyStatementXDRSignature(statementXDR, peerId, signature, network)
	);
}

function handleResult<Type>(result: Result<Type, Error>): Type {
	if (result.isErr()) throw result.error;
	else return result.value;
}

worker({
	verifyStatementXDRSignature: verifyStatementXDRSignatureWorker
});
