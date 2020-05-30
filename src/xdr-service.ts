export default {
    getMessageLengthFromXDRBuffer: function (buffer) {
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

    getXdrBufferFromMessage: function (message) {
        let lengthBuffer = Buffer.allocUnsafe(4);
        let xdrMessage =  message.toXDR();
        lengthBuffer.writeInt32BE(xdrMessage.length, 0);

        return Buffer.concat([lengthBuffer, xdrMessage]);
    },
};
