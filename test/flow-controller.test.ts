import { FlowController } from '../src/connection/flow-controller';
import { xdr } from '@stellar/stellar-base';
import MessageType = xdr.MessageType;

describe('FlowController', function () {
	it('should enable flow control in bytes if both local and remote overlay protocol versions are higher than 27 and remote auth flags are 200', function () {
		const flowController = new FlowController();
		flowController.start(28, 28, 200);
		expect(flowController.isFlowControlBytesEnabled()).toBeTruthy();
	});

	it('should not enable flow control in bytes if both local and remote overlay protocol versions are higher than 27 and remote auth flags are 100', function () {
		const flowController = new FlowController();
		flowController.start(28, 28, 100);
		expect(flowController.isFlowControlBytesEnabled()).toBeFalsy();
	});

	it('should not enable flow control in bytes if both local and remote overlay protocol versions are lower than 28', function () {
		const flowController = new FlowController();
		flowController.start(27, 27, 200);
		expect(flowController.isFlowControlBytesEnabled()).toBeFalsy();
	});

	it('should not enable flow control in bytes if local overlay protocol version is lower than 28', function () {
		const flowController = new FlowController();
		flowController.start(27, 28, 200);
		expect(flowController.isFlowControlBytesEnabled()).toBeFalsy();
	});

	it('should not enable flow control in bytes if remote overlay protocol version is lower than 28', function () {
		const flowController = new FlowController();
		flowController.start(28, 27, 200);
		expect(flowController.isFlowControlBytesEnabled()).toBeFalsy();
	});

	it('sendMore should return true if there is no peer flood reading capacity left in batch', function () {
		const flowController = new FlowController(2, 2);
		flowController.start(30, 30, 200);

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
		flowController.start(30, 30, 200);

		expect(flowController.sendMore(MessageType.transaction(), 150)).toBeNull();
		expect(
			flowController.sendMore(MessageType.scpMessage(), 150)
		).toBeInstanceOf(xdr.StellarMessage);
		expect(flowController.sendMore(MessageType.transaction(), 150)).toBeNull();
	});
});
