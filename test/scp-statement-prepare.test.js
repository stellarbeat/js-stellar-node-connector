const ScpStatement = require('../lib/scp-statement');
let scpExternalizeXdr = 'AAAAALsrraBmxcawytPurkd8D0zc8+XENcygJRlcKnh8UFvHAAAAAAFCsQEAAAAAoVCmb6BGLJhpbhCZzn7QrT4288ZOVOtY9l+y26P4UOIAAAABAAAAMHssstrhv2RMTgQC3AO+AW/rf7DLXnuwrwC/BrUG1hJJAAAAAFv5quUAAAAAAAAAAAAAAAEAAAABAAAAMHssstrhv2RMTgQC3AO+AW/rf7DLXnuwrwC/BrUG1hJJAAAAAFv5quUAAAAAAAAAAAAAAAAAAAABAAAAAQ==';

let scpStatement = ScpStatement.fromXdr(scpExternalizeXdr);

test('slotIndex', () => {
    expect(scpStatement.slotIndex).toEqual('21147905');
});

test('nodeId', () => {
    expect(scpStatement.nodeId).toEqual('GC5SXLNAM3C4NMGK2PXK4R34B5GNZ47FYQ24ZIBFDFOCU6D4KBN4POAE');
});

test('type', () => {
    expect(scpStatement.type).toEqual('prepare');
});

test('quorumSetHash', () => {
    expect(scpStatement.quorumSetHash).toEqual('oVCmb6BGLJhpbhCZzn7QrT4288ZOVOtY9l+y26P4UOI=');
});

test('ballot.counter', () => {
    expect(scpStatement.ballot.counter).toEqual(1);
});

test('ballot.value', () => {
    expect(scpStatement.ballot.value).toEqual('eyyy2uG/ZExOBALcA74Bb+t/sMtee7CvAL8GtQbWEkkAAAAAW/mq5QAAAAAAAAAA');
});

test('prepared.counter', () => {
    expect(scpStatement.prepared.counter).toEqual(1);
});

test('prepared.value', () => {
    expect(scpStatement.prepared.value).toEqual('eyyy2uG/ZExOBALcA74Bb+t/sMtee7CvAL8GtQbWEkkAAAAAW/mq5QAAAAAAAAAA');
});

test('preparedPrime', () => {
    expect(scpStatement.preparedPrime).toEqual(undefined);
});

test('nC', () => {
    expect(scpStatement.nC).toEqual(1);
});

test('nH', () => {
    expect(scpStatement.nH).toEqual(1);
});

let xdr = 'AAAAAIwdS0o2ARfVAN/PjN6xZrGaEuD0t7zToaDF6Z5B9peZAAAAAAFCsf4AAAAAaeRARPRhjl8HNOlSKi3rT1jb7T+okrFnTxnpbQVmGJsAAAABAAAAMENWWZhZurxXL9VBF9CujwimyoKTLeaQBKmB3VMI0i9aAAAAAFv5sAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
let statement = ScpStatement.fromXdr(xdr);

test('noPrepared', () => {
    expect(statement.prepared).toEqual(undefined);
});