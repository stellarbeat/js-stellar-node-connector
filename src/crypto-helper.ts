import * as crypto from "crypto";
import {crypto_sign_verify_detached} from "sodium-native";

export function createSHA256Hmac(data: Buffer, macKey: Buffer) {
    return crypto.createHmac('SHA256', macKey).update(data).digest();
}

export function verifyHmac(mac: Buffer, macKey: Buffer, data: Buffer) {
    let calculatedMac = crypto.createHmac('SHA256', macKey).update(
        data
    ).digest();

    return crypto.timingSafeEqual(calculatedMac, mac);
}

export function verifySignature(publicKey: Buffer, signature: Buffer, message: Buffer): boolean {
    return crypto_sign_verify_detached(signature, message, publicKey);
}
