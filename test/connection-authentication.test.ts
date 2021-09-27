import {ConnectionAuthentication} from "../src/connection/connection-authentication";
import {hash, Keypair, Networks, xdr} from "stellar-base";
import xdrMessageCreator from "../src/connection/handshake-message-creator";
import BigNumber from "bignumber.js";
import {createSHA256Hmac, verifyHmac} from "../src/crypto-helper";

test('shared key', () => {
    const keyPair = Keypair.fromSecret('SCV6Q3VU4S52KVNJOFXWTHFUPHUKVYK3UV2ISGRLIUH54UGC6OPZVK2D');
    //@ts-ignore
    const connectionAuth = new ConnectionAuthentication(keyPair, hash(Networks.PUBLIC));
    expect(connectionAuth.getSharedKey(Buffer.from('SaINZpCTl6KO8xMLvDkE2vE3knQz0Ma1RmJySOFqsWk=', 'base64'))).toBeDefined()
})

test('authCert', () => {
    const keyPair = Keypair.fromSecret('SCV6Q3VU4S52KVNJOFXWTHFUPHUKVYK3UV2ISGRLIUH54UGC6OPZVK2D');
    //@ts-ignore
    const connectionAuth = new ConnectionAuthentication(keyPair, hash(Networks.PUBLIC));
    const authCert = xdrMessageCreator.createAuthCert(connectionAuth);
    if (authCert.isOk())
        expect(connectionAuth.verifyRemoteAuthCert(new Date(), keyPair.rawPublicKey(), authCert.value)).toBeTruthy();

})

test('mac', () => {
    const keyPair = Keypair.random();
    const peerKeyPair = Keypair.random()

    //@ts-ignore
    const connectionAuth = new ConnectionAuthentication(keyPair, hash(Networks.PUBLIC));
    //@ts-ignore
    const peerConnectionAuth = new ConnectionAuthentication(peerKeyPair, hash(Networks.PUBLIC));

    //@ts-ignore
    const ourNonce = hash(BigNumber.random().toString());
    //@ts-ignore
    const peerNonce = hash(BigNumber.random().toString());

    const receivingMacKey = connectionAuth.getReceivingMacKey(ourNonce, peerNonce, peerConnectionAuth.publicKeyECDH);
    const peerSendingMacKey = peerConnectionAuth.getSendingMacKey(peerNonce, ourNonce, connectionAuth.publicKeyECDH, false);

    const peerSequence = xdr.Uint64.fromString("10").toXDR();

    const msg = Buffer.from('AAAAAAAAAAAAAAE3AAAACwAAAACslTOENMyaVlaiRvFAjiP6s8nFVIHDgWGbncnw+ziO5gAAAAACKbcUAAAAAzQaCq4p6tLHpdfwGhnlyX9dMUP70r4Dm98Td6YvKnhoAAAAAQAAAJijLxoAW1ZSaVphczIXU0XT7i46Jla6OZxkm9mEUfan3gAAAABg6Ee9AAAAAAAAAAEAAAAA+wsSteGzmcH88GN69FRjGLfxMzFH8tsJTaK+8ERePJMAAABAOiGtC3MiMa3LVn8f6SwUpKOmSMAJWQt2vewgt8T9WkRUPt2UdYac7vzcisXnmiusHldZcjVMF3vS03QhzaxdDQAAAAEAAACYoy8aAFtWUmlaYXMyF1NF0+4uOiZWujmcZJvZhFH2p94AAAAAYOhHvQAAAAAAAAABAAAAAPsLErXhs5nB/PBjevRUYxi38TMxR/LbCU2ivvBEXjyTAAAAQDohrQtzIjGty1Z/H+ksFKSjpkjACVkLdr3sILfE/VpEVD7dlHWGnO783IrF55orrB5XWXI1TBd70tN0Ic2sXQ0AAABA0ZiyH9AGgPR/d3h+94s6+iU5zhZbKM/5DIOYeKgxwEOotUveGfHLN5IQk7VlTW2arDkk+ekzjRQfBoexrkJrBMsQ30YpI1R/uY9npg0Fpt1ScyZ+yhABs6x1sEGminNh', 'base64');

    const macPeerUsesToSendUsTheMessage = createSHA256Hmac(Buffer.concat([
        peerSequence,
        msg
    ]), peerSendingMacKey);

    const result = verifyHmac(macPeerUsesToSendUsTheMessage, receivingMacKey, Buffer.concat([peerSequence, msg]));
    expect(result).toBeTruthy();
})