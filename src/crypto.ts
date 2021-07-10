import * as crypto from "crypto";

export function createHmac(stellarMessageXDR: Buffer, sequence: Buffer, macKey: Buffer) {
    return crypto.createHmac('SHA256', macKey).update(
        Buffer.concat([
            sequence,
            stellarMessageXDR
        ])
    ).digest();
}

export function verifyHmac(mac: Buffer, receivingMacKey: Buffer, data: Buffer) {
    let calculatedMac = crypto.createHmac('SHA256', receivingMacKey).update(
        data
    ).digest();

    return mac.equals(calculatedMac);
}