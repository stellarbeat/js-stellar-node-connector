import { xdr } from 'stellar-base';
import { isFloodMessage } from '../src/connection/is-flood-message';
import MessageType = xdr.MessageType;

test('isFloodMessage', () => {
	expect(isFloodMessage(MessageType.getScpQuorumset())).toBeFalsy();
	expect(isFloodMessage(MessageType.scpMessage())).toBeTruthy();
	expect(isFloodMessage(MessageType.transaction())).toBeTruthy();
});
