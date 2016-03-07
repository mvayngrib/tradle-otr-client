
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
    self.emit('receive', new Buffer(msg, MSG_ENCODING))
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
    self._reinit()
  })

  this._client.on('receive', function (msg) {
    otr.receiveMsg(msg.toString())
  })
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

  this._otr.sendMsg(msg, function () {
    // last 'io' event for this message
    // has just been emitted
    self._deliveryCallbacks[self._deliveryCallbacks.length - 1].callback = ondelivered
  })
}

Client.prototype.destroy = function (cb) {
  if (this._destroyed) return

  cb = cb || noop
  this._destroyed = true
  if (this._otr) this._otr.endOtr(cb)
}
