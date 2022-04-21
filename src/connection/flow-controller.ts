import { xdr } from 'stellar-base';
import { isFloodMessage } from './is-flood-message';
import MessageType = xdr.MessageType;

export class FlowController {
	private flowControlEnabled = false;
	private floodMessageCapacity = 0;

	constructor(public readonly maxFloodMessageCapacity: number) {}

	enableIfValidOverlayVersions(
		localOverlayVersion: number,
		remoteOverlayVersion: number
	): void {
		this.flowControlEnabled =
			remoteOverlayVersion >= 20 && localOverlayVersion >= 20;
	}

	sendMore(messageType?: MessageType): boolean {
		if (!this.flowControlEnabled) return false; //no need to send more if flow control not enabled

		if (messageType && isFloodMessage(messageType)) this.floodMessageCapacity--;

		if (this.floodMessageCapacity === 0) {
			this.floodMessageCapacity = this.maxFloodMessageCapacity;
			return true;
		}

		return false;
	}
}
