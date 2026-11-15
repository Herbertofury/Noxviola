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
  await action();
  result.checks.push({ name, passed: true, milliseconds: Math.round(performance.now() - start) });
  console.log(`PASS: ${name}`);
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
  return views().find(view => view.getVisible() && view.webContents.session === session.fromPartition(`persist:noxviola-identity-${tab.identity}`) && view.webContents.getURL() === tab.url);
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
async function identityData(view) { return view.webContents.executeJavaScript('window.fixture.readIdentity()'); }
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
  return until(async () => {
    const raw = await view.webContents.executeJavaScript(`document.documentElement.dataset[${JSON.stringify(field)}] || null`);
    return raw ? JSON.parse(raw) : null;
  }, `${field} content script and runtime response`);
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
  return session.fromPartition(`persist:noxviola-identity-${identity}`).extensions.getExtension(id);
}
function backgroundPages(runtimeId, identity) {
  const partition = session.fromPartition(`persist:noxviola-identity-${identity}`);
  return webContents.getAllWebContents().filter(contents => contents.session === partition && contents.getURL().startsWith(`chrome-extension://${runtimeId}/`) && contents.getType() === 'backgroundPage');
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
    assertIdentity(await personal.webContents.executeJavaScript('window.fixture.writeIdentity("personal")'), 'personal');
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
    assertIdentity(await second.webContents.executeJavaScript('window.fixture.writeIdentity("second")'), 'second');
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
}).catch(error => {
  result.passed = false;
  result.error = error.stack || String(error);
  fs.writeFileSync(path.join(context.output, `phase-${phase}.json`), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  console.error(result.error);
  app.exit(1);
});
