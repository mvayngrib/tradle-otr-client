
var util = require('util')
var EventEmitter = require('events').EventEmitter
var test = require('tape')
var DSA = require('@tradle/otr').DSA
var keys = require('./fixtures/keys')
var OTRClient = require('../')

test('basic', function (t) {
  t.plan(4)

  var c1 = new EventEmitter()
  c1.send = basicSend
  c1.receive = basicReceive

  var c2 = new EventEmitter()
  c2.send = basicSend
  c2.receive = basicReceive

  var key1 = DSA.parsePrivate(keys.shift())
  var key2 = DSA.parsePrivate(keys.shift())

  var o1 = new OTRClient({
    client: c1,
    key: key1,
    theirFingerprint: key2.fingerprint()
  })

  var o2 = new OTRClient({
    client: c2,
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

  o1.send('hey', function () {
    t.pass('delivered')
  })

  o2.send('ho', function () {
    t.pass('delivered')
  })

  o1.on('receive', function (msg) {
    t.equal(msg.toString(), 'ho')
  })

  o2.on('receive', function (msg) {
    t.equal(msg.toString(), 'hey')
  })
})

function basicReceive (msg) {
  this.emit('receive', msg)
}

function basicSend (msg, cb) {
  this.emit('send', msg)
  process.nextTick(cb)
}
