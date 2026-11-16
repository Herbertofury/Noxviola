'use strict';
// Portable admission/evidence contracts only. No test in this file starts an
// engine or executes third-party extension code.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createContext } = require('../scripts/native-smoke.cjs');
const { options } = require('../scripts/real-extension-smoke.cjs');
const { fetchCorpus } = require('../scripts/fetch-extension-corpus.cjs');
const { PIN, CHECKS, sha256, verifyArchive, readCorpusReceipt, realSourceEvidence,
  createLightServer, publicAddress, assertLight, assertPinnedPermissions, assertDarkened, assertRunCompleted } = require('./native/real-extension-support.cjs');

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'noxviola-real-extension-contract-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('actual CJS driver dispatches through Electron-style dynamic import and exits an early startup failure', () => {
  const driver = path.join(__dirname, 'native/real-extension-driver.cjs');
  // The child is plain Node, not Electron. Only the engine bootstrap boundary
  // is replaced. The actual driver source is dynamically imported just as
  // pinned Electron default_app/main.ts imports a CLI .cjs application.
  const code = `
    import { createRequire } from 'node:module';
    import { pathToFileURL } from 'node:url';
    const require=createRequire(import.meta.url), Module=require('node:module');
    const original=Module._load, driver=${JSON.stringify(driver)};
    Module._load=function(request,parent,...rest){
      if(request==='electron')return {app:{exit(code){console.log('EARLY_NATIVE_EXIT '+code);process.exitCode=code;}}};
      const loaded=original.call(this,request,parent,...rest);
      if(parent?.filename===driver && request==='../../scripts/native-smoke.cjs')return {...loaded,readContext(){
        console.log('ACTUAL_DRIVER_ENTERED');throw new Error('Generated bootstrap failure before any engine or extension code');
      }};
      return loaded;
    };
    Object.defineProperty(process.versions,'electron',{value:'44.11.3'});
    process.type='browser';process.argv=[process.execPath,driver,'generated-missing-context'];
    await import(pathToFileURL(driver).href);
    await new Promise(resolve=>setImmediate(resolve));
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 1, child.stderr);
  assert.match(child.stdout, /ACTUAL_DRIVER_ENTERED/);
  assert.match(child.stdout, /EARLY_NATIVE_EXIT 1/);
  assert.match(child.stderr, /Generated bootstrap failure/);
  const { isElectronEntry } = require('./native/real-extension-driver.cjs');
  assert.equal(isElectronEntry({ versions: {}, type: 'browser', argv: ['node', driver] }, driver), false);
  assert.equal(isElectronEntry({ versions: { electron: '44.11.3' }, type: 'renderer', argv: ['electron', driver] }, driver), false);
  assert.equal(isElectronEntry({ versions: { electron: '44.11.3' }, type: 'browser', argv: ['electron', path.join(__dirname, 'unrelated.cjs')] }, driver), false);
});

test('real-package CLI requires an explicit archive and refuses unsafe or silently ignored options', () => {
  const parsed = options(['--archive', 'corpus/darkreader.zip', '--output', 'records']);
  assert.equal(parsed.archive, path.resolve('corpus/darkreader.zip'));
  assert.equal(parsed.output, path.resolve('records'));
  for (const args of [[], ['--archive'], ['--archive', '--output'], ['--no-sandbox'], ['--archive', 'one', '--archive', 'two'], ['--archive', 'one', '--skip-options']]) {
    assert.throws(() => options(args), /explicit|identify|Unknown|incomplete|Repeated|--archive/);
  }
});

test('archive admission checks exact bytes and rejects same-length corruption and filesystem links', t => {
  const directory = temporary(t), file = path.join(directory, 'release.zip');
  const original = Buffer.from('generated contract archive bytes');
  const expected = { bytes: original.length, sha256: sha256(original) };
  fs.writeFileSync(file, original);
  assert.deepEqual(verifyArchive(file, expected).bytes, original);
  const changed = Buffer.from(original); changed[3] ^= 1; fs.writeFileSync(file, changed);
  assert.throws(() => verifyArchive(file, expected), /pinned release/);
  fs.writeFileSync(file, Buffer.concat([original, Buffer.from('extra')]));
  assert.throws(() => verifyArchive(file, expected), /pinned release length/);
  const linked = path.join(directory, 'linked');
  // Directory junctions are the privilege-free actual link form on Windows.
  fs.symlinkSync(directory, linked, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => verifyArchive(linked, expected), /regular, non-linked/);
  assert.throws(() => verifyArchive('relative.zip', expected), /absolute path/);
});

test('pinned MV2 permission review matches the real inspector arrays and rejects additional or omitted grants', () => {
  const { validateManifest } = require('../browser/extensions.cjs');
  const manifest = { name: PIN.name, version: PIN.version, manifest_version: PIN.manifestVersion,
    permissions: [...PIN.permissions.required, ...PIN.permissions.hosts], optional_permissions: PIN.permissions.optional };
  const { permissions } = validateManifest(manifest);
  assert.doesNotThrow(() => assertPinnedPermissions(permissions));
  assert.throws(() => assertPinnedPermissions({ ...permissions, required: permissions.required.filter(value => value !== '<all_urls>') }));
  assert.throws(() => assertPinnedPermissions({ ...permissions, required: [...permissions.required, 'cookies'] }));
  assert.throws(() => assertPinnedPermissions({ ...permissions, optional: [...permissions.optional, 'bookmarks'] }));
});

test('receipt cannot enroll a foreign fixture, replace provenance or substitute a different archive path', t => {
  const output = temporary(t), context = createContext('http://127.0.0.1:12345', output);
  t.after(() => fs.rmSync(context.directory, { recursive: true, force: true }));
  const directory = path.join(context.directory, 'corpus'); fs.mkdirSync(directory);
  const file = path.join(directory, 'corpus-receipt.json');
  const goodShape = { schema: 1, corpusId: PIN.id, fixtureToken: context.token, profile: context.profile,
    sourceManifestSha256: 'a'.repeat(64), archive: path.join(directory, PIN.asset.name), bytes: PIN.asset.bytes, sha256: PIN.asset.sha256, provenance: PIN };
  for (const changed of [
    { fixtureToken: 'another-generated-profile' }, { profile: path.dirname(context.profile) },
    { archive: path.join(output, 'some-other-package.zip') }, { sha256: 'b'.repeat(64) },
    { provenance: { ...PIN, apiProfile: 'firefox' } },
  ]) {
    fs.writeFileSync(file, JSON.stringify({ ...goodShape, ...changed }));
    assert.throws(() => readCorpusReceipt(context, file), /exact pinned release/);
  }
  assert.throws(() => readCorpusReceipt(context, path.join(output, 'corpus-receipt.json')), /marked fixture/);
});

test('exit zero and a loaded extension do not pass missing, failed or bypassed real workflows', () => {
  const receipt = { passed: true, runtimeReady: true, sandboxForced: true, completedWorkflows: true, normalCloseObserved: true, observerErrors: [],
    checks: CHECKS.map(name => ({ name, passed: true })) };
  assert.equal(assertRunCompleted(receipt, 0, null).processExitedCleanly, true);
  for (const changed of [
    { checks: [] }, { checks: receipt.checks.slice(1) }, { checks: receipt.checks.map((value, index) => index === 3 ? { ...value, passed: false } : value) },
    { normalCloseObserved: false }, { runtimeReady: false }, { sandboxForced: false },
    { observerErrors: [{ method: 'Runtime.enable', message: 'Popup attachment failed after background passed' }] }, { observerErrors: undefined },
    { firstFailure: { message: 'TypeError: chrome.alarms is undefined' } },
  ]) assert.throws(() => assertRunCompleted({ ...receipt, ...changed }, 0, null), /Real extension gate failed/);
  assert.throws(() => assertRunCompleted(receipt, 1, null), /exit 1/);
  assert.throws(() => assertRunCompleted(receipt, null, 'SIGTERM'), /SIGTERM/);
});

test('darkening evidence requires the actual fixture, extension styles and changed native pixels', () => {
  const before = { fixture: 'light-v1', pixel: { meanRGB: 255, alpha: 255 }, bodyBackground: 'rgb(255, 255, 255)', styleCount: 0 };
  const after = { fixture: 'light-v1', pixel: { meanRGB: 25, alpha: 255 }, bodyBackground: 'rgb(24, 26, 27)', styleCount: 3 };
  assert.doesNotThrow(() => assertLight(before));
  assert.doesNotThrow(() => assertDarkened(before, after));
  assert.throws(() => assertDarkened(before, { ...after, pixel: before.pixel }), /pixels must darken/);
  assert.throws(() => assertDarkened(before, { ...after, styleCount: 0 }), /actual Dark Reader styles/);
  assert.throws(() => assertDarkened(before, { ...after, bodyBackground: before.bodyBackground }), /styling must change/);
  assert.throws(() => assertDarkened(before, { ...after, fixture: 'popup' }), /not be substituted/);
});

test('observed request summaries retain origin, path and parameter names without credentials or query values', () => {
  assert.deepEqual(publicAddress('https://user:secret@example.com/config?token=secret&locale=en#private'),
    { scheme: 'https:', host: 'example.com', path: '/config', queryKeys: ['token', 'locale'] });
  assert.deepEqual(publicAddress('file:///unrelated/private-profile'), { scheme: 'file:' });
  assert.deepEqual(publicAddress('chrome-extension://abcdefghijklmnop/options.html'),
    { scheme: 'chrome-extension:', host: 'abcdefghijklmnop', path: '/options.html', queryKeys: [] });
});

test('real-source manifest covers the separate runner as well as recursive package gate inputs', t => {
  const directory = temporary(t);
  const names = ['browser/main.cjs', 'package.json', 'package-lock.json', 'scripts/native-smoke.cjs', 'scripts/package-preview.cjs',
    'scripts/real-extension-smoke.cjs', 'scripts/fetch-extension-corpus.cjs', '.github/workflows/browser-extensions.yml',
    'tests/native/real-extension-driver.cjs', 'tests/native/corpus/release.json', 'tests/native/fixtures/light.html'];
  for (const name of names) { const file = path.join(directory, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, name); }
  const before = realSourceEvidence(directory);
  assert.equal(before.files.length, names.length);
  fs.appendFileSync(path.join(directory, 'scripts/real-extension-smoke.cjs'), '\nchanged admission');
  const after = realSourceEvidence(directory);
  assert.notEqual(before.manifestSha256, after.manifestSha256);
  assert.deepEqual(before.files.filter(item => item.path !== 'scripts/real-extension-smoke.cjs'), after.files.filter(item => item.path !== 'scripts/real-extension-smoke.cjs'));
  fs.appendFileSync(path.join(directory, 'scripts/fetch-extension-corpus.cjs'), '\nchanged acquisition');
  const afterFetch = realSourceEvidence(directory);
  assert.notEqual(afterFetch.manifestSha256, after.manifestSha256);
  fs.appendFileSync(path.join(directory, '.github/workflows/browser-extensions.yml'), '\nchanged invocation');
  assert.notEqual(realSourceEvidence(directory).manifestSha256, afterFetch.manifestSha256);
});

test('corpus downloader requests the exact upstream pin without overwriting or accepting mismatched bytes', async t => {
  const directory = temporary(t), file = path.join(directory, 'download.zip');
  const bytes = Buffer.from('generated download transport contract, not extension code');
  const asset = { ...PIN.asset, bytes: bytes.length, sha256: sha256(bytes) };
  let requests = 0;
  const fetcher = async (address, settings) => {
    requests++; assert.equal(address, PIN.asset.url); assert.equal(settings.redirect, 'follow');
    assert.ok(settings.signal instanceof AbortSignal);
    return new Response(bytes);
  };
  const receipt = await fetchCorpus(file, { fetch: fetcher, asset });
  assert.deepEqual(receipt, { file, source: PIN.asset.url, bytes: bytes.length, sha256: sha256(bytes) });
  assert.deepEqual(fs.readFileSync(file), bytes);
  await assert.rejects(fetchCorpus(file, { fetch: fetcher, asset }), /already exists/);
  assert.equal(requests, 1, 'An existing archive must be preserved before any further network request');
  const bad = path.join(directory, 'bad.zip'), changed = Buffer.from(bytes); changed[0] ^= 1;
  await assert.rejects(fetchCorpus(bad, { fetch: async () => new Response(changed), asset }), /identity mismatch/);
  assert.equal(fs.existsSync(bad), false, 'Mismatched bytes are never installed at the admitted destination');
  await assert.rejects(fetchCorpus(bad, { fetch: async () => new Response(Buffer.concat([bytes, Buffer.from('extra')])), asset }), /exceeds/);
  await assert.rejects(fetchCorpus(bad, { fetch: async () => new Response('failure', { status: 503 }), asset }), /HTTP 503/);
  let defaultPinRequested = false;
  await assert.rejects(fetchCorpus(bad, { fetch: async address => {
    defaultPinRequested = address === PIN.asset.url; throw new Error('No network is performed by this test');
  } }), /No network/);
  assert.equal(defaultPinRequested, true);
});

test('the deterministic page server serves exact local bytes and provides no form or external-resource routes', async t => {
  const server = createLightServer(); t.after(() => server.close());
  const origin = await server.listen();
  assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  const response = await fetch(`${origin}/light?case=one`), bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(response.status, 200); assert.equal(sha256(bytes), server.page.sha256);
  const html = bytes.toString('utf8');
  assert.match(html, /data-noxviola-real-extension-fixture="light-v1"/);
  assert.doesNotMatch(html, /<script|<form|(?:src|href)="https?:/i);
  assert.equal((await fetch(`${origin}/unknown`)).status, 404);
  assert.equal((await fetch(`${origin}/light`, { method: 'POST' })).status, 404);
  assert.deepEqual(server.requests.map(item => [item.method, item.path]), [['GET', '/light'], ['GET', '/unknown'], ['POST', '/light']]);
});
