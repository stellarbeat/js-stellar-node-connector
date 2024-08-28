import { FlowController } from '../src/connection/flow-controller';
import { xdr } from '@stellar/stellar-base';
import MessageType = xdr.MessageType;

describe('FlowController', function () {
	it('sendMore should return true if there is no peer flood reading capacity left in batch', function () {
		const flowController = new FlowController(2, 2);
		flowController.start();

		expect(flowController.sendMore(MessageType.transaction(), 100)).toBeNull();
		expect(
			flowController.sendMore(MessageType.scpMessage(), 100)
		).toBeInstanceOf(xdr.StellarMessage);
		expect(flowController.sendMore(MessageType.transaction(), 100)).toBeNull();
		expect(
			flowController.sendMore(MessageType.scpMessage(), 100)
		).toBeInstanceOf(xdr.StellarMessage);
	});

	it('sendMore should return true if there is no peer flood reading capacity in bytes left in batch', function () {
		const flowController = new FlowController(20, 20, 200, 200);
		flowController.start();

		expect(flowController.sendMore(MessageType.transaction(), 150)).toBeNull();
		expect(
			flowController.sendMore(MessageType.scpMessage(), 150)
		).toBeInstanceOf(xdr.StellarMessage);
		expect(flowController.sendMore(MessageType.transaction(), 150)).toBeNull();
	});
});
