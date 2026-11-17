'use strict';

// Local credentials are an encrypted document, including their usernames and
// origins. This is OS-account protection, not a primary password or OS reauth.
// Locking drops application references; JavaScript cannot guarantee zeroization.
const crypto = require('node:crypto');
const {isDeepStrictEqual} = require('node:util');
const storage = require('./storage.cjs');
const {record, identity, identities, text, timestamp, id} = require('./service-store.cjs');

function exactKeys(value, allowed, label) {
  record(value, label);
  if (Object.keys(value).some(key => !allowed.includes(key))) throw storage.fail(`${label} uses unsupported fields; the original data was preserved.`, 'UNSUPPORTED_DATA');
}
function origin(value) {
  if (typeof value !== 'string') throw storage.fail('An exact website origin is required.');
  let parsed;
  try { parsed = new URL(value); } catch { throw storage.fail('An exact website origin is required.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if ((parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw storage.fail('Use an exact HTTPS origin, or HTTP loopback origin for local testing.');
  }
  return parsed.origin;
}
function envelope(value) {
  exactKeys(value, ['version', 'encryption', 'api', 'ciphertext'], 'Password checkpoint');
  if (value.version !== 1) throw storage.fail('This password checkpoint version is unsupported; its original bytes were preserved.', 'UNSUPPORTED_VERSION');
  if (value.encryption !== 'electron-safe-storage' || !['async', 'sync'].includes(value.api)) throw storage.fail('This password protection format is unsupported; its original bytes were preserved.', 'UNSUPPORTED_DATA');
  if (typeof value.ciphertext !== 'string' || !value.ciphertext || Buffer.from(value.ciphertext, 'base64').toString('base64') !== value.ciphertext) throw storage.fail('The encrypted password checkpoint is malformed.');
  return {version:1, encryption:value.encryption, api:value.api, ciphertext:value.ciphertext};
}
function document(value) {
  exactKeys(value, ['version', 'logins'], 'Encrypted password document');
  if (value.version !== 1) throw storage.fail('The encrypted password document version is unsupported.', 'UNSUPPORTED_VERSION');
  if (!Array.isArray(value.logins)) throw storage.fail('The encrypted password collection is malformed.');
  const seen = new Set(), scopes = new Set();
  const logins = value.logins.map(login => {
    exactKeys(login, ['id', 'identity', 'origin', 'username', 'password', 'created', 'modified'], 'Encrypted login');
    id(login.id); identity(login.identity); text(login.username, 'Username'); text(login.password, 'Password');
    if (!login.password) throw storage.fail('The encrypted login contains an empty password.');
    const site = origin(login.origin);
    if (site !== login.origin) throw storage.fail('The encrypted login origin is not canonical.', 'UNSUPPORTED_DATA');
    timestamp(login.created); timestamp(login.modified);
    if (login.modified < login.created) throw storage.fail('Encrypted login timestamps are inconsistent.');
    const scope = JSON.stringify([login.identity, site, login.username]);
    if (seen.has(login.id) || scopes.has(scope)) throw storage.fail('Encrypted login identities are ambiguous.', 'UNSUPPORTED_DATA');
    seen.add(login.id); scopes.add(scope);
    return {...login};
  });
  identities(logins.map(login => login.identity));
  return {version:1, logins};
}
function metadata(login) {
  const {password: _password, ...result} = login;
  return {...result};
}
function optionalBytes(file) {
  try { return storage.readRegular(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

class PasswordStore {
  constructor({file, safeStorage, getIdentities = null, onChange = () => {}, now = Date.now, platform = process.platform}) {
    if (typeof file !== 'string' || !file || !safeStorage) throw new TypeError('Password storage requires a file and OS safeStorage provider.');
    if (typeof onChange !== 'function' || typeof now !== 'function' || (getIdentities !== null && typeof getIdentities !== 'function')) throw new TypeError('Password storage callbacks must be functions.');
    this.file = file; this.safeStorage = safeStorage; this.getIdentities = getIdentities;
    this.onChange = onChange; this.now = now; this.platform = platform;
    this.status = 'unopened'; this.error = null; this.inspection = null;
    this._document = null; this._envelope = null; this._snapshot = null;
    this._generation = 0; this._queue = Promise.resolve(); this._disposed = false;
    this._available = false; this._protection = 'unavailable';
  }
  state() {
    return {status:this.status, locked:this._document === null, encryptionAvailable:this._available, protection:this._protection, error:this.error};
  }
  _emit(type = 'status') {
    try { this.onChange({type, ...this.state()}); } catch { /* An observer cannot undo a durable write. */ }
  }
  _alive() { if (this._disposed) throw storage.fail('Password storage is closed.', 'DISPOSED'); }
  _token(token) { this._alive(); if (token !== this._generation) throw storage.fail('Password storage was locked while the operation was pending.', 'LOCKED'); }
  _ready() {
    this._alive();
    if (!['new', 'ready'].includes(this.status)) throw storage.fail('Open or explicitly recover password storage before using it.', 'RECOVERY_REQUIRED');
  }
  _unlocked() { this._ready(); if (!this._document) throw storage.fail('Unlock password storage before using it.', 'LOCKED'); }
  _identity(value) {
    identity(value);
    if (this.getIdentities) {
      const allowed = this.getIdentities();
      if (!Array.isArray(allowed)) throw storage.fail('Browser identities are unavailable.');
      identities(allowed);
      if (!allowed.includes(value)) throw storage.fail('Unknown browser identity.', 'NOT_FOUND');
    }
    return value;
  }
  _enqueue(operation) {
    const token = this._generation;
    const pending = this._queue.then(() => { this._token(token); return operation(token); });
    this._queue = pending.catch(() => {});
    return pending;
  }
  lock() {
    this._alive(); this._generation++; this._document = null; this._emit();
    return this.state();
  }
  dispose() {
    if (this._disposed) return;
    this.lock(); this._disposed = true; this.status = 'disposed'; this._snapshot = null; this.inspection = null; this._emit();
  }
  _bytes() { return {primary:optionalBytes(this.file), previous:optionalBytes(`${this.file}.previous`)}; }
  _assertUnchanged() {
    if (!isDeepStrictEqual(this._bytes(), this._snapshot)) throw storage.fail('Password storage changed outside this service. Reopen it before editing.', 'STALE_PREVIEW');
  }
  open() {
    this.lock();
    return this._enqueue(() => {
      try {
        const opened = storage.inspect(this.file, envelope, () => null);
        const snapshot = this._bytes();
        const chosen = opened.status === 'recovery' ? snapshot.previous : snapshot.primary;
        if (!isDeepStrictEqual(chosen ? envelope(storage.parse(chosen)) : null, opened.value)) throw storage.fail('Password storage changed during inspection.', 'STALE_PREVIEW');
        this._snapshot = snapshot; this._envelope = opened.status === 'recovery' ? null : opened.value;
        this.inspection = opened.preview ? {status:opened.status, reason:opened.reason, preview:opened.preview} : {status:opened.status};
        this.status = opened.status; this.error = opened.status === 'recovery' ? 'The password checkpoint needs explicit recovery.' : null;
        this._emit(); return this.state();
      } catch (error) {
        this.status = 'error'; this.error = 'Password storage could not be opened; existing files were preserved.'; this.inspection = null; this._emit(); throw error;
      }
    });
  }
  async _crypto() {
    this._alive(); const provider = this.safeStorage;
    this._available = false; this._protection = 'unavailable';
    try {
      // Electron45 does not expose the async Linux provider identity. Never
      // trust its availability boolean as proof that its fallback is secure.
      if (this.platform === 'linux') {
        const selected = provider.getSelectedStorageBackend?.();
        if (!['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'].includes(selected) || typeof provider.isEncryptionAvailable !== 'function' || !provider.isEncryptionAvailable() || typeof provider.encryptString !== 'function' || typeof provider.decryptString !== 'function') throw new Error('unavailable');
        this._available = true; this._protection = `linux-${selected}`; return {api:'sync'};
      }
      // A reported plaintext backend is always rejected, including injected
      // test providers. Windows and macOS normally do not expose this method.
      if (typeof provider.getSelectedStorageBackend === 'function' && ['basic_text', 'unknown'].includes(provider.getSelectedStorageBackend())) throw new Error('unavailable');
      if (!['win32', 'darwin'].includes(this.platform)) throw new Error('unavailable');
      if (typeof provider.isAsyncEncryptionAvailable === 'function' && typeof provider.encryptStringAsync === 'function' && typeof provider.decryptStringAsync === 'function') {
        if (!await provider.isAsyncEncryptionAvailable()) throw new Error('unavailable');
        this._available = true; this._protection = this.platform === 'win32' ? 'windows-dpapi' : 'macos-keychain'; return {api:'async'};
      }
      // Older supported providers may use their OS-backed synchronous API.
      if (typeof provider.isEncryptionAvailable !== 'function' || !provider.isEncryptionAvailable() || typeof provider.encryptString !== 'function' || typeof provider.decryptString !== 'function') throw new Error('unavailable');
      this._available = true; this._protection = this.platform === 'win32' ? 'windows-dpapi' : 'macos-keychain'; return {api:'sync'};
    } catch { throw storage.fail('Secure OS password encryption is unavailable. No plaintext fallback is permitted.', 'ENCRYPTION_UNAVAILABLE'); }
  }
  async _encrypt(candidate, token) {
    const mode = await this._crypto(); this._token(token);
    let encrypted;
    try {
      const plain = JSON.stringify(document(candidate));
      encrypted = mode.api === 'async' ? await this.safeStorage.encryptStringAsync(plain) : this.safeStorage.encryptString(plain);
    } catch { throw storage.fail('Password encryption failed; the existing checkpoint was preserved.', 'ENCRYPTION_FAILED'); }
    this._token(token);
    if (!Buffer.isBuffer(encrypted) || !encrypted.length) throw storage.fail('The OS password provider returned invalid ciphertext.', 'ENCRYPTION_FAILED');
    return envelope({version:1, encryption:'electron-safe-storage', api:mode.api, ciphertext:encrypted.toString('base64')});
  }
  async _persist(candidate, token) {
    const encrypted = await this._encrypt(candidate, token);
    this._token(token); this._assertUnchanged();
    // No await between the optimistic conflict check and durable replacement.
    // storage.write validates both checkpoints before touching either one.
    const before = this._snapshot, written = storage.write(this.file, encrypted, envelope);
    const expected = {
      primary:written.changed ? Buffer.from(`${JSON.stringify(encrypted, null, 2)}\n`) : before.primary,
      previous:written.changed ? before.primary : before.previous || before.primary
    };
    const snapshot = this._bytes();
    if (!isDeepStrictEqual(snapshot, expected)) throw storage.fail('Password storage changed during its save. Reopen it before editing.', 'STALE_PREVIEW');
    this._snapshot = snapshot; this._envelope = encrypted;
    this.status = 'ready'; this.error = null; this.inspection = {status:'ready'};
  }
  async _decrypt(encrypted, mode, token) {
    let result, rotate = false;
    try {
      const bytes = Buffer.from(encrypted.ciphertext, 'base64');
      if (mode.api === 'sync' && encrypted.api !== 'sync') throw new Error('provider mismatch');
      if (mode.api === 'async') {
        const returned = await this.safeStorage.decryptStringAsync(bytes);
        if (!returned || typeof returned.result !== 'string' || typeof returned.shouldReEncrypt !== 'boolean') throw new Error('invalid response');
        result = returned.result; rotate = returned.shouldReEncrypt;
      } else result = this.safeStorage.decryptString(bytes);
    } catch { throw storage.fail('Password decryption failed. The OS key may be unavailable or the checkpoint damaged; existing files were preserved.', 'DECRYPTION_FAILED'); }
    this._token(token);
    try { return {decoded:document(storage.parse(result)), rotate}; }
    catch (error) {
      const code = ['UNSUPPORTED_VERSION', 'UNSUPPORTED_DATA'].includes(error.code) ? error.code : 'INVALID_DATA';
      throw storage.fail('The encrypted password document is unsupported or damaged; its original bytes were preserved.', code);
    }
  }
  async _offerPrevious(mode, token) {
    this._token(token); this._assertUnchanged();
    const {primary, previous} = this._snapshot;
    if (!previous) return;
    await this._decrypt(envelope(storage.parse(previous)), mode, token);
    this._token(token); this._assertUnchanged();
    const reason = 'The current encrypted checkpoint cannot be read. A readable older checkpoint is available for explicit recovery.';
    this.inspection = {status:'recovery', reason, preview:{primary, previous}};
    this.status = 'recovery'; this.error = reason; this._emit();
  }
  unlock() {
    return this._enqueue(async token => {
      this._ready(); this._assertUnchanged(); this._document = null;
      const mode = await this._crypto(); this._token(token);
      let decoded = {version:1, logins:[]}, rotate = false;
      if (this._envelope) {
        try {
          ({decoded, rotate} = await this._decrypt(this._envelope, mode, token));
        } catch (error) {
          // Future formats must stay untouched. Damage may offer an explicitly
          // selected older checkpoint, after proving that it can be decrypted.
          if (['DECRYPTION_FAILED', 'INVALID_DATA'].includes(error.code)) {
            try { await this._offerPrevious(mode, token); }
            catch (previousError) { if (['LOCKED', 'DISPOSED', 'STALE_PREVIEW'].includes(previousError.code)) throw previousError; }
          }
          throw error;
        }
      }
      this._token(token); this._assertUnchanged();
      // Re-encrypt with the provider's current key only after a complete decode.
      if (rotate) await this._persist(decoded, token);
      this._token(token); this._document = decoded; this.error = null; this._emit();
      return this.state();
    });
  }
  list(scope, options = {}) {
    this._unlocked(); this._identity(scope);
    exactKeys(options, ['origin'], 'Password list options');
    const site = options.origin === undefined ? null : origin(options.origin);
    return this._document.logins.filter(login => login.identity === scope && (!site || login.origin === site)).map(metadata);
  }
  save(request) {
    let input;
    try { input = structuredClone(request); } catch { return Promise.reject(storage.fail('A serializable login is required.')); }
    return this._enqueue(async token => {
      this._unlocked(); exactKeys(input, ['id', 'identity', 'origin', 'username', 'password'], 'Password save request');
      this._identity(input.identity); const site = origin(input.origin);
      text(input.username, 'Username'); text(input.password, 'Password');
      if (!input.password) throw storage.fail('A nonempty password is required.');
      if (input.id !== undefined) id(input.id);
      const candidate = structuredClone(this._document);
      let previous = input.id === undefined ? candidate.logins.find(login => login.identity === input.identity && login.origin === site && login.username === input.username) : candidate.logins.find(login => login.id === input.id && login.identity === input.identity);
      if (input.id !== undefined && !previous) throw storage.fail('The saved login does not belong to this browser identity.', 'NOT_FOUND');
      const current = timestamp(this.now());
      const login = {id:previous?.id || crypto.randomUUID(), identity:input.identity, origin:site, username:input.username, password:input.password, created:previous?.created ?? current, modified:Math.max(current, previous?.modified ?? current)};
      if (previous) candidate.logins[candidate.logins.indexOf(previous)] = login; else candidate.logins.push(login);
      document(candidate);
      if (previous && isDeepStrictEqual({...previous, modified:login.modified}, login)) { this._assertUnchanged(); return metadata(previous); }
      await this._persist(candidate, token); this._token(token); this._document = candidate; this._emit('changed');
      return metadata(login);
    });
  }
  reveal(scope, loginId, expectedOrigin) {
    return this._enqueue(async token => {
      this._unlocked(); this._identity(scope); id(loginId); this._assertUnchanged();
      await this._crypto(); this._token(token); this._assertUnchanged();
      const login = this._document.logins.find(item => item.id === loginId && item.identity === scope);
      if (!login || (expectedOrigin !== undefined && login.origin !== origin(expectedOrigin))) throw storage.fail('No saved login matches this identity and exact origin.', 'NOT_FOUND');
      return {...login};
    });
  }
  remove(scope, loginId) {
    return this._enqueue(async token => {
      this._unlocked(); this._identity(scope); id(loginId);
      const candidate = structuredClone(this._document), index = candidate.logins.findIndex(login => login.id === loginId && login.identity === scope);
      if (index < 0) throw storage.fail('The saved login does not belong to this browser identity.', 'NOT_FOUND');
      candidate.logins.splice(index, 1); await this._persist(candidate, token); this._token(token);
      this._document = candidate; this._emit('changed'); return {removed:true};
    });
  }
  recover(preview = this.inspection?.preview) {
    this.lock();
    return this._enqueue(() => {
      if (this.inspection?.status !== 'recovery') throw storage.fail('Inspect a recoverable password checkpoint before restoring it.', 'RECOVERY_REQUIRED');
      const restored = storage.recover(this.file, preview, envelope);
      const opened = storage.inspect(this.file, envelope, () => null);
      const snapshot = this._bytes();
      if (!isDeepStrictEqual(snapshot, {primary:preview.previous, previous:preview.previous})) throw storage.fail('Password storage changed during recovery. Reopen it before editing.', 'STALE_PREVIEW');
      this._envelope = opened.value; this._snapshot = snapshot; this.inspection = {status:opened.status};
      this.status = opened.status; this.error = null; this._emit();
      return {...this.state(), preserved:restored.preserved};
    });
  }
}

module.exports = {PasswordStore, origin};
