import {ConnectionAuthentication} from "../src/connection-authentication";
import {hash, Keypair, Networks} from "stellar-base";
import xdrMessageCreator from "../src/xdr-message-creator";

test('getSecretKey', () => {
    let keyPair = Keypair.fromSecret('SCV6Q3VU4S52KVNJOFXWTHFUPHUKVYK3UV2ISGRLIUH54UGC6OPZVK2D');
    //@ts-ignore
    let connectionAuth = new ConnectionAuthentication(keyPair, hash(Networks.PUBLIC));
    expect(connectionAuth.getSharedKey(Buffer.from('SaINZpCTl6KO8xMLvDkE2vE3knQz0Ma1RmJySOFqsWk=', 'base64')).toString('base64')).toEqual('Eln8mTN22/jViFFfe1itjDFcIlUX+iAghBt5K61Kpds=');
})

test('authCert', () => {
    let keyPair = Keypair.fromSecret('SCV6Q3VU4S52KVNJOFXWTHFUPHUKVYK3UV2ISGRLIUH54UGC6OPZVK2D');
    //@ts-ignore
    let connectionAuth = new ConnectionAuthentication(keyPair, hash(Networks.PUBLIC));
    let authCert = xdrMessageCreator.createAuthCert(connectionAuth);
    if(authCert.isOk())
        expect(connectionAuth.verifyRemoteAuthCert(new Date(), keyPair.rawPublicKey(), authCert.value)).toBeTruthy();

})