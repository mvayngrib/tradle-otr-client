
var util = require('util')
var EventEmitter = require('events').EventEmitter
var typeforce = require('typeforce')
var debug = require('debug')('otr-client')
var OTR = require('@tradle/otr').OTR
var MSG_ENCODING = 'base64'
var UINT16 = 0xffff

function Client (opts) {
  var self = this

  typeforce({
    client: 'Object',
    key: 'DSA',
    instanceTag: '?String',
    theirFingerprint: '?String'
  }, opts)

  EventEmitter.call(this)

  this._client = opts.client
  this._key = opts.key
  this._fingerprint = opts.key.fingerprint()
  this._theirFingerprint = opts.theirFingerprint
  this._instanceTag = opts.instanceTag
  this._deliveryCallbacks = []
  this._queued = 0
  this._setupOTR()
}

util.inherits(Client, EventEmitter)
exports = module.exports = Client

Client.prototype._debug = function () {
  var args = Array.prototype.slice.call(arguments)
  args.unshift(this._fingerprint)
  return debug.apply(null, args)
}

Client.prototype._setupOTR = function () {
  var self = this
  if (this._otr) {
    return this._otr.endOtr(function () {
      self._otr.removeAllListeners()
      self._otr = null
      self._reinit()
    })
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
    // self._debug('sending', msg)
    self._deliveryCallbacks.push({
      count: ++self._queued,
      callback: null
    })

    self._client.send(msg, function () {
      self._queued--
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

  otr.on('ui', function (msg, meta) {
    self.emit('message', msg)
  })

  otr.on('status', function (status) {
    self._debug('otr status', status)
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
    self._debug('OTR error: ' + err)
    self._reinit
  })

  this._client.on('message', function (msg) {
    otr.receiveMsg(msg)
  })
}

Client.prototype.send = function (msg, ondelivered) {
  var self = this

  if (Buffer.isBuffer(msg)) {
    msg = msg.toString(MSG_ENCODING)
  }

  this._otr.sendMsg(msg, function () {
    // last 'io' event for this message
    // has just been emitted
    self._deliveryCallbacks[self._deliveryCallbacks.length - 1].callback = ondelivered
  })
}
