'use strict';
// Test-only main entry. Never staged into a browser package. No production
// command bypass: all browser actions use the real trusted shell preload IPC.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { app, BrowserWindow, dialog, session, webContents, Menu } = require('electron');
const { readContext, preflight, sourceEvidence } = require('../../scripts/native-smoke.cjs');
const { createIdentitySessionResolver, identityStoragePaths } = require('../../browser/session-path.cjs');
const { DOWNLOAD } = require('./fixture-server.cjs');
const { assertOnlySpellingChanged } = require('./preferences-evidence.cjs');
const { createPageTools } = require('./page-tools.cjs');
const { createExtensionStorage } = require('./extension-storage.cjs');
const { exerciseSidebar } = require('./sidebar.cjs');
const { exerciseSidebarAccounts } = require('./sidebar-accounts.cjs');
const { exerciseTabContext } = require('./tab-context.cjs');
const bridgeManifest = require('./fixtures/extension-bridge/manifest.json');
const BRIDGE_CHECKS = ['chrome-callback-query', 'browser-promise-query', 'first-tab-event', 'canonical-tabs', 'native-message-ids', 'bookmark-service', 'cookie-host-and-identity', 'foreign-tab-denied', 'callback-last-error', 'promise-rejection', 'action-state', 'action-icons', 'cleanup'];
const BRIDGE_ICON_STAGES = [
  { stage: 'manifest-default', rgba: [120, 50, 170, 255], sizes: [16, 32] },
  { stage: 'path-map', rgba: [22, 163, 74, 255], sizes: [16, 32] },
  { stage: 'global-imagedata', rgba: [37, 99, 235, 255], sizes: [16, 32] },
  { stage: 'tab-imagedata', rgba: [234, 88, 12, 255], sizes: [16] },
  { stage: 'tab-reset', rgba: [37, 99, 235, 255], sizes: [16, 32] },
  { stage: 'global-reset', rgba: [120, 50, 170, 255], sizes: [16, 32] },
];
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
  const pendingPreloadErrors = [];
  function record(event, fields = {}, candidate = contents.getURL()) {
    try {
      for (const address of [candidate, contents.getURL()]) {
        let url;
        try { url = new URL(address); } catch { continue; }
        if (url.protocol !== 'chrome-extension:') continue;
        const extension = partition.extensions.getExtension(url.hostname);
        if (isFixtureExtension(extension)) observedExtension = extension;
      }
      if (!observedExtension) {
        // A preload can fail before the native extension appears in the Session
        // registry. Retain only this exact production preload, and publish it
        // only after this context is identified as a generated fixture.
        if (event === 'preload-error' && path.resolve(fields.preloadPath) === path.resolve(__dirname, '../../browser/extension-api.preload.cjs')) {
          pendingPreloadErrors.push({ capturedAt: new Date().toISOString(), fields });
        }
        return;
      }
      for (const pending of pendingPreloadErrors.splice(0)) {
        lifecycleEvent(partition, 'preload-error', { webContentsId: contents.id, type: contents.getType(), url: contents.getURL(), runtimeId: observedExtension.id, ...pending.fields, capturedAt: pending.capturedAt, identifiedAt: new Date().toISOString() });
      }
      lifecycleEvent(partition, event, { webContentsId: contents.id, type: contents.getType(), url: contents.getURL(), runtimeId: observedExtension.id, ...fields });
    } catch { /* Ignore unrelated or initial empty documents; never probe them. */ }
  }
  contents.on('did-start-navigation', details => record('did-start-navigation', { isMainFrame: details.isMainFrame }, details.url));
  contents.on('console-message', details => record('console-message', { level: details.level, message: details.message, lineNumber: details.lineNumber, sourceId: details.sourceId }, details.sourceId || contents.getURL()));
  contents.on('preload-error', (_event, preloadPath, error) => record('preload-error', { preloadPath, error: errorDetails(error) }));
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
async function assertSpellcheck(stage, enabled, identities) {
  const current = await state();
  const sessions = [{ kind: 'default', enabled: session.defaultSession.isSpellCheckerEnabled(), storagePath: session.defaultSession.getStoragePath() }];
  assert.equal(window.webContents.session, session.defaultSession, 'The actual shell must use the inspected default Session');
  for (const identity of identities) {
    const target = partitionFor(identity);
    const actualViews = views().filter(view => view.webContents.session === target);
    assert.ok(actualViews.length > 0, 'Spellcheck evidence must inspect an identity already used by a real browser view');
    sessions.push({ kind: 'identity', identity, enabled: target.isSpellCheckerEnabled(), storagePath: target.getStoragePath(), webContentsIds: actualViews.map(view => view.webContents.id) });
  }
  result.spellcheck ||= {
    scope: 'Actual local checking state from Session.isSpellCheckerEnabled(), changed through the real settings checkbox and Save preferences handler. This is not dictionary-download consent or a claim that engine requests stop while checking is disabled.',
    snapshots: [], uiChanges: [],
  };
  result.spellcheck.snapshots.push({ stage, expected: enabled, preference: current.preferences.spellcheckEnabled, sessions });
  assert.equal(current.preferences.spellcheckEnabled, enabled, 'The live preference must retain the explicit spelling choice');
  for (const entry of sessions) assert.equal(entry.enabled, enabled, `${stage}: ${entry.identity || entry.kind} native checking state`);
}
async function setSpellcheckThroughRenderer(enabled) {
  const before = await state();
  assert.equal(before.preferences.spellcheckEnabled, !enabled, 'The fixture must make an actual explicit choice, not submit an unchanged default');
  if (before.panel !== 'settings') await command('settings');
  await until(() => window.webContents.executeJavaScript(`(() => {
    const form=document.getElementById('settings-form'),field=form.elements.namedItem('spellcheckEnabled');
    return !document.getElementById('settings').hidden && !form.dataset.saving && !field.disabled && field.checked===${JSON.stringify(!enabled)};
  })()`), 'current spelling choice in the actual settings form');
  const action = await window.webContents.executeJavaScript(`(() => {
    const form=document.getElementById('settings-form'),field=form.elements.namedItem('spellcheckEnabled'),save=form.querySelector('.form-actions button');
    if(!field.getClientRects().length||!save.getClientRects().length||field.disabled||save.disabled)throw new Error('The real spelling and Save preferences controls must be available');
    field.scrollIntoView({block:'nearest'});field.click();
    if(field.checked!==${JSON.stringify(enabled)})throw new Error('The real checkbox did not change to the requested value');
    save.scrollIntoView({block:'nearest'});save.click();
    return {checked:field.checked,help:document.getElementById('spellcheck-help').textContent};
  })()`);
  const after = await until(async () => {
    const current = await state();
    const form = await window.webContents.executeJavaScript(`(() => {
      const form=document.getElementById('settings-form');
      return {saving:Boolean(form.dataset.saving),checked:form.elements.namedItem('spellcheckEnabled').checked,notice:document.getElementById('notice').textContent};
    })()`);
    return current.preferences.spellcheckEnabled === enabled && !form.saving ? { current, form } : null;
  }, 'the production settings save and native spellcheck update');
  assert.equal(after.form.checked, enabled);
  const evidence = { enabled, action, savedForm: after.form,
    before: { preferences: before.preferences, shortcuts: before.shortcuts },
    after: { preferences: after.current.preferences, shortcuts: after.current.shortcuts } };
  result.spellcheck.uiChanges.push(evidence); // Retain raw values even if comparison fails.
  evidence.resolution = assertOnlySpellingChanged(before, after.current, enabled);
  await command('panel-close');
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
  const expectedSeedVersion = context.legacyRuntime?.version || process.versions.electron;
  assert.equal(seed.versions.electron, expectedSeedVersion, 'The seed must run under the exact independently admitted writer runtime');
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
    seedVersions: seed.versions, readerVersions: result.versions,
    crossVersion: seed.versions.electron !== process.versions.electron,
    fixtureBindingVerified: true, observedBeforeFirstFixtureStoreOverwrite: true,
    fromFactory: seed.factory, toFactory: current.factory,
    original: seed.storage, current, retainedStores: retained,
    scope: 'Only the generated Personal identity web stores, written by the recorded seed runtime, are verified before overwrite in the recorded production reader runtime at the same physical directory. This does not qualify legacy extensions or arbitrary existing profiles.',
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
async function installPreviewThroughRenderer(preview, identity, { apiProfile = null } = {}) {
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
    const profile = document.getElementById('extension-api-profile');
    if (${JSON.stringify(apiProfile)} !== null) {
      if (profile.disabled || ![...profile.options].some(option => option.value === ${JSON.stringify(apiProfile)})) throw new Error('The requested API behavior profile is not available in the real preview');
      profile.value = ${JSON.stringify(apiProfile)};
      profile.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const consent = document.getElementById('extension-accept');
    if (consent.checked) throw new Error('The real preview must require fresh permission consent');
    consent.click();
    return { identities: choices.filter(input => input.checked).map(input => input.value), apiProfile: profile.value, permissionsAccepted: consent.checked, installEnabled: !document.getElementById('extension-install').disabled };
  })()`);
  assert.deepEqual([...selected.identities].sort(), [...identities].sort());
  assert.equal(selected.permissionsAccepted, true);
  assert.equal(selected.apiProfile, apiProfile || preview.apiProfileSuggestion);
  assert.equal(selected.installEnabled, true, 'The actual Install control must become enabled after fixture consent');
  await window.webContents.executeJavaScript("void document.getElementById('extension-install').click()");
  const installed = await until(async () => {
    const hidden = await window.webContents.executeJavaScript("document.getElementById('extension-preview').hidden");
    if (!hidden) return null;
    return (await command('extension-list')).find(item => item.packageDigest === preview.packageDigest) || null;
  }, 'real renderer installation, cleared consent preview and matching installed package');
  assert.deepEqual(installed.identities.map(grant => grant.identity).sort(), [...identities].sort());
  assert.equal(installed.apiProfile, selected.apiProfile, 'The reviewed API behavior profile must be retained by the installed package');
  await until(() => window.webContents.executeJavaScript(`(() => {
    const items = document.getElementById('extension-items');
    if (document.getElementById('extensions').hidden || items.hasAttribute('aria-busy')) return false;
    return [...items.querySelectorAll('article')].some(card => card.querySelector('h2')?.textContent === ${JSON.stringify(`${installed.name} · ${installed.version}`)} && card.textContent.includes(${JSON.stringify(installed.packageDigest)}));
  })()`), 'the actual installed package card rendered by the production shell');
  result.extensionRendererInstalls ||= [];
  result.extensionRendererInstalls.push({ name: installed.name, id: installed.id, packageDigest: installed.packageDigest, selectedIdentities: selected.identities, apiProfile: selected.apiProfile, permissionsAccepted: true, previewCleared: true, installedCardRendered: true });
  return installed;
}

async function observeBridgeIcons(view, expected, runId) {
  for (const { stage, rgba, sizes } of BRIDGE_ICON_STAGES) {
    const variants = sizes.map(size => ({ size, width: size, height: size, rgba }));
    const announced = await until(async () => {
      const status = await view.webContents.executeJavaScript('({stage:document.documentElement.dataset.noxviolaBridgeIconStage||null,result:document.documentElement.dataset.noxviolaBridgeResult||null,error:document.documentElement.dataset.noxviolaBridgeResultError||null})');
      assert.equal(status.error, null, 'Native icon message transport must succeed');
      if (status.result) throw new Error(`The native bridge completed before icon stage ${stage}: ${status.result}`);
      const value = status.stage ? JSON.parse(status.stage) : null;
      return value?.stage === stage ? value : null;
    }, `the native fixture’s one-shot ${stage} icon message`);
    assert.equal(announced.kind, 'noxviola-bridge-icon-stage');
    assert.equal(announced.runId, runId);
    assert.deepEqual(announced.expected, { variants });
    const record = { runId, stage, expected: { variants }, acknowledged: false };
    (result.bridgeIconStages ||= []).push(record);
    const observed = await until(async () => {
      record.observed = await window.webContents.executeJavaScript(`(async () => {
        const expected = ${JSON.stringify({ id: expected.bridgeId, identity: expected.personalIdentity, runtimeId: expected.bridgeRuntimeIds[expected.personalIdentity], variants, rgba })};
        const item = window.__noxviolaNativeActions?.find(value => value.id === expected.id);
        if (!item) return { ready: false, reason: 'Action update has not arrived' };
        if (item.iconError) throw new Error('Production action icon error: '+item.iconError);
        const actual = item.icon?.variants;
        if (!actual?.length) return { ready: false, reason: 'Action icon is not populated' };
        const root = document.getElementById('extension-actions');
        const controls = [...root.querySelectorAll('button')].filter(button => button.title === 'Bridge native accepted');
        if (controls.length !== 1) return { ready: false, reason: 'The actual action control is not present' };
        const control = controls[0], rendered = control.querySelector('img.extension-icon');
        if (!rendered) return { ready: false, reason: 'The actual action image is not present' };
        control.scrollIntoView({block:'nearest',inline:'nearest'});
        function pixels(image,width,height) {
          const canvas = document.createElement('canvas');canvas.width=width;canvas.height=height;
          const context = canvas.getContext('2d');context.drawImage(image,0,0,width,height);
          const data = context.getImageData(0,0,width,height).data;
          return { firstPixel: [...data.slice(0,4)], allPixelsMatch: data.every((value,index) => value === expected.rgba[index%4]) };
        }
        const decoded = [];
        for (const variant of actual) {
          const image = new Image();image.src=variant.dataUrl;await image.decode();
          decoded.push({size:variant.size,width:variant.width,height:variant.height,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight,dataUrl:variant.dataUrl,...pixels(image,image.naturalWidth,image.naturalHeight)});
        }
        await rendered.decode();
        const rect=rendered.getBoundingClientRect(),area=root.getBoundingClientRect();
        const visible=!root.hidden && !control.disabled && rect.width===16 && rect.height===16 && rect.left>=area.left && rect.right<=area.right && rect.top>=0 && rect.bottom<=innerHeight;
        const shown={src:rendered.src,currentSrc:rendered.currentSrc,srcset:rendered.getAttribute('srcset'),width:rect.width,height:rect.height,visible,...pixels(rendered,16,16)};
        const sameShape=JSON.stringify(decoded.map(({size,width,height})=>({size,width,height})))===JSON.stringify(expected.variants.map(({size,width,height})=>({size,width,height})));
        const ready=item.identity===expected.identity && item.runtimeId===expected.runtimeId && sameShape && decoded.every(icon=>icon.width===icon.naturalWidth && icon.height===icon.naturalHeight && icon.allPixelsMatch) && visible && shown.allPixelsMatch && actual.some(icon=>icon.dataUrl===shown.currentSrc) && shown.srcset===actual.map(icon=>icon.dataUrl+' '+(icon.size/16)+'x').join(', ');
        return {ready,identity:item.identity,runtimeId:item.runtimeId,variants:decoded,rendered:shown};
      })()`);
      return record.observed.ready ? record.observed : null;
    }, `actual decoded toolbar pixels for ${stage}`, 8_000);
    assert.equal(observed.ready, true);
    if (runId === 'phase1-first') {
      const image = await window.webContents.capturePage();
      record.screenshot = `synthetic-extension-icon-${stage}.png`;
      fs.writeFileSync(path.join(context.output, record.screenshot), image.toPNG());
    }
    // Acknowledge only after the actual model, PNG variants and visible toolbar
    // image have matched. This is native extension messaging in a fixture page,
    // not a test command or alternate permission route in the shipped browser.
    await view.webContents.executeJavaScript(`void window.postMessage(${JSON.stringify({ kind: 'noxviola-bridge-icon-observed', runId, stage })}, location.origin)`);
    record.acknowledged = true;
  }
}

async function runBridgeFixture(expected, runId) {
  assert.equal((await command('extension-list')).find(item => item.id === expected.bridgeId)?.apiProfile, 'firefox', 'Every fixture run and restart must retain the explicitly reviewed Firefox reset behavior');
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
  await observeBridgeIcons(view, expected, runId);
  const response = await extensionData(view, 'noxviolaBridgeResult');
  result.bridgeRuns ||= [];
  result.bridgeRuns.push({ runId, foreignPublicTabId: foreign.id, response });
  assert.equal(response.version, 1);
  assert.equal(response.runId, runId);
  assert.equal(response.passed, true, `The installed bridge fixture failed: ${JSON.stringify(response.failure || response.cleanupErrors || response)}`);
  assert.deepEqual(response.checks.map(check => check.name).sort(), [...BRIDGE_CHECKS].sort());
  assert.deepEqual(response.details.iconStages, BRIDGE_ICON_STAGES.map(({ stage, rgba, sizes }) => ({ stage, expected: { variants: sizes.map(size => ({ size, width: size, height: size, rgba })) } })));
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
      try { details.preloadScripts = partition.getPreloadScripts(); }
      catch (error) { details.preloadScriptsError = errorDetails(error); }
      details.backgroundPages = await Promise.all(backgroundPages(grant.runtimeId, grant.identity).map(async contents => {
        const page = { id: contents.id, type: contents.getType(), url: contents.getURL(), loading: contents.isLoading(), loadingMainFrame: contents.isLoadingMainFrame() };
        try {
          const preferences = contents.getLastWebPreferences();
          page.webPreferences = Object.fromEntries(['contextIsolation', 'sandbox', 'nodeIntegration', 'nodeIntegrationInWorker', 'nodeIntegrationInSubFrames', 'preload', 'webSecurity'].map(key => [key, preferences?.[key] ?? null]));
        } catch (error) { page.webPreferencesError = errorDetails(error); }
        // This is a one-time read only after a failed gate, never a wait for success
        // or execution in the initial empty background document.
        if (!page.loadingMainFrame && contents.mainFrame.url.startsWith(`chrome-extension://${grant.runtimeId}/`)) {
          try {
            page.committedDocument = await contents.executeJavaScript(`(() => {
              const chromeApi = globalThis.chrome, browserApi = globalThis.browser;
              function descriptor(object, key) {
                if (object === undefined || object === null) return null;
                const value = Object.getOwnPropertyDescriptor(object, key);
                if (!value) return null;
                return { configurable: value.configurable, enumerable: value.enumerable,
                  writable: 'writable' in value ? value.writable : null,
                  getterType: typeof value.get, setterType: typeof value.set,
                  valueType: 'value' in value ? typeof value.value : null };
              }
              function namespace(api) {
                return { type: typeof api, tabsType: typeof api?.tabs,
                  methods: Object.fromEntries(['create', 'get', 'query'].map(name => [name, typeof api?.tabs?.[name]])),
                  tabsDescriptor: descriptor(api, 'tabs'),
                  methodDescriptors: Object.fromEntries(['create', 'get', 'query'].map(name => [name, descriptor(api?.tabs, name)])),
                  runtimeId: api?.runtime?.id ?? null };
              }
              return { readyState: document.readyState, origin: location.origin,
                runtimeType: typeof chromeApi?.runtime, onMessageType: typeof chromeApi?.runtime?.onMessage,
                hasMessageListeners: typeof chromeApi?.runtime?.onMessage?.hasListeners === 'function' ? chromeApi.runtime.onMessage.hasListeners() : null,
                chrome: namespace(chromeApi), browser: namespace(browserApi), browserEqualsChrome: browserApi === chromeApi,
                globalDescriptors: { chrome: descriptor(globalThis, 'chrome'), browser: descriptor(globalThis, 'browser'), extensionHost: descriptor(globalThis, '__noxviolaExtensionHost') },
                context: { requireType: typeof require, processType: typeof process, extensionHostType: typeof globalThis.__noxviolaExtensionHost }
              };
            })()`);
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

function pageTools() {
  return createPageTools({ window, context, command, state, navigate, activate, check, result });
}
function downloadEvidence() {
  result.downloadHistory ||= {
    scope: 'Actual native-session attribution, durable terminal transfer records, preserved downloaded bytes, and identity-scoped metadata clearing. The browser downloads list remains app-wide and identity-tagged; this does not claim confidentiality between identities.',
    snapshots: [], rendered: [], completedFiles: [],
  };
  return result.downloadHistory;
}
function digest(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
async function captureDownloadHistory(stage) {
  assert.ok(['before-close', 'after-restart', 'after-personal-clear'].includes(stage));
  const evidence = downloadEvidence();
  const status = await until(async () => {
    const value = (await state()).downloadHistory; evidence.latestStatus = value;
    if (value?.error) throw new Error(`Actual download history error: ${value.error}`);
    return value?.persistent && value.status === 'ready' && value.pendingCount === 0 ? value : null;
  }, 'the actual durable download-history status');
  const bytes = fs.readFileSync(path.join(context.profile, 'browser-downloads.json'));
  const document = JSON.parse(bytes.toString('utf8'));
  assert.equal(document.version, 1); assert.ok(Array.isArray(document.downloads));
  const rows = await command('download-list');
  assert.equal(rows.length, document.downloads.length, 'The full app-wide native history must match the durable document');
  for (const saved of document.downloads) {
    const row = rows.find(item => item.id === saved.id); assert.ok(row);
    assert.equal(row.terminal, true); assert.equal(row.historySaved, true); assert.equal(row.historyPending, false);
    assert.equal(row.hasNativeItem, false); assert.equal(row.canResume, false); assert.equal(row.cancelPending, false);
    assert.deepEqual(Object.fromEntries(Object.keys(saved).map(key => [key, row[key]])), saved, 'Every stored terminal field must match actual manager data');
  }
  const file = `download-history-${stage}.json`;
  fs.writeFileSync(path.join(context.output, file), bytes, { flag: 'wx', mode: 0o600 });
  const snapshot = { stage, status, document, rows, rawLedger: { file, bytes: bytes.length, sha256: digest(bytes) } };
  evidence.snapshots.push(snapshot); return snapshot;
}
function preserveCompletedDownload(completed, row, label) {
  assert.equal(row.state, 'completed'); assert.equal(row.path, completed.destination); assert.equal(row.url, completed.url);
  assert.equal(row.received, DOWNLOAD.length); assert.equal(row.total, DOWNLOAD.length); assert.equal(row.error, '');
  assert.equal(new Date(row.finishedAt).toISOString(), row.finishedAt);
  const bytes = fs.readFileSync(completed.destination); assert.deepEqual(bytes, DOWNLOAD);
  const file = `actual-download-${label}.txt`;
  fs.copyFileSync(completed.destination, path.join(context.output, file), fs.constants.COPYFILE_EXCL);
  const value = { id: row.id, identity: row.identity, path: completed.destination, file, bytes: bytes.length, sha256: digest(bytes) };
  downloadEvidence().completedFiles.push(value); return value;
}
function assertCompletedDownloadBytes(files) {
  for (const record of files) {
    for (const file of [record.path, path.join(context.output, record.file)]) {
      const bytes = fs.readFileSync(file); assert.deepEqual(bytes, DOWNLOAD, 'Removing transfer metadata must never remove or rewrite the actual completed download');
      assert.equal(bytes.length, record.bytes); assert.equal(digest(bytes), record.sha256);
    }
  }
}
async function assertDownloadHistoryUI(records, stage, { restored = false } = {}) {
  if ((await state()).panel !== 'downloads') await command('downloads');
  const rendered = await until(() => window.webContents.executeJavaScript(`(() => {
    const list=document.getElementById('download-items');
    if(document.getElementById('downloads').hidden||list.hasAttribute('aria-busy')||list.querySelectorAll('article').length!==${records.length})return null;
    const clear=document.getElementById('download-history-clear');
    return {status:document.getElementById('download-history-status').textContent,error:document.getElementById('download-history-error').textContent,
      clear:{text:clear.textContent,disabled:clear.disabled,visible:Boolean(clear.getClientRects().length)},
      cards:[...list.querySelectorAll('article')].map(card=>({filename:card.querySelector('h2')?.textContent,path:card.querySelector('.source')?.textContent,
        text:card.textContent,paragraphs:[...card.querySelectorAll('p')].map(item=>item.textContent),
        progress:card.querySelector('progress')?{value:card.querySelector('progress').value,max:card.querySelector('progress').max}:null,
        actions:[...card.querySelectorAll('button')].map(item=>({label:item.textContent,disabled:item.disabled}))}))};
  })()`), 'the actual complete download-history cards');
  assert.equal(rendered.error, ''); assert.match(rendered.status, /No unsaved transfer status/);
  const current = await state();
  for (const record of records) {
    const card = rendered.cards.find(item => item.path === record.path); assert.ok(card, 'Every generated record must have its own actual rendered card');
    assert.equal(card.filename, record.filename);
    const owner = current.profiles.find(item => item.id === record.identity); assert.ok(owner);
    assert.ok(card.paragraphs.includes(`${owner.name} · ${record.state}`), 'The actual card must retain its native identity attribution');
    if (record.total > 0) assert.deepEqual(card.progress, { value: record.received, max: record.total });
    assert.ok(card.actions.some(item => item.label === 'Remove from history' && !item.disabled));
    assert.ok(!card.actions.some(item => ['Pause', 'Resume', 'Cancel'].includes(item.label)), 'A terminal/restored record must not expose a fictitious native resume or cancel');
    if (record.state === 'completed') assert.ok(card.actions.some(item => item.label === 'Show in folder' && !item.disabled));
    if (restored) assert.match(card.text, /Restored from saved download history/);
  }
  downloadEvidence().rendered.push({ stage, ...rendered });
  return rendered;
}
async function clearPersonalDownloadHistory(expected) {
  await activate(expected.personalTab);
  const rendered = await assertDownloadHistoryUI(expected.downloadHistory.records, 'before-personal-clear', { restored: true });
  const owner = (await state()).profiles.find(item => item.id === expected.personalIdentity);
  assert.deepEqual(rendered.clear, { text: `Clear saved history for ${owner.name}`, disabled: false, visible: true });
  const previous = dialog.showMessageBox, choices = [];
  dialog.showMessageBox = async (parent, options) => {
    assert.equal(parent, window); assert.equal(options.message, `Clear download history for ${owner.name}?`);
    assert.equal(options.detail, 'This removes transfer records for this identity. Downloaded files are kept. Finish or cancel active transfers first.');
    assert.deepEqual(options.buttons, ['Cancel', 'Clear history']); assert.equal(options.defaultId, 0); assert.equal(options.cancelId, 0);
    assert.equal(choices.length, 0, 'Exactly one generated, identity-bound clear confirmation is allowed');
    choices.push({ message: options.message, detail: options.detail, buttons: options.buttons, response: 1 });
    return { response: 1, checkboxChecked: false };
  };
  try {
    await window.webContents.executeJavaScript("document.getElementById('download-history-clear').click()");
    await until(async () => {
      const rows = await command('download-list');
      return choices.length === 1 && rows.every(row => row.identity !== expected.personalIdentity) ? rows : null;
    }, 'the actual confirmed identity-scoped history clearing');
    const saved = await captureDownloadHistory('after-personal-clear');
    assert.deepEqual(saved.document.downloads, expected.downloadHistory.records.filter(row => row.identity !== expected.personalIdentity), 'Clearing one identity must preserve every other identity record exactly');
    assert.ok(saved.document.downloads.some(row => row.identity === expected.secondIdentity));
    assertCompletedDownloadBytes(expected.downloadHistory.completedFiles);
    await assertDownloadHistoryUI(saved.document.downloads, 'after-personal-clear', { restored: true });
    downloadEvidence().clearConfirmation = choices;
  } finally { dialog.showMessageBox = previous; }
  await command('panel-close');
}

async function firstLaunch() {
  const expected = {};
  const initial = await state();
  await check('native Following form persists a manual source without claiming automatic collection', async () => {
    await command('following');
    await until(()=>window.webContents.executeJavaScript("Boolean(document.getElementById('follow-form').getClientRects().length)"),'following form');
    await window.webContents.executeJavaScript(`(() => { const form=document.getElementById('follow-form');form.elements.namedItem('name').value='Native follow fixture';form.elements.namedItem('url').value='https://example.invalid/project?item=one#details';form.requestSubmit(); })()`);
    const file=path.join(context.profile,'browser-follows.json');
    const saved=await until(()=>{if(!fs.existsSync(file))return null;const data=JSON.parse(fs.readFileSync(file,'utf8'));return data.sources.find(row=>row.name==='Native follow fixture')||null;},'durable follow created by actual renderer');
    assert.equal(saved.identity,initial.currentIdentity);assert.equal(saved.provider,'manual');assert.equal(saved.automatic,false);assert.equal(saved.url,'https://example.invalid/project?item=one#details');
    await until(()=>window.webContents.executeJavaScript("document.getElementById('follow-items').textContent.includes('automatic tracking unavailable')"),'honest manual-source status');
    await command('follow-change',{identity:saved.identity,id:saved.id,paused:true});expected.followId=saved.id;
    await captureShell('synthetic-following',1320,860);
    await command('panel-close');
  });
  await check('native Modrinth follow form saves exact loader and game-version filters without fetching or installing', async () => {
    await command('following');
    await until(()=>window.webContents.executeJavaScript("Boolean(document.getElementById('follow-form').getClientRects().length)"),'Modrinth follow form');
    await window.webContents.executeJavaScript(`(() => {const form=document.getElementById('follow-form');form.elements.namedItem('name').value='Synthetic Modrinth follow';form.elements.namedItem('url').value='https://modrinth.com/mod/sodium';form.elements.namedItem('loader').value='forge';form.elements.namedItem('gameVersion').value='1.20.1';form.requestSubmit();})()`);
    const saved=await until(()=>JSON.parse(fs.readFileSync(path.join(context.profile,'browser-follows.json'),'utf8')).sources.find(row=>row.name==='Synthetic Modrinth follow'),'durable native Modrinth compatibility');
    assert.equal(saved.provider,'modrinth-versions');assert.deepEqual(saved.compatibility,{loader:'forge',gameVersion:'1.20.1'});assert.equal(saved.automatic,false);assert.equal(saved.lastSuccess,0);expected.modrinthFollowId=saved.id;
    await until(()=>window.webContents.executeJavaScript("document.getElementById('follow-items').textContent.includes('declare') || document.getElementById('follow-items').textContent.includes('declared metadata')"),'explicit metadata-only compatibility scope');
    await command('panel-close');
  });
  await check('native ModHold author follow saves independently without claiming ban or starting automatic fetches', async () => {
    await command('following');
    await until(()=>window.webContents.executeJavaScript("Boolean(document.getElementById('follow-form').getClientRects().length)"),'ModHold follow form');
    await window.webContents.executeJavaScript(`(() => {const form=document.getElementById('follow-form');form.elements.namedItem('name').value='Synthetic ModHold author';form.elements.namedItem('url').value='https://modholdmods.com/u/NativeFixture';form.requestSubmit();})()`);
    const saved=await until(()=>JSON.parse(fs.readFileSync(path.join(context.profile,'browser-follows.json'),'utf8')).sources.find(row=>row.name==='Synthetic ModHold author'),'durable native ModHold follow');
    assert.equal(saved.provider,'modhold-author');assert.equal(saved.automatic,false);assert.equal(saved.lastSuccess,0);expected.modholdFollowId=saved.id;
    await until(()=>window.webContents.executeJavaScript("document.getElementById('follow-items').textContent.includes('Missing data does not verify a ban')"),'ModHold uncertainty scope');
    const observed=Math.floor(Date.now()/1000),report={schema_version:1,id:'native:report',creator_id:'native:fixture',source_account:saved.url,status:'unavailable',status_evidence:[{url:'https://example.invalid/evidence',kind:'retrieval_result',observed_unix:observed}],destination_account:null,identity_evidence:[],project_mappings:[],observed_unix:observed,review_after_unix:observed+86400,lifecycle:'active'};
    await window.webContents.executeJavaScript(`(() => {const card=[...document.querySelectorAll('#follow-items article')].find(c=>c.querySelector('h2')?.textContent==='Synthetic ModHold author');const input=card.querySelector('textarea');input.closest('details').open=true;input.value=${JSON.stringify(JSON.stringify(report))};input.dispatchEvent(new Event('input',{bubbles:true}));input.closest('form').requestSubmit();})()`);
    await until(()=>JSON.parse(fs.readFileSync(path.join(context.profile,'browser-follows.json'),'utf8')).sources.find(row=>row.id===saved.id)?.transitions?.length===1,'native imported report persisted');
    await until(()=>window.webContents.executeJavaScript("document.getElementById('follow-items').textContent.includes('Imported report: unavailable')"),'attributed native evidence report');
    await captureShell('synthetic-modhold-following',1320,860);await command('panel-close');
  });
  await assertSpellcheck('fresh-default-before-any-settings-change', true, []);
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
    await assertSpellcheck('fresh-personal-identity-before-any-settings-change', true, [initial.currentIdentity]);
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
  await check('real local-spelling settings update existing and later identity Sessions without changing other preferences', async () => {
    const existing = [expected.personalIdentity, expected.secondIdentity];
    await assertSpellcheck('default-in-both-existing-identities', true, existing);
    await setSpellcheckThroughRenderer(false);
    await assertSpellcheck('explicit-disable-existing-sessions', false, existing);
    await setSpellcheckThroughRenderer(true);
    await assertSpellcheck('explicit-reenable-existing-sessions', true, existing);
    await command('identity-add', 'Synthetic later spelling identity');
    const later = await state();
    expected.spellcheckIdentity = later.currentIdentity;
    expected.spellcheckTab = later.activeId;
    assert.ok(!existing.includes(expected.spellcheckIdentity), 'A newly used identity must be created after the explicit re-enable');
    await navigate(`${context.origin}/page?spellcheck=later-identity`);
    const all = [...existing, expected.spellcheckIdentity];
    await assertSpellcheck('new-identity-inherits-explicit-enable', true, all);
    await setSpellcheckThroughRenderer(false);
    await assertSpellcheck('final-explicit-disable-all-sessions', false, all);
    await activate(expected.personalTab);
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
    assert.ok(Math.abs(window.getContentSize()[0] - (left.x + left.width + right.width + (await state()).paneGeometry.dividers[0].bounds.width)) <= 1);
    await command('split');
    await captureMetrics('more-than-twelve-duplicate-tabs-loaded');
  });
  await check('closing an interleaved workspace tab selects its next visible neighbor', async () => {
    const previous=(await state()).activeId,workspace=await command('workspace-create',{name:'Synthetic close placement',color:'blue'}),ids=[];
    for(let i=0;i<5;i++)ids.push(await command('new'));
    await command('tab-assign',{id:ids[0],workspaceId:workspace.id});
    await command('tab-assign',{id:ids[2],workspaceId:workspace.id});
    await command('activate',ids[1]);await command('close',ids[1]);
    assert.equal((await state()).activeId,ids[3],'The next tab in the active workspace must win over a later global-array index.');
    await command('activate',previous);
    for(const id of [ids[0],ids[2],ids[3],ids[4]])await command('close',id);
    await command('workspace-remove',workspace.id);
  });
  await check('sidebar workspace buttons switch without losing the last selected tab', async () => {
    const before=await state(),previous=before.activeId,previousWorkspace=before.activeWorkspaceId,workspace=await command('workspace-create',{name:'Synthetic launcher workspace',color:'blue'});
    const first=await command('new'),second=await command('new');await command('tab-assign',{id:first,workspaceId:workspace.id});await command('tab-assign',{id:second,workspaceId:workspace.id});await command('activate',first);await command('activate',second);await command('activate',previous);
    await until(()=>window.webContents.executeJavaScript(`Boolean(document.querySelector('[data-workspace-id="${workspace.id}"].sidebar-workspace-button'))`),'created workspace launcher button');
    await window.webContents.executeJavaScript(`document.querySelector('[data-workspace-id="${workspace.id}"].sidebar-workspace-button').click()`);
    await until(async()=>{const s=await state();return s.activeWorkspaceId===workspace.id&&s.activeId===second;},'the last selected workspace tab');
    await window.webContents.executeJavaScript(`document.querySelector('[data-workspace-id="${workspace.id}"].sidebar-workspace-button').click()`);assert.equal((await state()).activeId,second,'Selecting the current workspace must not switch its active tab');
    await command('close',second);assert.equal((await state()).activeId,first);await command('workspace-switch',previousWorkspace);assert.equal((await state()).activeId,previous);
    await command('workspace-switch',workspace.id);assert.equal((await state()).activeId,first,'Closing the remembered tab selects a valid remaining tab');
    await command('workspace-switch',previousWorkspace);await command('close',first);await command('workspace-remove',workspace.id);
  });
  await check('the real tab-search window filters, closes and restores a tab', async () => {
    const previous=(await state()).activeId,url=`${context.origin}/page?tabSearch=unique-fixture`,id=await command('new',url);await site(url);
    await window.webContents.executeJavaScript("document.getElementById('tab-search-toggle').click()");
    const popup=await until(()=>BrowserWindow.getAllWindows().find(item=>item!==window&&!item.isDestroyed()&&item.webContents.getURL().includes('tab-search.html')),'the actual tab-search window');
    assert.equal(popup.webContents.getLastWebPreferences().sandbox,true);
    await until(()=>popup.webContents.executeJavaScript("Boolean(document.querySelector('#open .row'))"),'the rendered tab search list');
    await popup.webContents.executeJavaScript("const q=document.getElementById('query');q.value='tabSearch=unique-fixture';q.dispatchEvent(new Event('input',{bubbles:true}));");
    assert.equal(await popup.webContents.executeJavaScript("document.querySelectorAll('#open .row').length"),1);
    await popup.webContents.executeJavaScript("document.querySelector('#open .close').click()");
    await until(async()=>!(await state()).tabs.some(tab=>tab.id===id),'the tab closed through the dropdown');
    await until(()=>popup.webContents.executeJavaScript("Boolean(document.querySelector('#closed .open-tab'))"),'the recently closed result');
    // Restoring intentionally destroys the popup; acknowledge the request before
    // the click so Chromium cannot dispose the evaluating frame mid-response.
    await popup.webContents.executeJavaScript("setTimeout(()=>document.querySelector('#closed .open-tab').click(),0);true");
    await until(async()=>(await state()).tabs.some(tab=>tab.id===id),'the original tab restored through the dropdown');
    await command('activate',previous);await command('close',id);
  });
  await exerciseSidebar({window,context,command,state,activate,partitionFor,check,expected});
  await exerciseSidebarAccounts({window,context,command,state,activate,partitionFor,check,expected});
  await exerciseTabContext({window,context,command,state,check});
  await check('top-right browser menu opens Settings and the settings search filters real controls',async()=>{
    const original=Menu.buildFromTemplate;let captured=null,shown=false;
    Menu.buildFromTemplate=function(template){const menu=original.call(this,template);if(template.some(item=>item.label==='Settings')&&template.some(item=>item.label==='Accounts and identities')){captured=menu;menu.once('menu-will-show',()=>{shown=true;});}return menu;};
    try{
      await window.webContents.executeJavaScript("document.getElementById('open-tools').click()");await until(()=>shown&&captured,'the native top-right browser menu');captured.closePopup(window);
      const settings=captured.items.find(item=>item.label==='Settings');assert.ok(settings&&settings.enabled);settings.click(settings,window,{});await until(async()=>(await state()).panel==='settings','Settings opened from the native browser menu');
      await window.webContents.executeJavaScript("const search=document.getElementById('settings-search');search.value='sidebar pin';search.dispatchEvent(new Event('input',{bubbles:true}));true");
      const result=await window.webContents.executeJavaScript("({sidebarVisible:!document.querySelector('fieldset[data-settings-category=sidebar]').hidden, status:document.getElementById('settings-search-status').textContent})");assert.equal(result.sidebarVisible,true);assert.match(result.status,/matching section/);
      await command('panel-close');
    }finally{if(captured)captured.closePopup(window);Menu.buildFromTemplate=original;}
  });
  await check('configurable sidebar shortcuts open the canonical browser managers',async()=>{
    const saved=(await state()).preferences.sidebarTools;await command('settings-save',{sidebarTools:saved.map(item=>({...item,visible:true}))});
    for(const id of ['extensions','settings','vault','following','resources']){
      await until(()=>window.webContents.executeJavaScript(`Boolean(document.querySelector('[data-sidebar=${id}]')&&!document.querySelector('[data-sidebar=${id}]').hidden)`),'visible sidebar manager shortcut');
      await window.webContents.executeJavaScript(`document.querySelector('[data-sidebar=${id}]').click()`);await until(async()=>(await state()).panel===id,`the real ${id} manager`);await command('panel-close');
    }
    const before=(await state()).activeId;await window.webContents.executeJavaScript("document.querySelector('[data-sidebar=start]').click()");const fresh=await until(async()=>{const s=await state();return s.activeId!==before?s.tabs.find(tab=>tab.id===s.activeId):null;},'local new tab from sidebar');assert.equal(fresh.url,'about:blank');await command('close',fresh.id);await command('settings-save',{sidebarTools:saved});
  });
  await check('actual DownloadItem completion, pause/resume and cancellation are reflected by browser commands', async () => {
    const view = await activate(expected.personalTab);
    const completed = await selectDownload(view, '/download?identity=personal', 'complete-personal.txt');
    assert.equal(await completed.done, 'completed');
    assert.deepEqual(fs.readFileSync(completed.destination), DOWNLOAD);
    const personalRow = await until(async () => (await command('download-list')).find(item => item.url === completed.url && item.state === 'completed' && item.historySaved), 'the completed personal native transfer and saved history');
    assert.equal(personalRow.identity, expected.personalIdentity);
    preserveCompletedDownload(completed, personalRow, 'personal');
    const secondView = await activate(expected.secondTab);
    assert.notEqual(secondView.webContents.session, view.webContents.session, 'The two native transfers must originate from separate identity Sessions');
    const secondCompleted = await selectDownload(secondView, '/download?identity=second', 'complete-second.txt');
    assert.equal(await secondCompleted.done, 'completed');
    const secondRow = await until(async () => (await command('download-list')).find(item => item.url === secondCompleted.url && item.state === 'completed' && item.historySaved), 'the completed second-identity native transfer and saved history');
    assert.equal(secondRow.identity, expected.secondIdentity);
    preserveCompletedDownload(secondCompleted, secondRow, 'second');
    await activate(expected.personalTab);
    const cancelled = await selectDownload(view, '/slow-download', 'cancelled.txt');
    const row = await until(async () => (await command('download-list')).find(item => item.url === cancelled.url && item.state === 'progressing'), 'progressing download manager row');
    await command('download-action', { id: row.id, action: 'pause' });
    assert.equal(cancelled.item.isPaused(), true);
    await command('download-action', { id: row.id, action: 'resume' });
    assert.equal(cancelled.item.isPaused(), false);
    await command('download-action', { id: row.id, action: 'cancel' });
    assert.equal(await cancelled.done, 'cancelled');
    const saved = await captureDownloadHistory('before-close');
    assert.equal(saved.document.downloads.length, 3);
    const cancelledRow = saved.document.downloads.find(item => item.id === row.id);
    assert.equal(cancelledRow.state, 'cancelled'); assert.equal(cancelledRow.identity, expected.personalIdentity);
    expected.downloadHistory = { records: saved.document.downloads, rawLedgerSha256: saved.rawLedger.sha256, completedFiles: downloadEvidence().completedFiles };
    await assertDownloadHistoryUI(saved.document.downloads, 'before-close');
    await command('panel-close');
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
    const record = await installPreviewThroughRenderer(preview, [expected.personalIdentity, expected.secondIdentity], { apiProfile: 'firefox' });
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
  await check('native extension local and sync storage separate namespaces and identities, emit real changes and reject quota writes atomically', async () => {
    expected.extensionStorage = await createExtensionStorage({ context, result, backgroundPages, partitionFor }).firstLaunch(expected);
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
  expected.pageTools = await pageTools().firstLaunch(expected);
  expected.extensionVisits = (await extensionData(await site())).visits;
  await check('extension-owned tab creation, URL query, identity isolation and revocation use real native tabs', async () => {
    const previous=(await state()).activeId, runtimeId=expected.bridgeRuntimeIds[expected.personalIdentity];
    const background=backgroundPages(runtimeId,expected.personalIdentity)[0];assert.ok(background);
    const created=await background.executeJavaScript(`browser.tabs.create({url:browser.runtime.getURL('options.html'),active:false})`);
    const url=`chrome-extension://${runtimeId}/options.html`;
    assert.equal(created.url,url);
    const matching=await background.executeJavaScript(`browser.tabs.query({url:${JSON.stringify(url)}})`);
    assert.equal(matching.length,1);assert.equal(matching[0].id,created.id);
    const foreign=backgroundPages(expected.bridgeRuntimeIds[expected.secondIdentity],expected.secondIdentity)[0];assert.ok(foreign);
    assert.equal((await foreign.executeJavaScript(`browser.tabs.query({url:${JSON.stringify(url)}})`)).length,0);
    const tab=await until(async()=>{const row=(await state()).tabs.find(value=>value.url===url&&value.identity===expected.personalIdentity);return row||null;},'the extension options tab');
    expected.extensionOptionsTab=tab.id;expected.extensionOptionsURL=url;
    const view=await activate(tab.id), contents=view.webContents;assert.equal(contents.getURL(),url);
    await command('extension-enable',{id:expected.bridgeId,identity:expected.personalIdentity,enabled:false});
    assert.equal(contents.isDestroyed(),true,'Revocation destroys the extension document');
    assert.equal((await state()).tabs.find(value=>value.id===tab.id).url,url,'Revocation preserves the tab record');
    await command('extension-enable',{id:expected.bridgeId,identity:expected.personalIdentity,enabled:true});
    assert.equal((await site(url)).webContents.getURL(),url,'Re-enabling reopens the preserved active tab');
    await activate(previous);
  });
  await check('legacy blank split preserves whole-unit group and pin metadata',async()=>{
    const previous=(await state()).activeId,workspace=await command('workspace-create',{name:'Synthetic empty split workspace',color:'cyan'});await command('workspace-switch',workspace.id);const first=(await state()).activeId,group=await command('group-create',{workspaceId:workspace.id,name:'Blank split group',color:'purple'});await command('tab-assign',{id:first,workspaceId:workspace.id,groupId:group.id});await command('tab-pin',{id:first,pinned:true});await command('split');const splitState=await state(),members=splitState.paneGeometry.panes.map(p=>p.tabId);assert.equal(members.length,2);assert.ok(splitState.tabs.filter(t=>members.includes(t.id)).every(t=>t.groupId===group.id&&t.pinned),'Legacy fallback must inherit group and pin');await command('activate',previous);for(const id of members)await command('close',id);await command('group-remove',group.id);await command('workspace-remove',workspace.id);
  });
  await check('three actual panes split on both axes move resize and switch isolated identities independently',async()=>{
    await activate(expected.personalTab);await command('pane-split',{id:expected.personalTab,axis:'x'});let current=await state(),second=current.activeId;await command('pane-navigate',{id:second,url:`${context.origin}/page?pane=second`});await site();
    await command('pane-split',{id:second,axis:'y'});const third=(await state()).activeId;await command('pane-navigate',{id:third,url:`${context.origin}/page?pane=third`});await site();
    assert.equal((await state()).paneGeometry.panes.length,3);assert.equal(views().filter(v=>v.getVisible()).length,3);
    await command('pane-identity',{id:third,identity:expected.secondIdentity});const switched=(await state()).activeId,switchedView=await site();assertIdentity(await identityData(switchedView),'second');
    const paneBackground=backgroundPages(expected.bridgeRuntimeIds[expected.personalIdentity],expected.personalIdentity)[0];assert.ok(paneBackground);
    const paneAPI=await paneBackground.executeJavaScript(`(async()=>{const tab=(await browser.tabs.query({})).find(t=>t.url===${JSON.stringify(`${context.origin}/page?pane=second`)});const results=[];for(const operation of [()=>browser.tabs.move(tab.id,{index:0}),()=>browser.tabs.update(tab.id,{pinned:true})]){try{await operation();results.push('unexpected success');}catch(error){results.push(error.message);}}return results;})()`);assert.ok(paneAPI.every(message=>message.includes('other identities')),'Extension must not rearrange or pin another identity through split membership');
    await command('pane-focus',expected.personalTab);assertIdentity(await identityData(await site()),'personal');assert.equal((await state()).paneGeometry.panes.length,3);
    await command('pane-resize',{path:[],ratio:0.35});await command('pane-swap',{first:expected.personalTab,second:switched});current=await state();assert.equal(current.paneTree.ratio,0.35);assert.equal(current.paneGeometry.panes[0].tabId,switched);
    const bounds=views().filter(v=>v.getVisible()).map(v=>v.getBounds());assert.equal(bounds.length,3);for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length;j++){const a=bounds[i],b=bounds[j];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,'Actual pane surfaces cannot overlap');}
    const memberIds=current.paneGeometry.panes.map(p=>p.tabId),group=await command('group-create',{workspaceId:current.activeWorkspaceId,name:'Synthetic split group',color:'purple'});await command('tab-assign',{id:second,workspaceId:current.activeWorkspaceId,groupId:group.id});const grouped=await state();assert.ok(grouped.tabs.filter(t=>memberIds.includes(t.id)).every(t=>t.groupId===group.id));assert.equal(grouped.paneGeometry.panes.length,3,'Grouping a split must preserve every pane');
    const workspacePeers=grouped.tabs.filter(t=>t.workspaceId===grouped.activeWorkspaceId),outside=workspacePeers.findLastIndex(t=>!memberIds.includes(t.id));assert.ok(outside>=0,'Require an outside anchor to prove real unit movement');await command('tab-move',{id:second,index:outside});const moved=await state();assert.notDeepEqual(moved.tabs.map(t=>t.id),grouped.tabs.map(t=>t.id),'Unit movement must actually change tab order');const indices=memberIds.map(id=>moved.tabs.findIndex(t=>t.id===id)).sort((a,b)=>a-b);assert.equal(indices[2]-indices[0],2,'Split tabs move as a contiguous unit');assert.deepEqual(moved.paneTree,current.paneTree,'Tab-strip movement must not swap pane positions');
    const outsideTab=moved.tabs.find(t=>!memberIds.includes(t.id));assert.ok(outsideTab);const outsideBefore={groupId:outsideTab.groupId,pinned:outsideTab.pinned};await command('activate',outsideTab.id);const suspended=await state(),outsideAfter=suspended.tabs.find(t=>t.id===outsideTab.id);assert.deepEqual({groupId:outsideAfter.groupId,pinned:outsideAfter.pinned},outsideBefore,'Unrelated activation must not silently regroup or repin a tab');assert.equal(suspended.paneGeometry.panes.length,1);assert.ok(suspended.paneLayouts.some(tree=>JSON.stringify(tree)===JSON.stringify(moved.paneTree)),'Unrelated activation must preserve the previous split unit');await command('activate',second);assert.deepEqual((await state()).paneTree,moved.paneTree,'Returning to a split member restores its complete layout');
    const focusPoint=await window.webContents.executeJavaScript(`(()=>{const button=[...document.querySelectorAll('[data-pane-id]')].find(n=>n.dataset.paneId===${JSON.stringify(switched)}).querySelector('button');const r=button.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);window.webContents.focus();window.webContents.sendInputEvent({type:'mouseDown',...focusPoint,button:'left',clickCount:1});window.webContents.sendInputEvent({type:'mouseUp',...focusPoint,button:'left',clickCount:1});await until(async()=>(await state()).activeId===switched,'native shell pointer selects the targeted pane');
    const clickedView=await site();await clickedView.webContents.executeJavaScript("window.nativePaneClicks=0;document.addEventListener('click',()=>window.nativePaneClicks++,{once:true});true");clickedView.webContents.sendInputEvent({type:'mouseDown',x:20,y:20,button:'left',clickCount:1});clickedView.webContents.sendInputEvent({type:'mouseUp',x:20,y:20,button:'left',clickCount:1});await until(()=>clickedView.webContents.executeJavaScript('window.nativePaneClicks===1'),'native page receives its viewport pointer click');
    await captureShell('synthetic-three-independent-panes',1320,860);await command('split');
  });
  await check('group action shows every native tab without metadata changes and preserves close restore',async()=>{
    const workspaceId=(await state()).activeWorkspaceId,group=await command('group-create',{workspaceId,name:'All five native tabs',color:'cyan'}),ids=[];
    for(let i=0;i<5;i++){await activate(i%2?expected.secondTab:expected.personalTab);const id=await command('new',`${context.origin}/page?whole-group=${i}`);await site();await command('tab-assign',{id,workspaceId,groupId:group.id});ids.push(id);}
    const before=(await state()).tabs.map(({id,url,identity,groupId,pinned,workspaceId})=>({id,url,identity,groupId,pinned,workspaceId}));await command('workspaces');await until(()=>window.webContents.executeJavaScript(`Boolean(document.querySelector('[data-group-id="${group.id}"] [data-split-group]'))`),'whole group action button');await window.webContents.executeJavaScript(`document.querySelector('[data-group-id="${group.id}"] [data-split-group]').click()`);await until(async()=>(await state()).paneGeometry.panes.length===5,'all five group panes');const shown=await state();assert.deepEqual(shown.tabs.map(({id,url,identity,groupId,pinned,workspaceId})=>({id,url,identity,groupId,pinned,workspaceId})),before,'Group split cannot reorder, regroup, repin, close or replace tabs');assert.deepEqual(shown.paneGeometry.panes.map(p=>p.tabId),ids);await until(()=>views().filter(v=>v.getVisible()).length===5,'five actual native surfaces');
    await command('pane-resize',{path:[],ratio:.4});await command('pane-swap',{first:ids[0],second:ids[1]});const tree=(await state()).paneTree;await command('group-split',group.id);assert.deepEqual((await state()).paneTree,tree,'Repeated show all preserves customized ratios and swapped visual order');await activate(expected.personalTab);await command('group-split',group.id);assert.deepEqual((await state()).paneTree,tree,'Show all restores a customized suspended group layout');await command('close',ids[4]);assert.equal((await state()).paneGeometry.panes.length,4);await command('restore');await command('group-split',group.id);assert.equal((await state()).paneGeometry.panes.length,5);for(const id of ids){await command('pane-focus',id);assertIdentity(await identityData(await site()),ids.indexOf(id)%2?'second':'personal');}
    expected.wholeGroup={groupId:group.id,ids};await captureShell('synthetic-all-five-group-panes',1320,860);await command('split');
  });
  await check('prepare independent workspace focus for real restart',async()=>{
    const previous=(await state()).activeId,previousWorkspace=(await state()).activeWorkspaceId,workspace=await command('workspace-create',{name:'Synthetic restart workspace',color:'cyan'}),first=await command('new'),last=await command('new');
    await command('tab-assign',{id:first,workspaceId:workspace.id});await command('tab-assign',{id:last,workspaceId:workspace.id});await command('activate',first);await command('activate',last);await command('activate',previous);
    expected.workspaceFocus={workspaceId:workspace.id,first,last,previous,previousWorkspace};
  });
  await command('settings-save',{sidebarPanelPinned:false});
  await command('group-split',expected.wholeGroup.groupId);await command('pane-resize',{path:[],ratio:0.4});expected.paneTree=(await state()).paneTree;
  const final = await state();
  expected.tabs = final.tabs.map(({ id, url, identity }) => ({ id, url, identity }));
  expected.profiles = final.profiles;
  expected.activeId = final.activeId;
  expected.spellcheckEnabled = final.preferences.spellcheckEnabled;
  assert.equal(expected.spellcheckEnabled, false);
  fs.writeFileSync(path.join(context.directory, 'restart-expectations.json'), JSON.stringify(expected), { mode: 0o600 });
}

async function secondLaunch() {
  const expected = JSON.parse(fs.readFileSync(path.join(context.directory, 'restart-expectations.json'), 'utf8'));
  await check('the sidebar pin choice survives a real process restart',async()=>{assert.equal((await state()).preferences.sidebarPanelPinned,false);await command('settings-save',{sidebarPanelPinned:true});});
  await check('follow source and pause choice survive a real process restart', async () => {
    const data=JSON.parse(fs.readFileSync(path.join(context.profile,'browser-follows.json'),'utf8'));
    const saved=data.sources.find(row=>row.id===expected.followId);assert.ok(saved);assert.equal(saved.paused,true);assert.equal(saved.automatic,false);assert.equal(saved.provider,'manual');
    const modhold=data.sources.find(row=>row.id===expected.modholdFollowId);assert.ok(modhold);assert.equal(modhold.provider,'modhold-author');assert.equal(modhold.automatic,false);assert.equal(modhold.transitions[0].id,'native:report');
    const modrinth=data.sources.find(row=>row.id===expected.modrinthFollowId);assert.ok(modrinth);assert.equal(modrinth.provider,'modrinth-versions');assert.deepEqual(modrinth.compatibility,{loader:'forge',gameVersion:'1.20.1'});assert.equal(modrinth.automatic,false);
  });
  await check('real process restart restores complete duplicate-preserving tab and identity metadata', async () => {
    const restored = await state();
    assert.deepEqual(restored.tabs.map(({ id, url, identity }) => ({ id, url, identity })), expected.tabs);
    assert.deepEqual(restored.profiles, expected.profiles);
    assert.equal(restored.activeId, expected.activeId);assert.deepEqual(restored.paneTree,expected.paneTree);assert.deepEqual(restored.paneGeometry.panes.map(p=>p.tabId),expected.wholeGroup.ids);assert.equal(restored.paneGeometry.panes.length,5);await until(()=>views().filter(v=>v.getVisible()).length===5,'restored whole-group native surfaces');await command('split');
    const personal = await activate(expected.personalTab);
    await assertCookieLifetimes(expected.personalIdentity, 'personal', 'after-restart', {sessionCookieExpected: false});
    assertIdentity(await identityData(personal), 'personal', {sessionCookieExpected: false});
    const second = await activate(expected.secondTab);
    await assertCookieLifetimes(expected.secondIdentity, 'second', 'after-restart', {sessionCookieExpected: false});
    assertIdentity(await identityData(second), 'second', {sessionCookieExpected: false});
    assertIdentityStorageLocations();
    result.storageLayouts = fixtureStorageLayout();
  });
  await check('workspace launcher restores its last selected tab after real restart',async()=>{
    const fixture=expected.workspaceFocus,previous=(await state()).activeId;await command('workspace-switch',fixture.workspaceId);assert.equal((await state()).activeId,fixture.last);
    await command('close',fixture.last);assert.equal((await state()).activeId,fixture.first);await command('activate',fixture.previous);await command('workspace-switch',fixture.workspaceId);assert.equal((await state()).activeId,fixture.first);
    await command('activate',previous);await command('close',fixture.first);await command('workspace-remove',fixture.workspaceId);
  });
  await check('the explicit disabled spelling choice survives restart in the default and every identity Session', async () => {
    assert.equal(expected.spellcheckEnabled, false);
    const previousTab = (await state()).activeId;
    // Restored tabs are intentionally lazy. Enter the actual later-identity
    // document through production activation before inspecting its Session.
    await activate(expected.spellcheckTab);
    await assertSpellcheck('disabled-after-real-process-restart', expected.spellcheckEnabled, [expected.personalIdentity, expected.secondIdentity, expected.spellcheckIdentity]);
    await command('settings');
    // The command receipt precedes publish()'s deferred state event. Observe
    // the actual rendered control after the one open action; do not wait for
    // a particular checked value or repeat the action to manufacture a pass.
    const choice = await until(async () => {
      const observed = await window.webContents.executeJavaScript(`(() => {
        const field=document.getElementById('settings-form').elements.namedItem('spellcheckEnabled');
        return {checked:field.checked,visible:Boolean(field.getClientRects().length),disabled:field.disabled};
      })()`);
      return observed.visible && !observed.disabled ? observed : null;
    }, 'the restored spelling control is actually visible and enabled');
    assert.deepEqual(choice, { checked: false, visible: true, disabled: false });
    result.spellcheck.restoredControl = choice;
    await command('panel-close');
    await activate(previousTab);
  });
  await pageTools().afterRestart(expected.pageTools);
  await check('download history and completed bytes survive restart with truthful native status and identity-scoped clearing', async () => {
    const saved = await captureDownloadHistory('after-restart');
    assert.equal(saved.rawLedger.sha256, expected.downloadHistory.rawLedgerSha256, 'Normal close and restart must preserve the exact saved terminal download document');
    assert.deepEqual(saved.document.downloads, expected.downloadHistory.records);
    for (const row of saved.rows) { assert.equal(row.restored, true); assert.equal(row.interruptedByRestart, false); }
    assertCompletedDownloadBytes(expected.downloadHistory.completedFiles);
    downloadEvidence().completedFiles = expected.downloadHistory.completedFiles;
    await assertDownloadHistoryUI(saved.document.downloads, 'after-restart', { restored: true });
    await clearPersonalDownloadHistory(expected);
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
  await check('both native extension storage namespaces preserve complete isolated values after a normal process restart', async () => {
    await createExtensionStorage({ context, result, backgroundPages, partitionFor }).afterRestart(expected, expected.extensionStorage);
  });
  await check('extension-owned tab survives process restart and is reauthorized in its own identity', async () => {
    const previous=(await state()).activeId;
    const restored=(await state()).tabs.find(tab=>tab.id===expected.extensionOptionsTab);
    assert.equal(restored?.identity,expected.personalIdentity);assert.equal(restored?.url,expected.extensionOptionsURL);
    const view=await activate(expected.extensionOptionsTab);assert.equal(view.webContents.getURL(),expected.extensionOptionsURL);
    const background=backgroundPages(expected.bridgeRuntimeIds[expected.personalIdentity],expected.personalIdentity)[0];
    assert.equal((await background.executeJavaScript(`browser.tabs.query({url:${JSON.stringify(expected.extensionOptionsURL)}})`)).length,1);
    await activate(previous);
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
// retain events from the generated fixture packages under this fresh profile.
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
