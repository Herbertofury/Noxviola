'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const storage = require('../browser/storage.cjs');
const {BookmarkService, decode, rootIds} = require('../browser/bookmarks.cjs');

function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nox-bookmarks-')); t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const file = path.join(directory, 'bookmarks.json'), events = [];
  const setup = {file, getIdentities: () => ['personal', 'work'], onChange: event => events.push(event), ...options};
  const service = new BookmarkService(setup); service.open();
  return {service, file, events, reopen: () => { const next = new BookmarkService(setup); next.open(); return next; }};
}
test('bookmark trees have protected identity roots and reading a new tree performs no write', t => {
  const {service, file} = fixture(t), ids = rootIds('personal'), [tree] = service.getTree('personal');
  assert.equal(tree.id, ids.root); assert.equal(tree.parentId, undefined);
  assert.deepEqual(tree.children.map(child => child.id), [ids.bar, ids.other]);
  assert.equal(fs.existsSync(file), false);
  for (const protectedId of Object.values(ids)) {
    assert.throws(() => service.update('personal', protectedId, {title: 'Renamed'}), /Protected/);
    assert.throws(() => service.removeTree('personal', protectedId), /Protected/);
    assert.throws(() => service.move('personal', protectedId, {parentId: ids.other}), /Protected/);
  }
  assert.throws(() => service.create('personal', {parentId: ids.root, title: 'Forbidden'}), /writable/);
  assert.throws(() => service.create('personal', {parentId: null, title: 'Invalid default'}), /ID/);
  assert.throws(() => service.get('work', ids.bar), error => error.code === 'NOT_FOUND');
});
test('hierarchical create/edit/move/reorder/remove persists stable IDs and consecutive sibling positions', t => {
  let now = 1000;
  const {service, reopen, events} = fixture(t, {now: () => now++}), ids = rootIds('personal');
  const folder = service.create('personal', {parentId: ids.bar, title: 'Research'});
  const nested = service.create('personal', {parentId: folder.id, title: 'Nested'});
  const first = service.create('personal', {parentId: folder.id, title: 'First', url: 'https://first.example/'});
  const second = service.create('personal', {parentId: folder.id, index: 1, title: 'Second', url: 'https://second.example/'});
  const separator = service.create('personal', {parentId: folder.id, type: 'separator', index: 0});
  assert.deepEqual(service.getChildren('personal', folder.id).map(node => node.id), [separator.id, nested.id, second.id, first.id]);
  service.move('personal', first.id, {parentId: nested.id});
  service.move('personal', second.id, {index: 0});
  service.reorder('personal', folder.id, [nested.id, separator.id, second.id]);
  service.update('personal', first.id, {title: 'Edited', tags: ['Reference', 'Reading']});
  service.markUsed('personal', first.id);
  const restored = reopen(), [tree] = restored.getSubTree('personal', folder.id);
  assert.equal(tree.children[0].id, nested.id); assert.equal(tree.children[0].children[0].id, first.id);
  assert.equal(tree.children[0].children[0].title, 'Edited'); assert.deepEqual(tree.children[0].children[0].tags, ['Reference', 'Reading']);
  assert.equal(typeof tree.children[0].children[0].dateLastUsed, 'number');
  assert.deepEqual(tree.children.map(node => node.index), [0, 1, 2]);
  assert.throws(() => restored.remove('personal', folder.id), /not empty/);
  assert.deepEqual(restored.remove('personal', separator.id), {removed: 1});
  assert.deepEqual(restored.getChildren('personal', folder.id).map(node => node.index), [0, 1]);
  assert.deepEqual(restored.removeTree('personal', folder.id), {removed: 4});
  assert.equal(reopen().getChildren('personal', ids.bar).length, 0);
  assert.equal(events.filter(event => event.type === 'moved').length, 2);
  assert.equal(events.filter(event => event.type === 'reordered').length, 1);
});
test('bookmark search supports terms, phrases, exact fields and tags without cross-identity results', t => {
  const {service} = fixture(t);
  const first = service.create('personal', {title: 'Guide to Long Documents', url: 'https://example.com/guide', tags: ['Docs']});
  service.create('personal', {title: 'Longer Document', url: 'https://example.com/other'});
  const folder = service.create('personal', {title: 'Long Documents folder'});
  service.create('work', {title: 'Guide to Long Documents', url: 'https://example.com/guide', tags: ['Docs']});
  assert.deepEqual(service.search('personal', '"long documents" EXAMPLE').map(node => node.id), [first.id]);
  assert.deepEqual(service.search('personal', {title: 'Guide to Long Documents', url: 'https://example.com/guide', tags: ['Docs']}).map(node => node.id), [first.id]);
  assert.deepEqual(service.search('personal', {type: 'folder'}).map(node => node.id), [folder.id]);
  assert.equal(service.getRecent('personal', 50).length, 2);
  assert.throws(() => service.move('work', first.id, {parentId: rootIds('work').other}), error => error.code === 'NOT_FOUND');
  assert.throws(() => service.create('personal', {parentId: rootIds('work').other, title: 'Cross identity'}), error => error.code === 'NOT_FOUND');
  const result = service.get('personal', first.id); result[0].tags.push('External mutation');
  assert.deepEqual(service.get('personal', first.id)[0].tags, ['Docs']);
});
test('cycles, invalid indexes, partial reorder and credential URLs never alter a bookmark checkpoint', t => {
  const {service, file} = fixture(t);
  const parent = service.create('personal', {title: 'Parent'}), child = service.create('personal', {parentId: parent.id, title: 'Child'});
  const bookmark = service.create('personal', {parentId: child.id, url: 'https://example.com/', title: 'Leaf'});
  const before = fs.readFileSync(file);
  assert.throws(() => service.move('personal', parent.id, {parentId: child.id}), /descendants/);
  assert.throws(() => service.move('personal', child.id, {parentId: child.id}), /itself/);
  assert.throws(() => service.create('personal', {parentId: bookmark.id, title: 'Invalid child'}), /writable/);
  assert.throws(() => service.move('personal', child.id, {index: 100}), /outside/);
  assert.throws(() => service.reorder('personal', parent.id, []), /every child/);
  assert.throws(() => service.update('personal', parent.id, {url: 'https://example.com/'}), /converted/);
  for (const address of ['https://user:secret@example.com/', 'javascript:alert(1)', 'file:///private']) assert.throws(() => service.create('personal', {url: address}), /HTTP/);
  assert.deepEqual(fs.readFileSync(file), before);
});
test('unchanged bookmark ordering does not rotate checkpoints or emit false move/reorder events', t => {
  let now = 1000;
  const {service, file, events} = fixture(t, {now: () => now++});
  const a = service.create('personal', {title: 'A'}), b = service.create('personal', {title: 'B'});
  const primary = fs.readFileSync(file), previous = fs.readFileSync(`${file}.previous`), count = events.length;
  service.move('personal', a.id, {index: 0}); service.reorder('personal', rootIds('personal').other, [a.id, b.id]);
  assert.equal(events.length, count); assert.deepEqual(fs.readFileSync(file), primary); assert.deepEqual(fs.readFileSync(`${file}.previous`), previous);
});
test('failed saves and stale bookmark writers never publish successful mutation events', t => {
  const {service, file, events, reopen} = fixture(t);
  const node = service.create('personal', {title: 'Saved', url: 'https://saved.example/'}), stale = reopen();
  service.update('personal', node.id, {title: 'Current'});
  const bytes = fs.readFileSync(file), count = events.filter(event => event.type === 'changed').length;
  assert.throws(() => stale.update('personal', node.id, {title: 'Stale overwrite'}), error => error.code === 'STALE_PREVIEW');
  const original = storage.write;
  t.mock.method(storage, 'write', () => { throw new Error('Synthetic bookmark I/O failure'); });
  assert.throws(() => service.update('personal', node.id, {title: 'Unwritten'}), /I\/O/);
  assert.equal(events.filter(event => event.type === 'changed').length, count); assert.deepEqual(fs.readFileSync(file), bytes);
  storage.write = original; service.open(); assert.equal(service.get('personal', node.id)[0].title, 'Current');
});
test('bookmark metadata survives edits, duplicate data is rejected and recovery preserves exact damaged bytes', t => {
  const {service, file, reopen} = fixture(t);
  const node = service.create('personal', {title: 'Original', url: 'https://example.com/'});
  const raw = storage.parse(fs.readFileSync(file)); raw.extra = {future: true}; raw.nodes.find(row => row.id === node.id).custom = {retained: [1, 2]};
  fs.writeFileSync(file, JSON.stringify(raw)); service.open(); service.update('personal', node.id, {title: 'Edited'});
  const current = storage.parse(fs.readFileSync(file)); assert.deepEqual(current.extra, raw.extra); assert.deepEqual(current.nodes.find(row => row.id === node.id).custom, {retained: [1, 2]});
  assert.equal(service.get('personal', node.id)[0].custom, undefined);
  assert.throws(() => decode({...current, nodes: [...current.nodes, current.nodes.at(-1)]}), /repeated/);
  assert.throws(() => decode({...current, nodes: current.nodes.map(row => row.id === node.id ? {...row, parentId: 'missing'} : row)}), /missing/);
  const previous = fs.readFileSync(`${file}.previous`); fs.writeFileSync(file, '{damaged bookmark tree');
  assert.equal(service.open().status, 'recovery'); assert.throws(() => service.getTree('personal'), /explicitly recovered/);
  const restored = service.recover(); assert.equal(fs.readFileSync(restored.preserved, 'utf8'), '{damaged bookmark tree'); assert.deepEqual(fs.readFileSync(file), previous);
  fs.writeFileSync(file, '{"version":2,"nodes":[]}'); assert.throws(() => reopen(), error => error.code === 'UNSUPPORTED_VERSION');
  assert.equal(fs.readFileSync(file, 'utf8'), '{"version":2,"nodes":[]}');
});
test('deep bookmark hierarchies survive restart and complete subtree removal without a depth cap', t => {
  const {service, file, reopen} = fixture(t);
  const first = service.create('personal', {title: 'Level 0'}), document = storage.parse(fs.readFileSync(file));
  let parentId = first.id;
  for (let level = 1; level <= 512; level++) {
    const node = {id: `deep-${level}`, identity: 'personal', parentId, index: 0, type: 'folder', title: `Level ${level}`, dateAdded: 0, dateGroupModified: 0, tags: []};
    document.nodes.push(node); parentId = node.id;
  }
  storage.write(file, document, decode); const restored = reopen();
  let count = 0, [current] = restored.getSubTree('personal', first.id);
  while (current) { count++; [current] = current.children; }
  assert.equal(count, 513);
  assert.deepEqual(restored.removeTree('personal', first.id), {removed: 513});
  assert.equal(reopen().search('personal').length, 0);
});
