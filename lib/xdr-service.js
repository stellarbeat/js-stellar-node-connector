"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
exports.default = {
    getMessageLengthFromXDRBuffer: function (buffer) {
        let xdrLengthBuffer = buffer.slice(0, 4);
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
    xdrBufferContainsNextMessage: function (buffer) {
        return buffer.length - 4 >= this.getMessageLengthFromXDRBuffer(buffer);
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
        let xdrMessage = message.toXDR();
        lengthBuffer.writeInt32BE(xdrMessage.length, 0);
        return Buffer.concat([lengthBuffer, xdrMessage]);
    },
    readXdrFile: function (filePath, successCallback, errorCallback) {
        fs.readFile(filePath, { encoding: 'binary' }, function (err, data) {
            if (!err) {
                let buffer = Buffer.from(data, 'binary');
                let next, rem;
                [next, rem] = this.getNextMessageFromXdrBuffer(buffer);
                [next, rem] = this.getNextMessageFromXdrBuffer(rem);
                [next, rem] = this.getNextMessageFromXdrBuffer(rem);
                successCallback(next.toString('base64'));
            }
            else {
                errorCallback(err);
            }
        });
    }
};
//# sourceMappingURL=xdr-service.js.map