import { createNode, Node } from '../../src';
import { Connection } from '../../src';
import { xdr } from 'stellar-base';
import StellarMessage = xdr.StellarMessage;
import { getConfigFromEnv } from '../../src';
import { StellarMessageWork } from '../../src/connection/connection';
import { createDummyExternalizeMessage } from '../../fixtures/stellar-message.fixtures';

let nodeA: Node;
let nodeB: Node; //we don't want to connect the node to itself

let connectionToNodeA: Connection;

beforeAll(() => {
	const configA = getConfigFromEnv();
	configA.maxFloodMessageCapacity = 2;
	configA.nodeInfo.overlayVersion = 20;
	const configB = getConfigFromEnv();
	configB.maxFloodMessageCapacity = 2;
	configA.nodeInfo.overlayVersion = 20;
	nodeA = createNode(configA); //random public key
	nodeB = createNode(configB); //other random public key
	nodeA.acceptIncomingConnections(11623, '127.0.0.1');
	connectionToNodeA = nodeB.connectTo('127.0.0.1', 11623);
});

afterAll((done) => {
	connectionToNodeA.destroy();
	nodeA.stopAcceptingIncomingConnections(done);
});

test('connect', (done) => {
	let pingPongCounter = 0;
	let myConnectionToNodeB: Connection;
	nodeA.on('connection', (connectionToNodeB) => {
		connectionToNodeB.on('connect', () => {
			myConnectionToNodeB = connectionToNodeB;
			return;
		});
		connectionToNodeB.on('data', () => {
			//pong
			connectionToNodeB.sendStellarMessage(
				createDummyExternalizeMessage(nodeA.keyPair)
			);
		});
		connectionToNodeB.on('error', (error: Error) => console.log(error));
	});

	connectionToNodeA
		.on('connect', () => {
			//ping
			connectionToNodeA.sendStellarMessage(
				StellarMessage.getScpQuorumset(Buffer.alloc(32))
			);
		})
		.on('data', (data: StellarMessageWork) => {
			data.done();
			pingPongCounter++;
			if (
				pingPongCounter === 100 &&
				myConnectionToNodeB.sendMoreMsgReceivedCounter === 50
			) {
				done();
			} else
				connectionToNodeA.sendStellarMessage(
					StellarMessage.getScpQuorumset(Buffer.alloc(32))
				);
		});
});
