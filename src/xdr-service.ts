import fs = require("fs");

export default {
    getMessageLengthFromXDRBuffer: function (buffer) {
        let xdrLengthBuffer = buffer.slice(0,4);

        let length = xdrLengthBuffer[0];
        length &= 0x7f;
        length <<= 8;
        length |= xdrLengthBuffer[1];
        length <<= 8;
        length |= xdrLengthBuffer[2];
        length <<= 8;
        length |= xdrLengthBuffer[3];

        return length;
    },

    xdrBufferContainsCompleteMessage: function(buffer:Buffer, messageLength:number){
        return buffer.length - 4 >= messageLength;
    },

    //returns next message and remaining buffer
    getMessageFromXdrBuffer: function (buffer:Buffer, messageLength: number) {
        return [buffer.slice(4, messageLength), buffer.slice(4+messageLength, buffer.length)];
    },

    getXdrBufferFromMessage: function (message) {
        let lengthBuffer = Buffer.allocUnsafe(4);
        let xdrMessage =  message.toXDR();
        lengthBuffer.writeInt32BE(xdrMessage.length, 0);

        return Buffer.concat([lengthBuffer, xdrMessage]);
    },
};
