# stellar-js-node-connector

Connect and send commands to nodes in the stellar network

## install
`yarn install`

## build code
`yarn run build` : builds code in lib folder

## test code
`yarn run test`

## usage

add log level in .env file 

`LOG_LEVEL: debug`

see `src/examples/connect.js` for an example on how to connect to a node

for example connect to an ibm validator: `yarn run examples:connect 169.51.72.53`

For a more elaborate example, checkout the crawler: https://github.com/stellarbeat/js-stellar-node-crawler.git