const { xdr, StrKey } = require('@stellar/stellar-base');
const { createNode } = require('../lib');
const getConfigFromEnv = require('../lib').getConfigFromEnv;
const http = require('http');
const https = require('https');
const { ScpReader } = require('../lib/scp-reader');
const pino = require('pino')();
let node = createNode(getConfigFromEnv());

connect();

async function connect() {
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

	const nodes = await fetchData('https://api.stellarbeat.io/v1/nodes');
	const nodeNames = new Map(
		nodes.map((node) => {
			return [node.publicKey, node.name ?? node.publicKey];
		})
	);

	const scpReader = new ScpReader(pino);
	scpReader.read(node, ip, port, nodeNames);
}

function fetchData(url) {
	return new Promise((resolve, reject) => {
		const client = url.startsWith('https') ? https : http;

		const request = client.get(url, (response) => {
			let data = '';

			// A chunk of data has been received.
			response.on('data', (chunk) => {
				data += chunk;
			});

			// The whole response has been received.
			response.on('end', () => {
				resolve(JSON.parse(data));
			});
		});

		// Handle errors during the request.
		request.on('error', (error) => {
			reject(error);
		});
	});
}

function trimString(str, lengthToShow = 5) {
	if (str.length <= lengthToShow * 2) {
		return str;
	}

	const start = str.substring(0, lengthToShow);
	const end = str.substring(str.length - lengthToShow);

	return `${start}...${end}`;
}
