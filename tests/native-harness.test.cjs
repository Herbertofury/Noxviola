'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { preflight, createContext, readContext, sourceEvidence } = require('../scripts/native-smoke.cjs');

test('native gate refuses unsafe overrides, root Linux and absent desktop without executing Electron', () => {
  assert.match(preflight({ platform: 'linux', env: {}, uid: 1000 }), /No Linux desktop/);
  assert.match(preflight({ platform: 'linux', env: { DISPLAY: ':1' }, uid: 0 }), /ordinary user/);
  for (const variable of ['ELECTRON_DISABLE_SANDBOX', 'ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS']) {
    assert.match(preflight({ platform: 'win32', env: { [variable]: '1' } }), /refuses/);
  }
  assert.equal(preflight({ platform: 'linux', env: { DISPLAY: ':1' }, uid: 1000 }), null);
  assert.equal(preflight({ platform: 'win32', env: {} }), null);
});

test('native fixture validation never accepts an unrelated profile or non-loopback origin', () => {
  const context = createContext('http://127.0.0.1:12345', path.resolve('native-results'));
  try {
    assert.equal(readContext(context.configFile).profile, context.profile);
    fs.writeFileSync(context.configFile, JSON.stringify({ ...context, profile: path.dirname(context.profile) }));
    assert.throws(() => readContext(context.configFile), /ownership marker or profile/);
    fs.writeFileSync(context.configFile, JSON.stringify({ ...context, origin: 'https://example.com/' }));
    assert.throws(() => readContext(context.configFile), /loopback/);
  } finally { fs.rmSync(context.directory, { recursive: true, force: true }); }
});

test('native source receipt includes nested assets, exact dependencies and fixture bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'noxviola-provenance-'));
  try {
    for (const name of ['browser/main.cjs', 'browser/assets/icon.png', 'package.json', 'package-lock.json', 'scripts/native-smoke.cjs', 'tests/native/driver.cjs', 'tests/native/fixtures/extension/content.js']) {
      fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      fs.writeFileSync(path.join(root, name), `fixture: ${name}`);
    }
    const before = sourceEvidence(root);
    assert.equal(before.files.length, 7);
    assert.ok(before.files.some(file => file.path === 'browser/assets/icon.png'));
    assert.ok(before.files.some(file => file.path === 'package-lock.json'));
    const fixture = 'tests/native/fixtures/extension/content.js';
    fs.appendFileSync(path.join(root, fixture), '\nchanged workload');
    const after = sourceEvidence(root);
    assert.notEqual(after.manifestSha256, before.manifestSha256);
    assert.deepEqual(after.files.filter(file => file.path !== fixture), before.files.filter(file => file.path !== fixture));
    assert.notEqual(after.files.find(file => file.path === fixture).sha256, before.files.find(file => file.path === fixture).sha256);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
