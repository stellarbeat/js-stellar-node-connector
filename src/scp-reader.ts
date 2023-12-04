import {Logger} from "pino";
import {Node} from "./node";
import {StrKey, xdr} from "stellar-base";

type PublicKey = string;
type Ledger = string;
type Value = string;

export class ScpReader {
    private nominateVotes: Map<Ledger, Map<PublicKey, Value[]>> = new Map();
    private nominateAccepted: Map<Ledger, Map<PublicKey, Value[]>> = new Map();

    constructor(private logger: Logger) {

    }

    private isNewNominateVote(ledger: Ledger, publicKey: PublicKey, value: Value[]): boolean {
        if (value.length === 0)
            return false;
        const ledgerVotes = this.nominateVotes.get(ledger);
        if (!ledgerVotes)
            return true;

        const votesByNode = ledgerVotes.get(publicKey);
        if (!votesByNode)
            return true;

        return votesByNode.length !== value.length;
    }

    private registerNominateVotes(ledger: Ledger, publicKey: PublicKey, value: Value[]) {
        let ledgerVotes = this.nominateVotes.get(ledger);
        if (!ledgerVotes) {
            ledgerVotes = new Map();
            this.nominateVotes.set(ledger, ledgerVotes);
        }

        const votesByNode = ledgerVotes.get(publicKey);
        if (!votesByNode) {
            ledgerVotes.set(publicKey, value);
        }
    }

    private isNewNominateAccepted(ledger: Ledger, publicKey: PublicKey, value: Value[]): boolean {
        if (value.length === 0)
            return false;

        const ledgerAccepted = this.nominateAccepted.get(ledger);
        if (!ledgerAccepted)
            return true;

        const acceptedByNode = ledgerAccepted.get(publicKey);
        if (!acceptedByNode)
            return true;

        return acceptedByNode.length !== value.length;
    }

    private registerNominateAccepted(ledger: Ledger, publicKey: PublicKey, value: Value[]) {
        let ledgerAccepted = this.nominateAccepted.get(ledger);
        if (!ledgerAccepted) {
            ledgerAccepted = new Map();
            this.nominateAccepted.set(ledger, ledgerAccepted);
        }

        const acceptedByNode = ledgerAccepted.get(publicKey);
        if (!acceptedByNode) {
            ledgerAccepted.set(publicKey, value);
        }
    }

    read(node: Node, ip: string, port: number, nodeNames: Map<string, string>): void {
        this.logger.info('Connecting to ' + ip + ':' + port);

        const connection = node.connectTo(ip, port);
        connection
            .on('connect', (publicKey, nodeInfo) => {
                console.log('Connected to Stellar Node: ' + publicKey);
                console.log(nodeInfo);
            })
            .on('data', (stellarMessageJob) => {
                const stellarMessage = stellarMessageJob.stellarMessage;
                //console.log(stellarMessage.toXDR('base64'))

                switch (stellarMessage.switch()) {
                    case xdr.MessageType.scpMessage():
                        this.translateSCPMessage(stellarMessage, nodeNames);
                        break;
                    default:
                        console.log(
                            'rcv StellarMessage of type ' + stellarMessage.switch().name //+
                            //': ' +
                            //	stellarMessage.toXDR('base64')
                        );
                        break;
                }
                stellarMessageJob.done();
            })
            .on('error', (err) => {
                console.log(err);
            })
            .on('close', () => {
                console.log('closed connection');
            })
            .on('timeout', () => {
                console.log('timeout');
                connection.destroy();
            });
    }

    private translateSCPMessage(stellarMessage: xdr.StellarMessage, nodeNames: Map<string, string>) {
        const publicKey = StrKey.encodeEd25519PublicKey(
            stellarMessage.envelope().statement().nodeId().value()
        ).toString();
        const name = nodeNames.get(publicKey);
        const ledger = stellarMessage.envelope().statement().slotIndex().toString();

        if (stellarMessage.envelope().statement().pledges().switch() === xdr.ScpStatementType.scpStNominate()) {
            this.translateNominate(stellarMessage, ledger, publicKey, name);
        } else if (stellarMessage.envelope().statement().pledges().switch() === xdr.ScpStatementType.scpStPrepare()) {
            this.translatePrepare(stellarMessage, ledger, name);
        } else if (stellarMessage.envelope().statement().pledges().switch() === xdr.ScpStatementType.scpStConfirm()) {
            this.translateCommit(stellarMessage, ledger, name);
        } else if (stellarMessage.envelope().statement().pledges().switch() === xdr.ScpStatementType.scpStExternalize()) {
            this.translateExternalize(stellarMessage, ledger, name);
        }
    }

    private translateCommit(stellarMessage: xdr.StellarMessage, ledger: string, name: string | undefined) {
        const ballotValue = this.trimString(stellarMessage.envelope().statement().pledges().confirm().ballot().value().toString('hex'));
        const cCounter = stellarMessage.envelope().statement().pledges().confirm().nCommit();
        const hCounter = stellarMessage.envelope().statement().pledges().confirm().nH();
        const preparedCounter = stellarMessage.envelope().statement().pledges().confirm().nPrepared();
        console.log(ledger + ': ' + name + ':ACCEPT(COMMIT<' + cCounter + ' - ' + hCounter + ',' + ballotValue + '>)')
        console.log(ledger + ': ' + name + ':VOTE|ACCEPT(PREPARE<Inf,' + ballotValue + '>)')
        console.log(ledger + ': ' + name + ':ACCEPT(PREPARE<' + preparedCounter + ',' + ballotValue + '>)')
        console.log(ledger + ': ' + name + ':CONFIRM(PREPARE<' + hCounter + ',' + ballotValue + '>)')
        console.log(ledger + ': ' + name + ':VOTE(COMMIT<' + cCounter + ' - Inf,' + ballotValue + '>)')
    }

    private translateExternalize(stellarMessage: xdr.StellarMessage, ledger: string, name: string | undefined) {
        const ballotValue = this.trimString(stellarMessage.envelope().statement().pledges().externalize().commit().value().toString('hex'));
        const ballotCounter = stellarMessage.envelope().statement().pledges().externalize().commit().counter();
        console.log(ledger + ': ' + name + ':ACCEPT(COMMIT<' + ballotCounter + ' - Inf,' + ballotValue + '>)')

        const hCounter = stellarMessage.envelope().statement().pledges().externalize().nH();
        console.log(ledger + ': ' + name + ':CONFIRM(COMMIT<' + ballotCounter + ' - ' + hCounter + ',' + ballotValue + '>)')

        console.log(ledger + ': ' + name + ':ACCEPT(PREPARE<Inf,' + ballotValue + '>)')
        console.log(ledger + ': ' + name + ':CONFIRM(PREPARE<' + hCounter + ',' + ballotValue + '>)')
    }

    private translatePrepare(stellarMessage: xdr.StellarMessage, ledger: string, name: string | undefined) {
        const ballotValue = this.trimString(stellarMessage.envelope().statement().pledges().prepare().ballot().value().toString('hex'));
        const ballotCounter = stellarMessage.envelope().statement().pledges().prepare().ballot().counter().toString();
        const prepared = stellarMessage.envelope().statement().pledges().prepare().prepared();
        console.log(ledger + ': ' + name + ':VOTE(PREPARE<' + ballotCounter + ',' + ballotValue + '>)')

        if (prepared) {
            const preparedBallotValue = this.trimString(prepared.value().toString('hex'));
            const preparedBallotCounter = prepared.counter().toString();
            console.log(ledger + ': ' + name + ':ACCEPT(PREPARE<' + preparedBallotCounter + ',' + preparedBallotValue + '>)')

            //if prepared.value changes, ABORT is implied for all indices smaller than aCounter. aCounter is computed (see doc).
        }

        const hCounter = stellarMessage.envelope().statement().pledges().prepare().nH();
        if (hCounter !== 0 && hCounter !== undefined) {
            console.log(ledger + ': ' + name + ':CONFIRM(PREPARE<' + hCounter + ',' + ballotValue + '>)')
        }

        const cCounter = stellarMessage.envelope().statement().pledges().prepare().nC();
        if (cCounter !== 0 && cCounter !== undefined) {
            console.log(ledger + ': ' + name + ':VOTE(COMMIT<' + cCounter + ' - ' + hCounter + ',' + ballotValue + '>)')
        }
    }

    private translateNominate(stellarMessage: xdr.StellarMessage, ledger: string, publicKey: string, name: string | undefined) {
        const nominateVotes = stellarMessage.envelope().statement().pledges().nominate().votes().map((vote: Buffer) => {
            return this.trimString(vote.toString('hex'));
        });
        if (this.isNewNominateVote(ledger, publicKey, nominateVotes)) {
            console.log(ledger + ': ' + name + ':VOTE(NOMINATE([' + nominateVotes + ']))')
            this.registerNominateVotes(ledger, publicKey, nominateVotes)
        }

        const nominateAccepted = stellarMessage.envelope().statement().pledges().nominate().accepted().map((accepted: Buffer) => {
            return this.trimString(accepted.toString('hex'));
        });
        if (this.isNewNominateAccepted(ledger, publicKey, nominateAccepted)) {
            console.log(ledger + ': ' + name + ':ACCEPT(NOMINATE([' + nominateAccepted + ']))')
            this.registerNominateAccepted(ledger, publicKey, nominateAccepted)
        }
    }

    private trimString(str: string, lengthToShow = 5) {
        if (str.length <= lengthToShow * 2) {
            return str;
        }

        const start = str.substring(0, lengthToShow);
        const end = str.substring(str.length - lengthToShow);

        return `${start}...${end}`;
    }

}