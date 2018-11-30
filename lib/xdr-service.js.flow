const fs = require('fs');
const path = require('path');

module.exports = {
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

    xdrBufferContainsNextMessage: function(buffer){
        return buffer.length - 4 >= this.getMessageLengthFromXDRBuffer(buffer)
    },

    //returns next message and remaining buffer
    getNextMessageFromXdrBuffer: function (buffer) {
        let length = this.getMessageLengthFromXDRBuffer(buffer);
        let bufferWithouthLengthPrefix = buffer.slice(4, buffer.length);
        let nextMessageBuffer = bufferWithouthLengthPrefix.slice(0, length);
        let remainingBuffer = bufferWithouthLengthPrefix.slice(length, bufferWithouthLengthPrefix.length);

        return [nextMessageBuffer, remainingBuffer];
    },

    getXdrBufferFromMessage: function (message) {
        let lengthBuffer = Buffer.allocUnsafe(4);
        lengthBuffer.writeInt32BE(message.toXDR().length, 0);

        return Buffer.concat([lengthBuffer, message.toXDR()]);
    },

    readXdrFile: function (filePath, successCallback, errorCallback) {
        fs.readFile(filePath, {encoding: 'binary'}, function (err, data) {
            if (!err) {
                let buffer = Buffer.from(data, 'binary');
                let next, rem;
                [next, rem] = xs.getNextMessageFromXdrBuffer(buffer);
                [next, rem] = xs.getNextMessageFromXdrBuffer(rem);
                [next, rem] = xs.getNextMessageFromXdrBuffer(rem);
                successCallback(next.toString('base64'));

            } else {
                errorCallback(err);
            }
        });
    }
};
