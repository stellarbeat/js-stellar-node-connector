module.exports = {
    getLengthFromXDRLengthBuffer: function (xdrLengthBuffer) {
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

    getMessageFromXdrBuffer: function (buffer) {
        let lengthPart = buffer.slice(0,4);
        let length = this.getLengthFromXDRLengthBuffer(lengthPart);
        //console.log(buffer.slice(4).toString('base64'));
        if(buffer.length - length <= 4) {
            return [buffer.slice(4, 4 + length), null];
        } else {
            return [buffer.slice(4, 4 + length), buffer.slice(4+length)]; //the message starts at byte 5 and has the calculated length
        }
    },

    getXdrBufferFromMessage: function (message) {
        let lengthBuffer = Buffer.allocUnsafe(4);
        lengthBuffer.writeInt32BE(message.toXDR().length, 0);

        return Buffer.concat([lengthBuffer, message.toXDR()]);
    },
};
