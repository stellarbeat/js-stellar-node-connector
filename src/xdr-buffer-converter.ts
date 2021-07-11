import {xdr} from "stellar-base";
import AuthenticatedMessage = xdr.AuthenticatedMessage;
import {err, ok, Result} from "neverthrow";

export default {
    getMessageLengthFromXDRBuffer: function (buffer:Buffer) {
        if(buffer.length < 4)
            return 0;

        buffer[0] = buffer[0] &= 0x7f; //clear xdr continuation bit
        return buffer.readUInt32BE(0)
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
            let lengthBuffer = Buffer.alloc(4);
            let xdrMessage =  message.toXDR();
            lengthBuffer.writeUInt32BE(xdrMessage.length, 0);

            return ok(Buffer.concat([lengthBuffer, xdrMessage]));
        } catch (error){
            return err(error);
        }

    },
};
