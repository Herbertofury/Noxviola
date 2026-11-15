'use strict';
// Test-only legacy writer. It deliberately uses the old partition factory and
// never imports the production resolver or application. The ordinary profile,
// origin and guarded launcher are shared with the subsequent production phases.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {app, BrowserWindow, session} = require('electron');
const {readContext, preflight, sourceEvidence} = require('../../scripts/native-smoke.cjs');
const context = readContext(process.argv[2]);
assert.equal(preflight(), null);
assert.equal(process.versions.electron, require('../../package.json').devDependencies.electron, 'The legacy seed must use the exact pinned runtime');
for (const name of ['no-sandbox', 'disable-setuid-sandbox', 'disable-seccomp-filter-sandbox', 'disable-gpu-sandbox', 'disable-web-security']) {
  assert.equal(app.commandLine.hasSwitch(name), false, 'Refusing unsafe Chromium switch ' + name);
}
app.enableSandbox();
app.setPath('userData', context.profile);
const sessionData = path.join(context.profile, 'engine');
fs.mkdirSync(sessionData, {recursive:true});
app.setPath('sessionData', sessionData);
app.setPath('downloads', path.join(context.directory, 'downloads'));
app.setPath('logs', path.join(context.directory, 'logs'));
app.setPath('crashDumps', path.join(context.directory, 'crash'));

const IDENTITY = 'personal';
const VALUE = 'legacy-personal';
const PARTITION = 'persist:noxviola-identity-personal';
const source = sourceEvidence();
const result = {
  schema:1, phase:'legacy-seed', startedAt:new Date().toISOString(),
  passed:false, runtimeReady:false, sandboxForced:true, fixtureOnly:true,
  platform:process.platform, arch:process.arch,
  versions:{electron:process.versions.electron, chrome:process.versions.chrome, node:process.versions.node},
  source:{commit:source.commit, dirty:source.dirty, manifestSha256:source.manifestSha256},
  fixture:{marker:context.marker, token:context.token, origin:context.origin, profile:context.profile, sessionData},
  identity:IDENTITY, value:VALUE, factory:'fromPartition', partition:PARTITION,
  scope:'Generated personal-identity web stores written by the original factory; no extension or arbitrary existing-profile upgrade claim.',
  checks:[], normalCloseRequested:false, normalQuitObserved:false,
};
let window, completed = false;
function writeReceipt() {
  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(context.output, 'legacy-seed.json'), JSON.stringify(result, null, 2) + '\n', {mode:0o600});
}
function noAlias() {
  try {
    fs.lstatSync(path.join(sessionData, 'i'));
    assert.fail('The legacy writer must not observe or create a compact alias directory');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
function cookieSummary(cookie) {
  return {name:cookie.name, value:cookie.value, session:cookie.session, expirationDate:cookie.expirationDate ?? null, domain:cookie.domain, path:cookie.path};
}
function plainError(error) {
  return {name:String(error?.name || typeof error), message:String(error?.message || error), stack:String(error?.stack || '')};
}
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => {
  result.normalQuitObserved = true;
  result.passed = completed && result.windowClosed === true;
  if (!result.passed && !result.error) result.error = 'The legacy writer closed before all storage assertions completed.';
  writeReceipt();
});

app.whenReady().then(async () => {
  result.runtimeReady = true;
  noAlias();
  const partition = session.fromPartition(PARTITION);
  partition.setPermissionCheckHandler(() => false);
  partition.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  const original = path.join(sessionData, 'Partitions', 'noxviola-identity-personal');
  assert.equal(partition.getStoragePath(), original, 'Legacy seeding must use the unchanged ordinary fromPartition path');
  window = new BrowserWindow({
    width:900, height:650,
    webPreferences:{session:partition, nodeIntegration:false, contextIsolation:true, sandbox:true, webSecurity:true},
  });
  window.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  window.once('closed', () => { result.windowClosed = true; });
  await window.loadURL(context.origin + '/page?legacy-seed=personal');
  assert.equal(await window.webContents.executeJavaScript('document.documentElement.dataset.fixtureReady === "true"'), true);
  const outcome = await window.webContents.executeJavaScript('(async () => {' +
    'try { return {ok:true,value:await window.fixture.writeIdentity("legacy-personal")}; }' +
    'catch(error) { return {ok:false,error:{name:String(error?.name || typeof error),message:String(error?.message || error),stack:String(error?.stack || "")},fixtureFailure:window.fixture?.lastFailure || null}; }' +
    '})()');
  if (!outcome.ok) {
    result.storageFailure = outcome.fixtureFailure || outcome.error;
    throw new Error('Legacy writeIdentity failed: ' + JSON.stringify(result.storageFailure));
  }
  result.stores = outcome.value;
  for (const name of ['localStorage', 'indexedDB', 'cache']) assert.equal(result.stores[name], VALUE);
  const cookiePairs = result.stores.cookie.split(/;\s*/);
  assert.ok(cookiePairs.includes('noxviola_fixture=' + VALUE));
  assert.ok(cookiePairs.includes('noxviola_session_fixture=' + VALUE));
  assert.equal(result.stores.serviceWorkers, 1);
  for (const name of ['privilegedBridge', 'nodeRequire', 'nodeProcess']) assert.equal(result.stores[name], 'undefined');
  result.checks.push({name:'legacy fromPartition writes and reads all five generated web stores without a privileged renderer bridge', passed:true});

  const cookies = await partition.cookies.get({url:context.origin});
  const selected = cookies.filter(cookie => ['noxviola_fixture', 'noxviola_session_fixture'].includes(cookie.name));
  result.cookieLifetimes = selected.map(cookieSummary);
  const persistent = selected.filter(cookie => cookie.name === 'noxviola_fixture');
  const transient = selected.filter(cookie => cookie.name === 'noxviola_session_fixture');
  assert.equal(persistent.length, 1);
  assert.equal(persistent[0].value, VALUE);
  assert.equal(persistent[0].session, false);
  assert.ok(Number.isFinite(persistent[0].expirationDate) && persistent[0].expirationDate > Date.now() / 1000);
  assert.equal(transient.length, 1);
  assert.equal(transient[0].value, VALUE);
  assert.equal(transient[0].session, true);
  assert.equal(transient[0].expirationDate, undefined);
  result.checks.push({name:'legacy cookies have explicit persistent and session-only lifetimes', passed:true});

  const storagePath = partition.getStoragePath(), resolved = fs.realpathSync.native(storagePath);
  const originalResolved = fs.realpathSync.native(original);
  const stat = fs.statSync(storagePath, {bigint:true}), originalStat = fs.statSync(original, {bigint:true});
  assert.equal(resolved, originalResolved);
  assert.equal(stat.dev, originalStat.dev);
  assert.equal(stat.ino, originalStat.ino);
  result.storage = {
    configured:storagePath, original, resolved, originalResolved,
    fileId:{device:String(stat.dev), inode:String(stat.ino)},
    originalFileId:{device:String(originalStat.dev), inode:String(originalStat.ino)},
    physicalDirectoryPreserved:true,
  };
  noAlias();
  result.aliasDirectoryAbsent = true;
  result.checks.push({name:'legacy storage retains the original physical partition and creates no alias', passed:true});
  const renderers = app.getAppMetrics().filter(metric => metric.type === 'Tab');
  result.rendererSandboxMetrics = renderers.map(renderer => ({type:renderer.type, sandboxed:renderer.sandboxed ?? 'not-reported-on-this-platform'}));
  if (['win32', 'darwin'].includes(process.platform)) {
    assert.ok(renderers.length > 0);
    for (const renderer of renderers) assert.equal(renderer.sandboxed, true);
  }
  completed = true;
  result.normalCloseRequested = true;
  writeReceipt(); // Remains passed:false until the normal close/quit events occur.
  window.close(); // No storage/cookie flush: the ordinary Electron lifecycle owns persistence.
}).catch(error => {
  result.passed = false;
  result.errorDetails = plainError(error);
  result.error = result.errorDetails.stack || result.errorDetails.message;
  writeReceipt();
  console.error(result.error);
  app.exit(1); // Failed seeds never proceed to the production acceptance phases.
});
