'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const storage = require('../browser/storage.cjs');
const state = require('../browser/state.cjs');
const {SessionWriter} = require('../browser/session-writer.cjs');
function fixture(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nox-checkpoint-')); t.after(() => fs.rmSync(dir, {recursive: true, force: true})); return path.join(dir, 'session.json'); }
function snapshot(id) { return state.cleanState({tabs: [{id, url: 'https://example.com/', title: id, identity: 'personal', collection: 'Synthetic'}], extra: {retained: true}}); }
test('ambiguous JSON keys and inexact integers are preserved rather than rewritten', () => {
  for (const text of ['{"x":1,"x":2}', '{"nested":{"a":1,"\\u0061":2}}']) assert.throws(() => storage.parse(text), /Duplicate/);
  assert.deepEqual(storage.parse('{"x":"a,{}\\\"b","nested":[{"a":1},{"a":2}]}'), {x:'a,{}"b',nested:[{a:1},{a:2}]});
  for (const number of ['9007199254740993','1e400','1e-400','9007199254740991.1']) assert.throws(() => storage.parse(`{"x":${number}}`), /exact round-trip range/);
  assert.deepEqual(storage.parse('{"x":1.2300,"y":1e20}'), {x:1.23,y:1e20});
});
test('malformed UTF-8 and non-JSON values are rejected without altering source bytes', t => {
  const file = fixture(t), invalid = Buffer.concat([Buffer.from('{"version":1,"profiles":[],"tabs":[],"label":"caf'), Buffer.from([0xe9]), Buffer.from('"}')]);
  fs.writeFileSync(file,invalid);
  assert.throws(()=>storage.parse(invalid),/not valid UTF-8/);
  assert.throws(()=>state.inspectState(file),/not valid UTF-8/);
  assert.throws(()=>state.saveState(file,snapshot('replacement')),/not valid UTF-8/);
  assert.deepEqual(fs.readFileSync(file),invalid);
  assert.throws(()=>storage.write(`${file}.new`,{value:NaN},value=>value),/cannot preserve/);
  assert.equal(fs.existsSync(`${file}.new`),false);
  assert.deepEqual(storage.parse(Buffer.from('{"title":"café 🦊"}')),{title:'café 🦊'});
});
test('regular-file reader rejects links and directories and returns exact file bytes', t => {
  const file = fixture(t);fs.writeFileSync(file,'{"retained":true}');
  assert.deepEqual(storage.readRegular(file),fs.readFileSync(file));
  assert.throws(()=>storage.readRegular(path.dirname(file)),/regular file/);
  if(process.platform!=='win32'){fs.symlinkSync(file,`${file}.link`);assert.throws(()=>storage.readRegular(`${file}.link`),/regular file/);}
});
test('unchanged save preserves exact primary and genuine older checkpoint', t => {
  const file = fixture(t); state.saveState(file, snapshot('old')); state.saveState(file, snapshot('new'));
  const primary = fs.readFileSync(file), previous = fs.readFileSync(`${file}.previous`);
  assert.equal(state.saveState(file, snapshot('new')).changed, false);
  assert.deepEqual(fs.readFileSync(file), primary); assert.deepEqual(fs.readFileSync(`${file}.previous`), previous);
  assert.equal(state.readState(file).tabs[0].collection, 'Synthetic'); assert.deepEqual(state.readState(file).extra, {retained:true});
});
test('recovery is explicit, exact and stale-preview protected', t => {
  const file = fixture(t); state.saveState(file, snapshot('old')); state.saveState(file, snapshot('new'));
  const previous = fs.readFileSync(`${file}.previous`); fs.writeFileSync(file, '{damaged');
  const inspected = state.inspectState(file); assert.equal(inspected.status, 'recovery');
  assert.equal(fs.readFileSync(file, 'utf8'), '{damaged'); assert.throws(() => state.saveState(file, snapshot('replacement')));
  fs.writeFileSync(file, '{changed'); assert.throws(() => state.recoverState(file, inspected.preview), /changed after/);
  const result = state.recoverState(file, state.inspectState(file).preview);
  assert.equal(fs.readFileSync(result.preserved, 'utf8'), '{changed');
  assert.deepEqual(fs.readFileSync(file), previous); assert.deepEqual(fs.readFileSync(`${file}.previous`), previous);
});
test('future version never falls back to an older checkpoint', t => {
  const file = fixture(t); state.saveState(file, snapshot('old')); state.saveState(file, snapshot('new'));
  const future = '{"version":2,"tabs":[],"profiles":[],"future":true}'; fs.writeFileSync(file, future);
  assert.throws(() => state.readState(file), /Unsupported session version/);
  assert.throws(() => state.saveState(file, snapshot('replacement')), /Unsupported/);
  assert.equal(fs.readFileSync(file, 'utf8'), future);
});
test('unrecognized stored preferences and metadata values never silently become defaults', t => {
  const file=fixture(t);state.saveState(file,snapshot('old'));
  const future={...snapshot('new'),preferences:{searchEngine:'future-provider',tabLayout:'horizontal'}};
  fs.writeFileSync(file,JSON.stringify(future));const bytes=fs.readFileSync(file);
  assert.throws(()=>state.inspectState(file),/saved preference/);assert.throws(()=>state.saveState(file,snapshot('replacement')),/saved preference/);
  assert.deepEqual(fs.readFileSync(file),bytes);
  assert.throws(()=>state.saveState(`${file}.other`,{...snapshot('invalid'),tabs:[{id:'a',url:'file:///private'}]}),/unsupported/);
});
test('disk loading refuses malformed records instead of dropping tabs', t => {
  const file = fixture(t); fs.writeFileSync(file, JSON.stringify({version:1,profiles:[{id:'personal',name:'Personal'}],tabs:[{id:'x',url:'file:///private'}]}));
  assert.throws(() => state.readState(file), /No previous checkpoint/);
});
test('worker coalesces complete snapshots and flushes latest state before close', async t => {
  const file = fixture(t), writer = new SessionWriter(file); t.after(async () => { if (!writer.stopping) await writer.close().catch(() => {}); });
  for (let i = 0; i < 100; i++) writer.request(snapshot(String(i)));
  assert.ok(writer.active); assert.equal(writer.next.snapshot.tabs[0].id, '99');
  await writer.close(); assert.equal(state.readState(file).tabs[0].id, '99');
});
test('worker reports write failure and retains recoverable primary', async t => {
  const file = fixture(t); fs.writeFileSync(file, '{damaged');
  const writer = new SessionWriter(file); writer.request(snapshot('new'));
  await assert.rejects(writer.flush()); await assert.rejects(writer.close());
  assert.equal(fs.readFileSync(file, 'utf8'), '{damaged');
});
test('addresses reject credentials and controls while preserving loopback and IPv6', () => {
  for (const input of ['https://person:secret@example.com','person@example.com','javascript:1','https://exam\nple.com']) assert.equal(state.address(input), null);
  assert.equal(state.address('localhost:4000'), 'https://localhost:4000/');
  assert.equal(state.address('[::1]:4000'), 'https://[::1]:4000/');
  assert.equal(state.address('http://127.0.0.1:4000'), 'http://127.0.0.1:4000/');
  assert.equal(state.address(''), 'about:blank');
});
