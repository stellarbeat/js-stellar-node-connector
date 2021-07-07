import {worker} from 'workerpool';
import {handlePeersMessageXDR, handleSCPMessageXDR} from "../xdr-message-handler";
import {Result} from "neverthrow";
import {SCPStatement} from "../scp-statement";
import {PeerNode} from "../peer-node";

function handleSCPMessageXDRInPool(scpMessageXDR: Buffer, network: Buffer):SCPStatement {
    return handleResult(handleSCPMessageXDR(scpMessageXDR, network));
}

function handlePeersMessageXDRInPool(scpMessageXDR: Buffer):PeerNode[] {
    return handleResult(handlePeersMessageXDR(scpMessageXDR));
}

function handleResult(result: Result<any, Error>){
    if(result.isErr())
        throw result.error;
    else return result.value;
}

worker({
    handleSCPMessageXDR: handleSCPMessageXDRInPool,
    handlePeersMessageXDR: handlePeersMessageXDRInPool
});