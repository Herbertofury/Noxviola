'use strict';

// Electron's loadExtension/extension-ready confirm registration, not completion
// of a persistent MV2 background document. Observe the existing native host;
// never create another host, execute extension code, or retry its messages.
class ExtensionRuntimeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ExtensionRuntimeError';
    this.code = code;
  }
}

function backgroundURL(extension) {
  const manifest = extension?.manifest;
  const background = manifest?.background;
  if (manifest?.manifest_version !== 2 || !background || background.persistent === false) return null;
  const page = typeof background.page === 'string' && background.page;
  if (!page && !(Array.isArray(background.scripts) && background.scripts.length)) return null;
  if (!/^[a-p]{32}$/.test(extension.id)) throw new ExtensionRuntimeError('EXTENSION_BACKGROUND_ID', 'The background runtime has no valid extension identity.');
  const address = new URL(page || '_generated_background_page.html', `chrome-extension://${extension.id}/`);
  if (address.protocol !== 'chrome-extension:' || address.hostname !== extension.id || address.username || address.password || address.port) {
    throw new ExtensionRuntimeError('EXTENSION_BACKGROUND_URL', 'The background document must belong to its loaded extension.');
  }
  address.hash = '';
  return address.href;
}

function sameDocument(value, expected) {
  try {
    const address = new URL(value);
    address.hash = '';
    return address.href === expected;
  } catch { return false; }
}

function createExtensionLoader({app, webContents, timeoutMs = 15_000} = {}) {
  if (typeof app?.on !== 'function' || typeof app?.removeListener !== 'function' || typeof webContents?.getAllWebContents !== 'function') {
    throw new TypeError('The native app and webContents lifecycle APIs are required.');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError('The background readiness timeout must be a positive integer.');

  return async function loadExtension(session, directory, options) {
    if (['loadExtension', 'on', 'removeListener'].some(method => typeof session?.extensions?.[method] !== 'function')) throw new TypeError('The native Session.extensions loader and lifecycle events are required.');
    const records = new Map();
    const unloaded = new Set();
    let extension;
    let expected;
    let finish;
    let timer;

    function committed(contents) {
      try { return contents.isDestroyed() ? '' : contents.mainFrame.url; }
      catch { return ''; } // Initial or detached native frame, never readiness.
    }
    function loading(contents) {
      try { return contents.isDestroyed() || contents.isLoadingMainFrame(); }
      catch { return true; }
    }
    function evaluate() {
      if (!finish) return;
      if (unloaded.has(extension.id)) return finish(new ExtensionRuntimeError('EXTENSION_BACKGROUND_UNLOADED', 'The extension unloaded before its background document was ready.'));
      const matching = [...records.values()].filter(record =>
        sameDocument(record.lastURL, expected) || sameDocument(record.finishedURL, expected) || sameDocument(record.failure?.url, expected));
      // A previous host can still be draining while a new host has an empty
      // initial frame. An old completed document cannot prove this load ready;
      // a reused host must start a new observed main-frame navigation epoch.
      const candidates = matching.filter(record => !record.preexisting || record.startedDuringLoad);
      for (const record of candidates) {
        if (record.failure && sameDocument(record.failure.url, expected)) return finish(record.failure.error);
      }
      for (const record of candidates) {
        if (!record.destroyed && sameDocument(record.finishedURL, expected) &&
            sameDocument(committed(record.contents), expected)) return finish();
      }
    }
    function observe(contents, preexisting = false) {
      if (records.has(contents)) return;
      try { if (contents.isDestroyed() || contents.session !== session || contents.getType() !== 'backgroundPage') return; }
      catch { return; }
      const record = {contents, preexisting, startedDuringLoad: false, lastURL: '', finishedURL: '', failure: null, destroyed: false, listeners: []};
      records.set(contents, record);
      function listen(event, handler) { contents.on(event, handler); record.listeners.push([event, handler]); }
      function failed(code, message, url = committed(contents) || record.lastURL) {
        record.failure = {url, error: new ExtensionRuntimeError(code, message)};
        evaluate();
      }
      listen('did-start-navigation', details => {
        if (!details.isMainFrame) return;
        record.startedDuringLoad = true;
        record.lastURL = details.url;
        record.finishedURL = '';
        evaluate();
      });
      listen('did-finish-load', () => {
        const url = committed(contents);
        if (url) record.lastURL = record.finishedURL = url;
        evaluate();
      });
      listen('did-fail-load', (_event, code, description, url, isMainFrame) => {
        if (isMainFrame) failed('EXTENSION_BACKGROUND_LOAD_FAILED', `The extension background document failed to load (${code}): ${description}`, url || record.lastURL);
      });
      listen('render-process-gone', (_event, details) => failed('EXTENSION_BACKGROUND_CRASHED', `The extension background renderer stopped: ${details.reason} (exit ${details.exitCode}).`));
      listen('destroyed', () => {
        record.destroyed = true;
        failed('EXTENSION_BACKGROUND_DESTROYED', 'The extension background document was destroyed before it became ready.', record.lastURL);
      });
      // Register before sampling: a load that completed before observation is
      // accepted only with its actual committed document, never an empty frame.
      record.lastURL = committed(contents);
      if (record.lastURL && !loading(contents)) record.finishedURL = record.lastURL;
      evaluate();
    }
    const created = (_event, contents) => observe(contents);
    const onUnloaded = (_event, item) => { unloaded.add(item.id); evaluate(); };
    const onLoaded = (_event, item) => { unloaded.delete(item.id); };

    try {
      app.on('web-contents-created', created);
      session.extensions.on('extension-unloaded', onUnloaded);
      session.extensions.on('extension-loaded', onLoaded);
      for (const contents of webContents.getAllWebContents()) observe(contents, true);
      extension = await session.extensions.loadExtension(directory, options);
      expected = backgroundURL(extension);
      if (!expected) return extension; // Lazy MV2, MV3 and content-only unchanged.
      // Also catches a host already completed before the native promise result.
      for (const contents of webContents.getAllWebContents()) observe(contents);
      await new Promise((resolve, reject) => {
        finish = error => {
          if (!finish) return;
          finish = null;
          error ? reject(error) : resolve();
        };
        timer = setTimeout(() => finish?.(new ExtensionRuntimeError('EXTENSION_BACKGROUND_TIMEOUT', `The extension background document did not finish loading within ${timeoutMs} ms: ${expected}`)), timeoutMs);
        evaluate();
      });
      return extension;
    } finally {
      finish = null;
      clearTimeout(timer);
      app.removeListener('web-contents-created', created);
      session.extensions.removeListener('extension-unloaded', onUnloaded);
      session.extensions.removeListener('extension-loaded', onLoaded);
      for (const record of records.values()) for (const [event, handler] of record.listeners) record.contents.removeListener(event, handler);
      records.clear();
    }
  };
}

module.exports = {createExtensionLoader, ExtensionRuntimeError};
