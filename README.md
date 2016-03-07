
# sendy-otr

An OTR layer for [sendy](https://github.com/tradle/sendy)

# Example

```js
var OTRClient = require('sendy-otr') // OTR layer
var MessageClient = require('sendy') // enables message reassembly from UTP packets
var Connection = Sendy.Connection    // symmetric UTP protocol
var networkClient = ...              // must implement `send` method and 'receive' event

var client = new OTRClient({
  key: new DSA(),
  theirFingerprint: 'their otr fingerprint',
  client: new MessageClient({
    client: new Connection({
      mtu: 1500
    })
  })
})

client.on('send', function (msg) {
  // use unreliable network client
  // and guarantee delivery
  networkClient.send(msg)
})

networkClient.on('receive', function (msg) {
  // get a message from the network
  // process it through pipeline
  client.receive(msg)
})
```
