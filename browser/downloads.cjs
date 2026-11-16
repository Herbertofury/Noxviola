'use strict';
const {EventEmitter} = require('node:events');
const path = require('node:path');
const crypto = require('node:crypto');
const {isDeepStrictEqual} = require('node:util');
const storage = require('./storage.cjs');
const {ServiceStore, clone, record: object, keys, id, identity, identities, text, integer} = require('./service-store.cjs');

const STATES = new Set(['choosing-location', 'progressing', 'interrupted', 'completed', 'cancelled']);
const TERMINAL_STATES = new Set(['completed', 'cancelled', 'interrupted']);
const empty = () => ({version: 1, downloads: []});

function filename(value) {
  const clean = path.posix.basename(path.win32.basename(String(value || 'download'))).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
  return !clean || clean === '.' || clean === '..' ? 'download' : clean;
}
function date(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw storage.fail(`${label} must be an exact ISO date.`);
  return value;
}
function decode(value) {
  object(value, 'Download history');
  if (value.version !== 1) throw storage.fail('Unsupported download history version; original data was preserved.', 'UNSUPPORTED_VERSION');
  if (!Array.isArray(value.downloads)) throw storage.fail('Download history must contain a downloads array.');
  const seen = new Set();
  const downloads = value.downloads.map(row => {
    object(row, 'Download record'); id(row.id, 'Download ID'); identity(row.identity);
    if (seen.has(row.id)) throw storage.fail('Download IDs must be unique.');
    seen.add(row.id);
    for (const field of ['filename', 'url', 'path', 'error']) text(row[field], `Download ${field}`);
    if (!row.filename || row.path.includes('\0')) throw storage.fail('Download filename/path is invalid.');
    date(row.startedAt, 'Download start');
    if (row.finishedAt !== undefined) date(row.finishedAt, 'Download finish');
    integer(row.received, 'Received bytes'); integer(row.total, 'Total bytes');
    if (!STATES.has(row.state)) throw storage.fail('An unsupported download state was preserved.', 'UNSUPPORTED_DATA');
    for (const field of ['terminal', 'paused', 'canResume']) if (typeof row[field] !== 'boolean') throw storage.fail(`Download ${field} must be boolean.`);
    if (row.terminal && (!TERMINAL_STATES.has(row.state) || row.paused || row.canResume || row.finishedAt === undefined)) throw storage.fail('A terminal download has inconsistent lifecycle metadata.');
    if (!row.terminal && (['completed', 'cancelled'].includes(row.state) || row.finishedAt !== undefined)) throw storage.fail('An active download has inconsistent lifecycle metadata.');
    return {...row};
  });
  identities(downloads.map(row => row.identity));
  return {...value, downloads};
}
class DownloadStore extends ServiceStore {
  constructor(file) { super({file, name: 'Download history', decode, empty}); }
  document() { return this._document; }
  commit(downloads) { return this._commit({...this._document, downloads}); }
}
function boundary(row) {
  // Bytes change continuously. Only meaningful lifecycle changes checkpoint
  // them; native progress events do not become a permanent disk-write loop.
  return [row.path, row.state, row.terminal, row.paused, row.canResume, row.error];
}
function sameOriginRecord(left, right) {
  return ['id', 'identity', 'url', 'startedAt'].every(key => left[key] === right[key]);
}

class DownloadManager extends EventEmitter {
  constructor({directory, reveal, file, getIdentities = null, now = Date.now}) {
    super();
    if (typeof directory !== 'string' || !directory || typeof reveal !== 'function' || typeof now !== 'function' || (getIdentities !== null && typeof getIdentities !== 'function')) throw new TypeError('Download directory and callbacks are required.');
    this.directory = directory; this.reveal = reveal; this.getIdentities = getIdentities; this.now = now;
    this.store = file === undefined ? null : new DownloadStore(file);
    this.records = new Map(); this.sessions = new Map(); this.pending = new Set();
    this.queued = false; this.disposed = false; this.lastStatus = null;
    this.status = this.store ? 'unopened' : 'memory'; this.error = null;
  }
  _alive() { if (this.disposed) throw storage.fail('Downloads are closed.', 'DISPOSED'); }
  _time() {
    const value = this.now();
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 8640000000000000) throw storage.fail('The download clock returned an invalid time.');
    return new Date(value).toISOString();
  }
  _owner(value) {
    identity(value);
    const owners = [...this.sessions.values()].map(entry => entry.identity);
    identities([...owners, value]);
    if (this.getIdentities) {
      const allowed = this.getIdentities();
      if (!Array.isArray(allowed)) throw storage.fail('Browser identity configuration is unavailable.');
      identities(allowed);
      if (!allowed.includes(value)) throw storage.fail('Unknown browser identity.', 'NOT_FOUND');
    }
    return value;
  }
  getStatus() {
    return {status: this.status, error: this.error, pendingCount: this.pending.size,
      recoveryAvailable: this.store?.inspection?.status === 'recovery', persistent: !!this.store};
  }
  changed() {
    if (this.queued || this.disposed) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      if (this.disposed) return;
      // Invalidate, do not eagerly clone an unlimited history for a hidden UI.
      this.emit('change');
      const status = this.getStatus(), key = JSON.stringify(status);
      if (key !== this.lastStatus) { this.lastStatus = key; this.emit('status', status); }
    });
  }
  _failed(error) {
    this.status = this.store?.status === 'recovery' ? 'recovery' : 'error';
    this.error = error.message; this.changed();
  }
  _adopt(opened, recovering = false) {
    if (opened.status === 'recovery') {
      // An inspected previous copy is not consent to restore it. Live native
      // downloads remain available even while history itself is blocked.
      this.records = new Map([...this.records].filter(([, row]) => !row.restored));
      this.pending = new Set(this.records.keys());
    } else {
      const next = new Map(this.store.document().downloads.map(data => [data.id,
        {data: clone(data), item: null, restored: true, persisted: clone(data), listeners: null}]));
      const pending = new Set(), updates = [];
      for (const [key, current] of this.records) {
        if (current.restored || (!current.item && !this.pending.has(key))) continue;
        const saved = next.get(key)?.data;
        const exact = saved && isDeepStrictEqual(saved, current.data);
        const expected = saved && current.persisted && isDeepStrictEqual(saved, current.persisted);
        const recoveredSame = recovering && saved && sameOriginRecord(saved, current.data);
        if ((saved && !exact && !expected && !recoveredSame) || (!saved && current.persisted && !recovering)) {
          throw storage.fail('Download history changed outside this manager. Resolve the conflicting record before saving; native downloads and original bytes were preserved.', 'STALE_PREVIEW');
        }
        // Listener closures retain this exact object and its data object.
        // Validate the entire adoption before changing any of those objects.
        updates.push({current, saved, recoveredSame});
        if (!exact) pending.add(key);
        next.set(key, current);
      }
      for (const {current, saved, recoveredSame} of updates) {
        if (recoveredSame) for (const [key, value] of Object.entries(saved)) {
          if (!Object.hasOwn(current.data, key)) Object.defineProperty(current.data, key, {value: clone(value), enumerable: true, configurable: true, writable: true});
        }
        current.persisted = saved ? clone(saved) : null;
      }
      this.records = next; this.pending = pending;
    }
    this.status = opened.status; this.error = opened.status === 'recovery' ? opened.reason : null;
    this.changed();
    return {...opened, ...this.getStatus()};
  }
  open() {
    this._alive();
    if (!this.store) { this.changed(); return this.getStatus(); }
    try { return this._adopt(this.store.open()); }
    catch (error) { this._failed(error); throw error; }
  }
  recover() {
    this._alive();
    if (!this.store) throw storage.fail('No persistent download history is configured.');
    try { return this._adopt(this.store.recover(), true); }
    catch (error) { this._failed(error); throw error; }
  }
  _commit(records) {
    if (!this.store) return false;
    if (!['new', 'ready'].includes(this.status)) throw storage.fail(this.error || 'Open or explicitly recover download history before saving.', 'RECOVERY_REQUIRED');
    this.store.commit([...records.values()].map(row => row.data));
    for (const row of records.values()) row.persisted = clone(row.data);
    this.pending.clear(); this.status = this.store.status; this.error = null;
    return true;
  }
  _checkpoint(row, strict = false) {
    if (this.store && row) this.pending.add(row.data.id);
    try { return this._commit(this.records); }
    catch (error) { this._failed(error); if (strict) throw error; return false; }
  }
  _capture(row, state, ending = false) {
    const item = row.item;
    if (!item) return;
    try {
      const destination = item.getSavePath(), received = item.getReceivedBytes(), total = item.getTotalBytes();
      text(destination, 'Download destination'); integer(received, 'Received bytes'); integer(total, 'Total bytes');
      const nextState = state || item.getState();
      if (!STATES.has(nextState)) throw storage.fail('The native download reported an unknown state.');
      row.data.path = destination; row.data.received = received; row.data.total = total;
      row.data.paused = !!item.isPaused(); row.data.canResume = !!item.canResume();
      // A native getter can see cancellation/completion before its done event.
      // Only that event establishes a terminal outcome in our history.
      const activeState = !ending && ['completed', 'cancelled'].includes(nextState)
        ? (row.data.state === 'choosing-location' ? 'progressing' : row.data.state) : nextState;
      row.data.state = destination ? activeState : 'choosing-location';
    } catch (error) { row.data.error = error.message; }
  }
  _refresh(row, state) {
    const before = boundary(row.data);
    this._capture(row, state);
    if (!isDeepStrictEqual(before, boundary(row.data))) this._checkpoint(row);
    this.changed();
  }
  _detach(row) {
    if (row.item && row.listeners) {
      row.item.removeListener('updated', row.listeners.update);
      row.item.removeListener('done', row.listeners.done);
    }
    row.listeners = null; row.item = null;
  }
  _settled(row, error = null) {
    for (const waiter of row.waiters || []) { if (error) waiter.reject(error); else waiter.resolve(row.data.id); }
    row.waiters?.clear();
  }
  _cancel(row) {
    if (!row.item || row.data.terminal || row.cancelRequested) return;
    row.cancelRequested = true;
    try { row.item.cancel(); }
    catch (error) {
      row.cancelRequested = false; row.data.error = error.message;
      this._checkpoint(row); this.changed(); throw error;
    }
    if (row.item) this._refresh(row);
    this.changed();
  }
  _start(item, owner) {
    if (this.disposed) return;
    const data = {id: crypto.randomUUID(), identity: owner, filename: 'download', url: '',
      startedAt: this._time(), received: 0, total: 0, state: 'choosing-location', terminal: false,
      paused: false, canResume: false, path: '', error: ''};
    if (this.records.has(data.id)) throw storage.fail('A new download ID collided with existing history; nothing was replaced.');
    const row = {data, item, restored: false, persisted: null, listeners: null, waiters: new Set(), cancelRequested: false};
    this.records.set(data.id, row);
    try {
      data.filename = filename(item.getFilename()); data.url = text(item.getURL(), 'Download URL');
      data.total = integer(item.getTotalBytes(), 'Total bytes');
      // Electron restricts destination APIs to this synchronous callback.
      // Its own native chooser supplies the destination after user consent.
      item.setSaveDialogOptions({title: 'Save download', defaultPath: path.join(this.directory, data.filename)});
    } catch (error) {
      data.error = error.message; data.state = 'interrupted'; data.terminal = true; data.finishedAt = this._time();
      this._detach(row);
      try { item.cancel(); } catch { /* Destination/capture failure is already visible. */ }
      this._checkpoint(row); this.changed(); return;
    }
    const update = (_event, state) => { if (!this.disposed && row.item) this._refresh(row, state); };
    const done = (_event, state) => {
      if (this.disposed || !row.item) return;
      this._capture(row, state, true);
      let resultError = null;
      if (!TERMINAL_STATES.has(state)) { resultError = new Error('The native download ended with an unknown result.'); data.error = resultError.message; state = 'interrupted'; }
      data.state = state; data.finishedAt = this._time(); data.terminal = true; data.paused = false; data.canResume = false;
      this._detach(row); this._checkpoint(row); this._settled(row, resultError); this.changed();
    };
    row.listeners = {update, done}; item.on('updated', update); item.once('done', done);
    this._checkpoint(row); this.changed();
  }
  attach(session, owner) {
    this._alive(); this._owner(owner);
    const existing = this.sessions.get(session);
    if (existing) {
      if (existing.identity !== owner) throw storage.fail('A native download Session cannot belong to two identities.');
      return;
    }
    const listener = (_event, item) => this._start(item, owner);
    session.on('will-download', listener); this.sessions.set(session, {identity: owner, listener});
  }
  list(options = {}) {
    keys(options, ['identity'], 'Download query');
    if (options.identity !== undefined) identity(options.identity);
    return [...this.records.values()].filter(row => options.identity === undefined || row.data.identity === options.identity).map(row => {
      const incomplete = row.restored && !row.data.terminal;
      return {...clone(row.data), state: incomplete ? 'interrupted' : row.data.state,
        terminal: incomplete || row.data.terminal, paused: incomplete ? false : row.data.paused,
        canResume: !!row.item && row.data.canResume, hasNativeItem: !!row.item,
        cancelPending: !!row.item && !!row.cancelRequested,
        restored: row.restored, interruptedByRestart: incomplete, savedState: row.data.state,
        historySaved: !!row.persisted && !this.pending.has(row.data.id), historyPending: this.pending.has(row.data.id),
        error: incomplete ? [row.data.error, 'The previous process ended before a terminal result was saved. No native download is attached; restart or resume is not available.'].filter(Boolean).join(' ') : row.data.error};
    });
  }
  activeCount() { return [...this.records.values()].filter(row => row.item && !row.data.terminal).length; }
  action(key, action) {
    this._alive(); id(key, 'Download ID');
    const row = this.records.get(key);
    if (!row) throw storage.fail('Download is no longer available.', 'NOT_FOUND');
    if (action === 'reveal') {
      if (row.data.state !== 'completed' || !row.data.path) throw new Error('Only a completed download can be shown in its folder.');
      this.reveal(row.data.path); return;
    }
    if (action === 'retry') throw storage.fail('Retrying saved downloads is not supported. Start a new download explicitly from its source.', 'UNSUPPORTED_OPERATION');
    if (!row.item) throw new Error('This download has finished or has no live native item.');
    if (row.cancelRequested && action !== 'cancel') throw storage.fail('Wait for this download cancellation to finish.', 'CANCEL_PENDING');
    if (action === 'pause' && row.data.state === 'progressing') row.item.pause();
    else if (action === 'resume' && (row.data.paused || row.data.canResume)) row.item.resume();
    else if (action === 'cancel' && ['progressing', 'choosing-location', 'interrupted'].includes(row.data.state)) this._cancel(row);
    else throw new Error('That action is not available for this download.');
    // pause/resume need not emit an updated event before the next command.
    if (row.item && !row.data.terminal) this._refresh(row);
    this.changed();
  }
  remove(key) {
    this._alive(); id(key, 'Download ID');
    const row = this.records.get(key);
    if (!row) throw storage.fail('Download history record was not found.', 'NOT_FOUND');
    if (row.item && !row.data.terminal) throw storage.fail('Finish or cancel this live download before removing its history.', 'ACTIVE_DOWNLOAD');
    const next = new Map(this.records); next.delete(key);
    try { const persisted = this._commit(next); this.records = next; this.pending.delete(key); this.changed(); return {removed: 1, persisted}; }
    catch (error) { this._failed(error); throw error; }
  }
  clear(options = {}) {
    this._alive(); keys(options, ['identity'], 'Download history clear');
    if (options.identity !== undefined) identity(options.identity);
    const matches = row => options.identity === undefined || row.data.identity === options.identity;
    for (const row of this.records.values()) if (matches(row) && row.item && !row.data.terminal) throw storage.fail('Finish or cancel the selected live downloads before clearing their history.', 'ACTIVE_DOWNLOAD');
    const next = new Map([...this.records].filter(([, row]) => !matches(row))), removed = this.records.size - next.size;
    try { const persisted = this._commit(next); this.records = next; this.pending = new Set([...this.pending].filter(key => next.has(key))); this.changed(); return {removed, persisted}; }
    catch (error) { this._failed(error); throw error; }
  }
  flush() {
    this._alive();
    for (const row of this.records.values()) if (row.item && !row.data.terminal) this._capture(row);
    if (this.store) for (const row of this.records.values()) if (!isDeepStrictEqual(row.data, row.persisted)) this.pending.add(row.data.id);
    this._checkpoint(null, true); this.changed(); return this.getStatus();
  }
  cancelActive() {
    this._alive();
    const active = [...this.records.values()].filter(row => row.item && !row.data.terminal);
    const registrations = [];
    const settled = active.map(row => new Promise((resolve, reject) => {
      const waiter = {resolve, reject}; row.waiters.add(waiter);
      registrations.push({row, waiter});
      try { this._cancel(row); }
      catch (error) { row.waiters.delete(waiter); reject(error); }
    }));
    return Promise.all(settled).then(values => ({settled: values.length})).finally(() => {
      for (const {row, waiter} of registrations) row.waiters.delete(waiter);
    });
  }
  dispose() {
    if (this.disposed) return;
    for (const [session, entry] of this.sessions) session.removeListener('will-download', entry.listener);
    for (const row of this.records.values()) {
      this._settled(row, storage.fail('Downloads closed before native cancellation completed.', 'DISPOSED'));
      this._detach(row);
    }
    this.sessions.clear(); this.disposed = true; this.status = 'disposed';
    this.store?.dispose();
  }
}
module.exports = {DownloadManager, filename, decode};
