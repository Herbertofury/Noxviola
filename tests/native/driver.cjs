'use strict';
// Test-only main entry. Never staged into a browser package. No production
// command bypass: all browser actions use the real trusted shell preload IPC.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { app, BrowserWindow, dialog, session, webContents } = require('electron');
const { readContext, preflight, sourceEvidence } = require('../../scripts/native-smoke.cjs');
const { createIdentitySessionResolver, identityStoragePaths } = require('../../browser/session-path.cjs');
const { DOWNLOAD } = require('./fixture-server.cjs');
const bridgeManifest = require('./fixtures/extension-bridge/manifest.json');
const BRIDGE_CHECKS = ['chrome-callback-query', 'browser-promise-query', 'first-tab-event', 'canonical-tabs', 'native-message-ids', 'bookmark-service', 'cookie-host-and-identity', 'foreign-tab-denied', 'callback-last-error', 'promise-rejection', 'action-state', 'cleanup'];
const context = readContext(process.argv[2]);
const phase = Number(process.argv[3]);
assert.ok([1, 2].includes(phase), 'Only the two explicit fixture phases may run');
assert.equal(preflight(), null);
assert.equal(process.versions.electron, require('../../package.json').devDependencies.electron, 'The runtime must match the exact locked Electron pin');
for (const name of ['no-sandbox', 'disable-setuid-sandbox', 'disable-seccomp-filter-sandbox', 'disable-gpu-sandbox', 'disable-web-security']) {
  assert.equal(app.commandLine.hasSwitch(name), false, `Refusing unsafe Chromium switch ${name}`);
}
app.enableSandbox();
app.setPath('userData', context.profile);
const originalSessionData = path.join(context.profile, 'engine');
fs.mkdirSync(originalSessionData, { recursive: true });
const originalResolvedSessionData = fs.realpathSync.native(originalSessionData);
app.setPath('sessionData', originalSessionData);
app.setPath('downloads', path.join(context.directory, 'downloads'));
app.setPath('logs', path.join(context.directory, 'logs'));
app.setPath('crashDumps', path.join(context.directory, 'crash'));

const result = {
  phase, passed: false, runtimeReady: false, checks: [],
  versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
  sandboxForced: true, fixtureOnly: true,
  dialogBoundary: 'Native picker responses, permission denial and explicit fixture uninstall choices are supplied by this test. Native OS dialog UI is not accepted by this harness.',
  processMetrics: {
    source: 'Electron app.getAppMetrics(): all processes reported by this API at each fixture milestone',
    documentation: [
      'https://www.electronjs.org/docs/latest/api/app#appgetappmetrics',
      'https://www.electronjs.org/docs/latest/api/structures/memory-info',
      'https://www.electronjs.org/docs/latest/api/structures/cpu-usage',
    ],
    units: { memory: 'kilobytes, including the field named privateBytes', percentCPUUsage: 'percent since the preceding API call', cumulativeCPUUsage: 'CPU seconds since process creation, when reported', idleWakeupsPerSecond: 'wakeups per second since preceding API call; always zero on Windows', creationTime: 'milliseconds since Unix epoch' },
    caveats: 'Milestone samples from a synthetic workload, not steady-state benchmarks, startup latency, interaction latency or comparative efficiency evidence. Shared resident memory is not summed. CPU intervals reset on every getAppMetrics call and can be reset by other callers; the first per-process sample is zero. Missing platform-specific fields are left absent. No production polling or telemetry is added.',
    snapshots: [],
  },
};
let selection = null;
let saveSelection = null;
let dialogAction = null;
let permissionDialogs = 0;
dialog.showOpenDialog = async () => {
  assert.ok(selection, 'Unexpected native open dialog');
  const chosen = selection;
  selection = null;
  return { canceled: false, filePaths: [chosen] };
};
dialog.showSaveDialog = async () => {
  assert.ok(saveSelection, 'Unexpected asynchronous save dialog; downloads must select their path during will-download');
  const filePath = saveSelection;
  saveSelection = null;
  return { canceled: false, filePath };
};
dialog.showMessageBox = async (_window, options) => {
  const settings = options || _window;
  if (dialogAction) {
    const choice = settings.buttons?.indexOf(dialogAction);
    assert.ok(choice >= 0, 'Explicit fixture dialog action was not presented');
    dialogAction = null;
    return { response: choice, checkboxChecked: false };
  }
  const choice = settings.buttons?.findIndex(button => /^(deny|block|cancel)$/i.test(button.trim()));
  assert.ok(choice >= 0, 'Native fixture never accepts an unrecognized or permissive dialog');
  permissionDialogs++;
  return { response: choice, checkboxChecked: false };
};
dialog.showErrorBox = (title, message) => { throw new Error(`${title}: ${message}`); };

let window;
let lastState = null;
const partitionIdentities = new Map();
const observedPartitions = new WeakSet();
const lifecyclePartitions = new WeakMap();
let resolveIdentitySession;
result.extensionLifecycle = [];
function partitionFor(identity) {
  // Use the production resolver's exact factory and path. Calling fromPartition
  // alongside a fromPath alias would open a second context on the same databases.
  resolveIdentitySession ||= createIdentitySessionResolver({ session, root: app.getPath('sessionData') });
  const partition = resolveIdentitySession(identity);
  const knownIdentity = partitionIdentities.get(partition);
  assert.ok(!knownIdentity || knownIdentity === identity, 'Different identities must not share one Electron Session');
  partitionIdentities.set(partition, identity);
  for (const event of result.extensionLifecycle) if (lifecyclePartitions.get(event) === partition) event.identity = identity;
  observePartition(partition);
  return partition;
}
function isFixtureExtension(extension) {
  if (!extension || typeof extension.path !== 'string' || !['Noxviola synthetic storage fixture', 'Noxviola synthetic background fixture', bridgeManifest.name].includes(extension.name)) return false;
  const relative = path.relative(path.join(context.profile, 'extensions', 'packages'), extension.path);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}
function lifecycleEvent(partition, event, fields) {
  const record = { event, capturedAt: new Date().toISOString(), identity: partitionIdentities.get(partition) || null, storagePath: partition.getStoragePath(), ...fields };
  lifecyclePartitions.set(record, partition);
  result.extensionLifecycle.push(record);
}
function observePartition(partition) {
  if (observedPartitions.has(partition)) return;
  observedPartitions.add(partition);
  for (const event of ['extension-loaded', 'extension-ready', 'extension-unloaded']) {
    partition.extensions.on(event, (_event, extension) => {
      if (isFixtureExtension(extension)) lifecycleEvent(partition, event, { runtimeId: extension.id, name: extension.name });
    });
  }
}
function observeBackground(contents) {
  if (contents.getType() !== 'backgroundPage') return;
  const partition = contents.session;
  let observedExtension = null;
  function record(event, fields = {}, candidate = contents.getURL()) {
    try {
      for (const address of [candidate, contents.getURL()]) {
        let url;
        try { url = new URL(address); } catch { continue; }
        if (url.protocol !== 'chrome-extension:') continue;
        const extension = partition.extensions.getExtension(url.hostname);
        if (isFixtureExtension(extension)) observedExtension = extension;
      }
      if (!observedExtension) return;
      lifecycleEvent(partition, event, { webContentsId: contents.id, type: contents.getType(), url: contents.getURL(), runtimeId: observedExtension.id, ...fields });
    } catch { /* Ignore unrelated or initial empty documents; never probe them. */ }
  }
  contents.on('did-start-navigation', details => record('did-start-navigation', { isMainFrame: details.isMainFrame }, details.url));
  contents.on('console-message', details => record('console-message', { level: details.level, message: details.message, lineNumber: details.lineNumber, sourceId: details.sourceId }, details.sourceId || contents.getURL()));
  contents.on('did-finish-load', () => record('did-finish-load'));
  contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => record('did-fail-load', { errorCode, errorDescription, validatedURL, isMainFrame }, validatedURL));
  contents.on('render-process-gone', (_event, details) => record('render-process-gone', { reason: details.reason, exitCode: details.exitCode }));
}
function errorDetails(error) {
  return {
    name: String(error?.name || typeof error),
    message: String(error?.message || error),
    stack: String(error?.stack || ''),
  };
}
function ordinaryPath(value) {
  if (process.platform !== 'win32') return path.normalize(value);
  // An extended path is another spelling of this same generated directory.
  // Normalize only for comparison/length reporting; keep the actual configured
  // path for all Electron and filesystem operations.
  return path.win32.normalize(value.replace(/^\\\\\?\\UNC\\/i, '\\\\').replace(/^\\\\\?\\/, ''));
}
function comparablePath(value) {
  const normalized = ordinaryPath(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}
function expectedCachePathLengths(root) {
  const cache = path.join(ordinaryPath(root), 'Service Worker', 'CacheStorage', 'a'.repeat(40), '12345678-1234-1234-1234-123456789012');
  return {
    basis: 'Derived from the pinned Chromium first-party default cache layout using a 40-character origin hash and 36-character cache UUID; these sample names are not observations',
    source: 'https://github.com/chromium/chromium/tree/152.0.7977.169/content/browser/cache_storage',
    directory: cache.length,
    indexDirectory: path.join(cache, 'index-dir').length,
    indexFile: path.join(cache, 'index-dir', 'the-real-index').length,
    entryFile: path.join(cache, 'a'.repeat(16) + '_0').length,
    initialDoomedEntryFile: path.join(cache, 'todelete_' + 'a'.repeat(16) + '_0_1').length,
    largestDoomedEntryFile: path.join(cache, 'todelete_' + 'a'.repeat(16) + '_0_18446744073709551615').length,
    units: 'characters in the ordinary path spelling, without a Windows extended-path prefix or trailing NUL',
  };
}
function assertIdentityStorageLocations() {
  const records = [];
  result.identitySessionPaths = records;
  for (const [partition, identity] of partitionIdentities) {
    const expected = identityStoragePaths(app.getPath('sessionData'), identity);
    const original = identityStoragePaths(originalSessionData, identity).original;
    const configured = partition.getStoragePath();
    const resolved = fs.realpathSync.native(configured);
    const originalResolved = fs.realpathSync.native(original);
    const record = { identity, configured, resolved, original, originalResolved, allowedAlias: expected.alias };
    records.push(record);
    const sameSpelling = value => comparablePath(configured) === comparablePath(value);
    assert.ok(sameSpelling(expected.original) || (process.platform === 'win32' && sameSpelling(expected.alias)), 'The live Session must use its original partition or the canonical production alias');
    const configuredStat = fs.statSync(configured, { bigint: true });
    const originalStat = fs.statSync(original, { bigint: true });
    record.configuredFileId = { device: String(configuredStat.dev), inode: String(configuredStat.ino) };
    record.originalFileId = { device: String(originalStat.dev), inode: String(originalStat.ino) };
    const hasFileId = value => typeof value.dev === 'bigint' && typeof value.ino === 'bigint' && value.dev !== 0n && value.ino !== 0n;
    if (hasFileId(configuredStat) && hasFileId(originalStat)) {
      record.physicalVerification = 'equal nonzero device and inode identifiers';
      assert.equal(configuredStat.dev, originalStat.dev, 'The live Session must retain the original identity device');
      assert.equal(configuredStat.ino, originalStat.ino, 'The live Session must retain the original identity directory');
    } else {
      record.physicalVerification = 'exact canonical path equality; reliable file identifiers unavailable';
      assert.equal(resolved, originalResolved, 'The live Session must retain the exact original identity directory');
    }
    record.factory = sameSpelling(expected.alias) ? 'fromPath' : 'fromPartition';
    record.physicalDirectoryPreserved = true;
  }
}
function fixtureStorageLayout() {
  const profile = fs.realpathSync.native(context.profile);
  return [...partitionIdentities].map(([partition, identity]) => {
    const diagnostic = { identity, storagePath: partition.getStoragePath(), entries: [] };
    try {
      const root = fs.realpathSync.native(diagnostic.storagePath);
      const relative = path.relative(comparablePath(profile), comparablePath(root));
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        diagnostic.inspection = 'Skipped: session path is outside the generated fixture profile';
        return diagnostic;
      }
      diagnostic.realStoragePath = root;
      diagnostic.storagePathLength = diagnostic.storagePath.length;
      diagnostic.realStoragePathLength = root.length;
      diagnostic.ordinaryStoragePathLength = ordinaryPath(diagnostic.storagePath).length;
      diagnostic.ordinaryRealStoragePathLength = ordinaryPath(root).length;
      diagnostic.expectedConfiguredCachePathLengths = expectedCachePathLengths(diagnostic.storagePath);
      diagnostic.expectedCachePathLengths = expectedCachePathLengths(root);
      function walk(directory) {
        let entries;
        try { entries = fs.readdirSync(directory, { withFileTypes: true }); }
        catch (error) { diagnostic.entries.push({ relative: path.relative(root, directory), error: errorDetails(error) }); return; }
        for (const entry of entries) {
          const file = path.join(directory, entry.name);
          const relativePath = path.relative(root, file);
          diagnostic.entries.push({
            relative: relativePath.split(path.sep).join('/'),
            type: entry.isSymbolicLink() ? 'symlink-not-followed' : entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'special-not-followed',
            reportedPathLength: path.join(diagnostic.storagePath, relativePath).length,
            canonicalPathLength: file.length,
            ordinaryCanonicalPathLength: ordinaryPath(file).length,
          });
          if (entry.isDirectory() && !entry.isSymbolicLink()) walk(file);
        }
      }
      walk(root);
      diagnostic.entries.sort((left, right) => left.relative.localeCompare(right.relative));
      diagnostic.cacheEntries = diagnostic.entries.filter(entry => entry.relative === 'Service Worker/CacheStorage' || entry.relative.startsWith('Service Worker/CacheStorage/'));
      diagnostic.scope = 'Generated fixture path metadata only; no profile file contents are read or retained';
    } catch (error) { diagnostic.inspectionError = errorDetails(error); }
    return diagnostic;
  });
}
async function until(predicate, description, timeout = 15_000) {
  const end = performance.now() + timeout;
  let lastError;
  while (performance.now() < end) {
    try { const value = await predicate(); if (value) return value; } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`);
}
async function check(name, action) {
  const start = performance.now();
  result.activeCheck = name;
  try {
    await action();
    result.checks.push({ name, passed: true, milliseconds: Math.round(performance.now() - start) });
    result.activeCheck = null;
    console.log(`PASS: ${name}`);
  } catch (error) {
    result.checks.push({ name, passed: false, milliseconds: Math.round(performance.now() - start), error: errorDetails(error) });
    throw error;
  }
}
async function captureShell(name, width, height) {
  window.setContentSize(width, height);
  await until(() => {
    const actual = window.getContentSize();
    return actual[0] === width && actual[1] === height;
  }, `shell resize to ${width}x${height}`);
  await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const screenshot = await window.webContents.capturePage();
  fs.writeFileSync(path.join(context.output, `${name}-${width}x${height}.png`), screenshot.toPNG());
}
async function command(name, value) {
  return window.webContents.executeJavaScript(`window.browser.command(${JSON.stringify(name)}, ${JSON.stringify(value) || 'undefined'})`);
}
async function state() {
  const value = await command('state');
  assert.ok(value && Array.isArray(value.tabs) && Array.isArray(value.profiles), 'Trusted state IPC must return the live browser snapshot');
  lastState = value;
  return value;
}
async function captureMetrics(milestone) {
  const current = await state();
  const snapshot = {
    milestone, capturedAt: new Date().toISOString(),
    tabCount: current.tabs.length, identityCount: current.profiles.length,
    liveWebContentsViews: views().length,
    processes: app.getAppMetrics(),
  };
  result.processMetrics.snapshots.push(snapshot);
  return snapshot;
}
function views() {
  return window.contentView.children.filter(view => view.webContents && view.webContents !== window.webContents && !view.webContents.isDestroyed());
}
async function activeView() {
  const current = await state();
  const tab = current.tabs.find(item => item.id === current.activeId);
  return views().find(view => view.getVisible() && view.webContents.session === partitionFor(tab.identity) && view.webContents.getURL() === tab.url);
}
async function site(url) {
  return until(async () => {
    const view = await activeView();
    if (!view || (url && view.webContents.getURL() !== url)) return null;
    return await view.webContents.executeJavaScript('document.documentElement.dataset.fixtureReady === "true"') ? view : null;
  }, `actual fixture document ${url || ''}`);
}
async function navigate(url) {
  await command('navigate', url);
  return site(url);
}
async function activate(id) {
  await command('activate', id);
  return site();
}
async function fixtureValue(view, expression, operation) {
  // Return plain error fields before Electron can serialize a DOMException as {}.
  const outcome = await view.webContents.executeJavaScript(`(async () => {
    try { return { ok: true, value: await (${expression}) }; }
    catch (error) { return { ok: false, error: { name: String(error?.name || typeof error), message: String(error?.message || error), stack: String(error?.stack || '') }, fixtureFailure: window.fixture?.lastFailure || null }; }
  })()`);
  if (!outcome.ok) {
    const diagnostic = {
      operation, url: view.webContents.getURL(),
      identity: lastState?.tabs.find(tab => tab.id === lastState.activeId)?.identity || null,
      sessionData: app.getPath('sessionData'), browserError: outcome.error,
      fixtureFailure: outcome.fixtureFailure,
    };
    try {
      diagnostic.storagePath = view.webContents.session.getStoragePath();
      diagnostic.storagePathLength = diagnostic.storagePath?.length ?? null;
      diagnostic.realStoragePath = diagnostic.storagePath ? fs.realpathSync.native(diagnostic.storagePath) : null;
    } catch (error) { diagnostic.storagePathInspectionError = errorDetails(error); }
    result.storageFailure = diagnostic;
    try { result.storageLayouts = fixtureStorageLayout(); }
    catch (error) { result.storageLayoutInspectionError = errorDetails(error); }
    throw new Error(`${operation} failed: ${JSON.stringify(outcome.fixtureFailure || outcome.error)}`);
  }
  return outcome.value;
}
async function identityData(view) { return fixtureValue(view, 'window.fixture.readIdentity()', 'readIdentity'); }
async function writeIdentity(view, value) { return fixtureValue(view, `window.fixture.writeIdentity(${JSON.stringify(value)})`, `writeIdentity(${value})`); }
function assertIdentity(data, expected, {sessionCookieExpected = true} = {}) {
  assert.equal(data.localStorage, expected);
  assert.equal(data.indexedDB, expected);
  assert.equal(data.cache, expected);
  assert.match(data.cookie, new RegExp(`(?:^|;\\s*)noxviola_fixture=${expected}(?:;|$)`));
  if (sessionCookieExpected) assert.match(data.cookie, new RegExp(`(?:^|;\\s*)noxviola_session_fixture=${expected}(?:;|$)`));
  else assert.doesNotMatch(data.cookie, /(?:^|;\s*)noxviola_session_fixture=/, 'A session-only cookie must end with the previous process session');
  assert.equal(data.serviceWorkers, 1);
  assert.equal(data.privilegedBridge, 'undefined');
  assert.equal(data.nodeRequire, 'undefined');
  assert.equal(data.nodeProcess, 'undefined');
}
async function assertCookieLifetimes(identity, expected, stage, {sessionCookieExpected = true} = {}) {
  // Read only the real cookie jar for this generated loopback fixture. Do not
  // flush, rewrite expiration dates, or change production cookie policy.
  const cookies = await partitionFor(identity).cookies.get({url: context.origin});
  const selected = cookies.filter(cookie => ['noxviola_fixture', 'noxviola_session_fixture'].includes(cookie.name));
  result.cookieLifetimes ||= [];
  result.cookieLifetimes.push({identity, stage, cookies: selected.map(cookie => ({
    name: cookie.name, value: cookie.value, session: cookie.session,
    expirationDate: cookie.expirationDate ?? null, domain: cookie.domain, path: cookie.path,
  }))});
  const persistent = selected.filter(cookie => cookie.name === 'noxviola_fixture');
  assert.equal(persistent.length, 1, 'Exactly one persistent fixture cookie must exist in this identity');
  assert.equal(persistent[0].value, expected);
  assert.equal(persistent[0].session, false, 'The restart cookie must have an explicit persistent lifetime');
  assert.ok(Number.isFinite(persistent[0].expirationDate) && persistent[0].expirationDate > Date.now() / 1000, 'The persistent fixture cookie must have a future expiration');
  const transient = selected.filter(cookie => cookie.name === 'noxviola_session_fixture');
  assert.equal(transient.length, sessionCookieExpected ? 1 : 0, 'Session-only cookie presence must match the process lifetime');
  if (sessionCookieExpected) {
    assert.equal(transient[0].value, expected);
    assert.equal(transient[0].session, true);
    assert.equal(transient[0].expirationDate, undefined, 'The session-only fixture must not have a persistent expiration');
  }
}
async function verifyLegacyStorage(view, identity) {
  const seed = JSON.parse(fs.readFileSync(path.join(context.output, 'legacy-seed.json'), 'utf8'));
  assert.equal(seed.phase, 'legacy-seed');
  for (const field of ['passed', 'runtimeReady', 'normalCloseRequested', 'normalQuitObserved', 'windowClosed', 'sandboxForced', 'fixtureOnly', 'aliasDirectoryAbsent']) assert.equal(seed[field], true, `Legacy seed must establish ${field}`);
  assert.deepEqual(seed.fixture, { marker: context.marker, token: context.token, origin: context.origin, profile: context.profile, sessionData: originalSessionData });
  const source = sourceEvidence();
  assert.deepEqual(seed.source, { commit: source.commit, dirty: source.dirty, manifestSha256: source.manifestSha256 }, 'Legacy writer and production reader must use the same exact source inputs');
  assert.equal(seed.identity, identity);
  assert.equal(seed.identity, 'personal');
  assert.equal(seed.value, 'legacy-personal');
  assert.equal(seed.factory, 'fromPartition');
  assert.equal(seed.partition, 'persist:noxviola-identity-personal');
  assert.equal(seed.versions.electron, process.versions.electron);
  const original = identityStoragePaths(originalSessionData, identity).original;
  assert.equal(seed.storage.configured, original);
  assert.equal(seed.storage.original, original);
  assert.equal(seed.storage.physicalDirectoryPreserved, true);
  const retained = await identityData(view);
  assertIdentity(retained, seed.value, { sessionCookieExpected: false });
  await assertCookieLifetimes(identity, seed.value, 'legacy-store-before-fixture-overwrite', { sessionCookieExpected: false });
  assertIdentityStorageLocations();
  const current = result.identitySessionPaths.find(record => record.identity === identity);
  assert.ok(current, 'The live legacy identity must have a verified physical directory');
  const reliableId = value => value && /^[1-9]\d*$/.test(value.device) && /^[1-9]\d*$/.test(value.inode);
  if (reliableId(seed.storage.fileId) && reliableId(current.configuredFileId)) {
    assert.deepEqual(current.configuredFileId, seed.storage.fileId, 'The original legacy directory inode must survive the Session factory transition');
  } else assert.equal(current.resolved, seed.storage.resolved, 'The legacy directory must retain its exact canonical path');
  result.legacyUpgrade = {
    passed: true, identity, value: seed.value, source: seed.source,
    fixtureBindingVerified: true, observedBeforeFirstFixtureStoreOverwrite: true,
    fromFactory: seed.factory, toFactory: current.factory,
    original: seed.storage, current, retainedStores: retained,
    scope: 'The generated Personal identity web stores survive the original factory close and production reopen; no legacy extension or arbitrary-profile migration claim',
  };
}
async function extensionData(view, field = 'noxviolaExtension') {
  const outcome = await until(async () => {
    const data = await view.webContents.executeJavaScript(`({ raw: document.documentElement.dataset[${JSON.stringify(field)}] || null, error: document.documentElement.dataset[${JSON.stringify(field + 'Error')}] || null })`);
    return data.raw || data.error ? data : null;
  }, `${field} content script and runtime response`);
  if (outcome.error) {
    result.extensionResponseFailure = { field, url: view.webContents.getURL(), error: outcome.error };
    throw new Error(`${field} runtime response failed: ${outcome.error}`);
  }
  return JSON.parse(outcome.raw);
}
async function previewFixture(name) {
  if ((await state()).panel !== 'extensions') await command('extensions');
  assert.equal(selection, null);
  selection = path.join(__dirname, 'fixtures', name);
  const preview = await command('extension-preview-dialog', 'directory');
  assert.equal(selection, null, 'Production extension preview must use its selected path');
  assert.ok(preview?.token && preview?.permissions, 'Actual package inspection and consent preview required');
  return preview;
}
async function installPreviewThroughRenderer(preview, identity) {
  const identities = Array.isArray(identity) ? identity : [identity];
  assert.ok(identities.length && new Set(identities).size === identities.length, 'Explicit distinct fixture identities are required');
  await until(() => window.webContents.executeJavaScript(`(() => {
    return !document.getElementById('extensions').hidden &&
      !document.getElementById('extension-preview').hidden &&
      document.getElementById('extension-preview-title').textContent === ${JSON.stringify(`${preview.name} · ${preview.version}`)} &&
      !document.getElementById('extension-cancel').disabled;
  })()`), 'the real extension consent preview');
  const selected = await window.webContents.executeJavaScript(`(() => {
    const identities = ${JSON.stringify(identities)};
    const choices = [...document.querySelectorAll('#extension-preview-identities input')];
    if (!identities.every(identity => choices.some(input => input.value === identity))) throw new Error('An intended fixture identity is not available in the real preview');
    for (const input of choices) if (input.checked !== identities.includes(input.value)) input.click();
    const consent = document.getElementById('extension-accept');
    if (consent.checked) throw new Error('The real preview must require fresh permission consent');
    consent.click();
    return { identities: choices.filter(input => input.checked).map(input => input.value), permissionsAccepted: consent.checked, installEnabled: !document.getElementById('extension-install').disabled };
  })()`);
  assert.deepEqual([...selected.identities].sort(), [...identities].sort());
  assert.equal(selected.permissionsAccepted, true);
  assert.equal(selected.installEnabled, true, 'The actual Install control must become enabled after fixture consent');
  await window.webContents.executeJavaScript("void document.getElementById('extension-install').click()");
  const installed = await until(async () => {
    const hidden = await window.webContents.executeJavaScript("document.getElementById('extension-preview').hidden");
    if (!hidden) return null;
    return (await command('extension-list')).find(item => item.packageDigest === preview.packageDigest) || null;
  }, 'real renderer installation, cleared consent preview and matching installed package');
  assert.deepEqual(installed.identities.map(grant => grant.identity).sort(), [...identities].sort());
  await until(() => window.webContents.executeJavaScript(`(() => {
    const items = document.getElementById('extension-items');
    if (document.getElementById('extensions').hidden || items.hasAttribute('aria-busy')) return false;
    return [...items.querySelectorAll('article')].some(card => card.querySelector('h2')?.textContent === ${JSON.stringify(`${installed.name} · ${installed.version}`)} && card.textContent.includes(${JSON.stringify(installed.packageDigest)}));
  })()`), 'the actual installed package card rendered by the production shell');
  result.extensionRendererInstalls ||= [];
  result.extensionRendererInstalls.push({ name: installed.name, id: installed.id, packageDigest: installed.packageDigest, selectedIdentities: selected.identities, permissionsAccepted: true, previewCleared: true, installedCardRendered: true });
  return installed;
}

async function runBridgeFixture(expected, runId) {
  const foreignBackground = backgroundPages(expected.bridgeRuntimeIds[expected.secondIdentity], expected.secondIdentity);
  assert.equal(foreignBackground.length, 1, 'The actual authorized second-identity background context must exist');
  // Read the genuine public numeric tab ID through the installed extension's
  // normal API in its own context. Never infer it from WebContents IDs or supply
  // a caller-selected identity to the host dispatcher.
  const foreignTabs = await foreignBackground[0].executeJavaScript('browser.tabs.query({})');
  const secondUrl = (await state()).tabs.find(tab => tab.id === expected.secondTab).url;
  const foreign = foreignTabs.find(tab => tab.url === secondUrl);
  assert.ok(foreign && Number.isSafeInteger(foreign.id), 'A genuine foreign public tab ID is required');
  await activate(expected.personalTab);
  const before = await state();
  const address = new URL('/page', context.origin);
  address.searchParams.set('noxviolaBridgeRun', runId);
  address.searchParams.set('foreignTabId', String(foreign.id));
  address.searchParams.set('expectedCookie', 'personal');
  const view = await navigate(address.href);
  assert.equal(await view.webContents.executeJavaScript('typeof window.__noxviolaExtensionHost'), 'undefined', 'The webpage must never receive the extension-document host transport');
  const response = await extensionData(view, 'noxviolaBridgeResult');
  result.bridgeRuns ||= [];
  result.bridgeRuns.push({ runId, foreignPublicTabId: foreign.id, response });
  assert.equal(response.version, 1);
  assert.equal(response.runId, runId);
  assert.equal(response.passed, true, `The installed bridge fixture failed: ${JSON.stringify(response.failure || response.cleanupErrors || response)}`);
  assert.deepEqual(response.checks.map(check => check.name).sort(), [...BRIDGE_CHECKS].sort());
  assert.ok(response.checks.every(check => check.passed === true));
  assert.deepEqual(response.cleanupErrors || [], []);
  assert.equal(response.details.createdTabId, response.details.readySenderTabId, 'Native messaging must round-trip the public tab ID');
  assert.notEqual(response.details.createdTabId, foreign.id);
  const after = await state();
  assert.deepEqual(after.tabs.map(({ id, identity }) => ({ id, identity })), before.tabs.map(({ id, identity }) => ({ id, identity })), 'The bridge workload must preserve every pre-existing ordered tab and identity');
  assert.equal(after.activeId, expected.personalTab, 'Inactive extension work must preserve the foreground tab');
  assert.equal(after.currentIdentity, expected.personalIdentity);
  assertIdentity(await identityData(view), 'personal', { sessionCookieExpected: phase === 1 });
  assert.equal((await partitionFor(expected.personalIdentity).cookies.get({ url: context.origin, name: response.details.cookieName })).length, 0, 'The fixture must remove its temporary cookie through the actual service');
  const actions = await until(() => window.webContents.executeJavaScript(`window.__noxviolaNativeActions?.find(item => item.id === ${JSON.stringify(expected.bridgeId)} && item.badgeText === 'OK' && item.title === 'Bridge native accepted')`), 'actual browser extension action state');
  assert.equal(actions.identity, expected.personalIdentity);
  assert.equal(actions.runtimeId, expected.bridgeRuntimeIds[expected.personalIdentity]);
  assert.deepEqual(response.details.actionColor, [37, 99, 235, 255]);
  assert.deepEqual(actions.color, response.details.actionColor, 'The real action model must retain the requested badge color');
  await until(() => window.webContents.executeJavaScript("[...document.querySelectorAll('#extension-actions button')].some(button => button.title === 'Bridge native accepted' && button.textContent.includes('OK') && !button.disabled)"), 'the actual enabled browser toolbar action');
  await until(() => window.webContents.executeJavaScript("[...document.querySelectorAll('#extension-actions .extension-badge')].some(badge => badge.textContent === 'OK' && getComputedStyle(badge).backgroundColor === 'rgb(37, 99, 235)')"), 'the actual requested toolbar badge color');
  await navigate(`${context.origin}/page?bridge-idle=${encodeURIComponent(runId)}`);
  return response;
}
function nativeExtension(id, identity) {
  return partitionFor(identity).extensions.getExtension(id);
}
function backgroundPages(runtimeId, identity) {
  const partition = partitionFor(identity);
  return webContents.getAllWebContents().filter(contents => contents.session === partition && contents.getURL().startsWith(`chrome-extension://${runtimeId}/`) && contents.getType() === 'backgroundPage');
}
async function extensionDiagnostics() {
  const records = await command('extension-list');
  return Promise.all(records.map(async record => ({
    id: record.id, name: record.name, manifestVersion: record.manifestVersion,
    identities: await Promise.all(record.identities.map(async grant => {
      const details = { identity: grant.identity, enabled: grant.enabled, status: grant.status, runtimeId: grant.runtimeId, error: grant.error };
      if (!grant.runtimeId) return details;
      const partition = partitionFor(grant.identity);
      const registered = partition.extensions.getExtension(grant.runtimeId);
      details.runtimeRegistered = !!registered;
      details.backgroundPages = await Promise.all(backgroundPages(grant.runtimeId, grant.identity).map(async contents => {
        const page = { id: contents.id, type: contents.getType(), url: contents.getURL(), loading: contents.isLoading(), loadingMainFrame: contents.isLoadingMainFrame() };
        // This is a one-time read only after a failed gate, never a wait for success
        // or execution in the initial empty background document.
        if (!page.loadingMainFrame && contents.mainFrame.url.startsWith(`chrome-extension://${grant.runtimeId}/`)) {
          try {
            page.committedDocument = await contents.executeJavaScript('({ readyState: document.readyState, runtimeType: typeof chrome === "undefined" ? "undefined" : typeof chrome.runtime, onMessageType: typeof chrome === "undefined" ? "undefined" : typeof chrome.runtime?.onMessage, hasMessageListeners: typeof chrome !== "undefined" && typeof chrome.runtime?.onMessage?.hasListeners === "function" ? chrome.runtime.onMessage.hasListeners() : null })');
          } catch (error) { page.inspectionError = errorDetails(error); }
        } else page.inspection = 'Skipped: background document has not committed or is loading';
        return page;
      }));
      details.extensionPages = webContents.getAllWebContents().filter(contents => !contents.isDestroyed() && contents.session === partition && contents.getURL().startsWith(`chrome-extension://${grant.runtimeId}/`)).map(contents => ({ id: contents.id, type: contents.getType(), url: contents.getURL() }));
      return details;
    })),
  })));
}
async function selectDownload(view, route, filename) {
  const destination = path.join(context.directory, 'downloads', filename);
  const url = `${context.origin}${route}`;
  const itemPromise = new Promise((resolve, reject) => {
    const partition = view.webContents.session;
    const listener = (_event, item) => {
      try {
        assert.equal(item.getURL(), url);
        item.setSavePath(destination); // Actual Electron's synchronous will-download API.
        const done = new Promise(finish => item.once('done', (_event, status) => finish(status)));
        resolve({ item, done, destination, url });
      } catch (error) { item.cancel(); reject(error); }
    };
    partition.once('will-download', listener);
  });
  await view.webContents.executeJavaScript(`(() => { const a=document.createElement('a'); a.href=${JSON.stringify(url)}; document.body.append(a); a.click(); a.remove(); })()`, true);
  return itemPromise;
}

async function firstLaunch() {
  const expected = {};
  await check('capture actual synthetic blank and settings shell at narrow and desktop widths', async () => {
    for (const [width, height] of [[700, 600], [1320, 860]]) await captureShell('synthetic-blank', width, height);
    await command('settings');
    for (const [width, height] of [[700, 600], [1320, 860]]) await captureShell('synthetic-tools-settings', width, height);
    await command('panel-close');
  });
  await check('navigation, redirect and back/forward use real Chromium documents', async () => {
    const one = `${context.origin}/page?navigation=one`;
    const two = `${context.origin}/page?navigation=two`;
    const view = await navigate(one);
    assert.equal(await view.webContents.executeJavaScript('document.querySelector("h1").textContent'), 'Local browser acceptance fixture');
    await navigate(two);
    await command('back'); await site(one);
    await command('forward'); await site(two);
    await command('navigate', `${context.origin}/redirect`);
    await site(`${context.origin}/page?redirected=1`);
  });
  await check('same-origin cookies, localStorage, IndexedDB, cache and service workers are isolated by identity', async () => {
    const personal = await navigate(`${context.origin}/page?identity=personal`);
    expected.personalTab = (await state()).activeId;
    expected.personalIdentity = (await state()).currentIdentity;
    await verifyLegacyStorage(personal, expected.personalIdentity);
    assertIdentity(await writeIdentity(personal, 'personal'), 'personal');
    await command('identity-add', 'Synthetic second identity');
    const secondState = await state();
    expected.secondIdentity = secondState.currentIdentity;
    expected.secondTab = secondState.activeId;
    assert.notEqual(expected.secondIdentity, expected.personalIdentity);
    const second = await navigate(`${context.origin}/page?identity=second`);
    const empty = await identityData(second);
    for (const field of ['localStorage', 'indexedDB', 'cache']) assert.equal(empty[field], null);
    assert.equal(empty.cookie, '');
    assert.equal(empty.serviceWorkers, 0);
    assertIdentity(await writeIdentity(second, 'second'), 'second');
    assertIdentity(await identityData(await activate(expected.personalTab)), 'personal');
    assertIdentityStorageLocations();
    result.storageLayouts = fixtureStorageLayout();
  });
  await check('site geolocation request is denied through production permission handling', async () => {
    const view = await site();
    const outcome = await view.webContents.executeJavaScript('new Promise(resolve => navigator.geolocation.getCurrentPosition(() => resolve({allowed:true}), error => resolve({allowed:false,code:error.code}), {timeout:3000,maximumAge:0}))', true);
    assert.deepEqual(outcome, { allowed: false, code: 1 });
  });
  await check('more than twelve live duplicate tabs, close/reopen and actual split bounds', async () => {
    const duplicate = `${context.origin}/page?duplicate=1`;
    for (let index = 0; index < 14; index++) { await command('new', duplicate); await site(duplicate); }
    const current = await state();
    assert.equal(current.tabs.filter(tab => tab.url === duplicate).length, 14);
    assert.equal(new Set(current.tabs.map(tab => tab.id)).size, current.tabs.length);
    assert.ok(views().length > 12, 'The fixture must instantiate real WebContentsViews, not only metadata rows');
    await command('close', current.activeId);
    await command('restore'); await site(duplicate);
    assert.equal((await state()).tabs.filter(tab => tab.url === duplicate).length, 14);
    await command('split');
    const visible = await until(() => { const value = views().filter(view => view.getVisible()); return value.length === 2 ? value : null; }, 'both actual split views');
    const [left, right] = visible.map(view => view.getBounds()).sort((a, b) => a.x - b.x);
    assert.ok(left.width > 0 && right.width > 0 && left.height > 0 && right.height > 0);
    assert.ok(left.x + left.width <= right.x, 'Split view surfaces must not overlap');
    assert.ok(Math.abs(window.getContentSize()[0] - (left.x + left.width + right.width)) <= 1);
    await command('split');
    await captureMetrics('more-than-twelve-duplicate-tabs-loaded');
  });
  await check('actual DownloadItem completion, pause/resume and cancellation are reflected by browser commands', async () => {
    const view = await activate(expected.personalTab);
    const completed = await selectDownload(view, '/download', 'complete.txt');
    assert.equal(await completed.done, 'completed');
    assert.deepEqual(fs.readFileSync(completed.destination), DOWNLOAD);
    const cancelled = await selectDownload(view, '/slow-download', 'cancelled.txt');
    const row = await until(async () => (await command('download-list')).find(item => item.url === cancelled.url && item.state === 'progressing'), 'progressing download manager row');
    await command('download-action', { id: row.id, action: 'pause' });
    assert.equal(cancelled.item.isPaused(), true);
    await command('download-action', { id: row.id, action: 'resume' });
    assert.equal(cancelled.item.isPaused(), false);
    await command('download-action', { id: row.id, action: 'cancel' });
    assert.equal(await cancelled.done, 'cancelled');
  });
  await check('MV3 content script executes with persistent, per-identity extension storage and real enable/disable', async () => {
    const preview = await previewFixture('extension');
    const record = await installPreviewThroughRenderer(preview, expected.personalIdentity);
    expected.extensionId = record.id;
    const grant = record.identities.find(item => item.identity === expected.personalIdentity);
    assert.equal(grant.status, 'loaded');
    expected.extensionRuntimeId = grant.runtimeId;
    assert.ok(nativeExtension(grant.runtimeId, expected.personalIdentity));
    let view = await navigate(`${context.origin}/page?extensionSeed=personal-extension`);
    let data = await extensionData(view);
    assert.equal(data.fixtureSeed, 'personal-extension');
    expected.extensionVisits = data.visits;
    await activate(expected.secondTab);
    view = await navigate(`${context.origin}/page?extensionSeed=second-extension`);
    assert.equal(await view.webContents.executeJavaScript('document.documentElement.dataset.noxviolaExtension || null'), null);
    assert.ok(!nativeExtension(grant.runtimeId, expected.secondIdentity));
    await command('extension-authorize', { id: record.id, identity: expected.secondIdentity, permissionsAccepted: true });
    view = await navigate(`${context.origin}/page?extensionSeed=second-extension&enabled=1`);
    assert.equal((await extensionData(view)).fixtureSeed, 'second-extension');
    await captureMetrics('content-extension-enabled-in-both-identities');
    await activate(expected.personalTab);
    await command('extension-enable', { id: record.id, identity: expected.personalIdentity, enabled: false });
    assert.ok(!nativeExtension(grant.runtimeId, expected.personalIdentity));
    view = await navigate(`${context.origin}/page?extensionSeed=must-not-run`);
    assert.equal(await view.webContents.executeJavaScript('document.documentElement.dataset.noxviolaExtension || null'), null);
    await captureMetrics('content-extension-disabled-in-personal-identity');
    await command('extension-enable', { id: record.id, identity: expected.personalIdentity, enabled: true });
    view = await navigate(`${context.origin}/page?extensionSeed=must-not-replace`);
    data = await extensionData(view);
    assert.equal(data.fixtureSeed, 'personal-extension');
    assert.ok(data.visits > expected.extensionVisits);
    expected.extensionVisits = data.visits;
  });
  await check('documented MV2 background messaging runs and disabling destroys its native background context', async () => {
    const preview = await previewFixture('background-extension');
    const record = await installPreviewThroughRenderer(preview, expected.personalIdentity);
    expected.backgroundId = record.id;
    expected.backgroundRuntimeId = record.identities.find(item => item.identity === expected.personalIdentity).runtimeId;
    let view = await navigate(`${context.origin}/page?background=first`);
    const first = await extensionData(view, 'noxviolaBackground');
    assert.equal(first.runtimeId, expected.backgroundRuntimeId);
    assert.ok(first.count >= 1);
    assert.equal(backgroundPages(expected.backgroundRuntimeId, expected.personalIdentity).length, 1);
    await command('extension-enable', { id: record.id, identity: expected.personalIdentity, enabled: false });
    await until(() => backgroundPages(expected.backgroundRuntimeId, expected.personalIdentity).length === 0, 'background context removal');
    view = await navigate(`${context.origin}/page?background=disabled`);
    assert.equal(await view.webContents.executeJavaScript('document.documentElement.dataset.noxviolaBackground || null'), null);
    await captureMetrics('background-extension-disabled-and-context-removed');
    await command('extension-enable', { id: record.id, identity: expected.personalIdentity, enabled: true });
    view = await navigate(`${context.origin}/page?background=reenabled`);
    assert.equal((await extensionData(view, 'noxviolaBackground')).runtimeId, expected.backgroundRuntimeId);
    await captureMetrics('both-extension-fixtures-enabled');
  });
  await check('authenticated native extension host routes real APIs, identity denials and revocation', async () => {
    await window.webContents.executeJavaScript('window.__noxviolaNativeActions = null; void window.browser.onExtensionActions(value => { window.__noxviolaNativeActions = value; });');
    const preview = await previewFixture('extension-bridge');
    const record = await installPreviewThroughRenderer(preview, [expected.personalIdentity, expected.secondIdentity]);
    expected.bridgeId = record.id;
    expected.bridgeRuntimeIds = Object.fromEntries(record.identities.map(grant => {
      assert.equal(grant.status, 'loaded');
      assert.ok(nativeExtension(grant.runtimeId, grant.identity));
      return [grant.identity, grant.runtimeId];
    }));
    await runBridgeFixture(expected, 'phase1-first');
    await command('extension-enable', { id: expected.bridgeId, identity: expected.personalIdentity, enabled: false });
    await until(() => backgroundPages(expected.bridgeRuntimeIds[expected.personalIdentity], expected.personalIdentity).length === 0, 'disabled host bridge background removal');
    await until(() => window.webContents.executeJavaScript(`Array.isArray(window.__noxviolaNativeActions) && !window.__noxviolaNativeActions.some(item => item.id === ${JSON.stringify(expected.bridgeId)})`), 'disabled bridge action removal');
    const disabled = await navigate(`${context.origin}/page?noxviolaBridgeRun=must-not-run&foreignTabId=1&expectedCookie=personal`);
    assert.equal(await disabled.webContents.executeJavaScript('document.documentElement.dataset.noxviolaBridgeInjected || null'), null, 'Disabling must stop injection into a fresh document');
    assert.equal(backgroundPages(expected.bridgeRuntimeIds[expected.secondIdentity], expected.secondIdentity).length, 1, 'Disabling one identity must preserve the other authorized runtime');
    await command('extension-enable', { id: expected.bridgeId, identity: expected.personalIdentity, enabled: true });
    await runBridgeFixture(expected, 'phase1-reenabled');
    const second = await activate(expected.secondTab);
    assertIdentity(await identityData(second), 'second');
    await activate(expected.personalTab);
    await captureMetrics('native-host-bridge-enabled-and-functionally-verified');
  });
  await check('actual library IPC edits, previews, cancels, merges and exports complete synthetic metadata', async () => {
    await window.webContents.executeJavaScript('window.__noxviolaNativeVault = null; void window.browser.onVault(value => { window.__noxviolaNativeVault = value; });');
    const libraryState = () => window.webContents.executeJavaScript('window.__noxviolaNativeVault');
    await command('vault');
    await command('vault-save', { title: 'Synthetic saved reference', url: `${context.origin}/page?library=original`, kind: 'website', group: 'Synthetic research', notes: 'Generated acceptance fixture only' });
    let record = await until(async () => (await libraryState())?.items?.find(item => item.title === 'Synthetic saved reference'), 'saved library item');
    await command('vault-save', { id: record.id, title: 'Edited synthetic reference', characters: 'Fixture character', notes: 'Edited generated notes' });
    await command('vault-star', record.id);
    await command('vault-archive', record.id);
    await command('vault-archive', record.id);
    record = await until(async () => (await libraryState())?.items?.find(item => item.id === record.id && item.title === 'Edited synthetic reference' && item.favorite && !item.archived), 'edited and restored library item');
    saveSelection = path.join(context.directory, 'library-export.json');
    await command('vault-export');
    const exported = JSON.parse(fs.readFileSync(path.join(context.directory, 'library-export.json'), 'utf8'));
    assert.deepEqual(exported.items, [record]);
    const imported = { version: 1, items: [{ ...record, url: `${context.origin}/page?library=imported`, title: 'Conflicting fixture ID preserved separately' }] };
    const importedFile = path.join(context.directory, 'library-import.json');
    fs.writeFileSync(importedFile, JSON.stringify(imported), { mode: 0o600 });
    const libraryFile = path.join(context.profile, 'private-vault.json');
    const before = fs.readFileSync(libraryFile);
    selection = importedFile;
    const preview = await command('vault-import-preview');
    assert.equal(preview.added, 1);
    assert.equal(preview.remapped, 1);
    assert.deepEqual(fs.readFileSync(libraryFile), before);
    await command('vault-import-cancel');
    assert.deepEqual(fs.readFileSync(libraryFile), before);
    selection = importedFile;
    await command('vault-import-preview');
    await command('vault-import-apply');
    const merged = await until(async () => { const value = await libraryState(); return value?.items?.length === 2 ? value : null; }, 'committed library import');
    assert.deepEqual(merged.items[0], record);
    assert.notEqual(merged.items[1].id, record.id);
    expected.vault = merged.items;
    await command('panel-close');
  });
  await check('capture installed synthetic extension status at narrow and desktop widths', async () => {
    await command('extensions');
    const cards = await until(() => window.webContents.executeJavaScript(`(() => {
      const panel = document.getElementById('extensions'), items = document.getElementById('extension-items');
      if (panel.hidden || !document.getElementById('extension-preview').hidden || items.hasAttribute('aria-busy')) return null;
      const cards = [...items.querySelectorAll('article')].map(card => ({title: card.querySelector('h2')?.textContent, grants: [...card.querySelectorAll('.identity-grant > p')].map(row => row.textContent)}));
      return cards.length === 3 ? cards : null;
    })()`), 'actual installed extension cards after the consent previews are cleared');
    const current = await state();
    const personalName = current.profiles.find(profile => profile.id === expected.personalIdentity).name;
    const secondName = current.profiles.find(profile => profile.id === expected.secondIdentity).name;
    const storageCard = cards.find(card => card.title.startsWith('Noxviola synthetic storage fixture ·'));
    const backgroundCard = cards.find(card => card.title.startsWith('Noxviola synthetic background fixture ·'));
    const bridgeCard = cards.find(card => card.title.startsWith('Noxviola synthetic host bridge fixture ·'));
    assert.ok(storageCard && backgroundCard && bridgeCard, 'All three actual installed fixture packages must be rendered');
    assert.deepEqual(storageCard.grants.sort(), [`${personalName} · loaded`, `${secondName} · loaded`].sort());
    assert.deepEqual(backgroundCard.grants, [`${personalName} · loaded`]);
    assert.deepEqual(bridgeCard.grants.sort(), [`${personalName} · loaded`, `${secondName} · loaded`].sort());
    result.extensionStatusUi = { previewHidden: true, cards };
    for (const [width, height] of [[700, 600], [1320, 860]]) await captureShell('synthetic-extensions', width, height);
    await command('panel-close');
  });
  await check('persistent and session-only cookies have distinct native lifetimes before normal close', async () => {
    await assertCookieLifetimes(expected.personalIdentity, 'personal', 'before-normal-close');
    await assertCookieLifetimes(expected.secondIdentity, 'second', 'before-normal-close');
  });
  expected.extensionVisits = (await extensionData(await site())).visits;
  const final = await state();
  expected.tabs = final.tabs.map(({ id, url, identity }) => ({ id, url, identity }));
  expected.profiles = final.profiles;
  expected.activeId = final.activeId;
  fs.writeFileSync(path.join(context.directory, 'restart-expectations.json'), JSON.stringify(expected), { mode: 0o600 });
}

async function secondLaunch() {
  const expected = JSON.parse(fs.readFileSync(path.join(context.directory, 'restart-expectations.json'), 'utf8'));
  await check('real process restart restores complete duplicate-preserving tab and identity metadata', async () => {
    const restored = await state();
    assert.deepEqual(restored.tabs.map(({ id, url, identity }) => ({ id, url, identity })), expected.tabs);
    assert.deepEqual(restored.profiles, expected.profiles);
    assert.equal(restored.activeId, expected.activeId);
    const personal = await activate(expected.personalTab);
    await assertCookieLifetimes(expected.personalIdentity, 'personal', 'after-restart', {sessionCookieExpected: false});
    assertIdentity(await identityData(personal), 'personal', {sessionCookieExpected: false});
    const second = await activate(expected.secondTab);
    await assertCookieLifetimes(expected.secondIdentity, 'second', 'after-restart', {sessionCookieExpected: false});
    assertIdentity(await identityData(second), 'second', {sessionCookieExpected: false});
    assertIdentityStorageLocations();
    result.storageLayouts = fixtureStorageLayout();
  });
  await check('extension identity, storage and background execution survive a real process restart', async () => {
    const entries = await command('extension-list');
    const storage = entries.find(item => item.id === expected.extensionId);
    assert.ok(storage, 'Installed extension metadata must survive restart');
    assert.equal(storage.identities.find(item => item.identity === expected.personalIdentity).runtimeId, expected.extensionRuntimeId);
    let view = await activate(expected.personalTab);
    let data = await extensionData(view);
    assert.equal(data.fixtureSeed, 'personal-extension');
    assert.ok(data.visits > expected.extensionVisits);
    assert.equal((await extensionData(view, 'noxviolaBackground')).runtimeId, expected.backgroundRuntimeId);
    view = await activate(expected.secondTab);
    data = await extensionData(view);
    assert.equal(data.fixtureSeed, 'second-extension');
  });
  await check('authenticated extension host and native messaging remain functional after process restart', async () => {
    await window.webContents.executeJavaScript('window.__noxviolaNativeActions = null; void window.browser.onExtensionActions(value => { window.__noxviolaNativeActions = value; });');
    const bridge = (await command('extension-list')).find(item => item.id === expected.bridgeId);
    assert.ok(bridge, 'The actual host-bridge fixture package must survive restart');
    for (const grant of bridge.identities) {
      assert.equal(grant.runtimeId, expected.bridgeRuntimeIds[grant.identity]);
      assert.equal(grant.status, 'loaded');
    }
    await runBridgeFixture(expected, 'phase2-restarted');
  });
  await check('library edits and merged metadata survive a real process restart', async () => {
    await window.webContents.executeJavaScript('window.__noxviolaNativeVault = null; void window.browser.onVault(value => { window.__noxviolaNativeVault = value; });');
    await command('vault');
    const restored = await until(() => window.webContents.executeJavaScript('window.__noxviolaNativeVault'), 'restored library state');
    assert.deepEqual(restored.items, expected.vault);
    await command('panel-close');
  });
  await check('uninstall stops future injection in every granted identity and removes the background runtime', async () => {
    dialogAction = 'Uninstall';
    await command('extension-uninstall', expected.extensionId);
    assert.equal(dialogAction, null);
    dialogAction = 'Uninstall';
    await command('extension-uninstall', expected.backgroundId);
    assert.equal(dialogAction, null);
    dialogAction = 'Uninstall';
    await command('extension-uninstall', expected.bridgeId);
    assert.equal(dialogAction, null);
    assert.equal((await command('extension-list')).length, 0);
    for (const tab of [expected.personalTab, expected.secondTab]) {
      await activate(tab);
      const view = await navigate(`${context.origin}/page?uninstalled=${tab}&noxviolaBridgeRun=must-not-run&foreignTabId=1&expectedCookie=personal`);
      const data = await view.webContents.executeJavaScript('({storage:document.documentElement.dataset.noxviolaExtension||null,background:document.documentElement.dataset.noxviolaBackground||null,bridge:document.documentElement.dataset.noxviolaBridgeInjected||null})');
      assert.deepEqual(data, { storage: null, background: null, bridge: null });
    }
    assert.equal(backgroundPages(expected.backgroundRuntimeId, expected.personalIdentity).length, 0);
    for (const identity of [expected.personalIdentity, expected.secondIdentity]) assert.equal(backgroundPages(expected.bridgeRuntimeIds[identity], identity).length, 0);
    await captureMetrics('all-three-extension-fixtures-uninstalled');
  });
}

// Observers are attached before production startup, so extension-ready may be
// recorded even when it precedes loadExtension's resolved promise. They only
// retain events from the two generated fixture packages under this fresh profile.
app.on('session-created', observePartition);
app.on('web-contents-created', (_event, contents) => observeBackground(contents));
require('../../browser/main.cjs');
app.whenReady().then(async () => {
  await check('configured session storage resolves to the original generated directory without relocation', async () => {
    const configured = app.getPath('sessionData');
    const resolved = fs.realpathSync.native(configured);
    result.sessionDataPath = { original: originalSessionData, originalResolved: originalResolvedSessionData, configured, resolved };
    assert.equal(comparablePath(resolved), comparablePath(originalResolvedSessionData), 'The production path configuration must preserve the physical fixture directory');
  });
  window = await until(() => BrowserWindow.getAllWindows().find(value => !value.isDestroyed()), 'production BrowserWindow');
  await until(() => !window.webContents.isLoading() && window.webContents.getURL().startsWith('file:'), 'trusted shell document');
  await until(() => window.webContents.executeJavaScript('typeof window.browser?.command === "function"'), 'production preload bridge');
  result.runtimeReady = true;
  const initialMetrics = await captureMetrics(phase === 1 ? 'synthetic-blank-startup' : 'restored-process-startup');
  await check('real renderer runs without Node integration and Windows/macOS renderer metrics report sandboxing', async () => {
    const exposed = await window.webContents.executeJavaScript('({require:typeof require,process:typeof process})');
    assert.deepEqual(exposed, { require: 'undefined', process: 'undefined' });
    for (const metric of initialMetrics.processes.filter(metric => metric.type === 'Tab')) {
      if (metric.sandboxed !== undefined) assert.equal(metric.sandboxed, true);
    }
  });
  if (phase === 1) await firstLaunch(); else await secondLaunch();
  const finalMetrics = await captureMetrics('before-normal-close');
  const renderers = finalMetrics.processes.filter(metric => metric.type === 'Tab');
  if (['win32', 'darwin'].includes(process.platform)) {
    assert.ok(renderers.length > 0, 'Actual renderer process metrics must be present');
    for (const renderer of renderers) assert.equal(renderer.sandboxed, true);
  }
  result.rendererSandboxMetrics = renderers.map(renderer => ({ type: renderer.type, sandboxed: renderer.sandboxed ?? 'not-reported-on-this-platform' }));
  result.permissionDialogChoices = permissionDialogs;
  const image = await window.webContents.capturePage();
  fs.writeFileSync(path.join(context.output, `shell-phase-${phase}.png`), image.toPNG());
  result.passed = true;
  fs.writeFileSync(path.join(context.output, `phase-${phase}.json`), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  app.quit(); // Production close/persistence lifecycle must finish successfully.
}).catch(async error => {
  result.passed = false;
  result.errorDetails = errorDetails(error);
  result.error = result.errorDetails.stack || `${result.errorDetails.name}: ${result.errorDetails.message}`;
  const writeFailure = () => fs.writeFileSync(path.join(context.output, `phase-${phase}.json`), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  writeFailure(); // Preserve the original failure even if diagnostic IPC fails.
  let timer;
  try {
    result.extensionDiagnostics = await Promise.race([
      extensionDiagnostics(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Failure-context inspection exceeded 2 seconds')), 2000); }),
    ]);
  } catch (diagnosticError) { result.extensionDiagnosticsError = errorDetails(diagnosticError); }
  finally { clearTimeout(timer); }
  writeFailure();
  console.error(result.error);
  app.exit(1);
});
