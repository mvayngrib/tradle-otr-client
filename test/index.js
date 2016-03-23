
var util = require('util')
var EventEmitter = require('events').EventEmitter
var test = require('tape')
var DSA = require('@tradle/otr').DSA
var keys = require('./fixtures/keys')
var Sendy = require('sendy')
var Connection = Sendy.Connection
var OTRClient = require('../')

test('basic', function (t) {
  // t.plan(4)

  var bools = []
  var receive = Connection.prototype.receive
  Connection.prototype.receive = function () {
    var bool = Math.round(Math.random())
    bools.push(bool)
    if (bool) return receive.apply(this, arguments)
  }

  // var c1 = new EventEmitter()
  // c1.send = basicSend
  // c1.receive = basicReceive

  // var c2 = new EventEmitter()
  // c2.send = basicSend
  // c2.receive = basicReceive

  var key1 = DSA.parsePrivate(keys.shift())
  var key2 = DSA.parsePrivate(keys.shift())

  var o1 = new OTRClient({
    client: new Sendy(),
    key: key1,
    theirFingerprint: key2.fingerprint()
  })

  var o2 = new OTRClient({
    client: new Sendy(),
    key: key2,
    theirFingerprint: key1.fingerprint()
  })

  o1.on('send', function (msg) {
    process.nextTick(function () {
      o2.receive(msg)
    })
  })

  o2.on('send', function (msg) {
    process.nextTick(function () {
      o1.receive(msg)
    })
  })

  var hey = 'hey'.repeat(50000)
  var ho = 'ho'.repeat(10000)
  o1.send(hey, function () {
    t.pass('delivered')
    finish()
  })

  o2.send(ho, function () {
    t.pass('delivered')
    finish()
  })

  o1.on('receive', function (msg) {
    t.equal(msg.toString(), ho)
    finish()
  })

  o2.on('receive', function (msg) {
    t.equal(msg.toString(), hey)
    finish()
  })

  // setInterval(function () {
  //   console.log('random murder')
  //   var client = Math.random() > 0.5 ? o1 : o2
  //   client._client._client.reset()
  // }, 2000).unref()

  // var failTimeout = setTimeout(function () {
  //   console.log('[' + bools.join(',') + ']')
  // }, 20000)

  var togo = 4
  function finish () {
    if (--togo) return

    // clearTimeout(failTimeout)
    Connection.prototype.receive = receive
    o1.destroy()
    o2.destroy()
    t.end()
  }
})

function basicReceive (msg) {
  this.emit('receive', msg)
}

function basicSend (msg, cb) {
  this.emit('send', msg)
  process.nextTick(cb)
}
