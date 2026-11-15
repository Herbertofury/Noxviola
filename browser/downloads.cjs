'use strict';
const {EventEmitter} = require('node:events');
const path = require('node:path');
const crypto = require('node:crypto');

function filename(value) {
  const clean = path.basename(String(value || 'download')).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
  return !clean || clean === '.' || clean === '..' ? 'download' : clean;
}
class DownloadManager extends EventEmitter {
  constructor({directory, reveal}) {
    super(); this.directory = directory; this.reveal = reveal;
    this.records = new Map(); this.sessions = new Map(); this.queued = false;
  }
  changed() {
    if (this.queued) return;
    this.queued = true;
    queueMicrotask(() => { this.queued = false; this.emit('change', this.list()); });
  }
  attach(session, identity) {
    if (this.sessions.has(session)) return;
    const listener = (_event, item) => {
      const record = {id: crypto.randomUUID(), identity, item, filename: filename(item.getFilename()),
        url: item.getURL(), startedAt: new Date().toISOString(), received: 0, total: item.getTotalBytes(),
        state: 'choosing-location', terminal: false, paused: false, canResume: false, path: '', error: ''};
      this.records.set(record.id, record);
      try {
        // Electron restricts destination APIs to this synchronous callback.
        // Its own native chooser supplies the destination after user consent.
        item.setSaveDialogOptions({title: 'Save download', defaultPath: path.join(this.directory, record.filename)});
      } catch (error) {
        record.error = error.message; record.state = 'interrupted'; record.terminal = true; record.item = null;
        try { item.cancel(); } catch { /* The destination failure is already visible. */ }
        this.changed(); return;
      }
      const update = (_event, state) => {
        try {
          record.path = item.getSavePath(); record.received = item.getReceivedBytes();
          record.total = item.getTotalBytes(); record.paused = item.isPaused(); record.canResume = item.canResume();
          record.state = record.path ? state || item.getState() : 'choosing-location';
        } catch (error) { record.error = error.message; }
        this.changed();
      };
      item.on('updated', update);
      item.once('done', (_event, state) => {
        update(_event, state); record.state = state; record.finishedAt = new Date().toISOString();
        record.terminal = true; record.canResume = false; record.item = null;
        item.removeListener('updated', update); this.changed();
      });
      this.changed();
    };
    session.on('will-download', listener); this.sessions.set(session, listener);
  }
  list() { return [...this.records.values()].map(({item, ...record}) => ({...record})); }
  activeCount() { return this.list().filter(record => !record.terminal && ['progressing', 'choosing-location', 'interrupted'].includes(record.state)).length; }
  action(id, action) {
    const record = this.records.get(id);
    if (!record) throw new Error('Download is no longer available.');
    if (action === 'reveal') {
      if (record.state !== 'completed' || !record.path) throw new Error('Only a completed download can be shown in its folder.');
      this.reveal(record.path); return;
    }
    if (!record.item) throw new Error('This download has finished.');
    if (action === 'pause' && record.state === 'progressing') record.item.pause();
    else if (action === 'resume' && (record.paused || record.canResume)) record.item.resume();
    else if (action === 'cancel' && ['progressing', 'choosing-location', 'interrupted'].includes(record.state)) record.item.cancel();
    else throw new Error('That action is not available for this download.');
    // pause/resume need not emit an updated event before the next command.
    if (record.item && !record.terminal) {
      record.paused = record.item.isPaused(); record.canResume = record.item.canResume();
      record.state = record.path ? record.item.getState() : 'choosing-location';
    }
    this.changed();
  }
  cancelActive() {
    for (const record of this.records.values()) if (record.item && !record.terminal) record.item.cancel();
  }
  dispose() {
    for (const [session, listener] of this.sessions) session.removeListener('will-download', listener);
    this.sessions.clear();
  }
}
module.exports = {DownloadManager, filename};
