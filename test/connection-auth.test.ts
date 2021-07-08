import {ConnectionAuthentication} from "../src/connection-authentication";
import {Keypair} from "stellar-base";

test('getSecretKey', () => {
    let keyPair = Keypair.fromSecret('SCV6Q3VU4S52KVNJOFXWTHFUPHUKVYK3UV2ISGRLIUH54UGC6OPZVK2D');
    let connectionAuth = new ConnectionAuthentication(keyPair);
    expect(connectionAuth.getSharedKey(Buffer.from('SaINZpCTl6KO8xMLvDkE2vE3knQz0Ma1RmJySOFqsWk=', 'base64')).toString('base64')).toEqual('Eln8mTN22/jViFFfe1itjDFcIlUX+iAghBt5K61Kpds=');
})