"use strict";
const {Worker, isMainThread, parentPort} = require('node:worker_threads');
const {EventEmitter} = require('node:events');
if (!isMainThread) {
  const {saveState} = require('./state.cjs');
  parentPort.on('message', ({file, snapshot, revision}) => {
    try { parentPort.postMessage({revision, ...saveState(file, snapshot)}); }
    catch (error) { parentPort.postMessage({revision, error: error.message}); }
  });
} else {
  class SessionWriter extends EventEmitter {
    constructor(file) {
      super(); this.file = file; this.next = null; this.active = null; this.revision = 0;
      this.failure = null; this.waiters = []; this.stopping = false; this.dead = false;
      this.worker = new Worker(__filename);
      this.worker.on('message', result => {
        this.active = null; this.failure = result.error ? new Error(result.error) : null;
        this.emit('result', result); this.dispatch(); this.settle();
      });
      this.worker.on('error', error => this.failed(error));
      this.worker.on('exit', code => { if (!this.stopping) this.failed(new Error(`Session worker stopped (${code}).`)); });
    }
    request(snapshot) {
      if (this.stopping || this.dead) throw this.failure || new Error('Session writer is stopped.');
      this.next = {file: this.file, snapshot: structuredClone(snapshot), revision: ++this.revision};
      this.dispatch(); return this.revision;
    }
    dispatch() {
      if (this.active || !this.next || this.dead) return;
      this.active = this.next; this.next = null; this.worker.postMessage(this.active);
    }
    failed(error) {
      if (this.dead) return;
      this.dead = true; this.failure = error; this.active = null; this.next = null;
      this.emit('result', {revision: this.revision, error: error.message, workerStopped: true}); this.settle();
    }
    settle() {
      if (this.active || this.next) return;
      for (const {resolve, reject} of this.waiters.splice(0)) this.failure ? reject(this.failure) : resolve();
    }
    flush() {
      if (!this.active && !this.next) return this.failure ? Promise.reject(this.failure) : Promise.resolve();
      return new Promise((resolve, reject) => this.waiters.push({resolve, reject}));
    }
    async close() {
      let error; try { await this.flush(); } catch (failure) { error = failure; }
      this.stopping = true; await this.worker.terminate(); if (error) throw error;
    }
  }
  module.exports = {SessionWriter};
}
