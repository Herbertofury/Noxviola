'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {EventEmitter} = require('node:events');
const {PermissionManager, decode, ruleId, secureOrigin} = require('../browser/permissions.cjs');

let nextId = 1;
class Session {
  setPermissionRequestHandler(handler) { this.request = handler; }
  setPermissionCheckHandler(handler) { this.check = handler; }
  setDevicePermissionHandler(handler) { this.device = handler; }
  setDisplayMediaRequestHandler(handler) { this.display = handler; }
}
class Frame {
  constructor(url, parent = null) {
    this.url = url; this.origin = new URL(url).origin; this.parent = parent;
    this.frameTreeNodeId = nextId++; this.frameToken = `token-${this.frameTreeNodeId}`;
    this.processId = 1; this.routingId = this.frameTreeNodeId;
    this.detached = false; this.dead = false; this.children = [];
    if (parent) parent.children.push(this);
  }
  isDestroyed() { return this.dead; }
  get framesInSubtree() { return [this, ...this.children.flatMap(child => child.framesInSubtree)]; }
}
class Contents extends EventEmitter {
  constructor(session, url = 'https://site.example/page') {
    super(); this.id = nextId++; this.session = session; this.mainFrame = new Frame(url); this.dead = false;
  }
  isDestroyed() { return this.dead; }
  navigate(url, frame = this.mainFrame, sameDocument = false) {
    this.emit('did-start-navigation', {url, frame, isMainFrame: frame === this.mainFrame, isSameDocument: sameDocument});
    frame.url = url; frame.origin = new URL(url).origin;
    if (!sameDocument) frame.frameToken = `token-${nextId++}`;
  }
  destroy() { this.dead = true; this.emit('destroyed'); }
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}
async function flush() { await new Promise(resolve => setImmediate(resolve)); }
function details(wc, frame = wc.mainFrame, extra = {}) {
  return {requestingUrl: frame.url, isMainFrame: frame === wc.mainFrame, ...extra};
}
function request(session, wc, permission = 'notifications', extra = {}, frame = wc.mainFrame) {
  return new Promise(resolve => session.request(wc, permission, resolve, details(wc, frame, extra)));
}
function check(session, wc, permission = 'notifications', extra = {}, frame = wc.mainFrame) {
  return session.check(wc, permission, frame.origin, details(wc, frame, extra));
}
function fixture(t, prompt = async () => 'allow') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'noxviola-permissions-'));
  const file = path.join(directory, 'permissions.json');
  const manager = new PermissionManager({file, prompt});
  manager.open();
  const session = new Session(); manager.attach(session, 'personal');
  const wc = new Contents(session);
  t.after(() => { manager.dispose(); fs.rmSync(directory, {recursive: true, force: true}); });
  return {directory, file, manager, session, wc};
}

test('origin validation rejects opaque, insecure, credentialed and non-web origins', () => {
  assert.equal(secureOrigin('https://EXAMPLE.com:443/a'), 'https://example.com');
  for (const input of ['http://localhost:3000/', 'http://demo.localhost:80/', 'http://127.0.0.2:9000/', 'http://[::1]/']) assert.ok(secureOrigin(input));
  for (const input of ['http://example.com', 'http://192.168.1.1', 'http://localhost.evil.test', 'https://user:secret@example.com',
    'file:///tmp/data', 'about:blank', 'data:text/html,hello', 'blob:https://example.com/id', 'null', '', null]) assert.equal(secureOrigin(input), null, String(input));
});

test('both Electron handlers deny unknown, device, external and display grants without a prompt', async t => {
  let prompts = 0;
  const {session, wc} = fixture(t, async () => { prompts++; return 'allow'; });
  for (const permission of ['unknown', 'display-capture', 'usb', 'hid', 'serial', 'fileSystem', 'openExternal', 'camera', 'microphone']) {
    assert.equal(await request(session, wc, permission), false);
    assert.equal(check(session, wc, permission), false);
  }
  for (const mediaTypes of [undefined, [], ['screen'], ['video', 'unknown']]) assert.equal(await request(session, wc, 'media', {mediaTypes}), false);
  assert.equal(check(session, wc, 'media', {mediaType: 'unknown'}), false);
  assert.equal(session.device({}), false);
  assert.equal(await new Promise(resolve => session.display({}, resolve)), null);
  assert.equal(prompts, 0);
});

test('camera and microphone persist independently; identical concurrent requests prompt once', async t => {
  const response = deferred(), prompts = [];
  const {session, wc, manager, file} = fixture(t, value => { prompts.push(value); return response.promise; });
  const a = request(session, wc, 'media', {mediaTypes: ['video', 'audio']}), b = request(session, wc, 'media', {mediaTypes: ['audio', 'video', 'audio']});
  await flush(); assert.equal(prompts.length, 1);
  assert.deepEqual(prompts[0].permissions, ['camera', 'microphone']);
  assert.equal(prompts[0].requestingOrigin, 'https://site.example');
  assert.equal(prompts[0].embeddingOrigin, 'https://site.example');
  assert.equal(Object.keys(prompts[0]).includes('signal'), false);
  response.resolve({decision: 'allow'});
  assert.deepEqual(await Promise.all([a, b]), [true, true]);
  assert.equal(check(session, wc, 'media', {mediaType: 'video'}), true);
  assert.equal(check(session, wc, 'media', {mediaType: 'audio'}), true);
  assert.equal(manager.list().length, 2);
  assert.equal(JSON.parse(fs.readFileSync(file)).rules.length, 2);
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  manager.dispose();
  const restarted = new PermissionManager({file, prompt: () => assert.fail('saved consent must not prompt')});
  t.after(() => restarted.dispose()); restarted.open(); restarted.attach(session, 'personal');
  assert.equal(await request(session, wc, 'media', {mediaTypes: ['video', 'audio']}), true);
});

test('permission rules isolate identities, requesting origins and embedding origins', async t => {
  const {session, wc, manager} = fixture(t);
  const child = new Frame('https://camera.example/call', wc.mainFrame);
  assert.equal(await request(session, wc, 'media', {mediaTypes: ['video']}, child), true);
  assert.equal(check(session, wc, 'media', {mediaType: 'video', embeddingOrigin: wc.mainFrame.origin}, child), true);
  assert.equal(check(session, wc, 'media', {mediaType: 'audio'}, child), false);
  assert.equal(check(session, wc, 'media', {mediaType: 'video'}), false);
  const otherTop = new Contents(session, 'https://other.example/');
  const sameChild = new Frame(child.url, otherTop.mainFrame);
  assert.equal(check(session, otherTop, 'media', {mediaType: 'video'}, sameChild), false);
  const otherSession = new Session(); manager.attach(otherSession, 'work');
  const otherIdentity = new Contents(otherSession, wc.mainFrame.url);
  const otherChild = new Frame(child.url, otherIdentity.mainFrame);
  assert.equal(check(otherSession, otherIdentity, 'media', {mediaType: 'video'}, otherChild), false);
  assert.equal(session.check(wc, 'media', child.origin, details(wc, child, {mediaType: 'video', embeddingOrigin: 'https://wrong.example'})), false);
  assert.equal(session.check(wc, 'media', '', details(wc, child, {mediaType: 'video'})), false);
  assert.equal(session.check(wc, 'media', child.origin, details(wc, child, {mediaType: 'video', securityOrigin: ''})), false);
  assert.throws(() => manager.attach(session, 'work'), /reassigned/);
});

test('allow-once is a document grant, survives same-document navigation, and is never written', async t => {
  const {session, wc, manager, file} = fixture(t, async () => 'allow-once');
  assert.equal(await request(session, wc), true);
  const grant = manager.list()[0]; assert.equal(grant.scope, 'document'); assert.equal(grant.decision, 'allow-once');
  assert.equal(fs.existsSync(file), false);
  assert.equal(check(session, wc), true);
  assert.equal(check(session, new Contents(session, wc.mainFrame.url)), false);
  wc.navigate('https://site.example/page#section', wc.mainFrame, true);
  assert.equal(check(session, wc), true);
  wc.navigate('https://site.example/page');
  assert.equal(check(session, wc), false); assert.equal(manager.list().length, 0);
});

test('subframe navigation only invalidates the affected document and descendants', async t => {
  const {session, wc} = fixture(t, async () => 'allow-once');
  const child = new Frame('https://child.example/one', wc.mainFrame), sibling = new Frame('https://sibling.example/one', wc.mainFrame);
  assert.equal(await request(session, wc), true);
  assert.equal(await request(session, wc, 'notifications', {}, child), true);
  wc.navigate('https://sibling.example/two', sibling);
  assert.equal(check(session, wc), true); assert.equal(check(session, wc, 'notifications', {}, child), true);
  wc.navigate('https://child.example/two', child);
  assert.equal(check(session, wc), true); assert.equal(check(session, wc, 'notifications', {}, child), false);
});

test('pending prompts cancel on navigation, including away and back, and late replies cannot persist', async t => {
  const response = deferred(), prompts = [];
  const {session, wc, manager, file} = fixture(t, value => { prompts.push(value); return response.promise; });
  let callbacks = 0;
  const result = new Promise(resolve => session.request(wc, 'notifications', value => { callbacks++; resolve(value); }, details(wc)));
  await flush(); const original = wc.mainFrame.url;
  wc.navigate('https://elsewhere.example/'); wc.navigate(original);
  assert.equal(await result, false); assert.equal(prompts[0].signal.aborted, true);
  response.resolve('allow'); await flush();
  assert.equal(callbacks, 1); assert.equal(manager.list().length, 0); assert.equal(fs.existsSync(file), false);
});

test('same-document navigation cancels an unanswered prompt without silently granting it', async t => {
  const response = deferred();
  const {session, wc, file} = fixture(t, () => response.promise);
  const result = request(session, wc); await flush();
  wc.navigate(`${wc.mainFrame.url}#new`, wc.mainFrame, true);
  assert.equal(await result, false); response.resolve('allow'); await flush(); assert.equal(fs.existsSync(file), false);
});

test('destroyed, detached, ambiguous and origin-mismatched frames cannot receive a late grant', async t => {
  let prompts = 0; const response = deferred();
  const {session, wc, manager} = fixture(t, () => { prompts++; return response.promise; });
  const child = new Frame('https://child.example/', wc.mainFrame); new Frame(child.url, wc.mainFrame);
  assert.equal(await request(session, wc, 'notifications', {}, child), false);
  assert.equal(await request(session, wc, 'media', {mediaTypes: ['audio'], securityOrigin: 'https://wrong.example'}), false);
  assert.equal(prompts, 0);
  const result = request(session, wc); await flush(); wc.mainFrame.detached = true; response.resolve('allow');
  assert.equal(await result, false); assert.equal(manager.list().length, 0);
});

test('renderer crash cancels consent and clears once grants without affecting other tabs', async t => {
  const {session, wc, manager} = fixture(t, async () => 'allow-once');
  const other = new Contents(session);
  await request(session, wc); await request(session, other);
  wc.emit('render-process-gone', {}, {reason: 'crashed'});
  assert.equal(manager.list().length, 1); assert.equal(check(session, other), true);
  assert.equal(check(session, wc), false);
});

test('revoke/reset stop permission checks and cancel a pending reply that would resurrect consent', async t => {
  const response = deferred(); let calls = 0;
  const {session, wc, manager} = fixture(t, () => ++calls === 1 ? 'allow' : response.promise);
  assert.equal(await request(session, wc), true);
  const pending = request(session, wc, 'geolocation'); await flush();
  assert.equal(manager.revoke(manager.list()[0].id), true);
  assert.equal(check(session, wc), false); assert.equal(await pending, false);
  response.resolve('allow'); await flush(); assert.equal(manager.list().length, 0);
  manager.prompt = async () => 'allow-once'; await request(session, wc);
  assert.equal(manager.revoke(manager.list()[0].id), true); assert.equal(check(session, wc), false);
  manager.prompt = () => new Promise(() => {}); const pendingReset = request(session, wc); await flush();
  manager.reset('personal'); assert.equal(await pendingReset, false);
});

test('blocked permission survives restart and blocks a combined media request without prompting', async t => {
  const {session, wc, manager, file} = fixture(t, async () => 'block');
  assert.equal(await request(session, wc, 'media', {mediaTypes: ['audio']}), false);
  assert.equal(manager.list()[0].decision, 'block'); manager.dispose();
  const restarted = new PermissionManager({file, prompt: () => assert.fail('a saved block must not prompt')});
  t.after(() => restarted.dispose()); restarted.open(); restarted.attach(session, 'personal');
  assert.equal(await request(session, wc, 'media', {mediaTypes: ['audio', 'video']}), false);
  assert.equal(check(session, wc, 'media', {mediaType: 'audio'}), false);
});

test('worker notification checks honor only persistent same-origin consent, never document or embedded grants', async t => {
  const {session, wc, manager} = fixture(t, async () => 'allow-once');
  await request(session, wc);
  assert.equal(session.check(null, 'notifications', wc.mainFrame.origin, {}), false);
  manager.prompt = async () => 'allow'; manager.reset(); await request(session, wc);
  assert.equal(session.check(null, 'notifications', wc.mainFrame.origin, {}), true);
  assert.equal(session.check(null, 'notifications', wc.mainFrame.origin, {embeddingOrigin: 'https://other.example'}), false);
  assert.equal(session.check(null, 'media', wc.mainFrame.origin, {mediaType: 'video'}), false);
  assert.equal(session.check(null, 'notifications', 'null', {}), false);
  const child = new Frame('https://child.example/', wc.mainFrame); await request(session, wc, 'notifications', {}, child);
  assert.equal(session.check(null, 'notifications', child.origin, {}), false);
});

test('failed durable write denies the new grant, preserves damaged bytes and blocks cached grants', async t => {
  const {session, wc, manager, file} = fixture(t);
  assert.equal(await request(session, wc), true);
  fs.writeFileSync(file, '{broken');
  assert.equal(await request(session, wc, 'geolocation'), false);
  assert.equal(manager.status, 'error'); assert.match(manager.error, /JSON|property|position|Unexpected/);
  assert.equal(check(session, wc), false);
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
});

test('corrupt permission data stays deny-only until explicit byte-bound recovery; damaged primary is preserved', async t => {
  const {session, wc, manager, file} = fixture(t);
  await request(session, wc); await request(session, wc, 'geolocation');
  const backup = fs.readFileSync(`${file}.previous`);
  fs.writeFileSync(file, '{damaged'); manager.dispose();
  const restarted = new PermissionManager({file, prompt: () => assert.fail('recovery cannot prompt for permissions')});
  t.after(() => restarted.dispose()); const inspected = restarted.open(); restarted.attach(session, 'personal');
  assert.equal(inspected.status, 'recovery'); assert.equal(restarted.list().length, 0);
  assert.equal(check(session, wc), false); assert.equal(await request(session, wc), false);
  const outcome = restarted.recover(inspected.preview);
  assert.equal(outcome.status, 'ready'); assert.equal(fs.readFileSync(outcome.preserved, 'utf8'), '{damaged');
  assert.deepEqual(fs.readFileSync(file), backup); assert.equal(check(session, wc), true);
  assert.equal(check(session, wc, 'geolocation'), false);
});

test('future versions and unknown policy fields never silently downgrade to an older grant set', async t => {
  const {session, wc, manager, file} = fixture(t); await request(session, wc); await request(session, wc, 'geolocation');
  for (const value of [{version: 2, rules: []}, {version: 1, rules: [], futurePolicy: true}]) {
    fs.writeFileSync(file, JSON.stringify(value));
    assert.throws(() => manager.open(), error => ['UNSUPPORTED_VERSION', 'UNSUPPORTED_DATA'].includes(error.code));
    assert.equal(check(session, wc), false); assert.deepEqual(JSON.parse(fs.readFileSync(file)), value);
  }
});

test('recovery refuses a backup changed after preview', async t => {
  const {session, wc, manager, file} = fixture(t); await request(session, wc); await request(session, wc, 'geolocation');
  fs.writeFileSync(file, '{damaged'); const inspection = manager.open();
  fs.appendFileSync(`${file}.previous`, '\n');
  assert.throws(() => manager.recover(inspection.preview), {code: 'STALE_PREVIEW'});
  assert.equal(fs.readFileSync(file, 'utf8'), '{damaged'); assert.equal(manager.status, 'recovery');
});

test('schema rejects duplicate rules, noncanonical origins and unsupported permission semantics', () => {
  const rule = {identity: 'personal', requestingOrigin: 'https://site.example', embeddingOrigin: 'https://top.example', permission: 'notifications', decision: 'allow'};
  rule.id = ruleId(rule.identity, rule.requestingOrigin, rule.embeddingOrigin, rule.permission);
  assert.equal(decode({version: 1, rules: [rule]}).rules.length, 1);
  assert.throws(() => decode({version: 1, rules: [rule, rule]}), /unique/);
  assert.throws(() => decode({version: 1, rules: [{...rule, requestingOrigin: 'https://site.example/path'}]}), /canonical/);
  assert.throws(() => decode({version: 1, rules: [{...rule, permission: 'usb'}]}), {code: 'UNSUPPORTED_DATA'});
  assert.throws(() => decode({version: 1, rules: [{...rule, secretPolicy: 'future'}]}), {code: 'UNSUPPORTED_DATA'});
  assert.throws(() => decode({version: 1, rules: [{...rule, decision: 'allow-once'}]}), /allow or block/);
});

test('prompt exceptions and invalid decisions deny access and leave no file', async t => {
  const {session, wc, manager, file} = fixture(t, async () => { throw new Error('UI closed'); });
  assert.equal(await request(session, wc), false);
  manager.prompt = async () => ({decision: 'maybe'}); assert.equal(await request(session, wc), false);
  assert.equal(fs.existsSync(file), false);
});

test('disposing or detaching cancels pending work and retains explicit deny handlers', async t => {
  const response = deferred();
  const {session, wc, manager, file} = fixture(t, () => response.promise);
  const pending = request(session, wc); await flush(); manager.dispose();
  assert.equal(await pending, false); response.resolve('allow'); await flush();
  assert.equal(typeof session.check, 'function'); assert.equal(typeof session.request, 'function');
  assert.equal(check(session, wc), false); assert.equal(await request(session, wc), false);
  assert.equal(fs.existsSync(file), false); assert.equal(wc.listenerCount('did-start-navigation'), 0);
});
