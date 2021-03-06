const RandomAccess = require('random-access-storage')
const isOptions = require('is-options')
const inherits = require('inherits')

const DEFAULT_PAGE_SIZE = 1024 * 1024

module.exports = RAM

function RAM (opts) {
  if (!(this instanceof RAM)) return new RAM(opts)
  if (typeof opts === 'number') opts = {length: opts}
  if (!opts) opts = {}

  RandomAccess.call(this)

  if (Buffer.isBuffer(opts)) {
    opts = {length: opts.length, buffer: opts}
  }
  if (!isOptions(opts)) opts = {}

  this.length = opts.length || 0
  this.pageSize = opts.length || opts.pageSize || DEFAULT_PAGE_SIZE
  this.buffers = []

  if (opts.buffer) this.buffers.push(opts.buffer)
}

inherits(RAM, RandomAccess)

RAM.prototype._stat = function (req) {
  callback(req, null, {size: this.length})
}

RAM.prototype._write = function (req) {
  var i = Math.floor(req.offset / this.pageSize)
  var rel = req.offset - i * this.pageSize
  var start = 0

  const len = req.offset + req.size
  if (len > this.length) this.length = len

  while (start < req.size) {
    const page = this._page(i++, true)
    const free = this.pageSize - rel
    const end = free < (req.size - start)
      ? start + free
      : req.size

    req.data.copy(page, rel, start, end)
    start = end
    rel = 0
  }

  callback(req, null, null)
}

RAM.prototype._read = function (req) {
  var i = Math.floor(req.offset / this.pageSize)
  var rel = req.offset - i * this.pageSize
  var start = 0

  if (req.offset + req.size > this.length) {
    return callback(req, new Error('Could not satisfy length'), null)
  }

  const data = Buffer.alloc(req.size)

  while (start < req.size) {
    const page = this._page(i++, false)
    const avail = this.pageSize - rel
    const wanted = req.size - start
    const len = avail < wanted ? avail : wanted

    if (page) page.copy(data, start, rel, rel + len)
    start += len
    rel = 0
  }

  callback(req, null, data)
}

RAM.prototype._del = function (req) {
  var i = Math.floor(req.offset / this.pageSize)
  var rel = req.offset - i * this.pageSize
  var start = 0

  while (start < req.size) {
    if (rel === 0 && req.size - start >= this.pageSize) {
      this.buffers[i++] = undefined
    }

    rel = 0
    start += this.pageSize - rel
  }

  callback(req, null, null)
}

RAM.prototype._destroy = function (req) {
  this._buffers = []
  this.length = 0
  callback(req, null, null)
}

RAM.prototype._page = function (i, upsert) {
  var page = this.buffers[i]
  if (page || !upsert) return page
  page = this.buffers[i] = Buffer.alloc(this.pageSize)
  return page
}

function callback (req, err, data) {
  process.nextTick(callbackNT, req, err, data)
}

function callbackNT (req, err, data) {
  req.callback(err, data)
}
