import { xdr } from '@stellar/stellar-base';
import { isFloodMessage } from './is-flood-message';
import MessageType = xdr.MessageType;
import StellarMessage = xdr.StellarMessage;

export class FlowController {
	private messagesReceivedInCurrentBatch = 0;
	private bytesReceivedInCurrentBatch = 0;

	/**
	 * Uses param names from stellar-core config. Non bytes parameters are counted in number of messages.
	 * The Reading capacity is the number of messages that can be processed simultaneously.
	 * Everytime a batch of messages is processed, we request the capacity back through sendmore messages.
	 * The bytes capacity should be higher than the batch size + the maximum message size, to avoid getting stuck.
	 * @param peerFloodReadingCapacity
	 * @param flowControlSendMoreBatchSize
	 * @param peerFloodReadingCapacityBytes
	 * @param flowControlSendMoreBatchSizeBytes
	 */
	constructor(
		//we use stellar-core defaults atm
		private peerFloodReadingCapacity = 200,
		private flowControlSendMoreBatchSize = 40,
		private peerFloodReadingCapacityBytes = 300000,
		private flowControlSendMoreBatchSizeBytes = 100000
	) {}

	/*
	 * Start by sending a send-more message with the _total_ capacity available.
	 */
	start(): null | StellarMessage {
		return xdr.StellarMessage.sendMoreExtended(
			new xdr.SendMoreExtended({
				numMessages: this.peerFloodReadingCapacity,
				numBytes: this.peerFloodReadingCapacityBytes
			})
		);
	}

	sendMore(
		messageType: MessageType,
		stellarMessageSize: number
	): null | xdr.StellarMessage {
		if (isFloodMessage(messageType)) {
			this.messagesReceivedInCurrentBatch++;
			this.bytesReceivedInCurrentBatch += stellarMessageSize;
		}

		let shouldSendMore =
			this.messagesReceivedInCurrentBatch === this.flowControlSendMoreBatchSize;
		shouldSendMore =
			shouldSendMore ||
			this.bytesReceivedInCurrentBatch >=
				this.flowControlSendMoreBatchSizeBytes;

		//reclaim the capacity
		let sendMoreMessage: xdr.StellarMessage;
		if (shouldSendMore) {
			sendMoreMessage = xdr.StellarMessage.sendMoreExtended(
				new xdr.SendMoreExtended({
					numMessages: this.messagesReceivedInCurrentBatch, //!request back the number of messages we received, not the total capacity like when starting!
					numBytes: this.bytesReceivedInCurrentBatch
				})
			);

			this.messagesReceivedInCurrentBatch = 0;
			this.bytesReceivedInCurrentBatch = 0;

			return sendMoreMessage;
		}

		return null;
	}
}
