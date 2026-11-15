'use strict';

// Origin-scoped permission policy. Electron owns the platform API and user-gesture
// enforcement; this service owns consent, its lifetime, and durable decisions.
const crypto = require('node:crypto');
const storage = require('./storage.cjs');

const SUPPORTED_PERMISSIONS = Object.freeze([
  'camera', 'microphone', 'notifications', 'geolocation', 'geolocation-approximate',
  'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'pointerLock',
  'mediaKeySystem', 'midi', 'midiSysex', 'persistent-storage', 'screen-wake-lock',
  'local-fonts', 'idle-detection', 'sensors', 'keyboardLock',
]);
const supported = new Set(SUPPORTED_PERMISSIONS);

function secureOrigin(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.origin === 'null') return null;
    const hostname = url.hostname.toLowerCase();
    const loopback = hostname === 'localhost' || hostname.endsWith('.localhost') ||
      hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return null;
    return url.origin;
  } catch { return null; }
}

function identityName(value) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || /[\x00-\x1f\x7f]/.test(value)) {
    throw storage.fail('A nonempty identity name is required.');
  }
  return value;
}

function ruleId(identity, requestingOrigin, embeddingOrigin, permission) {
  return crypto.createHash('sha256').update(JSON.stringify([identity, requestingOrigin, embeddingOrigin, permission])).digest('hex');
}

function record(value, keys, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw storage.fail(`${name} must be an object.`);
  if (Object.keys(value).some(key => !keys.includes(key))) {
    throw storage.fail(`${name} contains fields this version cannot safely interpret.`, 'UNSUPPORTED_DATA');
  }
}

function decode(value) {
  record(value, ['version', 'rules'], 'Permission data');
  if (value.version !== 1) throw storage.fail('This permission data version is not supported; the original file is preserved.', 'UNSUPPORTED_VERSION');
  if (!Array.isArray(value.rules)) throw storage.fail('Permission rules must be an array.');
  const seen = new Set();
  const rules = value.rules.map(item => {
    record(item, ['id', 'identity', 'requestingOrigin', 'embeddingOrigin', 'permission', 'decision'], 'Permission rule');
    const identity = identityName(item.identity);
    if (!secureOrigin(item.requestingOrigin) || secureOrigin(item.requestingOrigin) !== item.requestingOrigin ||
        !secureOrigin(item.embeddingOrigin) || secureOrigin(item.embeddingOrigin) !== item.embeddingOrigin) {
      throw storage.fail('Permission rules require canonical secure origins.');
    }
    if (!supported.has(item.permission)) throw storage.fail('A permission rule is not supported by this version.', 'UNSUPPORTED_DATA');
    if (!['allow', 'block'].includes(item.decision)) throw storage.fail('A permission decision must be allow or block.');
    const id = ruleId(identity, item.requestingOrigin, item.embeddingOrigin, item.permission);
    if (item.id !== id || seen.has(id)) throw storage.fail('Permission rule IDs must match their unique origin and identity tuple.');
    seen.add(id);
    return {id, identity, requestingOrigin: item.requestingOrigin, embeddingOrigin: item.embeddingOrigin,
      permission: item.permission, decision: item.decision};
  });
  rules.sort((a, b) => a.id.localeCompare(b.id));
  return {version: 1, rules};
}

function permissionNames(permission, details, checking = false) {
  if (permission === 'media') {
    const types = checking ? [details?.mediaType] : details?.mediaTypes;
    if (!Array.isArray(types) || !types.length || types.some(type => type !== 'audio' && type !== 'video')) return null;
    return [...new Set(types.map(type => type === 'audio' ? 'microphone' : 'camera'))].sort();
  }
  // Camera and microphone are policy names, not Electron permission enum values.
  if (permission === 'camera' || permission === 'microphone' || !supported.has(permission)) return null;
  return [permission];
}

function frameInfo(frame) {
  if (!frame || frame.detached || frame.isDestroyed?.() || !Number.isSafeInteger(frame.frameTreeNodeId) || frame.frameTreeNodeId < 0) return null;
  const origin = secureOrigin(frame.origin);
  if (!origin || secureOrigin(frame.url) !== origin) return null;
  return {frame, id: frame.frameTreeNodeId, origin, url: frame.url,
    token: frame.frameToken, processId: frame.processId, routingId: frame.routingId};
}

class PermissionManager {
  constructor({file, prompt = async () => 'block', onChange = () => {}} = {}) {
    if (typeof file !== 'string' || !file) throw new TypeError('PermissionManager requires a file path.');
    if (typeof prompt !== 'function' || typeof onChange !== 'function') throw new TypeError('Permission callbacks must be functions.');
    this.file = file;
    this.prompt = prompt;
    this.onChange = onChange;
    this.status = 'unopened';
    this.error = null;
    this.inspection = null;
    this._rules = new Map();
    this._temporary = new Map();
    this._pending = new Map();
    this._sessions = new Map();
    this._contents = new Map();
    this._nextContents = 0;
    this._disposed = false;
  }

  open() {
    if (this._disposed) throw storage.fail('The permission manager has been disposed.');
    this._cancelPending();
    this._temporary.clear();
    this._rules.clear();
    this.status = 'unopened';
    this.error = null;
    try {
      this.inspection = storage.inspect(this.file, decode, () => ({version: 1, rules: []}));
      this.status = this.inspection.status;
      if (this.status !== 'recovery') this._rules = new Map(this.inspection.value.rules.map(item => [item.id, item]));
      else this.error = this.inspection.reason;
      this._notify();
      return this.inspection;
    } catch (error) {
      this.status = 'error'; this.error = error.message; this.inspection = null; this._notify();
      throw error;
    }
  }

  recover(preview) {
    if (this._disposed) throw storage.fail('The permission manager has been disposed.');
    const outcome = storage.recover(this.file, preview, decode);
    return {...this.open(), preserved: outcome.preserved};
  }

  attach(session, identity) {
    identityName(identity);
    if (this._disposed) throw storage.fail('The permission manager has been disposed.');
    if (!session || typeof session.setPermissionCheckHandler !== 'function' || typeof session.setPermissionRequestHandler !== 'function') {
      throw new TypeError('An Electron Session is required.');
    }
    const existing = this._sessions.get(session);
    if (existing) {
      if (existing.identity !== identity) throw storage.fail('A session cannot be reassigned to a different permission identity.');
      return existing.detach;
    }
    const binding = {identity, active: true};
    binding.detach = () => {
      if (!binding.active) return;
      binding.active = false;
      this._sessions.delete(session);
      for (const [wc, state] of this._contents) if (state.session === session) this._releaseContents(wc, state);
      // Never reset to Electron's default permissive handlers on disposal.
      session.setPermissionCheckHandler(() => false);
      session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
      session.setDevicePermissionHandler?.(() => false);
      session.setDisplayMediaRequestHandler?.((_request, callback) => callback(null));
    };
    this._sessions.set(session, binding);
    session.setPermissionCheckHandler((wc, permission, origin, details) => {
      try { return binding.active && this._check(session, identity, wc, permission, origin, details); }
      catch { return false; }
    });
    session.setPermissionRequestHandler((wc, permission, callback, details) => {
      let responded = false;
      const respond = allowed => {
        if (responded) return;
        responded = true;
        try { callback(Boolean(allowed)); } catch { /* A destroyed requester cannot receive its response. */ }
      };
      try {
        if (!binding.active) respond(false);
        else this._request(session, identity, wc, permission, details, respond);
      } catch { respond(false); }
    });
    // Device and display capture require a real device/source picker. A general
    // origin prompt must not silently approve an arbitrary device or screen.
    session.setDevicePermissionHandler?.(() => false);
    session.setDisplayMediaRequestHandler?.((_request, callback) => callback(null));
    return binding.detach;
  }

  list() {
    const durable = [...this._rules.values()].map(item => ({...item, scope: 'persistent'}));
    const temporary = [];
    for (const [id, item] of this._temporary) {
      if (this._valid(item.context, false)) temporary.push({...item.rule, id, decision: 'allow-once', scope: 'document', webContentsId: item.context.wc.id});
      else this._temporary.delete(id);
    }
    return [...durable, ...temporary].sort((a, b) => a.identity.localeCompare(b.identity) ||
      a.requestingOrigin.localeCompare(b.requestingOrigin) || a.permission.localeCompare(b.permission) || a.id.localeCompare(b.id));
  }

  revoke(id) {
    this._requireReady();
    if (typeof id !== 'string') throw storage.fail('A permission rule ID is required.');
    const durable = this._rules.has(id), temporary = this._temporary.has(id);
    if (!durable && !temporary) return false;
    if (durable) this._persist([...this._rules.values()].filter(item => item.id !== id));
    this._temporary.delete(id);
    this._cancelPending();
    this._notify();
    return true;
  }

  reset(identity) {
    this._requireReady();
    if (identity !== undefined) identityName(identity);
    const remaining = [...this._rules.values()].filter(item => identity !== undefined && item.identity !== identity);
    if (remaining.length !== this._rules.size) this._persist(remaining);
    for (const [id, item] of this._temporary) if (identity === undefined || item.rule.identity === identity) this._temporary.delete(id);
    this._cancelPending();
    this._notify();
    return true;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.status = 'disposed';
    this._cancelPending();
    this._temporary.clear();
    for (const binding of [...this._sessions.values()]) binding.detach();
    this._notify();
  }

  _ready() { return !this._disposed && (this.status === 'ready' || this.status === 'new'); }
  _requireReady() { if (!this._ready()) throw storage.fail('Permissions are unavailable until their saved data is opened or explicitly recovered.', 'RECOVERY_REQUIRED'); }
  _notify() { try { this.onChange({status: this.status, error: this.error}); } catch { /* UI listeners cannot change permission policy. */ } }

  _persist(rules) {
    this._requireReady();
    const document = decode({version: 1, rules});
    try { storage.write(this.file, document, decode); }
    catch (error) {
      this.status = 'error'; this.error = error.message;
      this._temporary.clear(); this._cancelPending(); this._notify();
      throw error;
    }
    this._rules = new Map(document.rules.map(item => [item.id, item]));
    this.status = 'ready'; this.error = null;
  }

  _track(wc, session) {
    let state = this._contents.get(wc);
    if (state) return state;
    state = {session, serial: ++this._nextContents, generation: 0, epochs: new Map(), listeners: []};
    const navigation = (details, _url, oldSameDocument, oldMainFrame, oldProcess, oldRouting) => {
      const sameDocument = typeof details?.isSameDocument === 'boolean' ? details.isSameDocument : oldSameDocument === true;
      const main = typeof details?.isMainFrame === 'boolean' ? details.isMainFrame : oldMainFrame;
      let frame = details?.frame;
      if (!frame && main !== true) {
        try { frame = wc.mainFrame.framesInSubtree.find(item => item.processId === oldProcess && item.routingId === oldRouting); } catch { /* Already detached. */ }
      }
      const id = frame?.frameTreeNodeId;
      const all = main === true || !Number.isSafeInteger(id);
      const affected = context => context.wc === wc && (all || context.chain.some(item => item.id === id));
      this._cancelPending(entry => affected(entry.context));
      let changed = false;
      if (!sameDocument) {
        if (all) { state.generation++; state.epochs.clear(); }
        else state.epochs.set(id, (state.epochs.get(id) || 0) + 1);
        for (const [key, grant] of this._temporary) if (affected(grant.context)) { this._temporary.delete(key); changed = true; }
      }
      if (changed) this._notify();
    };
    const gone = () => this._releaseContents(wc, state);
    for (const [event, listener] of [['did-start-navigation', navigation], ['destroyed', gone], ['render-process-gone', gone]]) {
      wc.on(event, listener); state.listeners.push([event, listener]);
    }
    this._contents.set(wc, state);
    return state;
  }

  _releaseContents(wc, state) {
    this._cancelPending(entry => entry.context.wc === wc);
    let changed = false;
    for (const [id, grant] of this._temporary) if (grant.context.wc === wc) { this._temporary.delete(id); changed = true; }
    for (const [event, listener] of state.listeners) wc.removeListener(event, listener);
    if (this._contents.get(wc) === state) this._contents.delete(wc);
    if (changed) this._notify();
  }

  _context(session, identity, wc, details, providedOrigin) {
    if (!wc || wc.isDestroyed() || wc.session !== session || typeof details?.isMainFrame !== 'boolean' || typeof details.requestingUrl !== 'string') return null;
    const main = wc.mainFrame, mainInfo = frameInfo(main);
    if (!mainInfo) return null;
    let frame;
    if (details.isMainFrame) frame = main;
    else {
      const candidates = [...new Set(main.framesInSubtree)].filter(item => {
        const info = frameInfo(item);
        return item !== main && info && info.url === details.requestingUrl &&
          (providedOrigin === undefined || info.origin === secureOrigin(providedOrigin)) &&
          (details.securityOrigin === undefined || info.origin === secureOrigin(details.securityOrigin));
      });
      // Electron's request details do not identify the frame. Two matching child
      // documents cannot be safely treated as one document-scoped consent.
      if (candidates.length !== 1) return null;
      [frame] = candidates;
    }
    const info = frameInfo(frame);
    if (!info || info.url !== details.requestingUrl || (providedOrigin !== undefined && secureOrigin(providedOrigin) !== info.origin) ||
        (details.securityOrigin !== undefined && secureOrigin(details.securityOrigin) !== info.origin) ||
        (details.embeddingOrigin !== undefined && secureOrigin(details.embeddingOrigin) !== mainInfo.origin)) return null;
    const state = this._track(wc, session), chain = [], seen = new Set();
    let current = frame;
    while (current) {
      const entry = frameInfo(current);
      if (!entry || seen.has(entry.id)) return null;
      seen.add(entry.id); chain.push({...entry, epoch: state.epochs.get(entry.id) || 0});
      if (current === main) break;
      current = current.parent;
    }
    if (chain.at(-1)?.frame !== main) return null;
    const documentKey = JSON.stringify([state.serial, state.generation, chain.map(item => [item.id, item.epoch, item.token])]);
    return {wc, session, identity, requestingOrigin: info.origin, embeddingOrigin: mainInfo.origin,
      state, generation: state.generation, chain, documentKey};
  }

  _valid(context, strictUrl = true) {
    try {
      if (!this._ready() || context.wc.isDestroyed() || context.wc.session !== context.session ||
          this._contents.get(context.wc) !== context.state || context.state.generation !== context.generation ||
          context.wc.mainFrame !== context.chain.at(-1).frame) return false;
      return context.chain.every((entry, index) => {
        const current = frameInfo(entry.frame);
        return current && current.id === entry.id && current.origin === entry.origin &&
          (!strictUrl || current.url === entry.url) && current.token === entry.token &&
          current.processId === entry.processId && current.routingId === entry.routingId &&
          (context.state.epochs.get(entry.id) || 0) === entry.epoch &&
          (index === context.chain.length - 1 || entry.frame.parent === context.chain[index + 1].frame);
      });
    } catch { return false; }
  }

  _rule(context, permission, decision) {
    const {identity, requestingOrigin, embeddingOrigin} = context;
    return {id: ruleId(identity, requestingOrigin, embeddingOrigin, permission), identity, requestingOrigin, embeddingOrigin, permission, decision};
  }
  _temporaryId(context, id) { return `once:${crypto.createHash('sha256').update(`${context.documentKey}:${id}`).digest('hex')}`; }
  _decision(context, permission) {
    const id = this._rule(context, permission).id;
    const durable = this._rules.get(id);
    if (durable?.decision === 'block') return 'block';
    if (durable?.decision === 'allow') return 'allow';
    const temporary = this._temporary.get(this._temporaryId(context, id));
    return temporary && this._valid(temporary.context, false) ? 'allow' : null;
  }

  _check(session, identity, wc, permission, origin, details) {
    if (!this._ready()) return false;
    const names = permissionNames(permission, details, true);
    if (!names) return false;
    if (!wc) {
      // Electron omits WebContents for service-worker notification checks. Only
      // an explicit persistent same-origin notification grant is eligible;
      // document grants and embedding-page grants never become worker grants.
      if (permission !== 'notifications') return false;
      const requestingOrigin = secureOrigin(origin);
      const embeddingOrigin = details?.embeddingOrigin !== undefined ? secureOrigin(details.embeddingOrigin) : requestingOrigin;
      return Boolean(requestingOrigin && requestingOrigin === embeddingOrigin &&
        this._rules.get(ruleId(identity, requestingOrigin, embeddingOrigin, 'notifications'))?.decision === 'allow');
    }
    const context = this._context(session, identity, wc, details, origin);
    return Boolean(context && this._valid(context) && names.every(name => this._decision(context, name) === 'allow'));
  }

  _request(session, identity, wc, permission, details, respond) {
    if (!this._ready()) { respond(false); return; }
    const names = permissionNames(permission, details);
    if (!names) { respond(false); return; }
    const context = this._context(session, identity, wc, details);
    if (!context || !this._valid(context)) { respond(false); return; }
    const decisions = names.map(name => this._decision(context, name));
    if (decisions.includes('block')) { respond(false); return; }
    const undecided = names.filter((_name, index) => decisions[index] !== 'allow');
    if (!undecided.length) { respond(true); return; }
    const key = JSON.stringify([context.documentKey, identity, context.requestingOrigin, context.embeddingOrigin, names]);
    const existing = this._pending.get(key);
    if (existing) { existing.callbacks.push(respond); return; }
    const entry = {key, context, permissions: undecided, callbacks: [respond], active: true, controller: new AbortController()};
    this._pending.set(key, entry);
    const request = {requestId: crypto.randomUUID(), identity, requestingOrigin: context.requestingOrigin,
      embeddingOrigin: context.embeddingOrigin, permissions: [...undecided], webContentsId: wc.id};
    // Non-enumerable so a renderer-facing spread of request metadata cannot try
    // to serialize AbortSignal. The main-process prompt can dismiss stale UI.
    Object.defineProperty(request, 'signal', {value: entry.controller.signal});
    Promise.resolve().then(() => entry.active ? this.prompt(request) : 'block').then(answer => {
      if (!entry.active) return;
      const decision = typeof answer === 'string' ? answer : answer?.decision;
      if (!this._valid(context) || names.some(name => this._decision(context, name) === 'block') ||
          !['allow-once', 'allow', 'block'].includes(decision)) { this._settle(entry, false); return; }
      try {
        if (decision === 'allow-once') {
          for (const name of undecided) {
            const rule = this._rule(context, name, 'allow');
            this._temporary.set(this._temporaryId(context, rule.id), {rule, context});
          }
        } else {
          const updated = new Map(this._rules);
          for (const name of undecided) {
            const rule = this._rule(context, name, decision); updated.set(rule.id, rule);
          }
          this._persist([...updated.values()]);
        }
        this._settle(entry, decision !== 'block' && this._valid(context));
        this._notify();
      } catch { this._settle(entry, false); }
    }, () => this._settle(entry, false));
  }

  _settle(entry, allowed) {
    if (!entry.active) return;
    entry.active = false;
    if (this._pending.get(entry.key) === entry) this._pending.delete(entry.key);
    entry.controller.abort();
    for (const callback of entry.callbacks) callback(allowed);
  }
  _cancelPending(predicate = () => true) {
    for (const entry of [...this._pending.values()]) if (predicate(entry)) this._settle(entry, false);
  }
}

module.exports = {PermissionManager, SUPPORTED_PERMISSIONS, decode, ruleId, secureOrigin};
