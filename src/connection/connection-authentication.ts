import { hash, Keypair, xdr } from 'stellar-base';
import * as sodium from 'sodium-native';
import EnvelopeType = xdr.EnvelopeType;
import Uint64 = xdr.Uint64;
import UnsignedHyper = xdr.UnsignedHyper;
import BigNumber from 'bignumber.js';
import { createSHA256Hmac, verifySignature } from '../crypto-helper';

type Curve25519SecretBuffer = Buffer;
type Curve25519PublicBuffer = Buffer;

interface AuthCert {
	publicKeyECDH: Curve25519PublicBuffer;
	expiration: UnsignedHyper;
	signature: Buffer;
}

export class ConnectionAuthentication {
	secretKeyECDH: Curve25519SecretBuffer;
	publicKeyECDH: Curve25519PublicBuffer;
	weCalledRemoteSharedKeys: Map<string, Buffer> = new Map();
	remoteCalledUsSharedKeys: Map<string, Buffer> = new Map();
	networkId: Buffer;
	keyPair: Keypair;

	protected authCert?: AuthCert;
	protected authCertExpiration = 0;

	static AUTH_EXPIRATION_LIMIT = 360000; //60 minutes

	constructor(keyPair: Keypair, networkId: Buffer) {
		this.networkId = networkId;
		this.keyPair = keyPair;
		this.secretKeyECDH = Buffer.alloc(32);
		sodium.randombytes_buf(this.secretKeyECDH);
		this.publicKeyECDH = Buffer.alloc(32);
		sodium.crypto_scalarmult_base(this.publicKeyECDH, this.secretKeyECDH);
	}

	getAuthCert(validAt: Date): AuthCert {
		if (
			!this.authCert ||
			this.authCertExpiration <
				validAt.getTime() + ConnectionAuthentication.AUTH_EXPIRATION_LIMIT / 2
		) {
			this.authCert = this.createAuthCert(validAt);
		}

		return this.authCert;
	}

	getSharedKey(
		remotePublicKeyECDH: Curve25519PublicBuffer,
		weCalledRemote = true
	): Buffer {
		const remotePublicKeyECDHString = remotePublicKeyECDH.toString();
		let sharedKey;
		if (weCalledRemote)
			sharedKey = this.weCalledRemoteSharedKeys.get(remotePublicKeyECDHString);
		else
			sharedKey = this.remoteCalledUsSharedKeys.get(remotePublicKeyECDHString);

		if (!sharedKey) {
			let buf = Buffer.alloc(sodium.crypto_scalarmult_BYTES);
			sodium.crypto_scalarmult(buf, this.secretKeyECDH, remotePublicKeyECDH);

			if (weCalledRemote)
				buf = Buffer.concat([buf, this.publicKeyECDH, remotePublicKeyECDH]);
			else buf = Buffer.concat([buf, remotePublicKeyECDH, this.publicKeyECDH]);

			const zeroSalt = Buffer.alloc(32);

			sharedKey = createSHA256Hmac(buf, zeroSalt);
			if (weCalledRemote)
				this.weCalledRemoteSharedKeys.set(remotePublicKeyECDHString, sharedKey);
			else
				this.remoteCalledUsSharedKeys.set(remotePublicKeyECDHString, sharedKey);
		}

		return sharedKey;
	}

	public createAuthCert(time: Date): AuthCert {
		this.authCertExpiration =
			time.getTime() + ConnectionAuthentication.AUTH_EXPIRATION_LIMIT;
		const expiration = Uint64.fromString(this.authCertExpiration.toString());
		const rawSigData = Buffer.concat([
			this.networkId,
			//@ts-ignore
			EnvelopeType.envelopeTypeAuth().toXDR(),
			expiration.toXDR(),
			this.publicKeyECDH
		]);
		const sha256RawSigData = hash(rawSigData);
		const signature = this.keyPair.sign(sha256RawSigData);

		return {
			publicKeyECDH: this.publicKeyECDH,
			expiration: expiration,
			signature: signature
		};
	}

	public verifyRemoteAuthCert(
		time: Date,
		remotePublicKey: Buffer,
		authCert: xdr.AuthCert
	): boolean {
		const expiration = new BigNumber(authCert.expiration().toString());
		if (expiration.lt(Math.round(time.getTime() / 1000))) {
			return false;
		}

		const rawSigData = Buffer.concat([
			this.networkId,
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			//@ts-ignore
			EnvelopeType.envelopeTypeAuth().toXDR(),
			authCert.expiration().toXDR(),
			authCert.pubkey().key()
		]);
		const sha256RawSigData = hash(rawSigData);

		return verifySignature(remotePublicKey, authCert.sig(), sha256RawSigData);
	}

	public getSendingMacKey(
		localNonce: Buffer,
		remoteNonce: Buffer,
		remotePublicKeyECDH: Curve25519PublicBuffer,
		weCalledRemote = true
	): Buffer {
		const buf = Buffer.concat([
			weCalledRemote ? Buffer.from([0]) : Buffer.from([1]),
			localNonce,
			remoteNonce,
			Buffer.from([1])
		]);

		const sharedKey = this.getSharedKey(remotePublicKeyECDH, weCalledRemote);

		return createSHA256Hmac(buf, sharedKey);
	}

	public getReceivingMacKey(
		localNonce: Buffer,
		remoteNonce: Buffer,
		remotePublicKeyECDH: Curve25519PublicBuffer,
		weCalledRemote = true
	): Buffer {
		const buf = Buffer.concat([
			weCalledRemote ? Buffer.from([1]) : Buffer.from([0]),
			remoteNonce,
			localNonce,
			Buffer.from([1])
		]);

		const sharedKey = this.getSharedKey(remotePublicKeyECDH, weCalledRemote);

		return createSHA256Hmac(buf, sharedKey);
	}
}
