import {Transform, TransformCallback} from "stream";
import {xdr} from "stellar-base";
import StellarMessage = xdr.StellarMessage;

export type MessageTypeName = string;

export class StellarMessageRouter extends Transform {
    streams: Map<MessageTypeName, Transform>;

    constructor(streams: Map<MessageTypeName, Transform>) {
        super({
            readableObjectMode: true,
            writableObjectMode: true
        })
        this.streams = streams;
    }

    _transform(stellarMessage: StellarMessage, encoding:string, next:TransformCallback) {
        let stream = this.streams.get(stellarMessage.switch().name);
        if(stream){
            console.log(stream.writableObjectMode);
            console.log(stream.readableObjectMode);
            stream.write(stellarMessage);//use write, not push because we add to the writable side of the duplex stream. Push is for adding to the readable side.
        }

        return next();
    }
}