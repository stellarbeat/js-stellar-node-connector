import {hash, Networks, xdr} from "stellar-base";
import {MessageService} from "../src";

test('verifySignature', () => {
    let envelopeXDR = "AAAAABXs9pU1KyIrzyOEDCUSnPpEhDvj27a5ZIG1KirxrXRfAAAAAAIVl0QAAAAANBoKrinq0sel1/AaGeXJf10xQ/vSvgOb3xN3pi8qeGgAAAABAAAAmLklemTbOXmcHqYKPMuJNIPObbHXgw4FWj5ASezID4pGAAAAAGB6qqsAAAAAAAAAAQAAAAAzzf089IRX5INdTDYrL1ld/908hUFIyTWOVan2X70KewAAAEBXpxODm8isW+NNwQidD+1dTAaYdRiJWmhARzBZ2KYFV8D5mKw0+FH1b4GU+qe6gnr8qOZPRxnRq6l7dbSOBnsFAAAAAAAAAAAAAAAAAAAAAAAAAEBU/G78nztcc3OWUxaddSg1fAwKeaWoL6Tf3WbKgU4WFM9S0FTIWJyXoZygvLMc4s16B9g8pG0BWWku1bnzO90B";

    let envelope = xdr.ScpEnvelope.fromXDR(envelopeXDR, "base64");
    //@ts-ignore
    expect(MessageService.verifyScpEnvelopeSignature(envelope, hash(Networks.PUBLIC))).toBeTruthy();

})