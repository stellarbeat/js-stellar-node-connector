const { xdr, StrKey } = require('@stellar/stellar-base');
const { createNode } = require('../lib');
const getConfigFromEnv = require('../lib').getConfigFromEnv;

let node = createNode(getConfigFromEnv());

connect();

function connect() {
	if (process.argv.length <= 2) {
		console.log(
			'Parameters: ' + 'NODE_IP(required) ' + 'NODE_PORT(default: 11625) '
		);
		process.exit(-1);
	}

	let ip = process.argv[2];
	let port = 11625;

	let portArg = process.argv[3];
	if (portArg) {
		port = parseInt(portArg);
	}

	let connectedPublicKey;
	let connection = node.connectTo(ip, port);
	connection
		.on('connect', (publicKey, nodeInfo) => {
			console.log('Connected to Stellar Node: ' + publicKey);
			console.log(nodeInfo);
			connectedPublicKey = publicKey;
			//connection.sendStellarMessage(xdr.StellarMessage.getScpState(0));
		})
		.on('data', (stellarMessageJob) => {
			const stellarMessage = stellarMessageJob.stellarMessage;
			//console.log(stellarMessage.toXDR('base64'))
			switch (stellarMessage.switch()) {
				case xdr.MessageType.scpMessage():
					let publicKey = StrKey.encodeEd25519PublicKey(
						stellarMessage.envelope().statement().nodeId().value()
					).toString();
					console.log(
						publicKey +
							' sent StellarMessage of type ' +
							stellarMessage.envelope().statement().pledges().switch().name +
							' for ledger ' +
							stellarMessage.envelope().statement().slotIndex().toString()
					);
					if (
						stellarMessage.envelope().statement().pledges().switch() ===
						xdr.ScpStatementType.scpStExternalize()
					) {
						const value = stellarMessage
							.envelope()
							.statement()
							.pledges()
							.externalize()
							.commit()
							.value();
						const closeTime = xdr.StellarValue.fromXDR(value)
							.closeTime()
							.toXDR()
							.readBigUInt64BE();
						//console.log(new Date(1000 * Number(closeTime)));
					}
					break;
				default:
					console.log(
						'rcv StellarMessage of type ' + stellarMessage.switch().name +
						': ' +
							stellarMessage.toXDR('base64')
					);
					if(stellarMessage.switch().value === 0) {
						console.log(stellarMessage.error().msg().toString());
						console.log(stellarMessage.error().code());
					}
					break;
			}
			stellarMessageJob.done();
		})
		.on('error', (err) => {
			console.log(err);
		})
		.on('close', () => {
			console.log('closed connection');
		})
		.on('timeout', () => {
			console.log('timeout');
			connection.destroy();
		});
}
