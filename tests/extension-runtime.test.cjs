'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {EventEmitter} = require('node:events');
const {createExtensionLoader} = require('../browser/extension-runtime.cjs');
const {ExtensionManager} = require('../browser/extensions.cjs');

// Actual production loader/manager with only the native event boundary replaced.
// These deterministic ordering contracts do not execute an extension or Electron.
const ID = 'abcdefghijklmnopabcdefghijklmnop';
const OTHER_ID = 'ponmlkjihgfedcbaponmlkjihgfedcba';
const BACKGROUND = `chrome-extension://${ID}/_generated_background_page.html`;
const MANIFEST = {manifest_version: 2, name: 'Background ordering fixture', version: '1', background: {scripts: ['background.js']}};
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return {promise, resolve, reject};
}
async function drainMicrotasks() { await Promise.resolve(); await Promise.resolve(); }

function nativeBoundary(manifest = MANIFEST) {
  const app = new EventEmitter();
  const contents = [];
  const loaded = new Map();
  const calls = [];
  const started = deferred();
  const controls = {removeFailure: false, autoFinish: false, manifestFromDisk: false};
  let background;
  const session = {extensions: new EventEmitter(), isPersistent: () => true};
  function createBackground(partition = session, {url = '', finished = false, type = 'backgroundPage', announce = true} = {}) {
    const value = Object.assign(new EventEmitter(), {
      session: partition, mainFrame: {url}, destroyed: false, loading: !finished,
      getType: () => type,
      isDestroyed() { return this.destroyed; },
      isLoadingMainFrame() { return this.loading; },
      start(address) { this.loading = true; this.emit('did-start-navigation', {url: address, isMainFrame: true}); },
      commit(address) { this.mainFrame.url = address; },
      finish(address = this.mainFrame.url) { this.mainFrame.url = address; this.loading = false; this.emit('did-finish-load'); },
      fail(address = BACKGROUND) { this.loading = false; this.emit('did-fail-load', {}, -6, 'ERR_FILE_NOT_FOUND', address, true); },
      crash() { this.emit('render-process-gone', {}, {reason: 'crashed', exitCode: 7}); },
      destroy() { this.destroyed = true; this.emit('destroyed'); },
    });
    contents.push(value);
    if (announce) app.emit('web-contents-created', {}, value);
    return value;
  }
  Object.assign(session.extensions, {
    async loadExtension(directory, options) {
      calls.push({operation: 'load', directory, options});
      const value = {id: ID, path: directory, manifest: controls.manifestFromDisk ? JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8')) : manifest};
      loaded.set(ID, value);
      session.extensions.emit('extension-loaded', {}, value);
      background = createBackground();
      started.resolve({extension: value, background});
      if (controls.autoFinish) background.finish(BACKGROUND);
      return value;
    },
    getExtension(id) { return loaded.get(id); },
    getAllExtensions() { return [...loaded.values()]; },
    removeExtension(id) {
      calls.push({operation: 'remove', id});
      if (controls.removeFailure) throw new Error('synthetic native unload failure');
      const value = loaded.get(id);
      loaded.delete(id);
      background?.destroy();
      if (value) session.extensions.emit('extension-unloaded', {}, value);
    },
  });
  const webContents = {getAllWebContents: () => contents.filter(value => !value.destroyed)};
  return {app, session, webContents, contents, loaded, calls, started, controls, createBackground};
}
function assertObserverCleanup(boundary, {manager = false} = {}) {
  assert.equal(boundary.app.listenerCount('web-contents-created'), 0);
  assert.equal(boundary.session.extensions.listenerCount('extension-loaded'), manager ? 1 : 0);
  assert.equal(boundary.session.extensions.listenerCount('extension-unloaded'), manager ? 1 : 0);
  for (const contents of boundary.contents) assert.deepEqual(contents.eventNames(), [], 'Native contents must retain no readiness listeners');
}

test('persistent MV2 does not release navigation at registration, ready, empty completion, or commit', async () => {
  const native = nativeBoundary();
  const loader = createExtensionLoader(native);
  let navigated = false;
  const loading = loader(native.session, '/owned/package', {allowFileAccess: false}).then(extension => { navigated = true; return extension; });
  const {background, extension} = await native.started.promise;
  native.session.extensions.emit('extension-ready', {}, extension);
  background.finish('about:blank');
  await drainMicrotasks();
  assert.equal(navigated, false);
  background.start(BACKGROUND);
  background.commit(BACKGROUND);
  await drainMicrotasks();
  assert.equal(navigated, false);
  background.finish();
  assert.equal((await loading).id, ID);
  assert.equal(navigated, true);
  assert.equal(native.calls.length, 1, 'No retry or additional host load');
  assertObserverCleanup(native);
});

test('completion emitted before the native load promise resolves is retained', async () => {
  const native = nativeBoundary();
  native.controls.autoFinish = true;
  const extension = await createExtensionLoader(native)(native.session, '/owned/package', {});
  assert.equal(extension.id, ID);
  assertObserverCleanup(native);
});

test('a genuine document completion does not depend on subsequent native loading-flag updates', async () => {
  const native = nativeBoundary();
  const loading = createExtensionLoader(native)(native.session, '/owned/package', {});
  const {background} = await native.started.promise;
  background.start(BACKGROUND);
  background.commit(BACKGROUND);
  assert.equal(background.isLoadingMainFrame(), true);
  background.emit('did-finish-load');
  assert.equal((await loading).id, ID);
  assertObserverCleanup(native);
});

test('an already completed native document found after load is accepted by exact committed URL', async () => {
  const native = nativeBoundary({...MANIFEST, background: {page: 'background/page.html'}});
  native.session.extensions.loadExtension = async () => {
    native.createBackground(native.session, {url: `chrome-extension://${ID}/background/page.html`, finished: true, announce: false});
    return {id: ID, manifest: {...MANIFEST, background: {page: 'background/page.html'}}};
  };
  assert.equal((await createExtensionLoader(native)(native.session, '/owned/package', {})).id, ID);
  assertObserverCleanup(native);
});

test('another identity, runtime ID, document, or contents type cannot satisfy readiness', async () => {
  const native = nativeBoundary();
  let completed = false;
  const loading = createExtensionLoader(native)(native.session, '/owned/package', {}).then(value => { completed = true; return value; });
  const {background} = await native.started.promise;
  native.createBackground({extensions: new EventEmitter()}, {url: BACKGROUND, finished: true});
  native.createBackground(native.session, {url: BACKGROUND.replace(ID, OTHER_ID), finished: true});
  native.createBackground(native.session, {url: BACKGROUND, finished: true, type: 'window'});
  native.createBackground(native.session, {url: `chrome-extension://${ID}/options.html`, finished: true});
  await drainMicrotasks();
  assert.equal(completed, false);
  background.start(BACKGROUND);
  background.finish(BACKGROUND);
  await loading;
  assertObserverCleanup(native);
});

test('replacing a prior native background cannot use its completed document or destruction as the new result', async () => {
  const native = nativeBoundary();
  const previous = native.createBackground(native.session, {url: BACKGROUND, finished: true});
  const originalLoad = native.session.extensions.loadExtension;
  native.session.extensions.loadExtension = async (...args) => {
    previous.destroy();
    native.session.extensions.emit('extension-unloaded', {}, {id: ID});
    const value = await originalLoad(...args);
    const {background} = await native.started.promise;
    background.start(BACKGROUND);
    return value;
  };
  let completed = false;
  const loading = createExtensionLoader(native)(native.session, '/owned/package', {}).then(value => { completed = true; return value; });
  const {background} = await native.started.promise;
  await drainMicrotasks();
  assert.equal(completed, false);
  background.finish(BACKGROUND);
  await loading;
  assertObserverCleanup(native);
});

test('a draining preexisting complete host cannot make a new initial blank host ready', async () => {
  const native = nativeBoundary();
  const previous = native.createBackground(native.session, {url: BACKGROUND, finished: true});
  let completed = false;
  const loading = createExtensionLoader(native)(native.session, '/owned/package', {}).then(value => { completed = true; return value; });
  const {background} = await native.started.promise;
  previous.emit('did-finish-load');
  await drainMicrotasks();
  assert.equal(background.mainFrame.url, '');
  assert.equal(completed, false, 'The old native host must not attest to the new load');
  previous.destroy();
  background.start(BACKGROUND);
  background.finish(BACKGROUND);
  await loading;
  assertObserverCleanup(native);
});

test('lazy MV2, MV3 worker, and content-only loads retain native completion semantics', async () => {
  for (const manifest of [
    {...MANIFEST, background: {scripts: ['background.js'], persistent: false}},
    {...MANIFEST, manifest_version: 3, background: {service_worker: 'worker.js'}},
    {manifest_version: 3, name: 'Content fixture', version: '1'},
  ]) {
    const native = nativeBoundary(manifest);
    assert.equal((await createExtensionLoader(native)(native.session, '/owned/package', {})).id, ID);
    assertObserverCleanup(native);
  }
});

for (const [operation, code, expectedMessage] of [
  ['fail', 'EXTENSION_BACKGROUND_LOAD_FAILED', /ERR_FILE_NOT_FOUND/],
  ['crash', 'EXTENSION_BACKGROUND_CRASHED', /crashed/],
  ['destroy', 'EXTENSION_BACKGROUND_DESTROYED', /destroyed/],
]) {
  test(`background ${operation} rejects readiness with the cause and removes observers`, async () => {
    const native = nativeBoundary();
    const loading = createExtensionLoader(native)(native.session, '/owned/package', {});
    const rejection = assert.rejects(loading, error => error.code === code && expectedMessage.test(error.message));
    const {background} = await native.started.promise;
    background.start(BACKGROUND);
    background[operation]();
    await rejection;
    assertObserverCleanup(native);
  });
}

test('background unload rejects readiness even when the document completed just afterward', async () => {
  const native = nativeBoundary();
  const loading = createExtensionLoader(native)(native.session, '/owned/package', {});
  const rejection = assert.rejects(loading, {code: 'EXTENSION_BACKGROUND_UNLOADED'});
  const {background} = await native.started.promise;
  native.session.extensions.emit('extension-unloaded', {}, {id: ID});
  background.finish(BACKGROUND);
  await rejection;
  assertObserverCleanup(native);
});

test('the bounded deadline fails without retries and is cleared after every outcome', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const native = nativeBoundary();
  const loading = createExtensionLoader({...native, timeoutMs: 1_000})(native.session, '/owned/package', {});
  const rejection = assert.rejects(loading, {code: 'EXTENSION_BACKGROUND_TIMEOUT'});
  await native.started.promise;
  await drainMicrotasks();
  t.mock.timers.tick(999);
  assert.equal(native.calls.length, 1);
  t.mock.timers.tick(1);
  await rejection;
  assertObserverCleanup(native);
  native.controls.autoFinish = true;
  await createExtensionLoader({...native, timeoutMs: 1_000})(native.session, '/owned/package', {});
  t.mock.timers.tick(1_000);
  assertObserverCleanup(native);
});

test('native loader rejection cleans up observation without disguising the original error', async () => {
  const native = nativeBoundary();
  native.session.extensions.loadExtension = async () => { native.createBackground(); throw new Error('native load rejected'); };
  await assert.rejects(createExtensionLoader(native)(native.session, '/owned/package', {}), /native load rejected/);
  assertObserverCleanup(native);
});

async function managedFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nox-extension-readiness-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const source = path.join(root, 'source');
  await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'manifest.json'), JSON.stringify(MANIFEST));
  await fs.writeFile(path.join(source, 'background.js'), '// Never executed by this contract test.\n');
  const native = nativeBoundary();
  native.controls.manifestFromDisk = true;
  const manager = new ExtensionManager({directory: path.join(root, 'extensions'), getSession: () => native.session,
    getIdentities: () => ['personal'], loadExtension: createExtensionLoader(native), electronVersion: '44.11.3'});
  await manager.open();
  const preview = await manager.preview(source);
  const installation = manager.install(preview.token, {identities: ['personal'], permissionsAccepted: true});
  const {background, extension} = await native.started.promise;
  return {manager, installation, native, background, extension};
}

test('the actual manager reports loaded and releases its consumer only after native background completion', async t => {
  const {manager, installation, native, background, extension} = await managedFixture(t);
  let navigated = false;
  const navigation = installation.then(() => { navigated = true; });
  native.session.extensions.emit('extension-ready', {}, extension);
  background.start(BACKGROUND);
  background.commit(BACKGROUND);
  await drainMicrotasks();
  assert.equal(manager.list()[0].identities[0].status, 'not-loaded');
  assert.equal(navigated, false);
  background.finish();
  const item = await installation;
  await navigation;
  assert.equal(item.identities[0].status, 'loaded');
  assert.equal(item.compatibility.functionalVerification, 'not-tested');
  assert.equal(navigated, true);
  assertObserverCleanup(native, {manager: true});
  await manager.dispose();
});

test('readiness rejection uses actual manager cleanup and preserves retryable installed intent', async t => {
  const {manager, installation, native, background} = await managedFixture(t);
  background.fail();
  const item = await installation;
  assert.equal(item.identities[0].enabled, true);
  assert.equal(item.identities[0].status, 'load-failed');
  assert.equal(item.identities[0].errorCode, 'EXTENSION_BACKGROUND_LOAD_FAILED');
  assert.equal(item.identities[0].runtimeId, null);
  assert.equal(native.loaded.size, 0);
  assert.equal(native.calls.at(-1).operation, 'remove');
  assert.equal(JSON.parse(await fs.readFile(manager.registryPath)).items[0].id, item.id);
  assertObserverCleanup(native, {manager: true});
  native.controls.autoFinish = true;
  const retried = await manager.setEnabled(item.id, 'personal', true);
  assert.equal(retried.identities[0].status, 'loaded');
  await manager.dispose();
});

test('failed readiness cleanup remains visibly running and neither re-enable nor a native event claims success', async t => {
  const {manager, installation, native, background, extension} = await managedFixture(t);
  native.controls.removeFailure = true;
  background.fail();
  const item = await installation;
  assert.equal(item.identities[0].status, 'disable-failed');
  assert.equal(item.identities[0].runtimeId, ID);
  assert.match(item.identities[0].error, /may still be running.*ERR_FILE_NOT_FOUND.*unload failure/);
  assert.equal(native.loaded.size, 1);
  native.session.extensions.emit('extension-loaded', {}, extension);
  const retry = await manager.setEnabled(item.id, 'personal', true);
  assert.equal(retry.identities[0].status, 'disable-failed');
  assert.equal(native.calls.filter(call => call.operation === 'load').length, 1);
  assertObserverCleanup(native, {manager: true});
  native.controls.removeFailure = false;
  await manager.setEnabled(item.id, 'personal', false);
  assert.equal(manager.list()[0].identities[0].status, 'disabled');
  assert.equal(native.loaded.size, 0);
  await manager.dispose();
});
