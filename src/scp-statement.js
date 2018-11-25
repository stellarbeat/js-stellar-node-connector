const StellarBase = require('stellar-base');

class SCPStatement {

    static fromXdr(xdr) {
        if (typeof xdr === "string") {
            let buffer = Buffer.from(xdr, "base64");
            xdr = StellarBase.xdr.ScpStatement.fromXDR(buffer);
        }

        let result = {};
        result.nodeId = StellarBase.StrKey.encodeEd25519PublicKey(xdr.nodeId().get()).toString();
        result.slotIndex = xdr.slotIndex().toString();
        result.type = xdr.pledges().arm();

        if(result.type === 'externalize') {
            result.quorumSetHash = xdr.pledges().value().commitQuorumSetHash().toString('base64'); //todo: does this differ from other quorumSetHashes?
            result.nH = xdr.pledges().value().nH();
            result.commit = {};
            result.commit.counter = xdr.pledges().value().commit().counter();
            result.commit.value = xdr.pledges().value().commit().value().toString('base64');
        }

        if(result.type === 'confirm') {
            result.quorumSetHash = xdr.pledges().value().quorumSetHash().toString('base64');
            result.nH = xdr.pledges().value().nH();
            result.nPrepared = xdr.pledges().value().nPrepared();
            result.nCommit = xdr.pledges().value().nCommit();
            result.ballot = {};
            result.ballot.counter = xdr.pledges().value().ballot().counter();
            result.ballot.value = xdr.pledges().value().ballot().value().toString('base64');
        }

        if(result.type === 'nominate') {
            result.quorumSetHash = xdr.pledges().value().quorumSetHash().toString('base64');
            result.votes = xdr.pledges().value().votes().map(vote => vote.toString('base64'));
            result.accepted = xdr.pledges().value().accepted().map(vote => vote.toString('base64'));
        }

        if(result.type === 'prepare') {
            result.quorumSetHash = xdr.pledges().value().quorumSetHash().toString('base64');
            result.nH = xdr.pledges().value().nH();
            result.nC = xdr.pledges().value().nC();
            result.preparedPrime = xdr.pledges().value().preparedPrime();
            result.ballot = {};
            result.ballot.counter = xdr.pledges().value().ballot().counter();
            result.ballot.value = xdr.pledges().value().ballot().value().toString('base64');
            if(xdr.pledges().value().prepared()){
                result.prepared = {};
                result.prepared.counter = xdr.pledges().value().prepared().counter();
                result.prepared.value = xdr.pledges().value().prepared().value().toString('base64');
            }
        }

        return result;
    }
}

module.exports = SCPStatement;