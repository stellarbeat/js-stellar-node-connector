import {SCPStatement} from '../src/scp-statement';
let scpExternalizeXdr = 'AAAAAIwdS0o2ARfVAN/PjN6xZrGaEuD0t7zToaDF6Z5B9peZAAAAAAFCpGgAAAACAAAAAQAAADAUBROQDU31tG+iqwxszbDEoE6ezXSlQ1+8cgtQGyJTQgAAAABb+Ws6AAAAAAAAAAAAAAABaeRARPRhjl8HNOlSKi3rT1jb7T+okrFnTxnpbQVmGJs=';

let scpStatement = SCPStatement.fromXdr(scpExternalizeXdr);

test('slotIndex', () => {
    expect(scpStatement.slotIndex).toEqual('21144680');
});

test('nodeId', () => {
    expect(scpStatement.nodeId).toEqual('GCGB2S2KGYARPVIA37HYZXVRM2YZUEXA6S33ZU5BUDC6THSB62LZSTYH');
});

test('type', () => {
    expect(scpStatement.type).toEqual('externalize');
});

test('quorumSetHash', () => {
    expect(scpStatement.quorumSetHash).toEqual('aeRARPRhjl8HNOlSKi3rT1jb7T+okrFnTxnpbQVmGJs=');
});

test('commit.counter', () => {
    expect(scpStatement.commit.counter).toEqual(1);
});

test('commit.value', () => {
    expect(scpStatement.commit.value).toEqual('FAUTkA1N9bRvoqsMbM2wxKBOns10pUNfvHILUBsiU0IAAAAAW/lrOgAAAAAAAAAA');
});

test('nh', () => {
    expect(scpStatement.nH).toEqual(1);
});