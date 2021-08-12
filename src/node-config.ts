import * as yn from 'yn';
import {NodeInfo} from "./node";

export type NodeConfig = {
    nodeInfo: NodeInfo,
    listeningPort: number,
    privateKey?: string,
    receiveTransactionMessages: boolean,
    receiveSCPMessages: boolean
}

export function getConfigFromEnv(): NodeConfig {
    let ledgerVersion = getNumberFromEnv('LEDGER_VERSION', 17);
    let overlayVersion = getNumberFromEnv('OVERLAY_VERSION', 17);
    let overlayMinVersion = getNumberFromEnv('OVERLAY_MIN_VERSION', 16);
    let versionString = process.env['VERSION_STRING'] ? process.env['VERSION_STRING'] : 'sb';
    let listeningPort = getNumberFromEnv('LISTENING_PORT', 11625);
    let privateKey = process.env['PRIVATE_KEY'] ? process.env['PRIVATE_KEY'] : undefined;
    let receiveTransactionMessages = yn(process.env['RECEIVE_TRANSACTION_MSG']);
    let receiveSCPMessages = yn(process.env['RECEIVE_SCP_MSG']);

    return {
        nodeInfo: {
            ledgerVersion: ledgerVersion,
            overlayMinVersion: overlayMinVersion,
            overlayVersion: overlayVersion,
            versionString: versionString,
        },
        listeningPort: listeningPort,
        privateKey: privateKey,
        receiveSCPMessages: receiveSCPMessages !== undefined ? receiveSCPMessages : true,
        receiveTransactionMessages: receiveTransactionMessages !== undefined ? receiveTransactionMessages : true
    }
}

function getNumberFromEnv(key: string, defaultValue: number){
    let value = defaultValue;
    let stringy = process.env[key];
    if (stringy && !isNaN(parseInt(stringy))) {
        value = parseInt(stringy);
    }
    return value;
}