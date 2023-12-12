import { xdr } from '@stellar/stellar-base';
import { err, ok, Result } from 'neverthrow';
import AuthCert = xdr.AuthCert;
import Hello = xdr.Hello;
import { ConnectionAuthentication } from './connection-authentication';

export default {
	createAuthMessage: function (
		flowControlInBytes = false
	): Result<xdr.StellarMessage, Error> {
		try {
			const auth = new xdr.Auth({ flags: flowControlInBytes ? 200 : 100 });
			// @ts-ignore
			const authMessage = new xdr.StellarMessage.auth(auth) as StellarMessage;
			return ok(authMessage);
		} catch (error) {
			if (error instanceof Error)
				return err(new Error('Auth msg create failed: ' + error.message));
			else return err(new Error('Auth msg create failed'));
		}
	},

	createHelloMessage: function (
		peerId: xdr.PublicKey,
		nonce: Buffer,
		authCert: xdr.AuthCert,
		stellarNetworkId: Buffer,
		ledgerVersion: number,
		overlayVersion: number,
		overlayMinVersion: number,
		versionStr: string,
		listeningPort: number
	): Result<Hello, Error> {
		try {
			const hello = new xdr.Hello({
				ledgerVersion: ledgerVersion,
				overlayVersion: overlayVersion,
				overlayMinVersion: overlayMinVersion,
				networkId: stellarNetworkId,
				versionStr: versionStr,
				listeningPort: listeningPort,
				peerId: peerId,
				cert: authCert,
				nonce: nonce
			});

			//@ts-ignore
			return ok(new xdr.StellarMessage.hello(hello));
		} catch (error) {
			let msg = 'CreateHelloMessage failed';
			if (error instanceof Error) msg += ': ' + error.message;
			return err(new Error(msg));
		}
	},

	createAuthCert: function (
		connectionAuthentication: ConnectionAuthentication
	): Result<AuthCert, Error> {
		try {
			const curve25519PublicKey = new xdr.Curve25519Public({
				key: connectionAuthentication.publicKeyECDH
			});

			return ok(
				new xdr.AuthCert({
					pubkey: curve25519PublicKey,
					expiration: connectionAuthentication.getAuthCert(new Date())
						.expiration,
					sig: connectionAuthentication.getAuthCert(new Date()).signature
				})
			);
		} catch (error) {
			if (error instanceof Error)
				return err(new Error('createAuthCert failed: ' + error.message));
			else return err(new Error('createAuthCert failed'));
		}
	}
};
