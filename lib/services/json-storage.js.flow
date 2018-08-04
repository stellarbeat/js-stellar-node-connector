const fs = require('fs');
const Node = require("../model/node");
const QuorumSet = require("../model/quorum-set");

module.exports = {
    readFilePromise: function (path) {
        return new Promise((resolve, reject) =>
            fs.readFile(path, 'utf8', function callback(err, data) {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            })
        );
    },

    writeFilePromise: function (fileName, data) {
        return new Promise((resolve, reject) =>
            fs.writeFile(fileName, data, 'utf8', function callback(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            })
        );
    },

    getNodesFromFile: async function (fileName) {
        let nodesJson = await this.readFilePromise(fileName);
        let nodesRaw = JSON.parse(nodesJson);

        return nodesRaw.map((node) => {
            return new Node(node.ip, node.port, node.publicKey,
                node.ledgerVersion, node.overlayVersion,
                node.overlayMinVersion, node.networkId, node.versionStr,
                node.activeCounter, node.countryCode, node.countryName,
                node.regionCode, node.regionName, node.city,
                node.zipCode, node.timeZone, node.latitude,
                node.longitude, node.metroCode, node.name, node.host, node.verified,
                node.dateDiscovered, node.dateLastSeen, this.getQuorumSetFromParsedJson(node.quorumSet)

            );
        });
    },

    getQuorumSetsFromFile: async function (fileName) {
        let quorumSetsJson = await this.readFilePromise(fileName);
        let quorumSetsRaw = JSON.parse(quorumSetsJson);

        return quorumSetsRaw.map((quorumSetRaw) => this.getQuorumSetFromParsedJson(quorumSetRaw));
    },

    getQuorumSetFromParsedJson: function (quorumSetRaw) {
        if(Array.isArray(quorumSetRaw)) { //bc
            if(quorumSetRaw.length > 0) {
                quorumSetRaw = quorumSetRaw[0];
            } else {
                return null;
            }
        }

        if(quorumSetRaw === null || quorumSetRaw === undefined) {
            return null;
        }

        let innerQuorumSets = quorumSetRaw.innerQuorumSets.map(
            innerQuorumSetRaw => this.getQuorumSetFromParsedJson(innerQuorumSetRaw)
        );
        return new QuorumSet(
            quorumSetRaw.hashKey,
            quorumSetRaw.threshold,
            new Set(quorumSetRaw.validators),
            new Set(innerQuorumSets),
            quorumSetRaw.dateDiscovered,
            quorumSetRaw.dateLastSeen,
        );
    }
};

