export type Config = {
    logLevel: string,
    ledgerVersion: number,
    overlayVersion: number,
    overlayMinVersion: number,
    versionString: string,
    listeningPort: number,
    socketTimeout: number,
    privateKey?: string
}
export function getConfig(): Config {
    let socketTimeout = getNumberFromEnv('SOCKET_TIMEOUT', 5000);
    let ledgerVersion = getNumberFromEnv('LEDGER_VERSION', 17);
    let overlayVersion = getNumberFromEnv('OVERLAY_VERSION', 17);
    let overlayMinVersion = getNumberFromEnv('OVERLAY_MIN_VERSION', 16);
    let versionString = process.env['VERSION_STRING'] ? process.env['VERSION_STRING'] : 'sb';
    let listeningPort = getNumberFromEnv('LISTENING_PORT', 11625);
    let logLevel = process.env['LOG_LEVEL'] ? process.env['LOG_LEVEL'] : 'debug';
    let privateKey = process.env['PRIVATE_KEY'] ? process.env['LOG_LEVEL'] : undefined;

    return {
        socketTimeout: socketTimeout,
        ledgerVersion: ledgerVersion,
        overlayMinVersion: overlayMinVersion,
        overlayVersion: overlayVersion,
        listeningPort: listeningPort,
        logLevel: logLevel,
        versionString: versionString,
        privateKey: privateKey
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