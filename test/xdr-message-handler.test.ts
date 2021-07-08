import {hash, Networks, xdr} from "stellar-base";
import MessageType = xdr.MessageType;
import {handlePeersMessageXDR, handleSCPMessageXDR, parseAuthenticatedMessageXDR} from "../src/xdr-message-handler";
import {ScpNomination, ScpStatementConfirm, ScpStatementExternalize, ScpStatementPrepare} from "../src";
const StellarBase = require('stellar-base');

test('parseAuthenticatedMessageXDR', () => {
    let xdr = Buffer.from("AAAAAAAAAAAAAAA7AAAACwAAAACMHUtKNgEX1QDfz4zesWaxmhLg9Le806GgxemeQfaXmQAAAAACKDOuAAAAAzQaCq4p6tLHpdfwGhnlyX9dMUP70r4Dm98Td6YvKnhoAAAAAQAAAJg1D82tsvx59BI2BldZq12xYzdrhUkIflWnRwbiJsoMUgAAAABg4A0jAAAAAAAAAAEAAAAAUwoi9HcvJrwUn5w15omNdNffAJKoHHDdZh+2c+8VUd4AAABAB5/NoeG4iJJitcTDJvdhDLaLL9FSUHodRXvMEjbGKeDSkSXDgl+q+VvDXenwQNOOhLg112bsviGwh61ci4HnAgAAAAEAAACYNQ/NrbL8efQSNgZXWatdsWM3a4VJCH5Vp0cG4ibKDFIAAAAAYOANIwAAAAAAAAABAAAAAFMKIvR3Lya8FJ+cNeaJjXTX3wCSqBxw3WYftnPvFVHeAAAAQAefzaHhuIiSYrXEwyb3YQy2iy/RUlB6HUV7zBI2xing0pElw4Jfqvlbw13p8EDTjoS4Nddm7L4hsIetXIuB5wIAAABAyN92d7osuHXtUWHoEQzSRH5f9h6oEQAGK02b4CO4bQchmpbwbqGQLdbD9psFpamuLrDK+QJiBuKw3PVnMNlMDA9Ws6xvU3NyJ/OBsg2EZicl61zCYxrQXQ4Qq/eXI+wT", 'base64');

    let result = parseAuthenticatedMessageXDR(xdr);
    expect(result.isOk()).toBeTruthy();
    if(result.isOk()){
        let messageType = StellarBase.xdr.MessageType.fromXDR(result.value.messageTypeXDR);
        expect(messageType).toEqual(MessageType.scpMessage());
        expect(StellarBase.xdr.ScpEnvelope.fromXDR(result.value.stellarMessageXDR)).toBeDefined();
    }

})

test('handlePeersMessageXDR', () => {
    let xdr = Buffer.from('AAAAMgAAAADZXIJCAAAtaQAAAAAAAAAAdMqk9gAALWkAAAAAAAAAABLoX84AAC1pAAAAAAAAAAA07TXUAAAtaQAAAAAAAAAADfTe3wAALWkAAAAAAAAAAChyQj8AAC1pAAAAAAAAAAAj5bxyAAAtaQAAAAAAAAAAjRQh9AAALWkAAAAAAAAAALI+ThsAAC1pAAAAAAAAAAAzoQ1vAAAtaQAAAAAAAAAAreG3mQAALWkAAAAAAAAAAFKlFpsAAC1pAAAAAAAAAAAjvSpoAAAtaQAAAAAAAAAApePZtgAALWkAAAAAAAAAACJQEJYAAC1pAAAAAAAAAACLO+qRAAAtaQAAAAAAAAAAsj9d9gAALWkAAAAAAAAAACJIkPIAAC1pAAAAAAAAAAC5RaYLAAAtaQAAAAAAAAAADXKrQgAALWkAAAAAAAAAABKdp4kAAC1pAAAAAAAAAAC8peacAAAtzQAAAAAAAAAAaM+YYQAALWkAAAAAAAAAAA3kGQEAAC1pAAAAAAAAAAAzTfe3AAAtaQAAAAAAAAAADeZl7QAALWkAAAAAAAAAAIe1iDEAAC1pAAAAAAAAAAAvW/G5AAAtaQAAAAAAAAAAdMqGggAALWkAAAAAAAAAAAMYiWwAAC1pAAAAAAAAAAAStbExAAAtaQAAAAAAAAAAA3iRrAAALWkAAAAAAAAAADap+/cAAC1pAAAAAAAAAABrFJ/oAAAtaQAAAAAAAAAAFGYoYQAALWkAAAAAAAAAAJxD3O4AAC1pAAAAAAAAAAA2u4lTAAAtaQAAAAAAAAAAdMqFcwAALWkAAAAAAAAAADb6Hx4AAC1pAAAAAAAAAAAj9xcxAAAtaQAAAAAAAAAATWTtbgAALWkAAAAAAAAAAFGnRvwAAC1pAAAAAAAAAAAzTXctAAAtaQAAAAAAAAAAIoyK7AAALWkAAAAAAAAAAANwGy8AAC1pAAAAAAAAAACAxwf7AAAtaQAAAAAAAAAANk5NhAAAE4kAAAAAAAAAAAMaWwcAAC1pAAAAAAAAAAAod5esAAAtaQAAAAAAAAAAA+7tbgAALWkAAAAA', 'base64');

    let result = handlePeersMessageXDR(xdr) ;
    expect(result.isOk()).toBeTruthy();
    if(result.isOk()){
        expect(result.value).toHaveLength(50);
        expect(result.value[0].ip).toEqual('217.92.130.66')
        expect(result.value[0].port).toEqual(11625)
    }
})

test('handleNominateSCPMessageXDR', () => {
    let xdr = Buffer.from('AAAAAAFdGFUq2t7rTo0wWu9k/6rxa0T+pf6CHmBj2vO56O1XAAAAAAIpQW4AAAADNBoKrinq0sel1/AaGeXJf10xQ/vSvgOb3xN3pi8qeGgAAAABAAAAmDfNPDC76wNcNIfI9Kh/sIZzyLSqM+/2Q7ynrnWNb75gAAAAAGDlyDEAAAAAAAAAAQAAAACMHUtKNgEX1QDfz4zesWaxmhLg9Le806GgxemeQfaXmQAAAEAO4K/dJZruXyv6ypWMXhk9fy8W5Ujq8znMPy8EncZQepTRzYvqyUU4PFamzp99lly+yDt4nqgov4VZvYVVDXsPAAAAAAAAAEBpJ3HZ9TunMXViASRj5RrWlNSjA6hZZeClRGo+SYHRwq8STmObzvUvOKfgF8VTfvyqZ/LCM9FPD+iQoG2gHssB', 'base64');

    //@ts-ignore
    let result = handleSCPMessageXDR(xdr, hash(Networks.PUBLIC)) ;
    expect(result.isOk()).toBeTruthy();
    if(result.isOk()){
        expect(result.value.type).toEqual('nominate');
        expect(result.value.nodeId).toEqual('GAAV2GCVFLNN522ORUYFV33E76VPC22E72S75AQ6MBR5V45Z5DWVPWEU');
        expect(result.value.slotIndex.toString()).toEqual('36258158');
        expect((result.value.pledges as ScpNomination).quorumSetHash).toEqual('NBoKrinq0sel1/AaGeXJf10xQ/vSvgOb3xN3pi8qeGg=');
        expect((result.value.pledges as ScpNomination).votes).toEqual([
            "N808MLvrA1w0h8j0qH+whnPItKoz7/ZDvKeudY1vvmAAAAAAYOXIMQAAAAAAAAABAAAAAIwdS0o2ARfVAN/PjN6xZrGaEuD0t7zToaDF6Z5B9peZAAAAQA7gr90lmu5fK/rKlYxeGT1/LxblSOrzOcw/LwSdxlB6lNHNi+rJRTg8VqbOn32WXL7IO3ieqCi/hVm9hVUNew8="
        ]);
        expect((result.value.pledges as ScpNomination).accepted).toEqual([
            "N808MLvrA1w0h8j0qH+whnPItKoz7/ZDvKeudY1vvmAAAAAAYOXIMQAAAAAAAAABAAAAAIwdS0o2ARfVAN/PjN6xZrGaEuD0t7zToaDF6Z5B9peZAAAAQA7gr90lmu5fK/rKlYxeGT1/LxblSOrzOcw/LwSdxlB6lNHNi+rJRTg8VqbOn32WXL7IO3ieqCi/hVm9hVUNew8="
        ]);
    }
})
test('handleConfirmSCPMessageXDR', () => {
    let xdr = Buffer.from('AAAAADPN/Tz0hFfkg11MNisvWV3/3TyFQUjJNY5VqfZfvQp7AAAAAAIpSk4AAAABAAAAAQAAAJhDlpNWjI0kZ2RCow2qCtM0XCBeAzcd81xKMpGnrYm/4AAAAABg5fhQAAAAAAAAAAEAAAAAM839PPSEV+SDXUw2Ky9ZXf/dPIVBSMk1jlWp9l+9CnsAAABAG46KDK74Y05yGtNqWKoogWBYsfc3OcIdJ49F/BV6OvN5ADZiiuPoZF1Dweo2XN3BxazSDe1u/X8TRPznHxRuDAAAAAEAAAABAAAAATQaCq4p6tLHpdfwGhnlyX9dMUP70r4Dm98Td6YvKnhoAAAAQC4eOEcKrC5gm8nt9cLITZ9XynAybzBc1TviBHoJEfVCV9ewGjvGJ4jPTZhARCGpukVQ/2qepWjG9kf96WAsDgo=', 'base64');

    //@ts-ignore
    let result = handleSCPMessageXDR(xdr, hash(Networks.PUBLIC)) ;
    expect(result.isOk()).toBeTruthy();
    if(result.isOk()){
        expect(result.value.type).toEqual('confirm');
        expect(result.value.nodeId).toEqual('GAZ437J46SCFPZEDLVGDMKZPLFO77XJ4QVAURSJVRZK2T5S7XUFHXI2Z');
        expect(result.value.slotIndex).toEqual('36260430');
        expect((result.value.pledges as ScpStatementConfirm).quorumSetHash).toEqual('NBoKrinq0sel1/AaGeXJf10xQ/vSvgOb3xN3pi8qeGg=');
        expect((result.value.pledges as ScpStatementConfirm).nH).toEqual(1);
        expect((result.value.pledges as ScpStatementConfirm).nCommit).toEqual(1);
        expect((result.value.pledges as ScpStatementConfirm).nPrepared).toEqual(1);
        expect((result.value.pledges as ScpStatementConfirm).ballot.value).toEqual('Q5aTVoyNJGdkQqMNqgrTNFwgXgM3HfNcSjKRp62Jv+AAAAAAYOX4UAAAAAAAAAABAAAAADPN/Tz0hFfkg11MNisvWV3/3TyFQUjJNY5VqfZfvQp7AAAAQBuOigyu+GNOchrTaliqKIFgWLH3NznCHSePRfwVejrzeQA2Yorj6GRdQ8HqNlzdwcWs0g3tbv1/E0T85x8Ubgw=');
        expect((result.value.pledges as ScpStatementConfirm).ballot.counter).toEqual(1);
    }
})
test('handleExternalizeSCPMessageXDR', () => {
    let xdr = Buffer.from('AAAAAAaweClXqq3sjNIHBm/r6o1RY6yR5HqkHJCaZtEEdMUfAAAAAAIpSk4AAAACAAAAAQAAAJhDlpNWjI0kZ2RCow2qCtM0XCBeAzcd81xKMpGnrYm/4AAAAABg5fhQAAAAAAAAAAEAAAAAM839PPSEV+SDXUw2Ky9ZXf/dPIVBSMk1jlWp9l+9CnsAAABAG46KDK74Y05yGtNqWKoogWBYsfc3OcIdJ49F/BV6OvN5ADZiiuPoZF1Dweo2XN3BxazSDe1u/X8TRPznHxRuDAAAAAE0GgquKerSx6XX8BoZ5cl/XTFD+9K+A5vfE3emLyp4aAAAAEBuChnRV0BBbiJe2dwhkMF+hXW6Nrq9ODUBUSHEq0wOvUnNgrVkLpvP0QTBana8Oscw2xXWMVwR/86ae3VuMXAE', 'base64');

    //@ts-ignore
    let result = handleSCPMessageXDR(xdr, hash(Networks.PUBLIC)) ;
    expect(result.isOk()).toBeTruthy();
    if(result.isOk()){
        expect(result.value.type).toEqual('externalize');
        expect(result.value.nodeId).toEqual('GADLA6BJK6VK33EM2IDQM37L5KGVCY5MSHSHVJA4SCNGNUIEOTCR6J5T');
        expect(result.value.slotIndex.toString()).toEqual('36260430');
        expect((result.value.pledges as ScpStatementExternalize).quorumSetHash).toEqual('NBoKrinq0sel1/AaGeXJf10xQ/vSvgOb3xN3pi8qeGg=');
        expect((result.value.pledges as ScpStatementExternalize).nH).toEqual(1);
        expect((result.value.pledges as ScpStatementExternalize).commit).toEqual({
            "counter": 1,
            "value": "Q5aTVoyNJGdkQqMNqgrTNFwgXgM3HfNcSjKRp62Jv+AAAAAAYOX4UAAAAAAAAAABAAAAADPN/Tz0hFfkg11MNisvWV3/3TyFQUjJNY5VqfZfvQp7AAAAQBuOigyu+GNOchrTaliqKIFgWLH3NznCHSePRfwVejrzeQA2Yorj6GRdQ8HqNlzdwcWs0g3tbv1/E0T85x8Ubgw="
        });
    }
})
test('handlePrepareSCPMessageXDR', () => {
    let xdr = Buffer.from('AAAAANViLMmkYquQRtnOU92Rv7mLQfQ6hViSTr7J17PDZzF1AAAAAAIpSk4AAAAANBoKrinq0sel1/AaGeXJf10xQ/vSvgOb3xN3pi8qeGgAAAABAAAAmEOWk1aMjSRnZEKjDaoK0zRcIF4DNx3zXEoykaetib/gAAAAAGDl+FAAAAAAAAAAAQAAAAAzzf089IRX5INdTDYrL1ld/908hUFIyTWOVan2X70KewAAAEAbjooMrvhjTnIa02pYqiiBYFix9zc5wh0nj0X8FXo683kANmKK4+hkXUPB6jZc3cHFrNIN7W79fxNE/OcfFG4MAAAAAQAAAAEAAACYQ5aTVoyNJGdkQqMNqgrTNFwgXgM3HfNcSjKRp62Jv+AAAAAAYOX4UAAAAAAAAAABAAAAADPN/Tz0hFfkg11MNisvWV3/3TyFQUjJNY5VqfZfvQp7AAAAQBuOigyu+GNOchrTaliqKIFgWLH3NznCHSePRfwVejrzeQA2Yorj6GRdQ8HqNlzdwcWs0g3tbv1/E0T85x8UbgwAAAAAAAAAAQAAAAEAAABAc+O1i4Gf0bAMZGoUEzj4aGsLLgsrA0G4LrtqXBKiSpg6QT7LKFkBDS0XURpkQspXauM+fzdOV9NY708RpFd0BA==', 'base64');

    //@ts-ignore
    let result = handleSCPMessageXDR(xdr, hash(Networks.PUBLIC)) ;
    expect(result.isOk()).toBeTruthy();
    if(result.isOk()){
        expect(result.value.type).toEqual('prepare');
        expect(result.value.nodeId).toEqual('GDKWELGJURRKXECG3HHFHXMRX64YWQPUHKCVRESOX3E5PM6DM4YXLZJM');
        expect(result.value.slotIndex.toString()).toEqual('36260430');
        expect((result.value.pledges as ScpStatementPrepare).quorumSetHash).toEqual('NBoKrinq0sel1/AaGeXJf10xQ/vSvgOb3xN3pi8qeGg=');
        expect((result.value.pledges as ScpStatementPrepare).nH).toEqual(1);
        expect((result.value.pledges as ScpStatementPrepare).nC).toEqual(1);
        expect((result.value.pledges as ScpStatementPrepare).prepared).toEqual({
            "counter": 1,
            "value": "Q5aTVoyNJGdkQqMNqgrTNFwgXgM3HfNcSjKRp62Jv+AAAAAAYOX4UAAAAAAAAAABAAAAADPN/Tz0hFfkg11MNisvWV3/3TyFQUjJNY5VqfZfvQp7AAAAQBuOigyu+GNOchrTaliqKIFgWLH3NznCHSePRfwVejrzeQA2Yorj6GRdQ8HqNlzdwcWs0g3tbv1/E0T85x8Ubgw="
        });
        expect((result.value.pledges as ScpStatementPrepare).preparedPrime).toEqual(null);
        expect((result.value.pledges as ScpStatementPrepare).ballot.counter).toEqual(1);
        expect((result.value.pledges as ScpStatementPrepare).ballot.value).toEqual('Q5aTVoyNJGdkQqMNqgrTNFwgXgM3HfNcSjKRp62Jv+AAAAAAYOX4UAAAAAAAAAABAAAAADPN/Tz0hFfkg11MNisvWV3/3TyFQUjJNY5VqfZfvQp7AAAAQBuOigyu+GNOchrTaliqKIFgWLH3NznCHSePRfwVejrzeQA2Yorj6GRdQ8HqNlzdwcWs0g3tbv1/E0T85x8Ubgw=');
    }
})
test('handleInvalidXdr', () => {
    let xdr = Buffer.from("3a4VJCH5Vp0cG4ibKDFIAAAAAYOANIwAAAAAAAAABAAAAAFMKIvR3Lya8FJ+cNeaJjXTX3wCSqBxw3WYftnPvFVHeAAAAQAefzaHhuIiSYrXEwyb3YQy2iy/RUlB6HUV7zBI2xing0pElw4Jfqvlbw13p8EDTjoS4Nddm7L4hsIetXIuB5wIAAABAyN92d7osuHXtUWHoEQzSRH5f9h6oEQAGK02b4CO4bQchmpbwbqGQLdbD9psFpamuLrDK+QJiBuKw3PVnMNlMDA9Ws6xvU3NyJ/OBsg2EZicl61zCYxrQXQ4Qq/eXI+wT", 'base64');

    expect(parseAuthenticatedMessageXDR(xdr).isErr()).toBeTruthy();
})