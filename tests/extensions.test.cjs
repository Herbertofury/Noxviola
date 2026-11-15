'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {EventEmitter} = require('node:events');
const {crc32, deflateRawSync} = require('node:zlib');
const {ExtensionManager, parseJson} = require('../browser/extensions.cjs');

// These are lifecycle contract tests, not an Electron compatibility claim.
// Runtime fixture coverage is maintained separately by the native test runner.
function fakeSessions() {
  const sessions = new Map();
  const calls = [];
  const controls = {loadFailure: false, afterLoadFailure: false, removeFailure: false, beforeLoad: null};
  function getSession(identity) {
    if (!sessions.has(identity)) {
      const loaded = new Map();
      const storage = new Map();
      const extensions = Object.assign(new EventEmitter(), {
        async loadExtension(directory, options) {
          calls.push({operation: 'load', identity, directory, options});
          await controls.beforeLoad?.();
          if (controls.loadFailure) throw new Error('fixture load refused');
          const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'));
          const seed = manifest.key ? Buffer.from(manifest.key, 'base64') : directory;
          const id = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 32).replace(/[0-9a-f]/g, value => String.fromCharCode(97 + parseInt(value, 16)));
          const extension = {id, path: directory, manifest};
          loaded.set(id, extension);
          extensions.emit('extension-loaded', {}, extension);
          if (controls.afterLoadFailure) throw new Error('fixture failed after starting code');
          return extension;
        },
        removeExtension(id) { calls.push({operation: 'remove', identity, id}); if (controls.removeFailure) throw new Error('fixture unload refused'); const extension = loaded.get(id); loaded.delete(id); if (extension) extensions.emit('extension-unloaded', {}, extension); },
        getExtension(id) { return loaded.get(id) || null; },
        getAllExtensions() { return [...loaded.values()]; },
      });
      sessions.set(identity, {loaded, storage, extensions});
    }
    return sessions.get(identity);
  }
  return {sessions, calls, controls, getSession};
}
async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nox-extensions-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const fake = fakeSessions();
  const directory = path.join(root, 'manager');
  const options = {directory, getSession: fake.getSession, getIdentities: () => ['personal', 'work'], electronVersion: '44.11.3'};
  const manager = new ExtensionManager(options);
  await manager.open();
  return {root, directory, manager, fake, options};
}
async function fixture(root, overrides = {}, files = {}) {
  const source = path.join(root, `source-${crypto.randomUUID()}`);
  await fs.mkdir(source);
  const manifest = {
    manifest_version: 3, name: 'Synthetic extension', version: '1.0', permissions: ['storage'],
    content_scripts: [{matches: ['https://example.test/*'], js: ['content.js']}],
    action: {default_popup: 'popup.html'}, options_ui: {page: 'options.html'}, ...overrides,
  };
  const entries = {'manifest.json': JSON.stringify(manifest), 'content.js': 'chrome.storage.local.get("seed");', 'popup.html': '<p>Fixture popup</p>', 'options.html': '<p>Fixture options</p>', ...files};
  for (const [name, data] of Object.entries(entries)) {
    await fs.mkdir(path.dirname(path.join(source, name)), {recursive: true});
    await fs.writeFile(path.join(source, name), data);
  }
  return source;
}
async function install(manager, source, identities = ['personal']) {
  const preview = await manager.preview(source);
  return manager.install(preview.token, {identities, permissionsAccepted: true});
}
test('runtime admission is bound to verified native Session, owned path and manifest before background startup', async t => {
  const {root,manager,fake} = await setup(t);
  const session = fake.getSession('personal');
  let startup;
  session.extensions.on('extension-loaded', (_event,extension) => { startup = manager.runtimeContext(session,extension.id); });
  const item = await install(manager,await fixture(root,{permissions:['cookies'],host_permissions:['https://example.test/*']}));
  const runtimeId = item.identities[0].runtimeId;
  assert.ok(startup, 'Verified consent must be available when native background startup calls the host');
  assert.deepEqual(startup.permissions.required,['cookies']);
  assert.deepEqual(startup.permissions.hosts,['https://example.test/*']);
  assert.equal(manager.runtimeContext(fake.getSession('work'),runtimeId),null);
  // Display metadata is not an authority to invent a permission the loaded
  // package never declared. The native manifest remains bound to hashed code.
  manager._records.get(item.id).permissions.required.push('bookmarks');
  assert.deepEqual(manager.runtimeContext(session,runtimeId).permissions.required,['cookies']);
  const original = session.loaded.get(runtimeId);
  session.loaded.set(runtimeId,{...original,path:path.join(root,'foreign-package')});
  assert.equal(manager.runtimeContext(session,runtimeId),null);
  session.loaded.set(runtimeId,original);
  const epoch = manager.runtimeContext(session,runtimeId).epoch;
  await manager.setEnabled(item.id,'personal',false);
  assert.equal(manager.runtimeContext(session,runtimeId),null);
  await manager.setEnabled(item.id,'personal',true);
  assert.notEqual(manager.runtimeContext(session,runtimeId).epoch,epoch);
});
test('failed native unload still revokes browser-host admission and emits cleanup', async t => {
  const {root,manager,fake} = await setup(t);
  const item = await install(manager,await fixture(root));
  const session = fake.getSession('personal'),runtimeId = item.identities[0].runtimeId,revocations = [];
  manager.subscribeRuntime(event=>revocations.push(event));
  assert.ok(manager.runtimeContext(session,runtimeId));
  fake.controls.removeFailure = true;
  await assert.rejects(manager.setEnabled(item.id,'personal',false),/unload refused/);
  assert.ok(session.extensions.getExtension(runtimeId),'Native runtime failure remains represented honestly');
  assert.equal(manager.runtimeContext(session,runtimeId),null);
  assert.equal(manager.list()[0].identities[0].status,'disable-failed');
  assert.ok(revocations.some(event=>event.id===item.id&&event.identity==='personal'));
});
function archive(entries) {
  const local = [], central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const data = Buffer.from(entry.data || '');
    const method = entry.deflate ? 8 : 0;
    const compressed = method ? deflateRawSync(data) : data;
    const checksum = entry.badChecksum ? (crc32(data) ^ 0xff) >>> 0 : crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(entry.encrypted ? 1 : 0, 6);
    header.writeUInt16LE(method, 8);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(0x0314, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(entry.encrypted ? 1 : 0, 8);
    record.writeUInt16LE(method, 10);
    record.writeUInt32LE(checksum, 16);
    record.writeUInt32LE(compressed.length, 20);
    record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(((entry.mode || 0o100600) << 16) >>> 0, 38);
    record.writeUInt32LE(offset, 42);
    local.push(header, name, compressed);
    central.push(record, name);
    offset += header.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
function minimalArchive(extra = []) {
  return [{name: 'manifest.json', data: JSON.stringify({manifest_version: 3, name: 'ZIP fixture', version: '1', permissions: ['storage']})}, ...extra];
}

test('preview never executes, exposes complete permissions, and requires explicit acceptance', async t => {
  const {manager, fake, root} = await setup(t);
  const source = await fixture(root, {host_permissions: ['https://*.example.test/*'], optional_permissions: ['downloads'], optional_host_permissions: ['file:///*']});
  const preview = await manager.preview(source);
  assert.deepEqual(fake.calls, []);
  assert.equal(fake.sessions.size, 0);
  assert.deepEqual(preview.permissions.required, ['storage']);
  assert.deepEqual(preview.permissions.optional, ['downloads']);
  assert.deepEqual(preview.permissions.optionalHosts, ['file:///*']);
  assert.equal(preview.permissions.contentScripts[0].matches[0], 'https://example.test/*');
  assert.equal(preview.provenance.publisherVerified, false);
  await assert.rejects(manager.install(preview.token, {identities: ['personal']}), {code: 'PERMISSION_ACCEPTANCE_REQUIRED'});
  assert.deepEqual(manager.list(), []);
  assert.deepEqual(fake.calls, []);
  const installed = await manager.install(preview.token, {identities: ['personal'], permissionsAccepted: true});
  assert.equal(installed.identities[0].status, 'loaded');
  assert.equal(installed.compatibility.functionalVerification, 'not-tested');
  assert.equal(fake.calls[0].options.allowFileAccess, false);
});

test('accepted package is the copied preview, preserves exact source bytes, and ignores later source changes', async t => {
  const {manager, root, fake} = await setup(t);
  const source = await fixture(root, {}, {'CaseSensitive.js': 'const exact = "Keep Case and whitespace";\n'});
  const original = await fs.readFile(path.join(source, 'manifest.json'));
  const preview = await manager.preview(source);
  await fs.writeFile(path.join(source, 'manifest.json'), '{"permissions":["nativeMessaging"]}');
  const item = await manager.install(preview.token, {identities: ['personal'], permissionsAccepted: true});
  const owned = fake.calls[0].directory;
  assert.notEqual(owned, source);
  assert.deepEqual(await fs.readFile(path.join(owned, 'manifest.json')), original);
  assert.equal(await fs.readFile(path.join(owned, 'CaseSensitive.js'), 'utf8'), 'const exact = "Keep Case and whitespace";\n');
  assert.deepEqual(item.permissions.required, ['storage']);
});

test('stable paths, storage identities, disable, restart and duplicate restore form one real lifecycle contract', async t => {
  const {manager, root, fake, options} = await setup(t);
  const item = await install(manager, await fixture(root), ['personal', 'work']);
  const personal = item.identities.find(grant => grant.identity === 'personal');
  fake.getSession('personal').storage.set(personal.runtimeId, 'personal-only');
  assert.equal(fake.getSession('work').storage.get(personal.runtimeId), undefined);
  const loadedPath = fake.calls[0].directory;
  await manager.restore();
  assert.equal(fake.calls.filter(call => call.operation === 'load').length, 2);
  await manager.setEnabled(item.id, 'work', false);
  assert.equal(fake.getSession('work').loaded.size, 0);
  assert.equal(fake.getSession('personal').loaded.size, 1);
  await manager.dispose();
  const restarted = new ExtensionManager(options);
  await restarted.open();
  await restarted.restore();
  const restored = restarted.list()[0];
  assert.equal(restored.identities.find(grant => grant.identity === 'personal').runtimeId, personal.runtimeId);
  assert.equal(restored.identities.find(grant => grant.identity === 'work').status, 'disabled');
  assert.equal(fake.calls.filter(call => call.operation === 'load').at(-1).directory, loadedPath);
  assert.equal(fake.getSession('personal').storage.get(personal.runtimeId), 'personal-only');
  assert.equal(fake.getSession('work').loaded.size, 0);
  const removed = await restarted.uninstall(item.id);
  assert.equal(removed.uninstalled, true);
  assert.equal(removed.dataRemoved, false);
  assert.equal(fake.getSession('personal').loaded.size, 0);
  assert.equal(fake.getSession('personal').storage.get(personal.runtimeId), 'personal-only');
  assert.deepEqual(restarted.list(), []);
  await assert.rejects(fs.stat(loadedPath), {code: 'ENOENT'});
});

test('another identity requires its own explicit permission acceptance and starts with file access off', async t => {
  const {manager, root, fake} = await setup(t);
  const item = await install(manager, await fixture(root));
  await assert.rejects(manager.setEnabled(item.id, 'work', true), {code: 'IDENTITY_PERMISSION_REQUIRED'});
  await assert.rejects(manager.authorizeIdentity(item.id, 'work'), {code: 'PERMISSION_ACCEPTANCE_REQUIRED'});
  await manager.authorizeIdentity(item.id, 'work', {permissionsAccepted: true});
  assert.equal(fake.getSession('work').loaded.size, 1);
  assert.equal(fake.calls.at(-1).options.allowFileAccess, false);
  await assert.rejects(manager.authorizeIdentity(item.id, 'missing', {permissionsAccepted: true}), {code: 'IDENTITY_UNKNOWN'});
});

test('preview tampering cannot reuse consent and installed tampering never runs on restart', async t => {
  const {manager, root, options, fake} = await setup(t);
  const preview = await manager.preview(await fixture(root));
  const staged = path.join(options.directory, 'previews', preview.token, 'package', 'content.js');
  await fs.writeFile(staged, 'chrome.cookies.getAll({});');
  await assert.rejects(manager.install(preview.token, {identities: ['personal'], permissionsAccepted: true}), {code: 'PREVIEW_CHANGED'});
  assert.equal(fake.calls.length, 0);
  await manager.cancelPreview(preview.token);
  const item = await install(manager, await fixture(root));
  const owned = fake.calls[0].directory;
  await manager.dispose();
  await fs.appendFile(path.join(owned, 'content.js'), '\nchrome.cookies.getAll({});');
  const restarted = new ExtensionManager(options);
  await restarted.open();
  await restarted.restore();
  assert.equal(restarted.list()[0].id, item.id);
  assert.equal(restarted.list()[0].identities[0].status, 'load-failed');
  assert.equal(restarted.list()[0].identities[0].errorCode, 'INSTALLED_PACKAGE_CHANGED');
  assert.equal(fake.calls.filter(call => call.operation === 'load').length, 1);
});

test('load failure remains installed, visible and retryable without claiming functional success', async t => {
  const {manager, root, fake} = await setup(t);
  fake.controls.loadFailure = true;
  const item = await install(manager, await fixture(root));
  assert.equal(item.identities[0].status, 'load-failed');
  assert.match(item.identities[0].error, /load refused/);
  assert.equal(item.identities[0].enabled, true);
  assert.equal(item.compatibility.functionalVerification, 'not-tested');
  fake.controls.loadFailure = false;
  const retry = await manager.setEnabled(item.id, 'personal', true);
  assert.equal(retry.identities[0].status, 'loaded');
});

test('failed disable persists disabled intent, reports still-running state, and retries without a duplicate runtime', async t => {
  const {manager, root, fake, options} = await setup(t);
  const item = await install(manager, await fixture(root));
  fake.controls.removeFailure = true;
  await assert.rejects(manager.setEnabled(item.id, 'personal', false), /unload refused/);
  const failed = manager.list()[0].identities[0];
  assert.equal(failed.enabled, false);
  assert.equal(failed.status, 'disable-failed');
  assert.match(failed.error, /still be running/);
  assert.equal(fake.getSession('personal').loaded.size, 1);
  assert.equal(JSON.parse(await fs.readFile(path.join(options.directory, 'registry.json'))).items[0].identities[0].enabled, false);
  fake.controls.removeFailure = false;
  await manager.setEnabled(item.id, 'personal', false);
  assert.equal(fake.getSession('personal').loaded.size, 0);
  assert.equal(manager.list()[0].identities[0].status, 'disabled');
});

test('failed uninstall preserves code and record for retry and never claims removal', async t => {
  const {manager, root, fake} = await setup(t);
  const item = await install(manager, await fixture(root));
  const owned = fake.calls[0].directory;
  fake.controls.removeFailure = true;
  await assert.rejects(manager.uninstall(item.id), /unload refused/);
  assert.equal(manager.list().length, 1);
  assert.equal(manager.list()[0].identities[0].enabled, false);
  assert.ok((await fs.stat(owned)).isDirectory());
  fake.controls.removeFailure = false;
  await manager.uninstall(item.id);
  assert.deepEqual(manager.list(), []);
});

test('queued enable then disable cannot leave code running after the disabling command resolves', async t => {
  const {manager, root, fake} = await setup(t);
  const item = await install(manager, await fixture(root));
  await manager.setEnabled(item.id, 'personal', false);
  let release;
  let announce;
  const started = new Promise(resolve => { announce = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  fake.controls.beforeLoad = () => { announce(); return blocked; };
  const enable = manager.setEnabled(item.id, 'personal', true);
  await started;
  const disable = manager.setEnabled(item.id, 'personal', false);
  release();
  await Promise.all([enable, disable]);
  assert.equal(fake.getSession('personal').loaded.size, 0);
  assert.equal(manager.list()[0].identities[0].enabled, false);
});

test('registry write conflict preserves outside bytes and still unloads on a disable request', async t => {
  const {manager, root, fake, options} = await setup(t);
  const item = await install(manager, await fixture(root));
  const registry = path.join(options.directory, 'registry.json');
  const evidence = Buffer.from('{"version":999,"evidence":"do not overwrite"}');
  await fs.writeFile(registry, evidence);
  await assert.rejects(manager.setEnabled(item.id, 'personal', false), {code: 'REGISTRY_CHANGED'});
  assert.deepEqual(await fs.readFile(registry), evidence);
  assert.equal(fake.getSession('personal').loaded.size, 0);
  assert.equal(manager.list()[0].identities[0].status, 'disabled');
});

test('popup and options URLs require a loaded authorized identity and remain in their extension origin', async t => {
  const {manager, root} = await setup(t);
  const item = await install(manager, await fixture(root));
  const runtimeId = item.identities[0].runtimeId;
  assert.equal(manager.pageFor(item.id, 'personal', 'popup'), `chrome-extension://${runtimeId}/popup.html`);
  assert.equal(manager.pageFor(item.id, 'personal', 'options'), `chrome-extension://${runtimeId}/options.html`);
  assert.throws(() => manager.pageFor(item.id, 'work', 'popup'), {code: 'EXTENSION_DISABLED'});
  await manager.setEnabled(item.id, 'personal', false);
  assert.throws(() => manager.pageFor(item.id, 'personal', 'popup'), {code: 'EXTENSION_DISABLED'});
  await assert.rejects(manager.preview(await fixture(root, {action: {default_popup: 'https://evil.test/'}})), {code: 'INVALID_MANIFEST'});
  await assert.rejects(manager.preview(await fixture(root, {options_page: '../outside.html', options_ui: undefined})), {code: 'UNSAFE_PACKAGE_PATH'});
});

test('unsupported and unknown APIs are concrete diagnostics, not a package allowlist or browser namespace ban', async t => {
  const {manager, root} = await setup(t);
  const preview = await manager.preview(await fixture(root, {permissions: ['nativeMessaging', 'storage'], sidebar_action: {default_panel: 'popup.html'}}, {
    'content.js': 'browser.tabs.create({url: "https://example.test/"}); chrome.runtime.connectNative("test"); browser.storage.local.get("x");',
  }));
  assert.equal(preview.compatibility.status, 'limited');
  assert.ok(preview.compatibility.detectedApis.includes('browser.tabs.create'));
  assert.ok(preview.compatibility.issues.some(issue => issue.api === 'browser.tabs.create'));
  assert.ok(preview.compatibility.issues.some(issue => issue.api === 'chrome.runtime.connectNative'));
  assert.ok(preview.compatibility.issues.some(issue => issue.api === 'sidebar_action'));
  const item = await manager.install(preview.token, {identities: ['personal'], permissionsAccepted: true});
  assert.equal(item.compatibility.functionalVerification, 'not-tested');
  assert.equal(item.identities[0].status, 'loaded');
});

test('ZIP and XPI preserve bytes, disclose signature uncertainty and require additional XPI acceptance', async t => {
  const {manager, root, fake} = await setup(t);
  const file = path.join(root, 'local.xpi');
  await fs.writeFile(file, archive(minimalArchive([{name: 'META-INF/signature.rsa', data: 'UNVERIFIED'}, {name: 'Data/Original.txt', data: 'CASE\n\r\n', deflate: true}])));
  const preview = await manager.preview(file);
  assert.equal(preview.format, 'xpi');
  assert.equal(preview.requiresUnsignedImportAcceptance, true);
  assert.equal(preview.provenance.signature, 'not-verified');
  assert.equal(preview.provenance.signatureFilesPresent, true);
  await assert.rejects(manager.install(preview.token, {identities: ['personal'], permissionsAccepted: true}), {code: 'XPI_TRUST_ACCEPTANCE_REQUIRED'});
  const item = await manager.install(preview.token, {identities: ['personal'], permissionsAccepted: true, unsignedImportAccepted: true});
  assert.equal(item.identities[0].status, 'loaded');
  assert.equal(await fs.readFile(path.join(fake.calls[0].directory, 'Data', 'Original.txt'), 'utf8'), 'CASE\n\r\n');
});

test('one wrapper directory is adapted without rewriting any package bytes', async t => {
  const {manager, root} = await setup(t);
  const file = path.join(root, 'wrapped.zip');
  await fs.writeFile(file, archive(minimalArchive().map(entry => ({...entry, name: `extension/${entry.name}`}))));
  const preview = await manager.preview(file);
  assert.equal(preview.provenance.adaptation, 'single-wrapper-directory-removed');
  assert.equal(preview.provenance.codeRewritten, false);
  const item = await manager.install(preview.token, {identities: ['personal'], permissionsAccepted: true});
  assert.equal(item.identities[0].status, 'loaded');
});

test('CRX signatures are never bypassed, even when a CRX is renamed to ZIP', async t => {
  const {manager, root, fake} = await setup(t);
  for (const filename of ['local.crx', 'renamed.zip']) {
    const file = path.join(root, filename);
    await fs.writeFile(file, Buffer.concat([Buffer.from('Cr24'), archive(minimalArchive())]));
    await assert.rejects(manager.preview(file), {code: 'CRX_SIGNATURE_UNVERIFIED'});
  }
  assert.deepEqual(fake.calls, []);
});

test('archive traversal, links, collisions, encrypted content and CRC corruption are rejected before execution', async t => {
  const {manager, root, fake} = await setup(t);
  const badEntries = [
    {name: '../escape', data: 'x'}, {name: '/absolute', data: 'x'}, {name: 'dir\\file', data: 'x'},
    {name: 'C:/escape', data: 'x'}, {name: 'file:stream', data: 'x'}, {name: 'CON.txt', data: 'x'},
    {name: 'link', data: '../escape', mode: 0o120777}, {name: 'encrypted', data: 'x', encrypted: true},
    {name: 'bad-crc', data: 'x', badChecksum: true},
  ];
  for (const entry of badEntries) {
    const file = path.join(root, `${crypto.randomUUID()}.zip`);
    await fs.writeFile(file, archive(minimalArchive([entry])));
    await assert.rejects(manager.preview(file), undefined, entry.name);
  }
  const duplicate = path.join(root, 'duplicate.zip');
  await fs.writeFile(duplicate, archive(minimalArchive([{name: 'MANIFEST.JSON', data: '{}'}])));
  await assert.rejects(manager.preview(duplicate), {code: 'DUPLICATE_PACKAGE_PATH'});
  assert.equal(fake.calls.length, 0);
  assert.deepEqual(await fs.readdir(path.join(root, 'manager', 'previews')), []);
  await assert.rejects(fs.stat(path.join(root, 'escape')), {code: 'ENOENT'});
});

test('unpacked symlinks and Unicode normalization collisions cannot import unseen bytes', async t => {
  const {manager, root} = await setup(t);
  const source = await fixture(root);
  await fs.writeFile(path.join(root, 'outside'), 'private');
  await fs.symlink(path.join(root, 'outside'), path.join(source, 'link'));
  await assert.rejects(manager.preview(source), {code: 'UNSAFE_PACKAGE_FILE'});
  // NTFS cannot represent content.js and Content.js as separate files. The
  // archive test above covers that collision before extraction on every OS.
  // NFC-equivalent spellings remain distinct on both supported host filesystems
  // and exercise the unpacked directory walk's ambiguity rejection as well.
  const names = ['caf\u00e9.js', 'cafe\u0301.js'];
  const collision = await fixture(root);
  for (const [index, name] of names.entries()) await fs.writeFile(path.join(collision, name), `source-${index}`, {flag: 'wx'});
  const entries = await fs.readdir(collision);
  for (const name of names) assert.ok(entries.includes(name), 'The collision fixture must contain both distinct spellings');
  await assert.rejects(manager.preview(collision), {code: 'DUPLICATE_PACKAGE_PATH'});
});

test('duplicate JSON keys, malformed/future registry and missing primary preserve recovery evidence', async t => {
  assert.throws(() => parseJson('{"permissions":[],"permissions":["cookies"]}', 'test'), {code: 'DUPLICATE_JSON_KEY'});
  assert.doesNotThrow(() => parseJson('{"one":{"a":1},"two":{"a":2},"text":"{\\"a\\":1}"}', 'test'));
  const {options} = await setup(t);
  const registry = path.join(options.directory, 'registry.json');
  for (const content of ['{ broken', '{"version":999,"items":[]}', '{"version":1,"items":[],"items":[]}']) {
    await fs.writeFile(registry, content);
    const manager = new ExtensionManager(options);
    await assert.rejects(manager.open());
    assert.equal(await fs.readFile(registry, 'utf8'), content);
  }
  await fs.rm(registry);
  await fs.writeFile(`${registry}.previous`, '{"version":1,"items":[]}');
  await assert.rejects(new ExtensionManager(options).open(), {code: 'REGISTRY_RECOVERY_REQUIRED'});
  await assert.rejects(fs.stat(registry), {code: 'ENOENT'});
});

test('install write failure keeps the accepted preview retryable and executes no code', async t => {
  const {manager, root, fake, options} = await setup(t);
  const preview = await manager.preview(await fixture(root));
  const registry = path.join(options.directory, 'registry.json');
  await fs.writeFile(registry, 'external evidence');
  await assert.rejects(manager.install(preview.token, {identities: ['personal'], permissionsAccepted: true}), {code: 'REGISTRY_CHANGED'});
  assert.equal(fake.calls.length, 0);
  assert.deepEqual(await fs.readdir(path.join(options.directory, 'packages')), []);
  await fs.rm(registry);
  const item = await manager.install(preview.token, {identities: ['personal'], permissionsAccepted: true});
  assert.equal(item.identities[0].status, 'loaded');
});

test('duplicate package and publisher identity are not loaded as competing instances', async t => {
  const {manager, root, fake} = await setup(t);
  const source = await fixture(root, {key: Buffer.from('synthetic-public-key').toString('base64')});
  await install(manager, source);
  const same = await manager.preview(source);
  await assert.rejects(manager.install(same.token, {identities: ['personal'], permissionsAccepted: true}), {code: 'EXTENSION_ALREADY_INSTALLED'});
  const changed = await manager.preview(await fixture(root, {key: Buffer.from('synthetic-public-key').toString('base64'), version: '2'}));
  await assert.rejects(manager.install(changed.token, {identities: ['personal'], permissionsAccepted: true}), {code: 'EXTENSION_ALREADY_INSTALLED'});
  assert.equal(fake.calls.filter(call => call.operation === 'load').length, 1);
});

test('identity-scoped startup opens only the requested runtime and repeats without extra loads', async t => {
  const {manager, root, options} = await setup(t);
  await install(manager, await fixture(root), ['personal', 'work']);
  await manager.dispose();
  const fresh = fakeSessions();
  const restarted = new ExtensionManager({...options, getSession: fresh.getSession});
  await restarted.open();
  assert.equal(fresh.sessions.size, 0);
  await restarted.restoreIdentity('personal');
  await restarted.restoreIdentity('personal');
  assert.deepEqual([...fresh.sessions.keys()], ['personal']);
  assert.equal(fresh.calls.length, 1);
  assert.equal(restarted.list()[0].identities.find(grant => grant.identity === 'work').status, 'not-loaded');
  await restarted.restoreIdentity('work');
  assert.equal(fresh.calls.length, 2);
});

test('native registration observes a runtime without bypassing managed readiness and dispose removes observers', async t => {
  const {manager, root, fake} = await setup(t);
  const item = await install(manager, await fixture(root));
  const adapter = fake.getSession('personal').extensions;
  const extension = adapter.getExtension(item.identities[0].runtimeId);
  adapter.removeExtension(extension.id);
  assert.equal(manager.list()[0].identities[0].status, 'not-loaded');
  fake.getSession('personal').loaded.set(extension.id, extension);
  adapter.emit('extension-loaded', {}, extension);
  assert.equal(manager.list()[0].identities[0].status, 'not-loaded');
  await manager.setEnabled(item.id, 'personal', true);
  assert.equal(manager.list()[0].identities[0].status, 'disable-failed');
  await manager.setEnabled(item.id, 'personal', false);
  await manager.setEnabled(item.id, 'personal', true);
  assert.equal(manager.list()[0].identities[0].status, 'loaded');
  assert.equal(adapter.listenerCount('extension-unloaded'), 1);
  await manager.dispose();
  assert.equal(adapter.listenerCount('extension-unloaded'), 0);
});

test('a runtime that starts code then rejects is unloaded before load-failed is reported', async t => {
  const {manager, root, fake} = await setup(t);
  fake.controls.afterLoadFailure = true;
  const item = await install(manager, await fixture(root));
  assert.equal(item.identities[0].status, 'load-failed');
  assert.equal(fake.getSession('personal').loaded.size, 0);
  assert.equal(fake.calls.at(-1).operation, 'remove');
});

test('a visible registry rename with failed acknowledgement never rolls its package back', async t => {
  const {manager, root, fake, options} = await setup(t);
  const preview = await manager.preview(await fixture(root));
  // open() canonicalizes its owned path. Windows runner temp paths can use a
  // short-name alias, so compare with the actual canonical destination.
  const registry = manager.registryPath;
  const originalRename = fs.rename;
  let injected = 0;
  fs.rename = async (from, to) => {
    await originalRename(from, to);
    if (to === registry) { injected++; const error = new Error('synthetic post-rename I/O error'); error.code = 'EIO'; throw error; }
  };
  try {
    await assert.rejects(manager.install(preview.token, {identities: ['personal'], permissionsAccepted: true}), {code: 'REGISTRY_DURABILITY_UNCONFIRMED'});
  } finally { fs.rename = originalRename; }
  assert.equal(injected, 1, 'The real registry replacement must succeed before exactly one acknowledgement failure');
  assert.equal(fake.calls.length, 0);
  const state = JSON.parse(await fs.readFile(registry));
  assert.equal(state.items.length, 1);
  assert.ok((await fs.stat(path.join(options.directory, 'packages', state.items[0].id))).isDirectory());
  assert.equal(manager.list()[0].identities[0].status, 'not-loaded');
  await manager.restoreIdentity('personal');
  assert.equal(manager.list()[0].identities[0].status, 'loaded');
});

test('code-removal failure leaves a disabled retryable uninstall record', async t => {
  const {manager, root, fake} = await setup(t);
  const item = await install(manager, await fixture(root));
  const owned = fake.calls[0].directory;
  const originalRemove = fs.rm;
  fs.rm = async (target, options) => {
    if (target === owned) { const error = new Error('fixture file in use'); error.code = 'EACCES'; throw error; }
    return originalRemove(target, options);
  };
  try { await assert.rejects(manager.uninstall(item.id), {code: 'EACCES'}); }
  finally { fs.rm = originalRemove; }
  assert.equal(fake.getSession('personal').loaded.size, 0);
  assert.equal(manager.list()[0].identities[0].enabled, false);
  assert.equal(manager.list()[0].identities[0].status, 'disabled');
  assert.ok((await fs.stat(owned)).isDirectory());
  await manager.uninstall(item.id);
  assert.deepEqual(manager.list(), []);
});

test('an invalid previous registry checkpoint is preserved and blocks replacement', async t => {
  const {manager, root, fake, options} = await setup(t);
  const item = await install(manager, await fixture(root));
  const previous = path.join(options.directory, 'registry.json.previous');
  await fs.writeFile(previous, 'old corrupt evidence');
  await assert.rejects(manager.setEnabled(item.id, 'personal', false), {code: 'INVALID_JSON'});
  assert.equal(await fs.readFile(previous, 'utf8'), 'old corrupt evidence');
  assert.equal(fake.getSession('personal').loaded.size, 0);
});

test('invalid UTF-8 manifests are rejected without rewriting their source bytes or executing code', async t => {
  const {manager, root, fake} = await setup(t);
  const source = await fixture(root);
  const invalid = Buffer.concat([Buffer.from('{"manifest_version":3,"name":"caf'), Buffer.from([0xe9]), Buffer.from('","version":"1"}')]);
  await fs.writeFile(path.join(source, 'manifest.json'), invalid);
  await assert.rejects(manager.preview(source), {code: 'INVALID_UTF8'});
  assert.deepEqual(await fs.readFile(path.join(source, 'manifest.json')), invalid);
  assert.equal(fake.calls.length, 0);
});

test('invalid UTF-8 registry metadata is preserved rather than silently repaired', async t => {
  const {options} = await setup(t);
  const file = path.join(options.directory, 'registry.json');
  const invalid = Buffer.concat([Buffer.from('{"version":1,"items":[],"metadata":"'), Buffer.from([0xff]), Buffer.from('"}')]);
  await fs.writeFile(file, invalid);
  await assert.rejects(new ExtensionManager(options).open(), {code: 'INVALID_UTF8'});
  assert.deepEqual(await fs.readFile(file), invalid);
});
