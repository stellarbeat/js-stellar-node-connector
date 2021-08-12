import {Transform, TransformCallback} from "stream";
import * as LRUCache from "lru-cache";
import {hash, Networks, xdr} from "stellar-base";
import StellarMessage = xdr.StellarMessage;
import MessageType = xdr.MessageType;
import {verifySCPEnvelopeSignature} from "./stellar-message-service";

export class UniqueSCPStatementTransform extends Transform {
    protected cache = new LRUCache(5000);

    constructor() {
        super({
            objectMode: true,
            readableObjectMode: true,
            writableObjectMode: true
        })
    }

    _transform(stellarMessage: StellarMessage, encoding:string, next:TransformCallback) {
        console.log('transform')

        if(stellarMessage.switch() !== MessageType.scpMessage())
            return next();

        if (this.cache.has(stellarMessage.envelope().signature().toString())) {
            console.log("cache hit");
            return next();
        }

        this.cache.set(stellarMessage.envelope().signature().toString(), 1);

        //todo: if we use worker pool and 'async' next call, will the internal buffer fill up too fast and block reading?
        //@ts-ignore
        if(verifySCPEnvelopeSignature(stellarMessage.envelope(), hash(Networks.PUBLIC)))
            return next(null, stellarMessage.envelope().statement().toXDR('base64'));

        return next();
    }
}