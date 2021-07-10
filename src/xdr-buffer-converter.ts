import {xdr} from "stellar-base";
import AuthenticatedMessage = xdr.AuthenticatedMessage;
import {err, ok, Result} from "neverthrow";

export default {
    getMessageLengthFromXDRBuffer: function (buffer:Buffer) {
        let length = buffer[0]; //first byte
        length &= 0x7f;
        length <<= 8;
        length |= buffer[1];
        length <<= 8;
        length |= buffer[2];
        length <<= 8;
        length |= buffer[3];

        return length;
    },

    xdrBufferContainsCompleteMessage: function(buffer:Buffer, messageLength:number){
        return buffer.length - 4 >= messageLength;
    },

    //returns next message and remaining buffer
    getMessageFromXdrBuffer: function (buffer:Buffer, messageLength: number) {
        return [buffer.slice(4, messageLength + 4), buffer.slice(4 + messageLength)];
    },

    getXdrBufferFromMessage: function (message:AuthenticatedMessage): Result<Buffer, Error> {
        try {
            let lengthBuffer = Buffer.allocUnsafe(4);
            let xdrMessage =  message.toXDR();
            lengthBuffer.writeInt32BE(xdrMessage.length, 0);

            return ok(Buffer.concat([lengthBuffer, xdrMessage]));
        } catch (error){
            return err(error);
        }

    },
};
