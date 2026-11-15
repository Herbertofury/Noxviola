'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {configureSessionDataPath} = require('../browser/session-path.cjs');

function application(directory, ready = false) {
  const calls = [];
  return {calls, isReady: () => ready, getPath(name) { calls.push(['get', name]); return directory; },
    setPath(name, value) { calls.push(['set', name, value]); }};
}

test('Windows session storage retains its drive directory and every identity suffix using the extended spelling', () => {
  const root = String.raw`C:\Users\Synthetic owner\AppData\Local\Temp\noxviola-native-ABCDEF\profile\engine`;
  const app = application(root), result = configureSessionDataPath(app, 'win32');
  assert.equal(result.original, root);
  assert.equal(result.effective, '\\\\?\\' + root);
  assert.deepEqual(app.calls, [['get', 'sessionData'], ['set', 'sessionData', result.effective]]);
  const suffix = ['Partitions', 'noxviola-identity-01234567-89ab-cdef-0123-456789abcdef', 'Service Worker', 'CacheStorage', 'a'.repeat(40), 'b'.repeat(36), 'index-dir', 'the-real-index'];
  const ordinary = path.win32.join(root, ...suffix), extended = path.win32.join(result.effective, ...suffix);
  assert.ok(ordinary.length > 260, 'The unchanged nested fixture exceeds the legacy Win32 path length');
  assert.equal(extended.slice(4), ordinary, 'No directory, partition ID or cache component is changed');
  assert.ok(extended.startsWith('\\\\?\\'));
});

test('UNC session storage keeps the same server share and directory', () => {
  const root = String.raw`\\synthetic-server\profiles\Noxviola`;
  const result = configureSessionDataPath(application(root), 'win32');
  assert.equal(result.effective, '\\\\?\\UNC\\' + root.slice(2));
  assert.equal('\\\\' + result.effective.slice(8), root);
  assert.equal(configureSessionDataPath(application('D:\\'), 'win32').effective, '\\\\?\\D:\\');
});

test('already namespaced session roots are idempotent without another override', () => {
  for (const root of [String.raw`\\?\C:\Synthetic\Noxviola`, String.raw`\\?\UNC\synthetic-server\profiles\Noxviola`, String.raw`\\?\C:\existing\..\different`, String.raw`\\?\C:\existing\concrete.\profile`]) {
    const app = application(root), result = configureSessionDataPath(app, 'win32');
    assert.equal(result.changed, false); assert.equal(result.effective, root);
    assert.deepEqual(app.calls, [['get', 'sessionData']]);
  }
});

test('other platforms perform no path lookup or override', () => {
  for (const platform of ['linux', 'darwin']) {
    const app = application('/synthetic/profile', true);
    assert.equal(configureSessionDataPath(app, platform), null);
    assert.deepEqual(app.calls, []);
  }
});

test('late, relative and failed Windows overrides stop instead of silently selecting another directory', () => {
  const late = application(String.raw`C:\Synthetic\Noxviola`, true);
  assert.throws(() => configureSessionDataPath(late, 'win32'), /before Electron is ready/);
  assert.deepEqual(late.calls, []);
  const relative = application('profile');
  assert.throws(() => configureSessionDataPath(relative, 'win32'), /absolute path/);
  assert.deepEqual(relative.calls, [['get', 'sessionData']]);
  const rooted = application('\\profile');
  assert.throws(() => configureSessionDataPath(rooted, 'win32'), /absolute drive or UNC path/);
  assert.deepEqual(rooted.calls, [['get', 'sessionData']]);
  const failed = application(String.raw`C:\Synthetic\Noxviola`);
  failed.setPath = () => { throw new Error('Synthetic override failure'); };
  assert.throws(() => configureSessionDataPath(failed, 'win32'), /Synthetic override failure/);
  for (const root of [String.raw`C:\Synthetic.\Noxviola`, String.raw`C:\Synthetic \Noxviola`]) {
    const ambiguous = application(root);
    assert.throws(() => configureSessionDataPath(ambiguous, 'win32'), /ambiguous trailing dot or space/);
    assert.deepEqual(ambiguous.calls, [['get', 'sessionData']]);
  }
  const absent = application(null);
  absent.getPath = () => { throw new Error('Synthetic sessionData lookup failure'); };
  assert.throws(() => configureSessionDataPath(absent, 'win32'), /Synthetic sessionData lookup failure/);
  assert.deepEqual(absent.calls, []);
});
