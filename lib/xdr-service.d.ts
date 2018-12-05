/// <reference types="node" />
declare const _default: {
    getMessageLengthFromXDRBuffer: (buffer: any) => any;
    xdrBufferContainsNextMessage: (buffer: any) => boolean;
    getNextMessageFromXdrBuffer: (buffer: any) => any[];
    getXdrBufferFromMessage: (message: any) => Buffer;
    readXdrFile: (filePath: any, successCallback: any, errorCallback: any) => void;
};
export default _default;
