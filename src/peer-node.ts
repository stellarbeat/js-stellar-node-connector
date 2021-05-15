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
}