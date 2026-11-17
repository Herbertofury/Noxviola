'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {PasswordStore, origin} = require('../browser/passwords.cjs');

// Synthetic authenticated crypto validates service semantics without claiming
// that Node unit tests prove the native DPAPI integration. The app test does.
function safeProvider({key = crypto.randomBytes(32), backend, available = true, async = true, rotate = false} = {}) {
  const counts = {encrypt:0, decrypt:0, availability:0};
  const encrypt = value => {
    counts.encrypt++;
    const nonce = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]);
  };
  const decrypt = value => {
    counts.decrypt++;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
    decipher.setAuthTag(value.subarray(12, 28));
    return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8');
  };
  const provider = {counts, isEncryptionAvailable:() => available, encryptString:encrypt, decryptString:decrypt};
  if (backend !== undefined) provider.getSelectedStorageBackend = () => backend;
  if (async) Object.assign(provider, {
    isAsyncEncryptionAvailable:async () => { counts.availability++; return available; },
    encryptStringAsync:async value => encrypt(value),
    decryptStringAsync:async value => ({result:decrypt(value), shouldReEncrypt:rotate})
  });
  return provider;
}
function setup(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nox-passwords-'));
  t.after(() => fs.rmSync(directory, {recursive:true, force:true}));
  const file = path.join(directory, 'passwords.json'), provider = options.safeStorage || safeProvider();
  const events = [];
  const create = (extra = {}) => new PasswordStore({file, safeStorage:provider, platform:'win32', getIdentities:() => ['personal', 'work'], onChange:event => events.push(event), ...options, ...extra});
  return {directory, file, provider, events, create};
}
const login = (changes = {}) => ({identity:'personal', origin:'https://example.test', username:'synthetic@example.test', password:'Synthetic secret α & "quotes"\n', ...changes});
const code = expected => error => error.code === expected;

test('passwords encrypt the complete document and retain stable identity-scoped records across restart', async t => {
  const {file, provider, events, create} = setup(t);
  let store = create({now:() => 1000});
  assert.equal((await store.open()).locked, true);
  assert.throws(() => store.list('personal'), code('LOCKED'));
  assert.equal((await store.unlock()).protection, 'windows-dpapi');
  const first = await store.save(login()), second = await store.save(login({identity:'work', password:'Synthetic work password'}));
  assert.equal('password' in first, false);
  assert.equal(store.list('personal').length, 1);
  assert.equal(store.list('work').length, 1);
  assert.equal(store.list('personal', {origin:'https://other.test'}).length, 0);
  assert.equal((await store.reveal('personal', first.id, 'https://example.test')).password, login().password);
  await assert.rejects(store.reveal('work', first.id), code('NOT_FOUND'));
  await assert.rejects(store.reveal('personal', first.id, 'https://sub.example.test'), code('NOT_FOUND'));
  await assert.rejects(store.remove('work', first.id), code('NOT_FOUND'));
  for (const checkpoint of [file, `${file}.previous`]) {
    const bytes = fs.readFileSync(checkpoint, 'utf8');
    for (const secret of [login().username, 'example.test', login().password, 'personal', 'Synthetic']) assert.equal(bytes.includes(secret), false);
    assert.equal(JSON.parse(bytes).api, 'async');
  }
  assert.equal(JSON.stringify(events).includes(login().password), false);
  assert.equal(JSON.stringify(events).includes(login().username), false);
  store.lock(); await assert.rejects(store.reveal('personal', first.id), code('LOCKED'));
  store = create(); await store.open(); await store.unlock();
  assert.equal(store.list('personal')[0].id, first.id);
  assert.equal((await store.reveal('work', second.id)).password, 'Synthetic work password');
  const updated = await store.save(login({password:'Synthetic updated'}));
  assert.equal(updated.id, first.id); assert.equal(store.list('personal').length, 1);
  await store.remove('personal', first.id);
  assert.equal(store.list('personal').length, 0);
  assert.equal(store.list('work').length, 1);
  assert.ok(provider.counts.encrypt > 0); assert.ok(provider.counts.decrypt > 0);
});

test('secure provider is mandatory and plaintext/unknown Linux fallbacks are refused', async t => {
  const {file, create} = setup(t);
  for (const [platform, safeStorage] of [
    ['win32', safeProvider({available:false})],
    ['win32', safeProvider({backend:'basic_text'})],
    ['linux', safeProvider({backend:'basic_text'})],
    ['linux', safeProvider({backend:'unknown'})],
    ['linux', safeProvider()],
    ['freebsd', safeProvider()]
  ]) {
    const store = create({platform, safeStorage}); await store.open();
    await assert.rejects(store.unlock(), code('ENCRYPTION_UNAVAILABLE'));
    assert.equal(store.state().locked, true); assert.equal(fs.existsSync(file), false);
    assert.equal(safeStorage.counts.encrypt, 0);
  }
  const secure = safeProvider({backend:'gnome_libsecret'}), store = create({platform:'linux', safeStorage:secure});
  await store.open(); await store.unlock(); await store.save(login());
  assert.equal(JSON.parse(fs.readFileSync(file)).api, 'sync');
  assert.equal(store.state().protection, 'linux-gnome_libsecret');
  assert.equal(secure.counts.availability, 0, 'Linux async provider cannot disclose which fallback was used');
});

test('async unavailable does not silently fall back to the legacy API', async t => {
  const provider = safeProvider(); provider.isAsyncEncryptionAvailable = async () => false;
  const {create} = setup(t, {safeStorage:provider}); const store = create();
  await store.open(); await assert.rejects(store.unlock(), code('ENCRYPTION_UNAVAILABLE'));
  assert.equal(provider.counts.encrypt, 0);
});

test('legacy OS-backed provider works when the async API is absent', async t => {
  const {create, file} = setup(t, {safeStorage:safeProvider({async:false})}); const store = create();
  await store.open(); await store.unlock(); const item = await store.save(login());
  assert.equal(JSON.parse(fs.readFileSync(file)).api, 'sync');
  store.lock(); await store.unlock(); assert.equal((await store.reveal('personal', item.id)).password, login().password);
});

test('origin checks reject HTTP websites, paths, credentials and cross-identity aliases', async t => {
  const {create, file} = setup(t); const store = create(); await store.open(); await store.unlock();
  for (const site of ['http://example.test', 'https://example.test/login', 'https://example.test?query=1', 'https://user:secret@example.test', 'data:text/html,hello', 'javascript:alert(1)', 'file:///test']) await assert.rejects(store.save(login({origin:site})), code('INVALID_DATA'));
  await assert.rejects(store.save(login({identity:'Personal'})), code('NOT_FOUND'));
  await assert.rejects(store.save(login({identity:'missing'})), code('NOT_FOUND'));
  await assert.rejects(store.save({...login(), token:'do-not-store'}), code('UNSUPPORTED_DATA'));
  await assert.rejects(store.save(login({password:''})), code('INVALID_DATA'));
  assert.equal(fs.existsSync(file), false);
  assert.equal(origin('http://localhost:3456/'), 'http://localhost:3456');
  assert.equal(origin('https://EXAMPLE.test:443/'), 'https://example.test');
  await store.save(login({origin:'http://127.0.0.1:3456'}));
});

test('corrupt primary requires explicit recovery and preserves exact damaged bytes', async t => {
  const {create, file} = setup(t); const store = create(); await store.open(); await store.unlock();
  const first = await store.save(login()); await store.save(login({password:'Second synthetic password'}));
  const previous = fs.readFileSync(`${file}.previous`), damaged = Buffer.from('{damaged password checkpoint\n');
  fs.writeFileSync(file, damaged);
  const recovered = create(); assert.equal((await recovered.open()).status, 'recovery');
  await assert.rejects(recovered.unlock(), code('RECOVERY_REQUIRED'));
  assert.deepEqual(fs.readFileSync(file), damaged);
  const result = await recovered.recover(); assert.ok(result.preserved);
  assert.deepEqual(fs.readFileSync(result.preserved), damaged); assert.deepEqual(fs.readFileSync(file), previous);
  await recovered.unlock(); assert.equal((await recovered.reveal('personal', first.id)).password, login().password);
});

test('unsupported formats and wrong OS keys are never rewritten or silently recovered', async t => {
  const {create, file} = setup(t); const store = create(); await store.open(); await store.unlock();
  await store.save(login()); await store.save(login({password:'Second'}));
  const checkpoint = fs.readFileSync(file), previous = fs.readFileSync(`${file}.previous`);
  const wrong = create({safeStorage:safeProvider()}); await wrong.open();
  await assert.rejects(wrong.unlock(), code('DECRYPTION_FAILED'));
  assert.deepEqual(fs.readFileSync(file), checkpoint); assert.deepEqual(fs.readFileSync(`${file}.previous`), previous);
  const future = {...JSON.parse(checkpoint), version:2}; fs.writeFileSync(file, JSON.stringify(future));
  const futureBytes = fs.readFileSync(file); const unsupported = create();
  await assert.rejects(unsupported.open(), code('UNSUPPORTED_VERSION'));
  assert.deepEqual(fs.readFileSync(file), futureBytes); assert.deepEqual(fs.readFileSync(`${file}.previous`), previous);
});

test('damaged valid-base64 ciphertext offers verified older recovery without automatically restoring', async t => {
  const {create, file} = setup(t); const store = create(); await store.open(); await store.unlock();
  const first = await store.save(login()); await store.save(login({password:'Second'}));
  const damaged = JSON.parse(fs.readFileSync(file)), bytes = Buffer.from(damaged.ciphertext, 'base64');
  bytes[bytes.length - 1] ^= 1; damaged.ciphertext = bytes.toString('base64'); fs.writeFileSync(file, JSON.stringify(damaged));
  const original = fs.readFileSync(file), reopened = create();
  assert.equal((await reopened.open()).status, 'ready');
  await assert.rejects(reopened.unlock(), code('DECRYPTION_FAILED'));
  assert.equal(reopened.state().status, 'recovery'); assert.equal(reopened.state().locked, true);
  assert.deepEqual(fs.readFileSync(file), original);
  const restored = await reopened.recover(); assert.deepEqual(fs.readFileSync(restored.preserved), original);
  await reopened.unlock(); assert.equal((await reopened.reveal('personal', first.id)).password, login().password);
});

test('a future encrypted payload cannot be replaced by an older compatible checkpoint', async t => {
  const {create, file, provider} = setup(t); const store = create(); await store.open(); await store.unlock();
  await store.save(login()); await store.save(login({password:'Second'}));
  const future = JSON.parse(fs.readFileSync(file)); future.ciphertext = (await provider.encryptStringAsync(JSON.stringify({version:2, logins:[]}))).toString('base64');
  fs.writeFileSync(file, JSON.stringify(future)); const original = fs.readFileSync(file), reopened = create(); await reopened.open();
  await assert.rejects(reopened.unlock(), code('UNSUPPORTED_VERSION'));
  assert.equal(reopened.state().status, 'ready'); await assert.rejects(reopened.recover(), code('RECOVERY_REQUIRED'));
  assert.deepEqual(fs.readFileSync(file), original);
});

test('unknown decrypted fields, repeated keys and ambiguous records cannot be silently lost', async t => {
  const {create, file, provider} = setup(t);
  const badPayloads = [
    '{"version":1,"version":1,"logins":[]}',
    JSON.stringify({version:1, logins:[], futureSettings:true}),
    JSON.stringify({version:2, logins:[]}),
    JSON.stringify({version:1, logins:[{...login(), id:'one', created:1, modified:1}, {...login(), id:'two', created:1, modified:1}]})
  ];
  for (const payload of badPayloads) {
    fs.writeFileSync(file, JSON.stringify({version:1, encryption:'electron-safe-storage', api:'async', ciphertext:(await provider.encryptStringAsync(payload)).toString('base64')}));
    const original = fs.readFileSync(file), store = create(); await store.open();
    await assert.rejects(store.unlock(), error => ['INVALID_DATA', 'UNSUPPORTED_DATA', 'UNSUPPORTED_VERSION'].includes(error.code));
    assert.equal(store.state().locked, true); assert.deepEqual(fs.readFileSync(file), original);
  }
});

test('stale external writes and checkpoint edits are detected before persistence', async t => {
  const {create, file} = setup(t); const first = create(); await first.open(); await first.unlock(); await first.save(login());
  const second = create(); await second.open(); await second.unlock();
  await first.save(login({password:'Newer synthetic password'}));
  const original = fs.readFileSync(file);
  await assert.rejects(second.save(login({password:'Stale overwrite'})), code('STALE_PREVIEW'));
  await assert.rejects(second.reveal('personal', second.list('personal')[0].id), code('STALE_PREVIEW'));
  assert.deepEqual(fs.readFileSync(file), original);
  await second.open(); await second.unlock(); fs.writeFileSync(`${file}.previous`, '{external edit');
  await assert.rejects(second.remove('personal', second.list('personal')[0].id), code('STALE_PREVIEW'));
  assert.deepEqual(fs.readFileSync(file), original); assert.equal(fs.readFileSync(`${file}.previous`, 'utf8'), '{external edit');
});

test('serialized async saves do not lose records and lock cancels pending cryptography', async t => {
  const {create, provider, file} = setup(t); const store = create(); await store.open(); await store.unlock();
  await Promise.all(Array.from({length:12}, (_, index) => store.save(login({username:`synthetic-${index}`}))));
  assert.equal(store.list('personal').length, 12);
  const before = fs.readFileSync(file), encrypt = provider.encryptStringAsync;
  let release, started;
  const entered = new Promise(resolve => { started = resolve; });
  provider.encryptStringAsync = async value => { started(); await new Promise(resolve => { release = resolve; }); return encrypt(value); };
  const pending = store.save(login({username:'cancelled'}));
  await entered; store.lock(); release();
  await assert.rejects(pending, code('LOCKED'));
  assert.equal(store.state().locked, true); assert.deepEqual(fs.readFileSync(file), before);
  provider.encryptStringAsync = encrypt; await store.unlock(); assert.equal(store.list('personal').length, 12);
});

test('lock cancels pending unlock and reveal; dispose cannot reopen the vault', async t => {
  const {create, provider} = setup(t); const store = create(); await store.open(); await store.unlock();
  const entry = await store.save(login()); store.lock();
  const decrypt = provider.decryptStringAsync; let release, started;
  let entered = new Promise(resolve => { started = resolve; });
  provider.decryptStringAsync = async value => { started(); await new Promise(resolve => { release = resolve; }); return decrypt(value); };
  const unlocking = store.unlock(); await entered; store.lock(); release();
  await assert.rejects(unlocking, code('LOCKED')); assert.equal(store.state().locked, true);
  provider.decryptStringAsync = decrypt; await store.unlock();
  const available = provider.isAsyncEncryptionAvailable;
  entered = new Promise(resolve => { started = resolve; });
  provider.isAsyncEncryptionAvailable = async () => { started(); await new Promise(resolve => { release = resolve; }); return true; };
  const revealing = store.reveal('personal', entry.id); await entered; store.lock(); release();
  await assert.rejects(revealing, code('LOCKED'));
  provider.isAsyncEncryptionAvailable = available; store.dispose();
  assert.throws(() => store.open(), code('DISPOSED'));
  await assert.rejects(store.unlock(), code('DISPOSED'));
});

test('key rotation rewrites ciphertext only after validated decrypt and preserves old checkpoint', async t => {
  const {create, file, provider} = setup(t); const store = create(); await store.open(); await store.unlock();
  const entry = await store.save(login()), before = fs.readFileSync(file);
  const decrypt = provider.decryptStringAsync;
  provider.decryptStringAsync = async bytes => ({...await decrypt(bytes), shouldReEncrypt:true});
  store.lock(); await store.unlock();
  assert.notDeepEqual(fs.readFileSync(file), before); assert.deepEqual(fs.readFileSync(`${file}.previous`), before);
  assert.equal((await store.reveal('personal', entry.id)).password, login().password);
});

test('provider exceptions cannot expose secret values through errors or observer state', async t => {
  const {create, provider, events, file} = setup(t); const store = create(); await store.open(); await store.unlock();
  provider.encryptStringAsync = async () => { throw new Error(login().password); };
  await assert.rejects(store.save(login()), error => error.code === 'ENCRYPTION_FAILED' && !error.message.includes(login().password));
  assert.equal(fs.existsSync(file), false); assert.equal(JSON.stringify(events).includes(login().password), false);
});
