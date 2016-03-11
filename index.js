
var util = require('util')
var EventEmitter = require('events').EventEmitter
var typeforce = require('typeforce')
var debug = require('debug')('otr-client')
var connect = require('sendy').connect
var OTR = require('@tradle/otr').OTR
var MSG_ENCODING = 'base64'
var UINT16 = 0xffff
var noop = function () {}

function Client (opts) {
  var self = this

  typeforce({
    client: 'Object',
    key: 'DSA',
    theirFingerprint: 'String',
    instanceTag: '?String',
  }, opts)

  EventEmitter.call(this)

  this._client = opts.client
  connect(this, this._client)

  this._key = opts.key
  this._fingerprint = opts.key.fingerprint()
  this._theirFingerprint = opts.theirFingerprint
  this._instanceTag = opts.instanceTag
  this._reset()

  this._client.on('receive', function (msg) {
    if (self._resetting) return

    if (self._otr) {
      self._otr.receiveMsg(msg.toString())
    }
  })
}

util.inherits(Client, EventEmitter)
exports = module.exports = Client

Client.prototype._debug = function () {
  var args = Array.prototype.slice.call(arguments)
  args.unshift(this._fingerprint)
  return debug.apply(null, args)
}

Client.prototype._reset = function () {
  var self = this
  var queue = this._queue && this._queue.slice()
  this._deliveryCallbacks = []
  this._queue = []
  this._queuedChunks = 0
  this._resetting = true
  this._setupOTR()
  if (queue) {
    queue.forEach(function (args) {
      self.send.apply(self, args)
    })
  }
}

Client.prototype._setupOTR = function () {
  var self = this

  if (this._otr) {
    return this._otr.endOtr(function () {
      self._resetting = false
      self._otr.removeAllListeners()
      self._otr = null
      self._setupOTR()
      self._otr.sendQueryMsg()
    })
  } else {
    this._resetting = false
  }

  var otr = this._otr = new OTR({
    priv: this._key,
    instance_tag: this._instanceTag,
    debug: debug.enabled,
  })

  if (this._instanceTag) {
    otr.ALLOW_V2 = false
  } else {
    otr.ALLOW_V3 = false
  }

  otr.REQUIRE_ENCRYPTION = true
  otr.on('io', function (msg, meta) {
    if (self._resetting) return

    // self._debug('sending', msg)
    self._deliveryCallbacks.push({
      count: ++self._queuedChunks,
      callback: null
    })

    msg = new Buffer(msg) // OTR uses UTF
    self._client.send(msg, function () {
      self._queuedChunks--
      self._deliveryCallbacks = self._deliveryCallbacks.filter(function (item) {
        if (--item.count === 0) {
          var cb = item.callback
          if (cb) cb()

          return
        }

        return true
      })
    })
  })

  otr.on('ui', function (msg, encrypted) {
    if (self._resetting) return

    if (!encrypted) {
      return self._setupOTR()
    }

    self.emit('receive', new Buffer(msg, MSG_ENCODING))
  })

  otr.on('status', function (status) {
    if (self._resetting) return

    self._debug('otr status', status)
    if (status === OTR.CONST.STATUS_END_OTR) return otr = null
    if (status !== OTR.CONST.STATUS_AKE_SUCCESS) return

    var theirActualFingerprint = otr.their_priv_pk.fingerprint()
    if (self._theirFingerprint === theirActualFingerprint) {
      self._debug('AKE successful')
    }

    self.emit('fraud', {
      actualFingerprint: theirActualFingerprint,
      expectedFingerprint: self._theirFingerprint
    })
  })

  otr.on('error', function (err) {
    if (self._resetting) return

    self._debug('OTR error: ' + err)
    self._setupOTR()
  })

  this._processQueue()
}

Client.prototype.send = function (msg, ondelivered) {
  var self = this

  if (typeof msg === 'string') {
    // assume utf8
    msg = new Buffer(msg)
  }

  if (Buffer.isBuffer(msg)) {
    msg = msg.toString(MSG_ENCODING)
  }

  this._queue.push(arguments)
  this._processQueue()
}

Client.prototype._processQueue = function () {
  var self = this
  if (!this._otr || !this._queue.length) return

  var next = this._queue[0]
  var msg = next[0]
  var ondelivered = next[1] || noop
  this._otr.sendMsg(msg, function () {
    // last 'io' event for this message
    // has just been emitted
    self._deliveryCallbacks[self._deliveryCallbacks.length - 1].callback = function () {
      self._queue.shift()
      ondelivered()
    }
  })
}

Client.prototype.destroy = function (cb) {
  var self = this
  if (this._destroyed) return

  cb = cb || noop
  this._destroyed = true
  if (this._otr) {
    this._resetting = true
    this._otr.endOtr(function () {
      self._otr.removeAllListeners()
    })
  }
}
