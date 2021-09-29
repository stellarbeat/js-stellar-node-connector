const { xdr, StrKey } = require('stellar-base');
const SCPStatement = require('../lib').SCPStatement;
const Node = require('../lib').Node;
const getConfigFromEnv = require('../lib').getConfigFromEnv;

let node = new Node(true, getConfigFromEnv());

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
		})
		.on('data', (data) => {
			switch (data.switch()) {
				case xdr.MessageType.scpMessage():
					let publicKey = StrKey.encodeEd25519PublicKey(
						data.envelope().statement().nodeId().value()
					).toString();
					console.log(
						publicKey +
							' sent StellarMessage of type ' +
							data.envelope().statement().pledges().switch().name +
							' for ledger ' +
							data.envelope().statement().slotIndex().toString()
					);
					console.log(data.toXDR('base64'));
					break;
				default:
					console.log(
						'rcv StellarMessage of type ' +
							data.switch().name +
							': ' +
							data.toXDR('base64')
					);
			}
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
