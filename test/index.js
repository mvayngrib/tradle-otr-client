
var util = require('util')
var EventEmitter = require('events').EventEmitter
var test = require('tape')
var DSA = require('@tradle/otr').DSA
var Sendy = require('sendy')
var Connection = Sendy.Connection
var Switchboard = Sendy.Switchboard
var keys = require('./fixtures/keys')
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

  var key1 = DSA.parsePrivate(keys[0])
  var key2 = DSA.parsePrivate(keys[1])

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

test('switchboard disconnect', function (t) {
  // t.timeoutAfter(5000)
  var names = ['a', 'b', 'c']
  var blocked = {}
  // var waitForTimeout
  // var waitedForTimeout
  // var cliffJumper = 'a'
  var disconnected
  var reconnected
  var unreliables = names.map(function (name, i) {
    // these are 100% reliable, but that's not what we're testing here
    var ee = new EventEmitter()
    ee.on('connect', function () {
      if (disconnected) {
        disconnected = false
        reconnected = true
      }
    })

    ee.on('disconnect', function () {
      disconnected = true
    })

    ee.name = name
    ee.destroy = function () {}
    ee.send = function (msg) {
      if (blocked[name]) return

      var to = unreliables.filter(function (u) {
        return u.name === msg.to
      })[0]

      process.nextTick(function () {
        // if (!waitForTimeout) {
        if (!disconnected) {
          to.emit('receive', msg)
        }
        // } else {
        //   console.log('no')
        // }
      })
    }

    ee.on('disconnect', function () {
      switchboards[i].cancelPending()
    })

    return ee
  })

  var cliffJumper = unreliables[0]
  var msgs = ['hey'.repeat(5e5), 'ho', 'blah!'.repeat(1234), 'booyah'.repeat(4321), 'ooga']
  // var msgs = ['hey', 'ho', 'blah!', 'booyah', 'ooga']
  var togo = msgs.length * names.length * (names.length - 1) // send and receive
  t.plan(togo)

  var received = 0
  var switchboards = names.map(function (name, i) {
    var key = DSA.parsePrivate(keys[i])
    var s = new Switchboard({
      unreliable: unreliables[i],
      clientForRecipient: function (recipient) {
        return new OTRClient({
          client: new Sendy(),
          key: key,
          theirFingerprint: key.fingerprint()
        })
      },
      encode: function (msg, to) {
        return {
          data: msg,
          from: name,
          to: to
        }
      }
    })

    var toRecv = {}
    var prev = {}
    names.forEach(function (other, j) {
      if (i === j) return

      toRecv[other] = msgs.slice()
      // setInterval(function () {
      //   console.log(name, other, toRecv[other].length)
      // }, 5000).unref()
    })

    // s.on('message', function (msg, from) {
    //   msg = msg.toString()
    //   if (prev[from] === msg) {
    //     console.log('discarding duplicate')
    //     return
    //   }

    //   received++

    //   t.equal(msg, toRecv[from].shift())
    //   console.log(name, 'received from', from, ',', toRecv[from].length, 'togo')
    //   prev[from] = msg

    //   // if (name === cliffJumper && !waitedForTimeout) waitForTimeout = true

    //   finish()

    //   // blocked[from] = true
    // })

    // s.on('timeout', function (recipient) {
    //   t.comment('forced timeout')
    //   // waitedForTimeout = true
    //   // waitForTimeout = false

    //   s.cancelPending(recipient)
    // })

    // s.setTimeout(500)

    return s
  })

  switchboards.forEach(function (sender, i) {
    names.forEach(function (receiver, j) {
      if (i === j) return

      var toSend = msgs.slice()
      sendNext()

      function sendNext () {
        var msg = toSend.shift()
        if (!msg) return

        sender.send(receiver, msg, function (err) {
          if (err) {
            toSend.unshift(msg)
            console.log(names[i], 'resending to', names[j], err, toSend.length)
          } else {
            // if (!disconnected && !reconnected && toSend.length === 2) {
            //   process.nextTick(function () {
            //     cliffJumper.emit('disconnect')
            //     setTimeout(function () {
            //       cliffJumper.emit('connect')
            //     }, 2000)
            //   })
            // }

            t.pass(`${names[i]} delivered msg to ${receiver}, ${toSend.length} to go `)
            finish() // delivered
          }

          sendNext()
        })
      }
    })
  })

  function finish () {
    if (--togo === 0) cleanup()
  }

  function cleanup () {
    console.log('TOTAL PACKETS', Connection.TOTAL_PACKETS)
    switchboards.forEach(function (s) {
      s.destroy()
    })
  }

  // function newBadConnection (opts) {
  //   var c = new Connection(opts)
  //   var receive = c.receive
  //   c.receive = function () {
  //     // if (!waitForTimeout) {
  //       return receive.apply(this, arguments)
  //     // } else {
  //     //   console.log('no')
  //     // }
  //   }
  // }
})

function basicReceive (msg) {
  this.emit('receive', msg)
}

function basicSend (msg, cb) {
  this.emit('send', msg)
  process.nextTick(cb)
}
