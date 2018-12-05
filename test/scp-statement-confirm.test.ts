import {SCPStatement} from '../src/scp-statement';
let scpExternalizeXdr = 'AAAAABztrsEXLl9W0X9JJPkBOBEqpZIMwLO6DNEyb8Of/SwPAAAAAAFCpGYAAAABAAAAAQAAADBnd98wfO2kAnTG9/08+P7HNL0Ew8IehQlIay6MPQjS1AAAAABb+WswAAAAAAAAAAAAAAABAAAAAQAAAAEFtEIOm9feOUDTJzFhUl0QgHwDNgbTUEFeY6WXrozltw==';

let scpStatement = SCPStatement.fromXdr(scpExternalizeXdr);

test('slotIndex', () => {
    expect(scpStatement.slotIndex).toEqual('21144678');
});

test('nodeId', () => {
    expect(scpStatement.nodeId).toEqual('GAOO3LWBC4XF6VWRP5ESJ6IBHAISVJMSBTALHOQM2EZG7Q477UWA6L7U');
});

test('type', () => {
    expect(scpStatement.type).toEqual('confirm');
});

test('quorumSetHash', () => {
    expect(scpStatement.quorumSetHash).toEqual('BbRCDpvX3jlA0ycxYVJdEIB8AzYG01BBXmOll66M5bc=');
});

test('nH', () => {
    expect(scpStatement.nH).toEqual(1);
});

test('ballot.counter', () => {
    expect(scpStatement.ballot.counter).toEqual(1);
});

test('ballot.value', () => {
    expect(scpStatement.ballot.value).toEqual('Z3ffMHztpAJ0xvf9PPj+xzS9BMPCHoUJSGsujD0I0tQAAAAAW/lrMAAAAAAAAAAA');
});

test('nPrepared', () => {
    expect(scpStatement.nPrepared).toEqual(1);
});

test('nCommit', () => {
    expect(scpStatement.nCommit).toEqual(1);
});