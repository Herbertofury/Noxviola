'use strict';
// Small external client for the documented Chromium DevTools Protocol. It does
// not enable Node inspection, inject main-process code, or alter app resources.
const { EventEmitter } = require('node:events');

function loopbackWebSocket(value) {
  const url = new URL(value);
  if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || !url.port ||
      url.username || url.password || url.search || url.hash ||
      !/^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(url.pathname)) {
    throw new Error('Packaged acceptance only attaches to its child process\'s ephemeral loopback browser endpoint.');
  }
  return url.href;
}

class CdpConnection extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.sequence = 0;
    this.pending = new Map();
    this.closed = new Promise(resolve => { this.resolveClosed = resolve; });
    socket.addEventListener('message', event => {
      try {
        const message = JSON.parse(event.data);
        if (message.id) {
          const pending = this.pending.get(message.id);
          if (!pending) return;
          this.pending.delete(message.id);
          clearTimeout(pending.timeout);
          if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message} (${message.error.code})`));
          else pending.resolve(message.result || {});
        } else this.emit('event', message);
      } catch (error) { this.fail(error); }
    });
    socket.addEventListener('close', () => { this.fail(new Error('Packaged Chromium debugging connection closed.')); this.resolveClosed(); });
    socket.addEventListener('error', () => this.fail(new Error('Packaged Chromium debugging connection failed.')));
  }

  static async connect(endpoint) {
    const socket = new WebSocket(loopbackWebSocket(endpoint));
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { socket.close(); reject(new Error('Timed out attaching to the packaged Chromium endpoint.')); }, 10_000);
      socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Could not attach to the packaged Chromium endpoint.')); }, { once: true });
    });
    return new CdpConnection(socket);
  }

  fail(error) {
    this.failure ||= error;
    for (const pending of this.pending.values()) { clearTimeout(pending.timeout); pending.reject(error); }
    this.pending.clear();
    this.emit('disconnected', error);
  }

  send(method, params = {}, sessionId) {
    if (this.failure) return Promise.reject(this.failure);
    if (this.socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error(`CDP is not connected: ${method}`));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for CDP ${method}.`));
      }, 30_000);
      this.pending.set(id, { resolve, reject, timeout, method });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  async evaluate(sessionId, expression, { awaitPromise = true } = {}) {
    const reply = await this.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, userGesture: true }, sessionId);
    if (reply.exceptionDetails) {
      const error = new Error(reply.exceptionDetails.exception?.description || reply.exceptionDetails.text || 'Packaged renderer evaluation failed.');
      error.details = reply.exceptionDetails;
      throw error;
    }
    return reply.result?.value;
  }

  close() { this.socket.close(); return this.closed; }
}

module.exports = { CdpConnection, loopbackWebSocket };
