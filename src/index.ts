import { NodeConfig } from './node-config';
import { Node } from './node';
import { FastSigning, hash, Keypair } from '@stellar/stellar-base';
import { ConnectionAuthentication } from './connection/connection-authentication';
import { pino } from 'pino';

export { Node } from './node';
export { Connection } from './connection/connection';
export { UniqueSCPStatementTransform } from './unique-scp-statement-transform';
export {
	StellarMessageRouter,
	MessageTypeName
} from './stellar-message-router';
export {
	ScpBallot,
	SCPStatement,
	SCPStatementType,
	ScpStatementPledges,
	ScpStatementPrepare,
	ScpStatementConfirm,
	ScpStatementExternalize,
	ScpNomination
} from './scp-statement-dto';
export { getConfigFromEnv } from './node-config';
export { ScpReader } from './scp-reader';
export {
	getPublicKeyStringFromBuffer,
	createSCPEnvelopeSignature,
	createStatementXDRSignature,
	getIpFromPeerAddress,
	verifySCPEnvelopeSignature,
	getQuorumSetFromMessage,
	QuorumSetDTO
} from './stellar-message-service'; //todo: separate package?

export function createNode(config: NodeConfig, logger?: pino.Logger): Node {
	if (!logger) {
		logger = pino({
			level: process.env.LOG_LEVEL || 'info',
			base: undefined
		});
	}

	logger = logger.child({ app: 'Connector' });
	if (!FastSigning) {
		logger.debug('warning', 'FastSigning not enabled');
	}

	let keyPair: Keypair;
	if (config.privateKey) {
		try {
			keyPair = Keypair.fromSecret(config.privateKey);
		} catch (error) {
			throw new Error('Invalid private key');
		}
	} else {
		keyPair = Keypair.random();
	}

	const networkId = hash(Buffer.from(config.network));

	const connectionAuthentication = new ConnectionAuthentication(
		keyPair,
		networkId
	);

	return new Node(config, keyPair, connectionAuthentication, logger);
}
