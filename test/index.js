
var util = require('util')
var EventEmitter = require('events').EventEmitter
var test = require('tape')
var DSA = require('@tradle/otr').DSA
var keys = require('./fixtures/keys')
var OTRClient = require('../')

test('basic', function (t) {
  t.plan(4)

  var c1 = new EventEmitter()
  var c2 = new EventEmitter()
  ;[c1, c2].forEach(function (me, i) {
    ;[c1, c2].forEach(function (them, j) {
      if (i !== j) {
        me.send = function (msg, cb) {
          process.nextTick(function () {
            them.emit('receive', msg)
            cb()
          })
        }
      }
    })
  })

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

  o1.send('hey', function () {
    t.pass('delivered')
  })

  o2.send('ho', function () {
    t.pass('delivered')
  })

  o1.on('receive', function (msg) {
    t.equal(msg, 'ho')
  })

  o2.on('receive', function (msg) {
    t.equal(msg, 'hey')
  })
})
