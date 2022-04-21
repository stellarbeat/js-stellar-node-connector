import { FlowController } from '../src/connection/flow-controller';
import { xdr } from 'stellar-base';
import MessageType = xdr.MessageType;

it('should request send more if both local and remote overlay protocol versions are higher than 19', function () {
	expect(createFlowControllerWith(19, 19).sendMore()).toBeFalsy();
	expect(createFlowControllerWith(20, 19).sendMore()).toBeFalsy();
	expect(createFlowControllerWith(19, 20).sendMore()).toBeFalsy();
	expect(createFlowControllerWith(20, 20).sendMore()).toBeTruthy();
});

it('sendMore should return true if there is no capacity left for new flood messages', function () {
	const flowController = createFlowControllerWith(20, 20);

	expect(flowController.sendMore()).toBeTruthy();
	expect(flowController.sendMore(MessageType.transaction())).toBeFalsy();
	expect(flowController.sendMore(MessageType.scpMessage())).toBeTruthy();
	expect(flowController.sendMore(MessageType.transaction())).toBeFalsy();
});

function createFlowControllerWith(localOverlay: number, remoteOverlay: number) {
	const flowController = new FlowController(2);
	flowController.enableIfValidOverlayVersions(localOverlay, remoteOverlay);
	return flowController;
}
