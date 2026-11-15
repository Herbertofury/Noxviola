'use strict';

// Shared service lifecycle only. storage.cjs remains the single checkpoint,
// atomic replacement, previous-copy and explicit-recovery implementation.
const {isDeepStrictEqual} = require('node:util');
const storage = require('./storage.cjs');
const {httpUrl} = require('./state.cjs');

const clone = value => structuredClone(value);
function record(value, label = 'Value') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw storage.fail(`${label} must be an object.`);
  return value;
}
function keys(value, allowed, label = 'Request') {
  record(value, label);
  if (Object.keys(value).some(key => !allowed.includes(key))) throw storage.fail(`${label} contains an unsupported field.`);
  return value;
}
function id(value, label = 'ID') {
  if (typeof value !== 'string' || !value || /[\u0000-\u001f\u007f]/.test(value)) throw storage.fail(`${label} must be a nonempty stable string.`);
  return value;
}
function identity(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(value)) throw storage.fail('A valid browser identity is required.');
  return value;
}
function identities(values) {
  const seen = new Map([['personal', 'personal']]);
  for (const value of values) {
    identity(value);
    const key = value.toLowerCase(), prior = seen.get(key);
    if (prior !== undefined && prior !== value) throw storage.fail('Saved identities contain an ambiguous case alias; original data was preserved.', 'UNSUPPORTED_DATA');
    seen.set(key, value);
  }
}
function text(value, label = 'Text') {
  if (typeof value !== 'string') throw storage.fail(`${label} must be text.`);
  return value;
}
function timestamp(value, label = 'Time') {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 8640000000000000) throw storage.fail(`${label} must be milliseconds since the epoch.`);
  return value;
}
function integer(value, label = 'Index') {
  if (!Number.isSafeInteger(value) || value < 0) throw storage.fail(`${label} must be a nonnegative integer.`);
  return value;
}
function url(value) {
  const result = httpUrl(value);
  if (!result) throw storage.fail('An HTTP(S) address without embedded credentials is required.');
  return result;
}

class ServiceStore {
  constructor({file, name, decode, empty, getIdentities = null, onChange = () => {}, now = Date.now}) {
    if (typeof file !== 'string' || !file) throw new TypeError(`${name} requires a file path.`);
    if (typeof onChange !== 'function' || typeof now !== 'function' || (getIdentities !== null && typeof getIdentities !== 'function')) throw new TypeError('Service callbacks must be functions.');
    this.file = file; this.name = name; this.onChange = onChange; this.now = now;
    this.getIdentities = getIdentities;
    this.status = 'unopened'; this.error = null; this.inspection = null;
    this._decode = decode; this._empty = empty; this._document = empty();
    this._listeners = new Set(); this._disposed = false;
  }
  open() {
    this._alive();
    try {
      const opened = storage.inspect(this.file, this._decode, this._empty);
      // Keep recovery bytes without duplicating every successfully loaded
      // collection just for a status snapshot.
      this.inspection = opened.preview ? {status: opened.status, reason: opened.reason, preview: opened.preview} : {status: opened.status};
      this.status = opened.status;
      this.error = opened.status === 'recovery' ? opened.reason : null;
      this._document = opened.status === 'recovery' ? this._empty() : clone(opened.value);
      this._reindex(); this._status();
      return opened;
    } catch (error) { this.inspection = null; this._failed(error); throw error; }
  }
  recover(preview = this.inspection?.preview) {
    this._alive();
    if (this.inspection?.status !== 'recovery') throw storage.fail('Open and inspect a recoverable checkpoint before restoring it.', 'RECOVERY_REQUIRED');
    try {
      const restored = storage.recover(this.file, preview, this._decode);
      return {...this.open(), preserved: restored.preserved};
    } catch (error) { this._failed(error); throw error; }
  }
  subscribe(listener) {
    this._alive();
    if (typeof listener !== 'function') throw new TypeError('A change listener is required.');
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }
  dispose() {
    if (this._disposed) return;
    this._disposed = true; this.status = 'disposed'; this._status(); this._listeners.clear();
  }
  _alive() { if (this._disposed) throw storage.fail(`${this.name} is closed.`, 'DISPOSED'); }
  _ready() {
    this._alive();
    if (!['ready', 'new'].includes(this.status)) throw storage.fail(`${this.name} is unavailable until its checkpoint is opened or explicitly recovered.`, 'RECOVERY_REQUIRED');
  }
  _identity(value) {
    this._ready(); identity(value);
    if (this.getIdentities) {
      const allowed = this.getIdentities();
      if (!Array.isArray(allowed)) throw storage.fail('Browser identity configuration is unavailable.');
      identities(allowed);
      if (!allowed.includes(value)) throw storage.fail('Unknown browser identity.', 'NOT_FOUND');
    }
    return value;
  }
  _time() { return timestamp(this.now()); }
  _reindex() {}
  _emit(event) {
    for (const listener of [this.onChange, ...this._listeners]) {
      try { listener(clone(event)); } catch { /* Observers cannot undo a durable commit. */ }
    }
  }
  _status() { this._emit({type: 'status', status: this.status, error: this.error}); }
  _failed(error) {
    this.status = this.inspection?.status === 'recovery' && error.code === 'RECOVERY_REQUIRED' ? 'recovery' : 'error';
    this.error = error.message; this._status();
  }
  _commit(candidate, events = []) {
    this._ready();
    const document = this._decode(candidate);
    try {
      const current = storage.inspect(this.file, this._decode, this._empty);
      if (current.status === 'recovery') {
        this.inspection = current;
        throw storage.fail(`${this.name} requires explicit recovery before saving.`, 'RECOVERY_REQUIRED');
      }
      if (!isDeepStrictEqual(current.value, this._document)) throw storage.fail(`${this.name} changed outside this service. Reopen it before editing.`, 'STALE_PREVIEW');
      const changed = !isDeepStrictEqual(document, this._document);
      storage.write(this.file, document, this._decode);
      this._document = clone(document); this.status = 'ready'; this.error = null;
      this.inspection = {status: 'ready'};
      this._reindex();
      if (changed) for (const event of events) this._emit(event);
      return changed;
    } catch (error) { this._failed(error); throw error; }
  }
}

module.exports = {ServiceStore, clone, record, keys, id, identity, identities, text, timestamp, integer, url};
