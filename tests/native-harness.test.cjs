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
  for (const variable of ['ELECTRON_DISABLE_SANDBOX', 'ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'NODE_PATH']) {
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
    for (const name of ['browser/main.cjs', 'browser/assets/icon.png', 'package.json', 'package-lock.json', 'scripts/native-smoke.cjs', 'scripts/package-preview.cjs', 'tests/native/driver.cjs', 'tests/native/fixtures/extension/content.js']) {
      fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      fs.writeFileSync(path.join(root, name), `fixture: ${name}`);
    }
    const before = sourceEvidence(root);
    assert.equal(before.files.length, 8);
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

test('packaged launch uses only the real executable profile, loopback CDP and default NetLog switches', () => {
  const { packagedLaunchArguments } = require('./native/packaged-driver.cjs');
  const context = { profile: path.resolve('synthetic-profile'), output: path.resolve('synthetic-output') };
  assert.deepEqual(packagedLaunchArguments(context, 1), [
    `--user-data-dir=${context.profile}`, '--remote-debugging-port=0',
    `--log-net-log=${path.join(context.output, 'packaged-phase-1-netlog.json')}`,
  ]);
  assert.throws(() => packagedLaunchArguments(context, 'legacy-seed'), /Only the two/);
  assert.throws(() => packagedLaunchArguments({ ...context, profile: 'relative' }, 1), /absolute/);
});

test('native command arguments cannot silently drop an HTTPS request or consume another switch as a path', () => {
  const { nativeOptions } = require('../scripts/native-smoke.cjs');
  const value = nativeOptions(['--package-receipt', 'native-results/package.json', '--public-https']);
  assert.equal(value.publicHttps, true);
  assert.equal(value.packageReceipt, path.resolve('native-results/package.json'));
  for (const args of [['--public-https'], ['--output'], ['--output', '--public-https'], ['--package-receipt', '--output'], ['--no-sandbox'], ['--output', 'one', '--output', 'two']]) {
    assert.throws(() => nativeOptions(args), /requires|incomplete|Repeated/);
  }
});

test('packaged CDP refuses remote, authenticated and unrelated debugging endpoints', () => {
  const { loopbackWebSocket } = require('./native/cdp.cjs');
  assert.equal(loopbackWebSocket('ws://127.0.0.1:12345/devtools/browser/generated-id'), 'ws://127.0.0.1:12345/devtools/browser/generated-id');
  for (const value of ['ws://example.com:1234/devtools/browser/id', 'ws://user:password@127.0.0.1:1234/devtools/browser/id', 'ws://127.0.0.1:1234/devtools/page/id', 'ws://127.0.0.1:1234/devtools/browser/id?token=secret', 'http://127.0.0.1:1234/devtools/browser/id']) {
    assert.throws(() => loopbackWebSocket(value), /only attaches/);
  }
});

test('packaged network summaries omit credentials, query values and non-network file paths', () => {
  const { publicAddress } = require('./native/packaged-driver.cjs');
  assert.deepEqual(publicAddress('https://name:password@example.com/page?token=secret&token=other#private'), { origin: 'https://example.com', path: '/page', queryKeys: ['token'] });
  assert.deepEqual(publicAddress('file:///private/profile/index.html'), { scheme: 'file:' });
});

test('packaged store assertions reject leaks, missing persistence and session-cookie resurrection', () => {
  const { assertStores } = require('./native/packaged-driver.cjs');
  const value = { localStorage: 'one', indexedDB: 'one', cache: 'one', cookie: 'noxviola_fixture=one; noxviola_session_fixture=one', serviceWorkers: 1, privilegedBridge: 'undefined', nodeRequire: 'undefined', nodeProcess: 'undefined' };
  assert.doesNotThrow(() => assertStores(value, 'one'));
  assert.throws(() => assertStores({ ...value, cache: 'two' }, 'one'), /cache/);
  assert.throws(() => assertStores({ ...value, privilegedBridge: 'object' }, 'one'), /privilegedBridge/);
  assert.throws(() => assertStores(value, 'one', { sessionCookieExpected: false }), /Session-only/);
  assert.doesNotThrow(() => assertStores({ ...value, cookie: 'noxviola_fixture=one' }, 'one', { sessionCookieExpected: false }));
});

test('packaged navigation observes the selected target commit before accepting an already-duplicated URL', async () => {
  const { waitForDocument } = require('./native/packaged-driver.cjs');
  const target = { id: 'selected-public-page', sessionId: 'same-native-target' };
  const address = 'http://127.0.0.1:12345/page?packaged=duplicate';
  const documents = [
    { url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript', title: 'JavaScript | MDN', complete: true, fixtureReady: false },
    { url: address, title: 'Loading fixture', complete: false, fixtureReady: false },
    { url: address, title: 'Noxviola synthetic fixture', complete: true, fixtureReady: true },
  ];
  let calls = 0;
  const observed = await waitForDocument(async actualTarget => {
    assert.equal(actualTarget, target, 'Readiness must never substitute an existing duplicate target');
    return documents[calls++];
  }, target, { address });
  assert.equal(calls, 3);
  assert.equal(observed, documents[2]);
  await assert.rejects(waitForDocument(async () => { throw new Error('Actual renderer inspection failed'); }, target, { address }), /Actual renderer inspection failed/);
});

test('packaged close addresses only an explicit child PID through the ordinary native-window helper', () => {
  const { nativeWindowCloseArguments } = require('./native/packaged-driver.cjs');
  assert.deepEqual(nativeWindowCloseArguments(314), ['-B', path.join(__dirname, 'native', 'window-close.py'), '--pid', '314']);
  for (const pid of [0, -1, NaN, Infinity, '314', undefined]) assert.throws(() => nativeWindowCloseArguments(pid), /positive launched browser PID/);
  require('node:child_process').execFileSync('python', ['-B', path.join(__dirname, 'native', 'test_window_close.py')], { stdio: 'pipe' });
});

test('post-exit session comparison detects stale last navigation, ordering and preference loss', () => {
  const { assertSavedSession } = require('./native/packaged-driver.cjs');
  const expected = { profiles: [{ id: 'personal', name: 'Personal' }], preferences: { theme: 'light' }, activeId: 'two', activeWorkspaceId: 'default', tabs: [
    { id: 'one', identity: 'personal', url: 'http://127.0.0.1/page?first', title: 'First', workspaceId: 'default', groupId: null, pinned: false, muted: false },
    { id: 'two', identity: 'personal', url: 'http://127.0.0.1/page?last', title: 'Last', workspaceId: 'default', groupId: null, pinned: false, muted: false },
  ] };
  const saved = structuredClone(expected);
  for (const tab of saved.tabs) for (const key of ['workspaceId', 'groupId', 'pinned', 'muted']) delete tab[key];
  assert.doesNotThrow(() => assertSavedSession(saved, expected));
  const stale = structuredClone(saved); stale.tabs[1].url = 'https://developer.mozilla.org/en-US/docs/Web/JavaScript'; stale.tabs[1].title = 'JavaScript | MDN';
  assert.throws(() => assertSavedSession(stale, expected), /final ordered tab state/);
  assert.throws(() => assertSavedSession({ ...saved, tabs: [...saved.tabs].reverse() }, expected), /final ordered tab state/);
  assert.throws(() => assertSavedSession({ ...saved, preferences: { theme: 'dark' } }, expected), /durably save preferences/);
});

test('spelling evidence accepts explicit default shortcut normalization while preserving complete effective behavior', () => {
  const { preferences, applyPreferences, shortcutList } = require('../browser/preferences.cjs');
  const { assertOnlySpellingChanged } = require('./native/preferences-evidence.cjs');
  for (const platform of ['linux', 'win32', 'darwin']) {
    const original = preferences({}, { platform });
    const before = { preferences: original, shortcuts: shortcutList(original, platform) };
    const submitted = Object.fromEntries(before.shortcuts.map(item => [item.id, item.accelerator]));
    const saved = applyPreferences(original, { spellcheckEnabled: false, shortcuts: submitted });
    const after = { preferences: saved, shortcuts: shortcutList(saved, platform) };
    assert.deepEqual(original.shortcuts, {});
    assert.ok(Object.keys(saved.shortcuts).length > 0, 'Reproduce the exact native form normalization');
    const evidence = assertOnlySpellingChanged(before, after, false, platform);
    assert.deepEqual(evidence.resolvedBefore, evidence.resolvedAfter);
    assert.deepEqual(evidence.before.preferences.shortcuts, {});
    assert.deepEqual(evidence.after.preferences.shortcuts, submitted);
  }
});

test('spelling evidence rejects rebound or re-enabled shortcuts even when the live projection is stale', () => {
  const { preferences, applyPreferences, shortcutList } = require('../browser/preferences.cjs');
  const { assertOnlySpellingChanged } = require('./native/preferences-evidence.cjs');
  const original = preferences({ shortcuts: { 'focus-find': '', new: 'CmdOrCtrl+Y' } });
  const before = { preferences: original, shortcuts: shortcutList(original) };
  const saved = applyPreferences(original, { spellcheckEnabled: false, shortcuts: Object.fromEntries(before.shortcuts.map(item => [item.id, item.accelerator])) });
  const after = { preferences: saved, shortcuts: shortcutList(saved) };
  assert.doesNotThrow(() => assertOnlySpellingChanged(before, after, false));
  for (const change of [{ new: 'CmdOrCtrl+Shift+Y' }, { 'focus-find': 'CmdOrCtrl+F' }]) {
    const rebound = applyPreferences(saved, { shortcuts: change });
    assert.throws(() => assertOnlySpellingChanged(before, { preferences: rebound, shortcuts: shortcutList(rebound) }, false), /effective shortcut/);
    assert.throws(() => assertOnlySpellingChanged(before, { preferences: rebound, shortcuts: before.shortcuts }, false), /saved preference representation/);
  }
});

test('spelling evidence preserves unknown shortcut metadata and every unrelated preference exactly', () => {
  const { preferences, applyPreferences, shortcutList } = require('../browser/preferences.cjs');
  const { assertOnlySpellingChanged } = require('./native/preferences-evidence.cjs');
  const original = preferences({ shortcuts: { 'future-action': { note: 'retained generated metadata', values: [1, 2] } } });
  const before = { preferences: original, shortcuts: shortcutList(original) };
  const saved = applyPreferences(original, { spellcheckEnabled: false, shortcuts: Object.fromEntries(before.shortcuts.map(item => [item.id, item.accelerator])) });
  const after = { preferences: saved, shortcuts: shortcutList(saved) };
  assert.doesNotThrow(() => assertOnlySpellingChanged(before, after, false));
  for (const mutate of [
    value => { delete value.shortcuts['future-action']; },
    value => { value.shortcuts['future-action'].values[1] = 3; },
    value => { value.shortcuts['new-metadata'] = true; },
  ]) {
    const changed = structuredClone(saved); mutate(changed);
    assert.throws(() => assertOnlySpellingChanged(before, { preferences: changed, shortcuts: after.shortcuts }, false), /Unknown shortcut metadata/);
  }
  for (const mutate of [value => { value.theme = 'light'; }, value => { value.toolbar.home = false; }, value => { value.spellcheckEnabled = true; }]) {
    const changed = structuredClone(saved); mutate(changed);
    assert.throws(() => assertOnlySpellingChanged(before, { preferences: changed, shortcuts: after.shortcuts }, false), /independent non-shortcut preference/);
  }
});
