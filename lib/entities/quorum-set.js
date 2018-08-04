// 
const R = require('ramda');

class QuorumSet {


    constructor(hashKey,
                threshold = 0,
                validators = [],
                innerQuorumSets = [],
                dateDiscovered = new Date(),
                dateLastSeen = new Date(),) {
        this._hashKey = hashKey;
        this._threshold = threshold;
        this.validators = validators;
        this.innerQuorumSets = innerQuorumSets;
    }

    get hashKey() {
        return this._hashKey;
    }

    set hashKey(value) {
        this._hashKey = value;
    }

    get threshold() {
        return this._threshold;
    }

    set threshold(value) {
        this._threshold = value;
    }

    get validators() {
        return this._validators;
    }

    set validators(value) {
        this._validators = value;
    }

    get innerQuorumSets() {
        return this._innerQuorumSets;
    }

    set innerQuorumSets(value) {
        this._innerQuorumSets = value;
    }

    static getAllValidators(qs) {
        return R.reduce(
            (validators, innerQS) => R.concat(validators, QuorumSet.getAllValidators(innerQS)),
            qs.validators,
            qs.innerQuorumSets
        );
    }

    toJSON() {
        return {
            hashKey: this.hashKey,
            threshold: this.threshold,
            validators: Array.from(this.validators),
            innerQuorumSets: Array.from(this.innerQuorumSets),
        };
    }


    static fromJSON(quorumSet) {
        if(!quorumSet){
            return null;
        }

        let innerQuorumSets = quorumSet.innerQuorumSets.map(
            innerQuorumSet => this.fromJSON(innerQuorumSet)
        );

        return new QuorumSet(
            quorumSet.hashKey,
            quorumSet.threshold,
            quorumSet.validators,
            innerQuorumSets
        );
    };
}

module.exports = QuorumSet;