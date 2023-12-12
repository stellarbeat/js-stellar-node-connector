import { StrKey, xdr } from '@stellar/stellar-base';
import { err, ok, Result } from 'neverthrow';

export type ScpStatementPledges =
	| ScpStatementPrepare
	| ScpStatementConfirm
	| ScpStatementExternalize
	| ScpNomination;

export interface ScpStatementConfirm {
	ballot: ScpBallot;
	nPrepared: number;
	nCommit: number;
	nH: number;
	quorumSetHash: string;
}

export interface ScpStatementPrepare {
	quorumSetHash: string;
	ballot: ScpBallot;
	prepared: null | ScpBallot;
	preparedPrime: null | ScpBallot;
	nC: number;
	nH: number;
}

export interface ScpBallot {
	counter: number;
	value: string; //base64
}

export interface ScpStatementExternalize {
	quorumSetHash: string;
	nH: number;
	commit: ScpBallot;
}

export interface ScpNomination {
	quorumSetHash: string;
	votes: string[];
	accepted: string[];
}

export type SCPStatementType =
	| 'externalize'
	| 'nominate'
	| 'confirm'
	| 'prepare';

export class SCPStatement {
	nodeId: string;
	slotIndex: string;
	type: SCPStatementType;
	pledges: ScpStatementPledges;

	constructor(
		nodeId: string,
		slotIndex: string,
		type: SCPStatementType,
		pledges: ScpStatementPledges
	) {
		this.nodeId = nodeId;
		this.slotIndex = slotIndex;
		this.type = type;
		this.pledges = pledges;
	}

	static fromXdr(
		xdrInput: string | xdr.ScpStatement
	): Result<SCPStatement, Error> {
		if (typeof xdrInput === 'string') {
			const buffer = Buffer.from(xdrInput, 'base64');
			xdrInput = xdr.ScpStatement.fromXDR(buffer) as xdr.ScpStatement;
		}

		const nodeId = StrKey.encodeEd25519PublicKey(
			xdrInput.nodeId().value()
		).toString(); //slow! cache!
		const slotIndex = xdrInput.slotIndex().toString();
		const xdrType = xdrInput.pledges().switch();
		let pledges: ScpStatementPledges;
		let type: SCPStatementType;

		if (xdrType === xdr.ScpStatementType.scpStExternalize()) {
			type = 'externalize';
			const statement = xdrInput
				.pledges()
				.value() as xdr.ScpStatementExternalize;
			pledges = {
				quorumSetHash: statement.commitQuorumSetHash().toString('base64'),
				nH: statement.nH(),
				commit: {
					counter: statement.commit().counter(),
					value: statement.commit().value().toString('base64')
				}
			};
		} else if (xdrType === xdr.ScpStatementType.scpStConfirm()) {
			const statement = xdrInput.pledges().value() as xdr.ScpStatementConfirm;
			type = 'confirm';
			pledges = {
				quorumSetHash: statement.quorumSetHash().toString('base64'),
				nH: statement.nH(),
				nPrepared: statement.nPrepared(),
				nCommit: statement.nCommit(),
				ballot: {
					counter: statement.ballot().counter(),
					value: statement.ballot().value().toString('base64')
				}
			};
		} else if (xdrType === xdr.ScpStatementType.scpStNominate()) {
			const statement = xdrInput.pledges().value() as xdr.ScpNomination;
			type = 'nominate';
			pledges = {
				quorumSetHash: statement.quorumSetHash().toString('base64'),
				votes: statement.votes().map((vote: Buffer) => vote.toString('base64')),
				accepted: statement
					.votes()
					.map((vote: Buffer) => vote.toString('base64'))
			};
		} else if (xdrType === xdr.ScpStatementType.scpStPrepare()) {
			type = 'prepare';
			const statement = xdrInput.pledges().value() as xdr.ScpStatementPrepare;
			const prepared = statement.prepared();
			const preparedPrime = statement.preparedPrime();
			pledges = {
				quorumSetHash: statement.quorumSetHash().toString('base64'),
				ballot: {
					counter: statement.ballot().counter(),
					value: statement.ballot().value().toString('base64')
				},
				prepared: prepared
					? {
							counter: prepared.counter(),
							value: prepared.value().toString('base64')
					  }
					: null,
				preparedPrime: preparedPrime
					? {
							counter: preparedPrime.counter(),
							value: preparedPrime.value().toString('base64')
					  }
					: null,
				nC: statement.nH(),
				nH: statement.nC()
			};
		} else {
			return err(new Error('unknown type: ' + xdrType));
		}

		return ok(new SCPStatement(nodeId, slotIndex, type, pledges));
	}
}
