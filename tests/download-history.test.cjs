'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const storage = require('../browser/storage.cjs');
const {DownloadManager, decode} = require('../browser/downloads.cjs');

class Item extends EventEmitter {
  constructor(name = 'fixture.txt') { super(); this.name = name; this.path = ''; this.state = 'progressing'; this.received = 0; this.total = 100; this.paused = false; this.allowResume = false; this.calls = []; }
  getFilename() { return this.name; }
  getURL() { return `https://example.test/download/${this.name}`; }
  getTotalBytes() { return this.total; }
  getReceivedBytes() { return this.received; }
  getSavePath() { return this.path; }
  getState() { return this.state; }
  isPaused() { return this.paused; }
  canResume() { return this.paused || this.allowResume; }
  setSaveDialogOptions(options) { this.options = options; }
  pause() { this.calls.push('pause'); this.paused = true; }
  resume() { this.calls.push('resume'); this.paused = false; this.allowResume = false; this.state = 'progressing'; }
  cancel() { this.calls.push('cancel'); this.finish('cancelled'); }
  update(state = this.state) { this.state = state; this.emit('updated', {}, state); }
  finish(state = 'completed') { this.state = state; this.emit('done', {}, state); }
}
function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nox-download-history-'));
  const file = path.join(directory, 'downloads.json'), reveals = [], all = [];
  const config = {file, directory, reveal: value => reveals.push(value), getIdentities: () => ['personal', 'work'], ...options};
  function make(open = true) { const result = new DownloadManager(config); all.push(result); if (open) result.open(); return result; }
  const manager = make(), sessions = new Map();
  function start(owner = 'personal', name = 'fixture.txt') {
    if (!sessions.has(owner)) { const session = new EventEmitter(); manager.attach(session, owner); sessions.set(owner, session); }
    const item = new Item(name); sessions.get(owner).emit('will-download', {}, item);
    return {item, id: manager.list().at(-1).id};
  }
  t.after(() => { for (const value of all) value.dispose(); fs.rmSync(directory, {recursive: true, force: true}); });
  return {directory, file, manager, reveals, sessions, make, start};
}
function choose(item, directory) { item.path = path.join(directory, item.name); item.received = 15; item.update(); }
function read(file) { return storage.parse(fs.readFileSync(file)); }

test('durable history retains completed, canceled, native-interrupted and unfinished results without reviving native items', t => {
  const {directory, file, manager, make, start, reveals} = fixture(t);
  const done = start('personal', 'done.txt'); choose(done.item, directory); done.item.received = 100; done.item.finish();
  fs.writeFileSync(done.item.path, 'downloaded bytes stay untouched');
  const canceled = start('work', 'canceled.txt'); canceled.item.cancel();
  const interrupted = start('work', 'interrupted.txt'); choose(interrupted.item, directory); interrupted.item.allowResume = true; interrupted.item.update('interrupted'); interrupted.item.finish('interrupted');
  const pending = start('personal', 'pending.txt'); choose(pending.item, directory); manager.action(pending.id, 'pause');
  const choosing = start('work', 'choosing.txt');
  const original = fs.readFileSync(file), restored = make(), rows = restored.list();
  assert.deepEqual(rows.map(row => row.id), manager.list().map(row => row.id));
  assert.deepEqual(fs.readFileSync(file), original, 'opening history is read-only');
  assert.equal(restored.activeCount(), 0); assert.equal(rows.length, 5);
  for (const row of rows) { assert.equal(row.hasNativeItem, false); assert.equal(row.canResume, false); assert.equal(row.restored, true); assert.equal(row.historySaved, true); }
  assert.equal(rows[0].state, 'completed'); assert.equal(rows[0].received, 100); assert.equal(rows[0].path, done.item.path);
  assert.equal(rows[1].state, 'cancelled'); assert.equal(rows[2].state, 'interrupted'); assert.equal(rows[2].interruptedByRestart, false);
  for (const key of [pending.id, choosing.id]) {
    const row = rows.find(value => value.id === key); assert.equal(row.state, 'interrupted'); assert.equal(row.terminal, true); assert.equal(row.paused, false);
    assert.equal(row.interruptedByRestart, true); assert.equal(row.finishedAt, undefined); assert.match(row.error, /previous process/);
    assert.throws(() => restored.action(key, 'resume'), /no live native item/);
    assert.throws(() => restored.action(key, 'retry'), error => error.code === 'UNSUPPORTED_OPERATION');
  }
  assert.equal(rows[3].savedState, 'progressing'); assert.equal(rows[4].savedState, 'choosing-location');
  restored.action(done.id, 'reveal'); assert.deepEqual(reveals, [done.item.path]);
  restored.remove(done.id); assert.equal(fs.readFileSync(done.item.path, 'utf8'), 'downloaded bytes stay untouched');
});

test('only lifecycle boundaries write history; byte progress invalidates without cloning or polling the full list', async t => {
  const {directory, file, manager, start} = fixture(t);
  const original = storage.write; let writes = 0, changes = 0, lists = 0; const statuses = [];
  t.mock.method(storage, 'write', (...args) => { writes++; return original(...args); });
  manager.on('change', (...args) => { assert.equal(args.length, 0); changes++; }); manager.on('status', value => statuses.push(value));
  const {item, id} = start(); assert.equal(writes, 1); choose(item, directory); assert.equal(writes, 2);
  const saved = fs.readFileSync(file); t.mock.method(manager, 'list', () => { lists++; throw new Error('Hidden progress must not snapshot the history.'); });
  for (let i = 16; i < 90; i++) { item.received = i; item.update(); }
  await Promise.resolve(); assert.equal(lists, 0); assert.equal(writes, 2); assert.deepEqual(fs.readFileSync(file), saved); assert.equal(changes, 1);
  manager.action(id, 'pause'); assert.equal(writes, 3); manager.action(id, 'resume'); assert.equal(writes, 4);
  item.received = 97; item.update(); assert.equal(writes, 4); manager.flush(); assert.equal(writes, 5); assert.equal(read(file).downloads[0].received, 97);
  item.received = 100; item.finish(); assert.equal(writes, 6); await Promise.resolve();
  assert.ok(statuses.every(status => status.persistent && status.pendingCount === 0 && status.recoveryAvailable === false));
});

test('disk failure preserves live controls and prior bytes; explicit reopen and flush retain callbacks and terminal results', t => {
  const {directory, file, manager, make, start} = fixture(t);
  const first = start('personal', 'saved.txt'); choose(first.item, directory); first.item.finish();
  const primary = fs.readFileSync(file), previous = fs.readFileSync(`${file}.previous`), write = storage.write;
  t.mock.method(storage, 'write', () => { throw Object.assign(new Error('Synthetic disk full'), {code: 'ENOSPC'}); });
  const current = start('work', 'unsaved.txt'); choose(current.item, directory); manager.action(current.id, 'pause');
  assert.equal(manager.activeCount(), 1); assert.equal(manager.status, 'error'); assert.equal(manager.getStatus().pendingCount, 1);
  assert.equal(manager.list().at(-1).historySaved, false); assert.equal(manager.list().at(-1).historyPending, true); assert.equal(manager.list().at(-1).paused, true);
  assert.deepEqual(fs.readFileSync(file), primary); assert.deepEqual(fs.readFileSync(`${file}.previous`), previous); assert.throws(() => manager.flush(), /disk full/);
  storage.write = write; manager.open(); assert.equal(manager.list().at(-1).hasNativeItem, true); assert.equal(manager.getStatus().pendingCount, 1);
  manager.action(current.id, 'resume'); current.item.received = 100; current.item.finish();
  assert.equal(manager.list().at(-1).state, 'completed', 'reopening must retain the objects held by native listener closures');
  assert.equal(manager.list().at(-1).historySaved, true); assert.equal(manager.getStatus().pendingCount, 0); assert.equal(make().list().at(-1).received, 100);
});

test('corrupt history requires explicit exact-byte recovery while new native downloads remain usable', t => {
  const {directory, file, manager, make, start} = fixture(t);
  const old = start('personal', 'older.txt'); choose(old.item, directory); old.item.finish(); manager.flush();
  const previous = fs.readFileSync(`${file}.previous`), corrupt = Buffer.from('{ damaged download checkpoint');
  fs.writeFileSync(file, corrupt); const recovering = make(false); const opened = recovering.open();
  assert.equal(opened.status, 'recovery'); assert.equal(recovering.getStatus().recoveryAvailable, true); assert.deepEqual(recovering.list(), []);
  const session = new EventEmitter(); recovering.attach(session, 'work'); const item = new Item('live.txt'); session.emit('will-download', {}, item); choose(item, directory);
  assert.equal(recovering.activeCount(), 1); assert.equal(recovering.list()[0].historyPending, true); assert.deepEqual(fs.readFileSync(file), corrupt); assert.deepEqual(fs.readFileSync(`${file}.previous`), previous);
  assert.throws(() => recovering.flush(), /damaged|JSON|property|checkpoint/i);
  const result = recovering.recover(); assert.deepEqual(fs.readFileSync(result.preserved), corrupt); assert.equal(recovering.getStatus().recoveryAvailable, false);
  item.received = 100; item.finish(); recovering.flush();
  assert.equal(recovering.list().find(row => row.filename === 'live.txt').state, 'completed'); assert.equal(recovering.list().find(row => row.filename === 'live.txt').historySaved, true);
  assert.equal(make().list().find(row => row.filename === 'live.txt').received, 100);
});

test('future versions and ambiguous identity aliases cannot fall back to a previous history checkpoint', t => {
  const {file, manager, make, start} = fixture(t);
  const first = start(); first.item.cancel(); manager.flush();
  const previous = fs.readFileSync(`${file}.previous`);
  for (const document of [{version: 2, downloads: []}, {...read(file), downloads: [{...read(file).downloads[0], identity: 'Personal'}]}]) {
    const bytes = Buffer.from(JSON.stringify(document)); fs.writeFileSync(file, bytes); const blocked = make(false);
    assert.throws(() => blocked.open(), error => ['UNSUPPORTED_VERSION', 'UNSUPPORTED_DATA'].includes(error.code));
    assert.equal(blocked.getStatus().recoveryAvailable, false); assert.deepEqual(blocked.list(), []);
    const session = new EventEmitter(), item = new Item(); blocked.attach(session, 'personal'); session.emit('will-download', {}, item); item.cancel();
    assert.equal(blocked.list()[0].state, 'cancelled'); assert.equal(blocked.list()[0].historySaved, false);
    assert.throws(() => blocked.flush(), /Unsupported|alias/); assert.deepEqual(fs.readFileSync(file), bytes); assert.deepEqual(fs.readFileSync(`${file}.previous`), previous);
  }
});

test('external edits are preserved and an adoption conflict cannot be bypassed by a later flush', t => {
  const {directory, file, manager, start} = fixture(t);
  const {item, id} = start(); choose(item, directory);
  const external = read(file); external.downloads[0].futureMetadata = {note: 'An external edit must survive'}; storage.write(file, external, decode);
  const primary = fs.readFileSync(file), previous = fs.readFileSync(`${file}.previous`);
  manager.action(id, 'pause'); assert.equal(manager.status, 'error'); assert.equal(manager.list()[0].paused, true);
  assert.throws(() => manager.open(), error => error.code === 'STALE_PREVIEW');
  assert.throws(() => manager.flush(), /outside this manager/); assert.deepEqual(fs.readFileSync(file), primary); assert.deepEqual(fs.readFileSync(`${file}.previous`), previous);
  assert.equal(manager.list()[0].hasNativeItem, true); assert.equal(manager.list()[0].historySaved, false);
});

test('remove and identity clear are durable metadata-only operations and reject targeted live downloads before mutation', t => {
  const {directory, file, manager, make, start} = fixture(t);
  const personal = start('personal', 'p.txt'); choose(personal.item, directory); personal.item.finish(); fs.writeFileSync(personal.item.path, 'personal payload');
  const work = start('work', 'w.txt'); choose(work.item, directory); fs.writeFileSync(work.item.path, 'work payload');
  const bytes = fs.readFileSync(file);
  assert.throws(() => manager.remove(work.id), error => error.code === 'ACTIVE_DOWNLOAD');
  assert.throws(() => manager.clear(), error => error.code === 'ACTIVE_DOWNLOAD'); assert.deepEqual(fs.readFileSync(file), bytes);
  assert.deepEqual(manager.clear({identity: 'personal'}), {removed: 1, persisted: true}); assert.equal(manager.list().length, 1);
  assert.equal(make().list({identity: 'personal'}).length, 0); assert.equal(fs.readFileSync(personal.item.path, 'utf8'), 'personal payload');
  work.item.finish('interrupted'); assert.deepEqual(manager.remove(work.id), {removed: 1, persisted: true}); assert.deepEqual(make().list(), []);
  assert.equal(fs.readFileSync(work.item.path, 'utf8'), 'work payload');
  assert.throws(() => manager.clear({deleteFiles: true}), /unsupported field/); assert.throws(() => manager.remove('missing'), error => error.code === 'NOT_FOUND');
});

test('failed history removal returns failure without hiding the row or modifying last-good bytes', t => {
  const {file, manager, start} = fixture(t); const {item, id} = start(); item.cancel();
  const primary = fs.readFileSync(file), previous = fs.readFileSync(`${file}.previous`);
  t.mock.method(storage, 'write', () => { throw new Error('Synthetic removal save failure'); });
  assert.throws(() => manager.remove(id), /save failure/); assert.equal(manager.list()[0].id, id);
  assert.deepEqual(fs.readFileSync(file), primary); assert.deepEqual(fs.readFileSync(`${file}.previous`), previous);
});

test('unknown document/record metadata and unlimited complete history survive writes and restart', t => {
  const {file, manager, make, start} = fixture(t); const first = start(); first.item.cancel();
  const template = read(file).downloads[0]; const document = {version: 1, futureDocument: {keep: ['exact', 17]}, downloads: Array.from({length: 1250}, (_, index) => ({...template, id: `saved-${index}`, identity: index % 2 ? 'work' : 'personal', futureRecord: {ordinal: index, keep: true}}))};
  storage.write(file, document, decode); manager.open(); assert.equal(manager.list().length, 1250); assert.equal(manager.list({identity: 'work'}).length, 625);
  const callerCopy = manager.list(); callerCopy[0].futureRecord.keep = false; assert.equal(manager.list()[0].futureRecord.keep, true);
  const second = start('work', 'new.txt'); second.item.cancel(); assert.equal(make().list().length, 1251);
  assert.deepEqual(read(file).futureDocument, document.futureDocument); assert.deepEqual(read(file).downloads[1234], document.downloads[1234]);
});

test('schema refuses duplicate IDs, contradictory terminal states and unsupported native states', t => {
  const {file, start} = fixture(t); const {item} = start(); item.cancel(); const good = read(file), row = good.downloads[0];
  assert.throws(() => decode({...good, downloads: [row, {...row}]}), /unique/);
  assert.throws(() => decode({...good, downloads: [{...row, canResume: true}]}), /inconsistent/);
  assert.throws(() => decode({...good, downloads: [{...row, received: -1}]}), /nonnegative/);
  assert.throws(() => decode({...good, downloads: [{...row, state: 'new-engine-state'}]}), error => error.code === 'UNSUPPORTED_DATA');
});

test('flush failures expose the unsaved progress snapshot and do not manufacture a successful close checkpoint', t => {
  const {directory, file, manager, start} = fixture(t); const {item} = start(); choose(item, directory); const primary = fs.readFileSync(file);
  item.received = 78; item.update(); assert.equal(manager.list()[0].historySaved, true, 'ordinary progress is newer than its last lifecycle checkpoint');
  t.mock.method(storage, 'write', () => { throw new Error('Synthetic close checkpoint failure'); });
  assert.throws(() => manager.flush(), /close checkpoint failure/); assert.equal(manager.getStatus().pendingCount, 1); assert.equal(manager.list()[0].historySaved, false);
  assert.equal(manager.list()[0].received, 78); assert.deepEqual(fs.readFileSync(file), primary);
});

test('Session identity is immutable and disposal removes native listeners without late history writes', async t => {
  const {file, manager, start, sessions} = fixture(t); const {item} = start(); const session = sessions.get('personal');
  assert.throws(() => manager.attach(session, 'work'), /two identities/); assert.throws(() => manager.attach(new EventEmitter(), 'PERSONAL'), /alias/);
  const before = fs.readFileSync(file); let events = 0; manager.on('change', () => events++); manager.dispose();
  assert.equal(session.listenerCount('will-download'), 0); assert.equal(item.listenerCount('updated'), 0); assert.equal(item.listenerCount('done'), 0);
  item.received = 100; item.finish(); item.update(); await Promise.resolve(); assert.equal(events, 0); assert.deepEqual(fs.readFileSync(file), before);
  assert.throws(() => manager.flush(), error => error.code === 'DISPOSED');
});

test('cancelActive waits for real asynchronous done and never persists a nonterminal cancelled getter state', async t => {
  const {directory, file, manager, start} = fixture(t);
  const first = start('personal', 'first.txt'); choose(first.item, directory);
  const second = start('work', 'second.txt'); choose(second.item, directory);
  first.item.cancel = function () { this.calls.push('cancel'); this.state = 'cancelled'; };
  let settled = false; const closing = manager.cancelActive().then(value => { settled = true; return value; });
  await Promise.resolve(); assert.equal(settled, false); assert.equal(manager.activeCount(), 1);
  assert.equal(manager.list().find(row => row.id === first.id).cancelPending, true);
  assert.equal(read(file).downloads.find(row => row.id === first.id).state, 'progressing');
  assert.equal(read(file).downloads.find(row => row.id === first.id).terminal, false);
  assert.throws(() => manager.action(first.id, 'pause'), error => error.code === 'CANCEL_PENDING');
  manager.action(first.id, 'cancel'); assert.deepEqual(first.item.calls, ['cancel'], 'a pending cancellation is not sent again');
  first.item.finish('cancelled'); assert.deepEqual(await closing, {settled: 2}); manager.flush();
  assert.equal(manager.activeCount(), 0); assert.ok(read(file).downloads.every(row => row.state === 'cancelled' && row.terminal && row.finishedAt));
});

test('a cancellation exception rejects close and removes its settlement observers without inventing a done result', async t => {
  const {manager, start} = fixture(t); const first = start('personal', 'waiting.txt'); const second = start('work', 'failed.txt');
  first.item.cancel = function () { this.calls.push('cancel'); };
  second.item.cancel = () => { throw new Error('Synthetic native cancellation failure'); };
  await assert.rejects(manager.cancelActive(), /native cancellation failure/);
  assert.equal(manager.activeCount(), 2); assert.match(manager.list().find(row => row.id === second.id).error, /native cancellation failure/);
  assert.ok([...manager.records.values()].every(row => row.waiters.size === 0), 'a rejected close must not retain settlement observers');
  first.item.finish('cancelled'); second.item.cancel = function () { this.finish('cancelled'); };
  assert.deepEqual(await manager.cancelActive(), {settled: 1});
});

test('disposal rejects an unsettled native cancellation instead of resolving close successfully', async t => {
  const {manager, start} = fixture(t); const {item} = start(); item.cancel = () => {};
  const closing = manager.cancelActive(); const rejected = assert.rejects(closing, error => error.code === 'DISPOSED');
  manager.dispose(); await rejected; assert.equal(item.listenerCount('done'), 0); assert.equal(item.listenerCount('updated'), 0);
});

test('explicit recovery merges older same-record metadata without losing live callbacks or applying prototype setters', t => {
  const {directory, file, manager, start, make} = fixture(t); const {item, id} = start(); choose(item, directory);
  const previous = read(`${file}.previous`);
  Object.defineProperty(previous.downloads[0], '__proto__', {value: {unsafeInheritedField: 'must remain data'}, enumerable: true});
  previous.downloads[0].futureLabel = {kept: true};
  fs.writeFileSync(`${file}.previous`, JSON.stringify(previous)); fs.writeFileSync(file, '{ broken');
  assert.equal(manager.open().status, 'recovery'); const recovered = manager.recover(); assert.ok(recovered.preserved);
  assert.equal(manager.list()[0].hasNativeItem, true); assert.equal(manager.list()[0].historyPending, true);
  item.received = 100; item.finish(); manager.flush();
  const row = make().list().find(value => value.id === id);
  assert.equal(row.state, 'completed'); assert.equal(row.received, 100); assert.deepEqual(row.futureLabel, {kept: true});
  assert.equal(Object.hasOwn(row, '__proto__'), true); assert.deepEqual(row.__proto__, {unsafeInheritedField: 'must remain data'}); assert.equal(row.unsafeInheritedField, undefined);
});
