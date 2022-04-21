import { FlowController } from '../src/connection/flow-controller';
import { xdr } from 'stellar-base';
import MessageType = xdr.MessageType;

it('should request send more if overlay protocol version is higher than 19', function () {
	const flowController = new FlowController(2);
	flowController.initialize(19);
	expect(flowController.sendMore()).toBeFalsy();

	const flowController2 = new FlowController(2);
	flowController2.initialize(20);
	expect(flowController2.sendMore()).toBeTruthy();
});

it('sendMore should return true if there is no capacity left for new flood messages', function () {
	const flowController = new FlowController(2);

	flowController.initialize(20);
	expect(flowController.sendMore()).toBeTruthy();
	expect(flowController.sendMore(MessageType.transaction())).toBeFalsy();
	expect(flowController.sendMore(MessageType.scpMessage())).toBeTruthy();
	expect(flowController.sendMore(MessageType.transaction())).toBeFalsy();
});
