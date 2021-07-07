import {StrKey, xdr} from "stellar-base";
import {Connection} from "./connection";

export class PeerNode {
    public ip: string;
    public port: number;
    public publicKey?: string;
    public ledgerVersion?: number;
    public overlayVersion?: number;
    public overlayMinVersion?: number;
    public networkId?: string;
    public versionStr?: string;

    constructor(ip: string, port: number) {
        this.ip = ip;
        this.port = port;
    }

    get key() {
        return this.ip + ":" + this.port;
    }

    updateFromHelloMessage(helloMessage: xdr.Hello) { 
        this.publicKey = StrKey.encodeEd25519PublicKey(helloMessage.peerId().value());
        this.ledgerVersion = helloMessage.ledgerVersion();
        this.overlayVersion = helloMessage.overlayVersion();
        this.overlayMinVersion = helloMessage.overlayMinVersion();
        this.networkId = helloMessage.networkId().toString('base64');
        this.versionStr = helloMessage.versionStr().toString();
    }
}