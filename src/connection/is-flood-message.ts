import { xdr } from 'stellar-base';
import MessageType = xdr.MessageType;

export function isFloodMessage(messsageType: MessageType): boolean {
	return (
		messsageType === MessageType.scpMessage() ||
		messsageType === MessageType.transaction()
	);
}
