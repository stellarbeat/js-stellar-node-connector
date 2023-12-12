import { xdr } from '@stellar/stellar-base';
import AuthenticatedMessage = xdr.AuthenticatedMessage;
import { err, ok, Result } from 'neverthrow';
import StellarMessage = xdr.StellarMessage;

export default {
	getMessageLengthFromXDRBuffer: function (buffer: Buffer): number {
		if (buffer.length < 4) return 0;

		buffer[0] = buffer[0] &= 0x7f; //clear xdr continuation bit
		return buffer.readUInt32BE(0);
	},

	xdrBufferContainsCompleteMessage: function (
		buffer: Buffer,
		messageLength: number
	): boolean {
		return buffer.length - 4 >= messageLength;
	},

	//returns next message and remaining buffer
	getMessageFromXdrBuffer: function (
		buffer: Buffer,
		messageLength: number
	): [Buffer, Buffer] {
		return [
			buffer.slice(4, messageLength + 4),
			buffer.slice(4 + messageLength)
		];
	},

	getXdrBufferFromMessage: function (
		message: AuthenticatedMessage | StellarMessage
	): Result<Buffer, Error> {
		try {
			const lengthBuffer = Buffer.alloc(4);
			const xdrMessage = message.toXDR();
			lengthBuffer.writeUInt32BE(xdrMessage.length, 0);

			return ok(Buffer.concat([lengthBuffer, xdrMessage]));
		} catch (error) {
			let msg: xdr.StellarMessage;
			if (message instanceof AuthenticatedMessage)
				msg = message.value().message();
			else msg = message;

			let errorMsg = 'ToXDR of ' + msg.switch().name + ' failed';
			if (error instanceof Error) errorMsg += ': ' + error.message;

			return err(new Error(errorMsg));
		}
	}
};
