const ScpStatement = require('../lib/scp-statement');
let scpExternalizeXdr = 'AAAAABztrsEXLl9W0X9JJPkBOBEqpZIMwLO6DNEyb8Of/SwPAAAAAAFCsPsAAAADBbRCDpvX3jlA0ycxYVJdEIB8AzYG01BBXmOll66M5bcAAAACAAAAMPvLgvBDr/YUpaI3Mfz+sMx0oMORDaI4u6KvFKL9WQQfAAAAAFv5qsMAAAAAAAAAAAAAADD7y4LwQ6/2FKWiNzH8/rDMdKDDkQ2iOLuirxSi/VkEHwAAAABb+arEAAAAAAAAAAAAAAABAAAAMPvLgvBDr/YUpaI3Mfz+sMx0oMORDaI4u6KvFKL9WQQfAAAAAFv5qsQAAAAAAAAAAA=';

let scpStatement = ScpStatement.fromXdr(scpExternalizeXdr);

test('slotIndex', () => {
    expect(scpStatement.slotIndex).toEqual('21147899');
});

test('nodeId', () => {
    expect(scpStatement.nodeId).toEqual('GAOO3LWBC4XF6VWRP5ESJ6IBHAISVJMSBTALHOQM2EZG7Q477UWA6L7U');
});

test('type', () => {
    expect(scpStatement.type).toEqual('nominate');
});

test('quorumSetHash', () => {
    expect(scpStatement.quorumSetHash).toEqual('BbRCDpvX3jlA0ycxYVJdEIB8AzYG01BBXmOll66M5bc=');
});

let votes = [
    '+8uC8EOv9hSlojcx/P6wzHSgw5ENoji7oq8Uov1ZBB8AAAAAW/mqwwAAAAAAAAAA',
    '+8uC8EOv9hSlojcx/P6wzHSgw5ENoji7oq8Uov1ZBB8AAAAAW/mqxAAAAAAAAAAA'
];

test('votes', () => {
    expect(scpStatement.votes).toEqual(votes);
});

let accepted = [
    '+8uC8EOv9hSlojcx/P6wzHSgw5ENoji7oq8Uov1ZBB8AAAAAW/mqxAAAAAAAAAAA'
];

test('accepted', () => {
    expect(scpStatement.accepted).toEqual(accepted);
});