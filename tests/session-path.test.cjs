'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createIdentitySessionResolver, prepareIdentityAlias, identityStoragePaths, fitsLegacyCacheStorage} = require('../browser/session-path.cjs');

function fixture(t) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'nx-')));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  return root;
}
function link(target, alias) {
  fs.mkdirSync(path.dirname(alias), {recursive:true});
  fs.symlinkSync(target, alias, 'junction');
}
function savedIdentity(root, identity, bytes = Buffer.from([0, 1, 13, 10, 255, 128])) {
  const locations = identityStoragePaths(root, identity);
  fs.mkdirSync(locations.original, {recursive:true});
  const file = path.join(locations.original, 'existing-profile.data');
  fs.writeFileSync(file, bytes);
  return {...locations, file, bytes, inode:fs.statSync(file, {bigint:true}).ino};
}
function assertSaved(saved) {
  assert.deepEqual(fs.readFileSync(saved.file), saved.bytes);
  assert.equal(fs.statSync(saved.file, {bigint:true}).ino, saved.inode);
}
function electron() {
  const calls = [], contexts = new Map();
  function open(factory, address) {
    calls.push({factory, address});
    const key = factory + ':' + address;
    if (!contexts.has(key)) contexts.set(key, {factory, address});
    return contexts.get(key);
  }
  return {calls, fromPartition:address => open('partition', address), fromPath:address => open('path', address)};
}
function resolveWindows(session, root) {
  // POSIX runs exercise the Windows strategy using real POSIX directory links
  // and a synthetic Session boundary; they are not Windows native qualification.
  return createIdentitySessionResolver({session, root, platform:'win32'});
}
function rootLength(base, length) {
  assert.ok(base.length + 2 <= length, 'The disposable fixture must leave room for the selected path length');
  const root = path.join(base, 'x'.repeat(length - base.length - 1));
  fs.mkdirSync(root);
  assert.equal(root.length, length);
  return root;
}
function existsNoFollow(file) {
  try { fs.lstatSync(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
function eexist() { const error = new Error('Synthetic concurrent creation'); error.code = 'EEXIST'; return error; }

test('Windows aliases preserve legacy partition spelling and compact the same 128 hash bits', () => {
  const root = 'C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\noxviola-native-Wsunh5\\profile\\engine';
  const id = '7d6dacd8-5002-4bb0-be7e-886b8eadeae7';
  const location = identityStoragePaths(root, id, path.win32);
  assert.equal(location.original, path.win32.join(root, 'Partitions', 'noxviola-identity-' + id));
  assert.equal(location.original.length, 140);
  assert.equal(path.win32.dirname(location.alias), path.win32.join(root, 'i'));
  assert.match(path.win32.basename(location.alias), /^[a-zA-Z0-9_-]{22}$/);
  assert.equal(location.alias.length, 99);
  assert.equal(fitsLegacyCacheStorage(location.original), false);
  assert.equal(fitsLegacyCacheStorage(location.alias), true);
  const upper = identityStoragePaths(root, 'Work', path.win32);
  assert.equal(upper.partition, 'persist:noxviola-identity-Work');
  assert.equal(upper.original, path.win32.join(root, 'Partitions', 'noxviola-identity-work'));
  assert.equal(upper.alias, identityStoragePaths(root, 'work', path.win32).alias);
  assert.equal(identityStoragePaths('D:\\', id, path.win32).root, 'D:\\');
  assert.equal(identityStoragePaths('\\\\server\\share\\profile', id, path.win32).original,
    '\\\\server\\share\\profile\\Partitions\\noxviola-identity-7d6dacd8-5002-4bb0-be7e-886b8eadeae7');
});

test('root and identity validation reject relative, device, ambiguous and traversal forms', () => {
  for (const root of ['relative', '\\profile', '\\\\server', '\\\\?\\C:\\profile', '\\\\.\\C:\\profile', 'C:\\owner.\\profile', 'C:\\owner \\profile']) {
    assert.throws(() => identityStoragePaths(root, 'personal', path.win32), {code:'IDENTITY_STORAGE_UNSAFE'});
  }
  for (const id of ['', '../other', 'a/b', 'a\\b', 'a.b', null, 4, 'a\0b']) {
    assert.throws(() => identityStoragePaths('C:\\profile', id, path.win32), {code:'IDENTITY_STORAGE_UNSAFE'});
  }
});

test('legacy budget includes uint64 deletion names, terminating NUL and canonical spellings', () => {
  const ofLength = length => 'C:\\' + 'x'.repeat(length - 3);
  // Root104 + separator/cache hierarchy/maximum doom filename155 =259.
  assert.equal(fitsLegacyCacheStorage(ofLength(104)), true);
  assert.equal(fitsLegacyCacheStorage(ofLength(105)), false);
  assert.equal(fitsLegacyCacheStorage(ofLength(100), ofLength(105)), false);
  assert.equal(fitsLegacyCacheStorage('\\\\?\\' + ofLength(104)), true);
  assert.equal(fitsLegacyCacheStorage('\\\\?\\' + ofLength(105)), false);
});

test('non-Windows keeps exact fromPartition, caches Sessions and creates no filesystem paths', t => {
  const base = fixture(t), root = path.join(base, 'not-created');
  for (const platform of ['linux', 'darwin']) {
    const session = electron(), resolve = createIdentitySessionResolver({session, root, platform});
    const first = resolve('Work');
    assert.equal(resolve('Work'), first);
    assert.deepEqual(session.calls, [{factory:'partition', address:'persist:noxviola-identity-Work'}]);
    assert.throws(() => resolve('work'), /same Electron partition/);
    assert.equal(existsNoFollow(root), false);
  }
});

test('short Windows profiles keep their original Session factory and data', t => {
  const root = fixture(t), saved = savedIdentity(root, 'a'), session = electron();
  assert.ok(fitsLegacyCacheStorage(saved.original, fs.realpathSync.native(saved.original)));
  const resolve = resolveWindows(session, root), first = resolve('a');
  assert.equal(resolve('a'), first);
  assert.deepEqual(session.calls, [{factory:'partition', address:'persist:noxviola-identity-a'}]);
  assert.equal(existsNoFollow(saved.aliasRoot), false);
  assertSaved(saved);
});

test('real compact links preserve existing profile bytes and do not recreate or move the target', t => {
  const root = fixture(t), saved = savedIdentity(root, 'Work');
  const targetInode = fs.statSync(saved.original, {bigint:true}).ino;
  const first = prepareIdentityAlias(root, 'Work'), second = prepareIdentityAlias(root, 'Work');
  assert.equal(first.locations.alias, second.locations.alias);
  assert.ok(fs.lstatSync(saved.alias).isSymbolicLink());
  assert.equal(fs.realpathSync.native(saved.alias), fs.realpathSync.native(saved.original));
  assert.equal(fs.statSync(saved.original, {bigint:true}).ino, targetInode);
  assert.deepEqual(fs.readFileSync(path.join(saved.alias, path.basename(saved.file))), saved.bytes);
  assertSaved(saved);
});

test('long Windows identities use an ordinary compact path and independent resolvers select one exact native address', t => {
  const base = fixture(t), root = rootLength(base, 75);
  const saved = savedIdentity(root, '7d6dacd8-5002-4bb0-be7e-886b8eadeae7'), session = electron();
  const firstResolver = resolveWindows(session, root), first = firstResolver(saved.identity);
  assert.equal(firstResolver(saved.identity), first);
  const second = resolveWindows(session, root)(saved.identity);
  assert.equal(second, first, 'The synthetic native factory keys contexts by the exact supplied path');
  assert.deepEqual(session.calls, [{factory:'path', address:saved.alias}, {factory:'path', address:saved.alias}]);
  assert.notEqual(saved.alias, fs.realpathSync.native(saved.alias), 'fromPath receives the compact spelling, not its long physical target');
  assert.equal(saved.alias.startsWith('\\\\?\\'), false);
  assertSaved(saved);
});

test('an existing verified alias remains authoritative even when the current profile path is short', t => {
  const root = fixture(t), saved = savedIdentity(root, 'a'), session = electron();
  prepareIdentityAlias(root, 'a');
  resolveWindows(session, root)('a');
  assert.deepEqual(session.calls, [{factory:'path', address:saved.alias}]);
  assertSaved(saved);
});

test('first initialization creates only the original directory and its verified link', t => {
  const root = fixture(t), prepared = prepareIdentityAlias(root, 'new_identity');
  assert.ok(fs.statSync(prepared.locations.original).isDirectory());
  assert.ok(fs.lstatSync(prepared.locations.alias).isSymbolicLink());
  assert.equal(fs.realpathSync.native(prepared.locations.alias), fs.realpathSync.native(prepared.locations.original));
  assert.deepEqual(fs.readdirSync(root).sort(), ['Partitions', 'i']);
});

test('foreign files and ordinary directories at the alias are preserved and never adopted', t => {
  for (const kind of ['file', 'directory']) {
    const base = fixture(t), root = path.join(base, kind); fs.mkdirSync(root);
    const location = identityStoragePaths(root, 'personal'); fs.mkdirSync(location.aliasRoot);
    if (kind === 'file') fs.writeFileSync(location.alias, 'foreign bytes\r\n');
    else fs.mkdirSync(location.alias);
    const session = electron();
    assert.throws(() => resolveWindows(session, root)('personal'), /foreign entry/);
    assert.deepEqual(session.calls, []);
    assert.equal(existsNoFollow(location.original), false);
    if (kind === 'file') assert.equal(fs.readFileSync(location.alias, 'utf8'), 'foreign bytes\r\n');
    else assert.ok(fs.lstatSync(location.alias).isDirectory());
  }
});

test('mismatched links and simulated digest collisions preserve both targets without retargeting', t => {
  const root = fixture(t), saved = savedIdentity(root, 'personal');
  const foreign = path.join(root, 'foreign'); fs.mkdirSync(foreign); fs.writeFileSync(path.join(foreign, 'marker'), 'foreign');
  link(foreign, saved.alias);
  const before = fs.readlinkSync(saved.alias), session = electron();
  assert.throws(() => resolveWindows(session, root)('personal'), /different identity directory/);
  assert.equal(fs.readlinkSync(saved.alias), before);
  assert.equal(fs.readFileSync(path.join(foreign, 'marker'), 'utf8'), 'foreign');
  assert.deepEqual(session.calls, []);
  assertSaved(saved);
});

test('a dangling existing alias never recreates a missing identity profile', t => {
  const root = fixture(t), location = identityStoragePaths(root, 'personal');
  link(location.original, location.alias);
  const before = fs.readlinkSync(location.alias), session = electron();
  assert.throws(() => resolveWindows(session, root)('personal'), /original identity directory is missing/);
  assert.equal(existsNoFollow(location.original), false);
  assert.equal(existsNoFollow(location.partitions), false);
  assert.equal(fs.readlinkSync(location.alias), before);
  assert.deepEqual(session.calls, []);
});

test('an alias parent that is a link is rejected before any identity initialization', t => {
  const base = fixture(t), root = path.join(base, 'profile'), foreign = path.join(base, 'foreign');
  fs.mkdirSync(root); fs.mkdirSync(foreign);
  const location = identityStoragePaths(root, 'personal'); link(foreign, location.aliasRoot);
  assert.throws(() => prepareIdentityAlias(root, 'personal'), /ordinary directory/);
  assert.equal(existsNoFollow(location.original), false);
  assert.deepEqual(fs.readdirSync(foreign), []);
});

test('case aliases are refused across resolver instances without touching the original ID', t => {
  const root = fixture(t), saved = savedIdentity(root, 'Work'), session = electron();
  resolveWindows(session, root)('Work');
  assert.throws(() => resolveWindows(session, root)('work'), /same Electron partition/);
  assert.equal(session.calls.length, 1);
  assertSaved(saved);
});

test('distinct IDs with preexisting target links cannot share a physical directory', t => {
  const root = fixture(t), saved = savedIdentity(root, 'first'), second = identityStoragePaths(root, 'second');
  link(saved.original, second.original);
  const session = electron();
  resolveWindows(session, root)('first');
  assert.throws(() => resolveWindows(session, root)('second'), /same physical directory/);
  assert.equal(session.calls.length, 1);
  assert.equal(existsNoFollow(second.alias), false);
  assertSaved(saved);
});

test('canonical path comparison never case-folds foreign targets when file IDs are unavailable', t => {
  const root = fixture(t), saved = savedIdentity(root, 'personal'), foreign = path.join(root, 'foreign');
  fs.mkdirSync(foreign); link(foreign, saved.alias);
  const realpath = file => file === saved.original ? 'C:\\Case' : file === saved.alias ? 'C:\\case' : fs.realpathSync.native(file);
  realpath.native = realpath;
  const filesystem = {...fs, realpathSync:realpath, statSync(file, options) {
    const stat = fs.statSync(file, options);
    return {...stat, dev:0n, ino:0n, isDirectory:() => stat.isDirectory()};
  }};
  assert.throws(() => prepareIdentityAlias(root, 'personal', {filesystem}), /different identity directory/);
  assertSaved(saved);
});

test('a concurrent correct link is verified after EEXIST without replacing it', t => {
  const root = fixture(t), saved = savedIdentity(root, 'personal');
  let attempts = 0;
  const filesystem = {...fs, symlinkSync(target, alias, type) {
    attempts++; fs.symlinkSync(target, alias, type); throw eexist();
  }};
  const result = prepareIdentityAlias(root, 'personal', {filesystem});
  assert.equal(attempts, 1);
  assert.equal(result.alias.canonical, fs.realpathSync.native(saved.original));
  assertSaved(saved);
});

test('a concurrent foreign link is preserved and rejected after EEXIST', t => {
  const root = fixture(t), saved = savedIdentity(root, 'personal'), foreign = path.join(root, 'foreign');
  fs.mkdirSync(foreign);
  const filesystem = {...fs, symlinkSync(_target, alias, type) {
    fs.symlinkSync(foreign, alias, type); throw eexist();
  }};
  assert.throws(() => prepareIdentityAlias(root, 'personal', {filesystem}), /different identity directory/);
  assert.equal(fs.realpathSync.native(saved.alias), fs.realpathSync.native(foreign));
  assertSaved(saved);
});

test('a concurrent alias-root link cannot redirect new junction creation', t => {
  const root = fixture(t), saved = savedIdentity(root, 'personal'), foreign = path.join(root, 'foreign');
  fs.mkdirSync(foreign);
  const filesystem = {...fs, mkdirSync(file) {
    if (file === saved.aliasRoot) { fs.symlinkSync(foreign, file, 'junction'); throw eexist(); }
    return fs.mkdirSync(file);
  }};
  assert.throws(() => prepareIdentityAlias(root, 'personal', {filesystem}), /ordinary directory/);
  assert.deepEqual(fs.readdirSync(foreign), []);
  assertSaved(saved);
});

test('junction permission failure is visible and leaves existing data intact', t => {
  const root = fixture(t), saved = savedIdentity(root, 'personal');
  const filesystem = {...fs, symlinkSync() { const error = new Error('Synthetic junction refusal'); error.code = 'EPERM'; throw error; }};
  assert.throws(() => prepareIdentityAlias(root, 'personal', {filesystem}), {code:'EPERM'});
  assert.equal(existsNoFollow(saved.alias), false);
  assertSaved(saved);
});

test('cached Sessions refuse later link retargeting without invoking another factory', t => {
  const root = fixture(t), saved = savedIdentity(root, 'personal'), session = electron();
  prepareIdentityAlias(root, 'personal');
  const resolve = resolveWindows(session, root); resolve('personal');
  const foreign = path.join(root, 'foreign'); fs.mkdirSync(foreign);
  fs.unlinkSync(saved.alias); fs.symlinkSync(foreign, saved.alias, 'junction');
  assert.throws(() => resolve('personal'), /different identity directory/);
  assert.equal(session.calls.length, 1);
  assertSaved(saved);
});

test('a Session cannot switch fromPartition to fromPath across resolver instances', t => {
  const root = fixture(t), saved = savedIdentity(root, 'a'), session = electron();
  resolveWindows(session, root)('a');
  prepareIdentityAlias(root, 'a');
  assert.throws(() => resolveWindows(session, root)('a'), /different Session factory/);
  assert.deepEqual(session.calls, [{factory:'partition', address:'persist:noxviola-identity-a'}]);
  assertSaved(saved);
});

test('a failed native factory retries only the same verified mapping', t => {
  const root = fixture(t), saved = savedIdentity(root, 'personal'), session = electron();
  prepareIdentityAlias(root, 'personal');
  const open = session.fromPath; let attempts = 0;
  session.fromPath = address => { attempts++; if (attempts === 1) throw new Error('Synthetic native Session failure'); return open(address); };
  const resolve = resolveWindows(session, root);
  assert.throws(() => resolve('personal'), /Synthetic native Session failure/);
  assert.equal(resolve('personal').address, saved.alias);
  assert.equal(attempts, 2);
  assertSaved(saved);
});

test('an overlong compact root fails before profile or link creation, without fallback', t => {
  const base = fixture(t), root = rootLength(base, 105), session = electron();
  const location = identityStoragePaths(root, 'personal');
  assert.throws(() => resolveWindows(session, root)('personal'), /remains too long/);
  assert.equal(existsNoFollow(location.original), false);
  assert.equal(existsNoFollow(location.aliasRoot), false);
  assert.deepEqual(session.calls, []);
});

test('copied absolute junctions are not silently retargeted to a restored profile', t => {
  const base = fixture(t), oldRoot = path.join(base, 'old'), newRoot = path.join(base, 'new');
  fs.mkdirSync(oldRoot); fs.mkdirSync(newRoot);
  const old = savedIdentity(oldRoot, 'personal'), restored = savedIdentity(newRoot, 'personal', old.bytes);
  link(old.original, restored.alias);
  const before = fs.readlinkSync(restored.alias), session = electron();
  assert.throws(() => resolveWindows(session, newRoot)('personal'), /different identity directory/);
  assert.equal(fs.readlinkSync(restored.alias), before);
  assert.deepEqual(session.calls, []);
  assertSaved(old); assertSaved(restored);
});

test('an existing short identity that disappears is refused without recreating it', t => {
  const root = fixture(t), saved = savedIdentity(root, 'a'), session = electron();
  const resolve = resolveWindows(session, root); resolve('a');
  const retained = path.join(root, 'retained-original'); fs.renameSync(saved.original, retained);
  assert.throws(() => resolve('a'), /original directory changed/);
  assert.equal(existsNoFollow(saved.original), false);
  assert.deepEqual(fs.readFileSync(path.join(retained, path.basename(saved.file))), saved.bytes);
  assert.equal(session.calls.length, 1);
});

test('a newly initialized short identity captures its physical directory before later replacement', t => {
  const root = fixture(t), location = identityStoragePaths(root, 'a'), session = electron();
  const open = session.fromPartition;
  session.fromPartition = address => { fs.mkdirSync(location.original, {recursive:true}); return open(address); };
  const resolve = resolveWindows(session, root); resolve('a'); resolve('a');
  const retained = path.join(root, 'retained-original'); fs.renameSync(location.original, retained);
  fs.mkdirSync(location.original);
  assert.throws(() => resolve('a'), /original directory changed/);
  assert.equal(session.calls.length, 1);
  assert.ok(fs.statSync(retained).isDirectory());
});
