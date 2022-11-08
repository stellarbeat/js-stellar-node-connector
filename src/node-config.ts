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
	maxFloodMessageCapacity: number;
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

	const maxFloodMessageCapacity = getNumberFromEnv('MAX_FLOOD_CAPACITY', 2000);

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
		maxFloodMessageCapacity: maxFloodMessageCapacity
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
