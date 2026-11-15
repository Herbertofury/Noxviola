'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const storage = require('../browser/storage.cjs');
const {WorkspaceService, decode, DEFAULT_WORKSPACE} = require('../browser/workspaces.cjs');

function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nox-workspaces-')); t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  const file = path.join(directory, 'workspaces.json'), events = [], setup = {file, onChange: event => events.push(event), ...options};
  const service = new WorkspaceService(setup); service.open();
  return {service, file, events, reopen: () => { const next = new WorkspaceService(setup); next.open(); return next; }};
}
test('workspace and tab-group definitions persist stable IDs, colors and collapsed state independently', t => {
  let now = 100;
  const {service, reopen, file} = fixture(t, {now: () => now++});
  assert.equal(service.list()[0].id, DEFAULT_WORKSPACE); assert.equal(fs.existsSync(file), false);
  const workspace = service.create({name: 'Research', color: 'blue'});
  const group = service.createGroup({workspaceId: workspace.id, name: 'Reading', color: 'green'});
  service.update(workspace.id, {name: 'Research and writing'}); service.updateGroup(group.id, {collapsed: true, color: 'purple'});
  const restored = reopen();
  assert.equal(restored.get(workspace.id).name, 'Research and writing');
  assert.deepEqual(restored.listGroups(workspace.id).map(row => [row.id, row.workspaceId, row.collapsed, row.color]), [[group.id, workspace.id, true, 'purple']]);
  assert.deepEqual(restored.listGroups(DEFAULT_WORKSPACE), []);
  assert.equal(Object.hasOwn(restored.getGroup(group.id), 'identity'), false);
  assert.equal(Object.hasOwn(restored.getGroup(group.id), 'tabs'), false);
  assert.throws(() => restored.create({name: 'Invalid', color: null}), /supported/);
  assert.throws(() => restored.createGroup({name: 'Invalid', collapsed: null}), /boolean/);
});
test('workspace/group removal refuses live assignments, remaining groups and the protected default', t => {
  const usedWorkspaces = new Set(), usedGroups = new Set();
  const {service, file} = fixture(t, {isWorkspaceInUse: id => usedWorkspaces.has(id), isGroupInUse: id => usedGroups.has(id)});
  const workspace = service.create({name: 'Project'}), group = service.createGroup({workspaceId: workspace.id, name: 'Sources'});
  usedWorkspaces.add(workspace.id); usedGroups.add(group.id); const bytes = fs.readFileSync(file);
  assert.throws(() => service.remove(DEFAULT_WORKSPACE), /default/);
  assert.throws(() => service.remove(workspace.id), error => error.code === 'IN_USE');
  assert.throws(() => service.removeGroup(group.id), error => error.code === 'IN_USE');
  assert.deepEqual(fs.readFileSync(file), bytes);
  usedWorkspaces.clear(); assert.throws(() => service.remove(workspace.id), /group definitions/);
  usedGroups.clear(); service.removeGroup(group.id); service.remove(workspace.id);
  assert.deepEqual(service.list().map(row => row.id), [DEFAULT_WORKSPACE]);
});
test('workspace updates preserve unknown metadata and unchanged edits preserve checkpoint history', t => {
  let now = 100;
  const {service, file} = fixture(t, {now: () => now++});
  const workspace = service.create({name: 'Custom'}), group = service.createGroup({workspaceId: workspace.id, name: 'Group'});
  const raw = storage.parse(fs.readFileSync(file)); raw.layout = {future: true}; raw.groups[0].extension = {retained: true};
  fs.writeFileSync(file, JSON.stringify(raw)); service.open(); service.updateGroup(group.id, {collapsed: true});
  const stored = storage.parse(fs.readFileSync(file)); assert.deepEqual(stored.layout, raw.layout); assert.deepEqual(stored.groups[0].extension, raw.groups[0].extension);
  const primary = fs.readFileSync(file), previous = fs.readFileSync(`${file}.previous`);
  service.update(workspace.id, {name: 'Custom'}); service.updateGroup(group.id, {collapsed: true});
  assert.deepEqual(fs.readFileSync(file), primary); assert.deepEqual(fs.readFileSync(`${file}.previous`), previous);
  assert.throws(() => decode({...stored, groups: [...stored.groups, stored.groups[0]]}), /repeated/);
  assert.throws(() => decode({...stored, groups: [{...stored.groups[0], workspaceId: 'missing'}]}), /missing/);
});
test('workspace disk failures and stale writers do not publish success or modify the saved definitions', t => {
  const {service, file, events, reopen} = fixture(t);
  const workspace = service.create({name: 'Saved'}), stale = reopen(); service.update(workspace.id, {name: 'Current'});
  const bytes = fs.readFileSync(file), count = events.filter(event => event.type === 'workspace-changed').length;
  assert.throws(() => stale.update(workspace.id, {name: 'Stale'}), error => error.code === 'STALE_PREVIEW');
  const original = storage.write; t.mock.method(storage, 'write', () => { throw new Error('Synthetic write denied'); });
  assert.throws(() => service.update(workspace.id, {name: 'Not saved'}), /denied/);
  assert.equal(events.filter(event => event.type === 'workspace-changed').length, count); assert.deepEqual(fs.readFileSync(file), bytes);
  storage.write = original; service.open(); assert.equal(service.get(workspace.id).name, 'Current');
});
test('workspace recovery preserves corrupt data and unsupported documents cannot replace existing checkpoints', t => {
  const {service, file, reopen} = fixture(t);
  const workspace = service.create({name: 'First'}); service.update(workspace.id, {name: 'Second'});
  const previous = fs.readFileSync(`${file}.previous`); fs.writeFileSync(file, '{broken workspaces');
  assert.equal(service.open().status, 'recovery'); assert.throws(() => service.create({name: 'Unsafe'}), /explicitly recovered/);
  const restored = service.recover(); assert.equal(fs.readFileSync(restored.preserved, 'utf8'), '{broken workspaces'); assert.deepEqual(fs.readFileSync(file), previous);
  fs.writeFileSync(file, '{"version":5,"future":true}'); assert.throws(() => reopen(), error => error.code === 'UNSUPPORTED_VERSION');
  assert.equal(fs.readFileSync(file, 'utf8'), '{"version":5,"future":true}');
  service.dispose(); assert.throws(() => service.list(), error => error.code === 'DISPOSED');
});
