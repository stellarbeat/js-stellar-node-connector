import * as crypto from 'crypto';
import {
	crypto_sign_BYTES,
	crypto_sign_detached,
	crypto_sign_verify_detached
} from 'sodium-native';

export function createSHA256Hmac(data: Buffer, macKey: Buffer): Buffer {
	return crypto.createHmac('SHA256', macKey).update(data).digest();
}

export function verifyHmac(mac: Buffer, macKey: Buffer, data: Buffer): boolean {
	const calculatedMac = crypto
		.createHmac('SHA256', macKey)
		.update(data)
		.digest();

	return crypto.timingSafeEqual(calculatedMac, mac);
}

export function verifySignature(
	publicKey: Buffer,
	signature: Buffer,
	message: Buffer
): boolean {
	return crypto_sign_verify_detached(signature, message, publicKey);
}

export function createSignature(secretKey: Buffer, message: Buffer): Buffer {
	const signature = Buffer.alloc(crypto_sign_BYTES);
	crypto_sign_detached(signature, message, secretKey);

	return signature;
}
