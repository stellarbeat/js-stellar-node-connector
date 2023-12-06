import { Networks } from 'stellar-base';
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config();
import * as yn from 'yn';
import { NodeInfo } from './node';

export type NodeConfig = {
	network: string;
	nodeInfo: NodeInfo;
	listeningPort: number;
	privateKey?: string;
	receiveTransactionMessages: boolean;
	receiveSCPMessages: boolean;
	peerFloodReadingCapacity: number;
	flowControlSendMoreBatchSize: number;
	peerFloodReadingCapacityBytes: number;
	flowControlSendMoreBatchSizeBytes: number;
};

export function getConfigFromEnv(): NodeConfig {
	const ledgerVersion = getNumberFromEnv('LEDGER_VERSION', 17);
	const overlayVersion = getNumberFromEnv('OVERLAY_VERSION', 17);
	const overlayMinVersion = getNumberFromEnv('OVERLAY_MIN_VERSION', 16);
	const versionString = process.env['VERSION_STRING']
		? process.env['VERSION_STRING']
		: 'sb';
	const listeningPort = getNumberFromEnv('LISTENING_PORT', 11625);
	const privateKey = process.env['PRIVATE_KEY']
		? process.env['PRIVATE_KEY']
		: undefined;
	const receiveTransactionMessages = yn(process.env['RECEIVE_TRANSACTION_MSG']);
	const receiveSCPMessages = yn(process.env['RECEIVE_SCP_MSG']);
	const networkString = process.env['NETWORK']
		? process.env['NETWORK']
		: Networks.PUBLIC;

	const peerFloodReadingCapacity = getNumberFromEnv(
		'PEER_FLOOD_READING_CAPACITY',
		200
	);
	const flowControlSendMoreBatchSize = getNumberFromEnv(
		'FLOW_CONTROL_SEND_MORE_BATCH_SIZE',
		40
	);
	const peerFloodReadingCapacityBytes = getNumberFromEnv(
		'PEER_FLOOD_READING_CAPACITY_BYTES',
		300000
	);
	const flowControlSendMoreBatchSizeBytes = getNumberFromEnv(
		'FLOW_CONTROL_SEND_MORE_BATCH_SIZE_BYTES',
		100000
	);

	return {
		network: networkString,
		nodeInfo: {
			ledgerVersion: ledgerVersion,
			overlayMinVersion: overlayMinVersion,
			overlayVersion: overlayVersion,
			versionString: versionString
		},
		listeningPort: listeningPort,
		privateKey: privateKey,
		receiveSCPMessages:
			receiveSCPMessages !== undefined ? receiveSCPMessages : true,
		receiveTransactionMessages:
			receiveTransactionMessages !== undefined
				? receiveTransactionMessages
				: true,
		peerFloodReadingCapacity: peerFloodReadingCapacity,
		flowControlSendMoreBatchSize: flowControlSendMoreBatchSize,
		peerFloodReadingCapacityBytes: peerFloodReadingCapacityBytes,
		flowControlSendMoreBatchSizeBytes: flowControlSendMoreBatchSizeBytes
	};
}

function getNumberFromEnv(key: string, defaultValue: number) {
	let value = defaultValue;
	const stringy = process.env[key];
	if (stringy && !isNaN(parseInt(stringy))) {
		value = parseInt(stringy);
	}
	return value;
}
