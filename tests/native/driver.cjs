'use strict';
// Test-only main entry. Never staged into a browser package. No production
// command bypass: all browser actions use the real trusted shell preload IPC.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { app, BrowserWindow, dialog, session, webContents } = require('electron');
const { readContext, preflight } = require('../../scripts/native-smoke.cjs');
const { DOWNLOAD } = require('./fixture-server.cjs');
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
fs.mkdirSync(path.join(context.profile, 'engine'), { recursive: true });
app.setPath('sessionData', path.join(context.profile, 'engine'));
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
result.extensionLifecycle = [];
function partitionFor(identity) {
  const partition = session.fromPartition(`persist:noxviola-identity-${identity}`);
  partitionIdentities.set(partition, identity);
  for (const event of result.extensionLifecycle) if (lifecyclePartitions.get(event) === partition) event.identity = identity;
  observePartition(partition);
  return partition;
}
function isFixtureExtension(extension) {
  if (!extension || typeof extension.path !== 'string' || !['Noxviola synthetic storage fixture', 'Noxviola synthetic background fixture'].includes(extension.name)) return false;
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
    throw new Error(`${operation} failed: ${JSON.stringify(outcome.fixtureFailure || outcome.error)}`);
  }
  return outcome.value;
}
async function identityData(view) { return fixtureValue(view, 'window.fixture.readIdentity()', 'readIdentity'); }
async function writeIdentity(view, value) { return fixtureValue(view, `window.fixture.writeIdentity(${JSON.stringify(value)})`, `writeIdentity(${value})`); }
function assertIdentity(data, expected) {
  assert.equal(data.localStorage, expected);
  assert.equal(data.indexedDB, expected);
  assert.equal(data.cache, expected);
  assert.match(data.cookie, new RegExp(`(?:^|;\\s*)noxviola_fixture=${expected}(?:;|$)`));
  assert.equal(data.serviceWorkers, 1);
  assert.equal(data.privilegedBridge, 'undefined');
  assert.equal(data.nodeRequire, 'undefined');
  assert.equal(data.nodeProcess, 'undefined');
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
  assert.equal(selection, null);
  selection = path.join(__dirname, 'fixtures', name);
  const preview = await command('extension-preview-dialog', 'directory');
  assert.equal(selection, null, 'Production extension preview must use its selected path');
  assert.ok(preview?.token && preview?.permissions, 'Actual package inspection and consent preview required');
  return preview;
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
    const record = await command('extension-install', { token: preview.token, identities: [expected.personalIdentity], permissionsAccepted: true });
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
    const record = await command('extension-install', { token: preview.token, identities: [expected.personalIdentity], permissionsAccepted: true });
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
  await check('actual library IPC edits, previews, cancels, merges and exports complete synthetic metadata', async () => {
    await window.webContents.executeJavaScript('window.__noxviolaNativeVault = null; window.browser.onVault(value => { window.__noxviolaNativeVault = value; });');
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
    for (const [width, height] of [[700, 600], [1320, 860]]) await captureShell('synthetic-extensions', width, height);
    await command('panel-close');
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
    assertIdentity(await identityData(await activate(expected.personalTab)), 'personal');
    assertIdentity(await identityData(await activate(expected.secondTab)), 'second');
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
  await check('library edits and merged metadata survive a real process restart', async () => {
    await window.webContents.executeJavaScript('window.__noxviolaNativeVault = null; window.browser.onVault(value => { window.__noxviolaNativeVault = value; });');
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
    assert.equal((await command('extension-list')).length, 0);
    for (const tab of [expected.personalTab, expected.secondTab]) {
      await activate(tab);
      const view = await navigate(`${context.origin}/page?uninstalled=${tab}`);
      const data = await view.webContents.executeJavaScript('({storage:document.documentElement.dataset.noxviolaExtension||null,background:document.documentElement.dataset.noxviolaBackground||null})');
      assert.deepEqual(data, { storage: null, background: null });
    }
    assert.equal(backgroundPages(expected.backgroundRuntimeId, expected.personalIdentity).length, 0);
    await captureMetrics('both-extension-fixtures-uninstalled');
  });
}

// Observers are attached before production startup, so extension-ready may be
// recorded even when it precedes loadExtension's resolved promise. They only
// retain events from the two generated fixture packages under this fresh profile.
app.on('session-created', observePartition);
app.on('web-contents-created', (_event, contents) => observeBackground(contents));
require('../../browser/main.cjs');
app.whenReady().then(async () => {
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
