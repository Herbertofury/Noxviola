'use strict';
// Runs in the ordinary Node test process, never in the shipped Electron main.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { performance } = require('node:perf_hooks');
const { fileURLToPath } = require('node:url');
const { CdpConnection, loopbackWebSocket } = require('./cdp.cjs');
const executeFile = promisify(execFile);

const HTTPS_CASES = Object.freeze([
  { url: 'https://www.rfc-editor.org/rfc/rfc9110.html', title: 'RFC 9110' },
  { url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript', title: 'JavaScript' },
]);

function publicAddress(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return { scheme: url.protocol };
    return { origin: url.origin, path: url.pathname, queryKeys: [...new Set(url.searchParams.keys())] };
  } catch { return { invalid: true }; }
}

function packagedLaunchArguments(context, phase) {
  if (![1, 2].includes(phase)) throw new Error('Only the two packaged fixture phases may launch.');
  if (!path.isAbsolute(context.profile) || !path.isAbsolute(context.output)) throw new Error('Packaged fixture paths must be absolute.');
  return [
    `--user-data-dir=${context.profile}`,
    '--remote-debugging-port=0',
    `--log-net-log=${path.join(context.output, `packaged-phase-${phase}-netlog.json`)}`,
  ];
}

function nativeWindowCloseArguments(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('An exact positive launched browser PID is required.');
  return ['-B', path.join(__dirname, 'window-close.py'), '--pid', String(pid)];
}

async function requestNativeWindowClose(pid) {
  const { stdout } = await executeFile('python', nativeWindowCloseArguments(pid), { encoding: 'utf8', windowsHide: true, timeout: 10_000 });
  const outcome = JSON.parse(stdout);
  assert.equal(outcome.pid, pid);
  assert.equal(outcome.window.pid, pid);
  assert.equal(outcome.window.visible, true);
  assert.equal(outcome.window.topLevel, true);
  assert.equal(outcome.protocol, process.platform === 'win32' ? 'WM_CLOSE' : 'WM_PROTOCOLS/WM_DELETE_WINDOW');
  assert.equal(process.platform === 'win32' ? outcome.messageProcessed : outcome.messageSubmitted, true);
  return outcome;
}

function assertStores(data, expected, { sessionCookieExpected = true } = {}) {
  for (const name of ['localStorage', 'indexedDB', 'cache']) assert.equal(data[name], expected, name);
  const cookies = new Map(data.cookie.split(';').filter(Boolean).map(value => value.trim().split('=')));
  assert.equal(cookies.get('noxviola_fixture'), expected, 'The persistent cookie must belong to this identity');
  assert.equal(cookies.get('noxviola_session_fixture'), sessionCookieExpected ? expected : undefined, 'Session-only cookie lifetime');
  assert.equal(data.serviceWorkers, 1);
  for (const name of ['privilegedBridge', 'nodeRequire', 'nodeProcess']) assert.equal(data[name], 'undefined', name);
}

function digest(file) {
  const bytes = fs.readFileSync(file);
  return { file: path.basename(file), bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

async function until(action, label, timeout = 30_000) {
  const deadline = performance.now() + timeout;
  while (performance.now() < deadline) {
    const result = await action();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${label}. The operation is not retried or skipped.`);
}

async function bounded(promise, milliseconds, message) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })]); }
  finally { clearTimeout(timer); }
}

async function waitForDocument(evaluate, target, { fixture = true, address = null } = {}) {
  return until(async () => {
    try {
      const document = await evaluate(target, "({url:location.href,title:document.title,complete:document.readyState==='complete',fixtureReady:typeof window.fixture?.readIdentity==='function'})");
      return document.complete && (!fixture || document.fixtureReady) && (address === null || document.url === address) ? document : null;
    } catch (error) {
      if (/Execution context was destroyed|Cannot find context|Inspected target navigated/i.test(error.message)) return false;
      throw error;
    }
  }, 'the selected target’s committed document readiness');
}

function summarizeNetLog(file) {
  const document = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(Array.isArray(document.events) && document.events.length, 'The normal packaged exit must finish its actual Chromium NetLog');
  const eventTypes = new Map(Object.entries(document.constants?.logEventTypes || {}).map(([name, value]) => [value, name]));
  const counts = {}, origins = {};
  for (const event of document.events) {
    const type = eventTypes.get(event.type) || String(event.type);
    counts[type] = (counts[type] || 0) + 1;
    if (typeof event.params?.url === 'string') {
      const address = publicAddress(event.params.url);
      if (address.origin) origins[address.origin] = (origins[address.origin] || 0) + 1;
    }
  }
  return { events: document.events.length, counts, urlParameterOrigins: origins, caveat: 'All NetLog events are retained. Origin counts count events with a URL parameter, not unique requests, and do not by themselves attribute traffic to an application or prove its purpose.' };
}

function stateTabs(value) {
  return value.tabs.map(tab => Object.fromEntries(['id', 'url', 'title', 'identity', 'workspaceId', 'groupId', 'pinned', 'muted'].filter(key => Object.hasOwn(tab, key)).map(key => [key, tab[key]])));
}

function assertSavedSession(saved, expected) {
  // stateView spells out default tab flags; the saved format may omit them.
  // Normalize only these documented defaults, retaining every ordered tab and
  // comparing URL/title, identity, workspace/group membership and flags.
  const normalized = { tabs: saved.tabs.map(tab => ({ ...tab,
    workspaceId: tab.workspaceId || 'default', groupId: tab.groupId ?? null,
    pinned: tab.pinned ?? false, muted: tab.muted ?? false,
  })) };
  assert.deepEqual(stateTabs(normalized), stateTabs(expected), 'Normal OS close must durably save the final ordered tab state');
  for (const field of ['profiles', 'preferences', 'activeId', 'activeWorkspaceId']) {
    assert.deepEqual(saved[field], expected[field], `Normal OS close must durably save ${field}`);
  }
}

function flattenBookmarks(tree) {
  const found = [], pending = [...tree];
  while (pending.length) { const item = pending.shift(); found.push(item); pending.unshift(...item.children || []); }
  return found;
}

async function runPackagedPhase(packaged, context, phase, { publicHttps = false } = {}) {
  const started = performance.now();
  const label = `packaged-phase-${phase}`;
  const resultFile = path.join(context.output, `${label}.json`);
  const result = {
    phase, passed: false, runtimeReady: false, checks: [], startedAt: new Date().toISOString(),
    launch: {
      executable: packaged.executable, executableSha256: packaged.files.find(file => file.path === (process.platform === 'win32' ? 'Noxviola.exe' : 'Noxviola')).sha256,
      applicationArchive: packaged.archive, archiveSha256: packaged.files.find(file => file.path === 'resources/app.asar').sha256,
      entry: packaged.entry, productionEntryUnmodified: true, sourceCommit: packaged.commit,
      applicationManifestSha256: packaged.applicationManifestSha256,
      userData: context.profile, arguments: packagedLaunchArguments(context, phase),
      mainProcessInspection: false, injectedMainProcessCode: false,
      boundary: 'The manifest-verified packaged executable starts its ordinary resources/app.asar/browser/main.cjs. External Chromium CDP drives the trusted renderer; no alternate app entry or privileged test IPC is installed.',
    },
    network: {
      rendererEventsFile: `${label}-network.jsonl`, netLogFile: `${label}-netlog.json`,
      capture: 'All selected Network CDP events for attached page targets; request/response headers and bodies are never collected. Chromium NetLog uses its default capture mode from launch to normal close.',
      caveat: 'Finite synthetic and explicitly requested public-page observation. CDP starts after attachment and does not cover Node/OS traffic. NetLog is retained for engine-level inspection. No universal zero-telemetry, privacy or security claim follows.',
      requests: 0, completedRequests: 0, failedRequests: 0, completedEncodedBytes: 0, origins: {},
    },
    resources: {
      source: 'The production resource-sample command; Chromium SystemInfo.getProcessInfo; per-page Performance.getMetrics',
      caveat: 'Explicit milestone samples under instrumentation, not comparative benchmarks. Process working-set totals can count shared pages more than once. CDP process CPU time is seconds. Renderer heap metrics do not measure total browser memory.',
      samples: [],
    },
    screenshots: [], persistence: {},
  };
  const log = fs.createWriteStream(path.join(context.output, `${label}.log`), { flags: 'wx', mode: 0o600 });
  const network = fs.createWriteStream(path.join(context.output, result.network.rendererEventsFile), { flags: 'wx', mode: 0o600 });
  let child, connection, shell, normalCloseRequested = false, exitResult = null, attachmentError = null;
  const attached = new Map();
  const documentResponses = new Map();
  let selectedPublicTarget = null;
  let exitPromise;
  let timeout;
  const writeNetwork = value => network.write(JSON.stringify({ capturedAt: new Date().toISOString(), ...value }) + '\n');

  async function attach(info) {
    if (attached.has(info.targetId)) return attached.get(info.targetId);
    const pending = (async () => {
      const { sessionId } = await connection.send('Target.attachToTarget', { targetId: info.targetId, flatten: true });
      const target = { id: info.targetId, sessionId, url: info.url, type: info.type };
      writeNetwork({ event: 'target-attached', targetId: info.targetId, sessionId, address: publicAddress(info.url) });
      await connection.send('Network.enable', {}, sessionId);
      await connection.send('Runtime.enable', {}, sessionId);
      await connection.send('Page.enable', {}, sessionId);
      await connection.send('Performance.enable', {}, sessionId);
      return target;
    })();
    attached.set(info.targetId, pending);
    return pending;
  }

  async function targets() { return (await connection.send('Target.getTargets')).targetInfos.filter(info => info.type === 'page'); }
  async function targetAt(address) {
    const info = await until(async () => (await targets()).find(target => target.url === address), `actual page target ${address}`);
    return attach(info);
  }
  const evaluate = (target, expression, options) => connection.evaluate(target.sessionId, expression, options);
  const command = (name, value) => evaluate(shell, `window.browser.command(${JSON.stringify(name)},${JSON.stringify(value) || 'undefined'})`);
  const state = () => command('state');
  async function submitForm(id, fields) {
    await until(() => evaluate(shell, `!document.getElementById(${JSON.stringify(id)}).dataset.saving`), `${id} ready for editing`);
    await evaluate(shell, `(() => {
      const form = document.getElementById(${JSON.stringify(id)});
      for (const [name,value] of Object.entries(${JSON.stringify(fields)})) {
        const control = form.elements.namedItem(name);
        if (!control) throw new Error('Missing real form control: ' + name);
        if (control.type === 'checkbox') control.checked = value; else control.value = value;
        control.dispatchEvent(new Event('input',{bubbles:true})); control.dispatchEvent(new Event('change',{bubbles:true}));
      }
      if (!form.reportValidity()) throw new Error('The real form rejected the supplied fixture values.');
      form.requestSubmit();
    })()`);
    await until(() => evaluate(shell, `!document.getElementById(${JSON.stringify(id)}).dataset.saving`), `${id} submission to finish`);
  }
  async function ready(target, fixture = true, address = null) {
    return waitForDocument(evaluate, target, { fixture, address });
  }
  async function navigate(address, knownTarget = null) {
    const activeId = (await state()).activeId;
    await command('navigate', address);
    const target = knownTarget || await targetAt(address);
    const document = await ready(target, true, address);
    await until(async () => {
      const current = await state(), tab = current.tabs.find(tab => tab.id === activeId);
      return current.activeId === activeId && tab && !tab.loading && tab.url === document.url && tab.title === document.title;
    }, 'completed application navigation matching the selected committed document');
    return target;
  }
  async function check(name, action) {
    const start = performance.now();
    result.activeCheck = name;
    try {
      await action();
      if (attachmentError) throw attachmentError;
      result.checks.push({ name, passed: true, milliseconds: Math.round(performance.now() - start) });
      result.activeCheck = null;
      console.log(`PACKAGED PASS: ${name}`);
    } catch (error) {
      result.checks.push({ name, passed: false, milliseconds: Math.round(performance.now() - start), error: error.stack || error.message });
      throw error;
    }
  }
  async function screenshot(name, target = shell) {
    const file = `${label}-${name}.png`;
    const { data } = await connection.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, target.sessionId);
    fs.writeFileSync(path.join(context.output, file), Buffer.from(data, 'base64'), { flag: 'wx' });
    result.screenshots.push({ file, surface: target.id === shell.id ? 'packaged shell WebContents' : 'actual page WebContents', ...digest(path.join(context.output, file)) });
  }
  async function sample(milestone, target) {
    const sample = { milestone, capturedAt: new Date().toISOString(), production: await command('resource-sample'), chromium: await connection.send('SystemInfo.getProcessInfo') };
    assert.ok(Array.isArray(sample.production?.processes) && sample.production.processes.length, 'The actual product resource command must report processes');
    if (process.platform === 'win32') {
      const renderers = sample.production.processes.filter(process => process.type === 'Tab');
      assert.ok(renderers.length, 'At least one real renderer must be reported');
      assert.ok(renderers.every(process => process.sandboxed === true), 'Every reported Windows renderer must remain sandboxed');
    }
    if (target) sample.renderer = (await connection.send('Performance.getMetrics', {}, target.sessionId)).metrics;
    result.resources.samples.push(sample);
  }
  async function cookies(target, expected, restarted = false) {
    const values = (await connection.send('Network.getCookies', { urls: [context.origin] }, target.sessionId)).cookies;
    const persistent = values.filter(cookie => cookie.name === 'noxviola_fixture');
    const transient = values.filter(cookie => cookie.name === 'noxviola_session_fixture');
    assert.equal(persistent.length, 1);
    assert.equal(persistent[0].value, expected);
    assert.equal(persistent[0].session, false);
    assert.ok(persistent[0].expires > Date.now() / 1000);
    assert.equal(transient.length, restarted ? 0 : 1);
    if (!restarted) { assert.equal(transient[0].session, true); assert.equal(transient[0].value, expected); }
    return values.filter(cookie => cookie.name.startsWith('noxviola_')).map(({ name, value, session, expires, domain, path: cookiePath }) => ({ name, value, session, expires, domain, path: cookiePath }));
  }

  try {
    const endpoint = new Promise((resolve, reject) => {
      let stderr = '';
      child = spawn(packaged.executable, result.launch.arguments, { cwd: packaged.directory, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false });
      child.stdout.on('data', chunk => log.write(chunk));
      child.stderr.on('data', chunk => {
        log.write(chunk);
        stderr += chunk.toString('utf8');
        const match = stderr.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[a-zA-Z0-9-]+)/);
        if (match) resolve(loopbackWebSocket(match[1]));
        if (stderr.length > 65_536) stderr = stderr.slice(-32_768); // The complete log is retained above; only endpoint framing is bounded.
      });
      child.once('error', reject);
      child.once('exit', (code, signal) => reject(new Error(`Packaged app exited before its debugging endpoint was available (exit ${code}, signal ${signal || 'none'}).`)));
    });
    exitPromise = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => { exitResult = { code, signal }; resolve(exitResult); });
    });
    timeout = setTimeout(() => { child.kill(); }, 240_000);
    connection = await CdpConnection.connect(await bounded(endpoint, 30_000, 'Packaged app did not expose its requested local Chromium endpoint within 30 seconds.'));
    result.runtimeReady = true;
    result.versions = await connection.send('Browser.getVersion');
    connection.on('event', message => {
      const { method, params: event = {}, sessionId } = message;
      if (method === 'Target.targetCreated' && event.targetInfo?.type === 'page') {
        attach(event.targetInfo).catch(error => { if (!normalCloseRequested) attachmentError = error; });
      }
      if (!sessionId || !method.startsWith('Network.')) return;
      let fields;
      if (method === 'Network.requestWillBeSent') {
        const address = publicAddress(event.request.url);
        result.network.requests++;
        if (address.origin) result.network.origins[address.origin] = (result.network.origins[address.origin] || 0) + 1;
        fields = { requestId: event.requestId, address, method: event.request.method, resourceType: event.type, initiatorType: event.initiator?.type, timestamp: event.timestamp, wallTime: event.wallTime, redirectStatus: event.redirectResponse?.status };
      } else if (method === 'Network.responseReceived') {
        const response = event.response;
        fields = { requestId: event.requestId, address: publicAddress(response.url), status: response.status, mimeType: response.mimeType, protocol: response.protocol, fromDiskCache: response.fromDiskCache, fromServiceWorker: response.fromServiceWorker, securityState: response.securityState, securityDetails: response.securityDetails && { protocol: response.securityDetails.protocol, issuer: response.securityDetails.issuer, validFrom: response.securityDetails.validFrom, validTo: response.securityDetails.validTo } };
        if (event.type === 'Document') documentResponses.set(sessionId, fields);
      } else if (method === 'Network.loadingFinished') {
        result.network.completedRequests++;
        result.network.completedEncodedBytes += event.encodedDataLength;
        fields = { requestId: event.requestId, timestamp: event.timestamp, encodedDataLength: event.encodedDataLength };
      } else if (method === 'Network.loadingFailed') {
        result.network.failedRequests++;
        fields = { requestId: event.requestId, timestamp: event.timestamp, errorText: event.errorText, canceled: event.canceled, blockedReason: event.blockedReason };
      } else if (method === 'Network.dataReceived') fields = { requestId: event.requestId, timestamp: event.timestamp, dataLength: event.dataLength, encodedDataLength: event.encodedDataLength };
      if (fields) writeNetwork({ event: method, sessionId, ...fields });
    });
    await connection.send('Target.setDiscoverTargets', { discover: true });
    const shellInfo = await until(async () => (await targets()).find(info => {
      try { return path.normalize(fileURLToPath(info.url)) === path.join(packaged.archive, 'browser', 'index.html'); }
      catch { return false; }
    }), 'the actual shell served from the packaged ASAR');
    shell = await attach(shellInfo);
    await until(() => evaluate(shell, "typeof window.browser?.command === 'function'"), 'the packaged preload API');
    await ready(shell, false);
    result.launch.shellUrl = shellInfo.url;
    result.launch.launchToReadyShellMilliseconds = Math.round(performance.now() - started);
    result.launch.timingCaveat = 'Spawn to externally observed complete shell/preload, including CDP attachment. This is not a calibrated startup benchmark.';

    await check('unchanged packaged entry, real trusted preload and sandboxed renderer process', async () => {
      assert.deepEqual(await evaluate(shell, '({require:typeof require,process:typeof process})'), { require: 'undefined', process: 'undefined' });
      const current = await state();
      assert.equal(current.engine.electron, packaged.electron);
      assert.equal(current.engine.isPackaged, true, 'Electron itself must identify the launched production application as packaged');
      result.launch.isPackaged = current.engine.isPackaged;
      result.launch.appVersion = current.engine.appVersion;
      assert.equal(current.profiles[0].id, 'personal');
      await sample(phase === 1 ? 'fresh-packaged-shell' : 'restored-packaged-shell', shell);
    });

    const expectationsFile = path.join(context.directory, 'packaged-restart.json');
    const personalUrl = `${context.origin}/page?packaged=personal`;
    const secondUrl = `${context.origin}/page?packaged=second`;
    if (phase === 1) {
      const expected = {};
      await check('bounded fresh blank resource and renderer network observation', async () => {
        assert.equal((await state()).tabs.length, 1);
        assert.equal((await state()).tabs[0].url, 'about:blank');
        const requests = result.network.requests;
        const start = performance.now();
        // A declared observation interval, never a workaround for feature readiness.
        await new Promise(resolve => setTimeout(resolve, 3_000));
        result.network.freshBlankWindow = { milliseconds: Math.round(performance.now() - start), rendererRequests: result.network.requests - requests, scope: 'Attached packaged shell while the only browser tab is the local blank page' };
        await sample('fresh-blank-after-three-second-observation', shell);
        await screenshot('blank');
      });
      await check('packaged browsing, redirects and real back/forward navigation', async () => {
        let target = await navigate(personalUrl);
        assert.match(await evaluate(target, 'document.title'), /Noxviola synthetic fixture/);
        await command('navigate', `${context.origin}/redirect`);
        target = await targetAt(`${context.origin}/page?redirected=1`); await ready(target);
        await command('back'); target = await targetAt(personalUrl); await ready(target);
        await command('forward'); target = await targetAt(`${context.origin}/page?redirected=1`); await ready(target);
        await navigate(personalUrl);
      });
      await check('packaged identities isolate all five real browser stores', async () => {
        const personal = await targetAt(personalUrl);
        expected.personal = (await state()).activeId;
        assertStores(await evaluate(personal, "window.fixture.writeIdentity('packaged-personal')"), 'packaged-personal');
        await command('identity-add', 'Packaged synthetic identity');
        expected.secondIdentity = (await state()).currentIdentity;
        const second = await navigate(secondUrl);
        expected.second = (await state()).activeId;
        const empty = await evaluate(second, 'window.fixture.readIdentity()');
        for (const key of ['localStorage', 'indexedDB', 'cache']) assert.equal(empty[key], null);
        assert.equal(empty.cookie, ''); assert.equal(empty.serviceWorkers, 0);
        assertStores(await evaluate(second, "window.fixture.writeIdentity('packaged-second')"), 'packaged-second');
        assertStores(await evaluate(personal, 'window.fixture.readIdentity()'), 'packaged-personal');
        result.cookieLifetimes = { personal: await cookies(personal, 'packaged-personal'), second: await cookies(second, 'packaged-second') };
      });
      await check('packaged browser retains more than twelve live tabs and duplicate URLs', async () => {
        for (let index = 0; index < 14; index++) await command('new', `${context.origin}/page?packaged=duplicate`);
        await until(async () => { const current = await state(); return current.tabs.length === 16 && current.tabs.every(tab => tab.live && !tab.loading); }, 'sixteen actual loaded tabs');
        const before = await state();
        assert.equal(before.tabs.filter(tab => tab.url.endsWith('packaged=duplicate')).length, 14);
        assert.equal((await targets()).filter(target => target.url.startsWith(context.origin)).length, 16);
        await Promise.all(attached.values());
        await command('close', before.activeId); assert.equal((await state()).tabs.length, 15);
        await command('restore'); await until(async () => (await state()).tabs.length === 16, 'closed packaged tab restoration');
        await command('split'); assert.ok((await state()).splitId);
        await command('split'); assert.equal((await state()).splitId, null);
        await sample('sixteen-loaded-packaged-tabs', await targetAt(personalUrl));
      });
      await check('packaged Library form persists complete generated metadata', async () => {
        await evaluate(shell, 'window.__packagedVault = null; void window.browser.onVault(value => { window.__packagedVault = value; });');
        await command('vault');
        const draft = { title: 'Packaged application saved reference', url: `${context.origin}/page?packaged=library`, kind: 'website', group: 'Packaged acceptance', characters: 'Synthetic character', notes: 'Created through the unchanged packaged renderer form.' };
        await evaluate(shell, `(() => { const form = document.getElementById('vault-add'); document.getElementById('vault-editor').open = true; for (const [name,value] of Object.entries(${JSON.stringify(draft)})) { const field = form.elements.namedItem(name); field.value = value; field.dispatchEvent(new Event('input',{bubbles:true})); } form.requestSubmit(); })()`);
        const item = await until(() => evaluate(shell, `window.__packagedVault?.items.find(item => item.title === ${JSON.stringify(draft.title)})`), 'the saved packaged Library record');
        for (const [key, value] of Object.entries(draft)) assert.equal(item[key], value);
        await until(() => evaluate(shell, `document.getElementById('vault-items').textContent.includes(${JSON.stringify(draft.title)})`), 'the actual saved Library card');
        expected.library = item;
        await screenshot('library');
        await command('panel-close');
      });
      await check('packaged committed history and bookmark form preserve identity boundaries', async () => {
        await command('activate', expected.personal);
        const history = await until(async () => (await command('history-query', { text: personalUrl })).items.find(item => item.url === personalUrl && item.title === 'Noxviola synthetic fixture'), 'the actual committed history title');
        expected.history = { id: history.id, url: history.url, title: history.title, visitCount: history.visitCount };
        await command('history');
        await until(() => evaluate(shell, `document.getElementById('history-items').textContent.includes(${JSON.stringify(personalUrl)})`), 'the rendered personal history row');
        await screenshot('history');
        await evaluate(shell, 'window.__packagedBookmarks = null; void window.browser.onBookmarks(value => { window.__packagedBookmarks = value; });');
        const bookmarkSnapshot = async () => {
          const value = await evaluate(shell, 'window.__packagedBookmarks');
          return value?.identity === 'personal' ? value : null;
        };
        await command('bookmarks');
        const initial = await until(bookmarkSnapshot, 'the actual personal bookmark tree');
        const bar = flattenBookmarks(initial.tree).find(item => item.folderType === 'bookmarks-bar');
        assert.ok(bar, 'The production service must expose its real protected bookmark root');
        const createBookmark = async fields => {
          await evaluate(shell, "document.getElementById('bookmark-add').click()");
          await submitForm('bookmark-form', fields);
          return until(async () => flattenBookmarks((await bookmarkSnapshot()).tree).find(item => item.title === fields.title), 'the submitted bookmark/folder');
        };
        const folder = await createBookmark({ type: 'folder', title: 'Packaged research folder', parentId: bar.id });
        const nested = await createBookmark({ type: 'folder', title: 'Packaged nested folder', parentId: folder.id });
        const saved = await createBookmark({ type: 'bookmark', title: 'Packaged bookmark before edit', parentId: nested.id, url: personalUrl });
        await evaluate(shell, `(() => { const search = document.getElementById('bookmark-search'); search.value = ${JSON.stringify(saved.title)}; search.dispatchEvent(new Event('input',{bubbles:true})); })()`);
        await until(() => evaluate(shell, `document.getElementById('bookmark-items').textContent.includes(${JSON.stringify(saved.title)})`), 'the real nested bookmark search result');
        await evaluate(shell, `(() => { const card = [...document.querySelectorAll('#bookmark-items article')].find(item => item.querySelector('h2')?.textContent === ${JSON.stringify(saved.title)}); [...card.querySelectorAll('button')].find(button => button.textContent === 'Edit').click(); })()`);
        await submitForm('bookmark-form', { title: 'Packaged bookmark edited', url: `${context.origin}/page?packaged=bookmark-edited` });
        await evaluate(shell, "(() => { const search = document.getElementById('bookmark-search'); search.value = 'Packaged bookmark edited'; search.dispatchEvent(new Event('input',{bubbles:true})); })()");
        await until(() => evaluate(shell, "document.getElementById('bookmark-items').textContent.includes('Packaged bookmark edited')"), 'the edited bookmark card');
        await evaluate(shell, "(() => { const card = [...document.querySelectorAll('#bookmark-items article')].find(item => item.querySelector('h2')?.textContent === 'Packaged bookmark edited'); [...card.querySelectorAll('button')].find(button => button.textContent === 'Move').click(); })()");
        await submitForm('bookmark-move-form', { parentId: folder.id });
        const moved = await until(async () => flattenBookmarks((await bookmarkSnapshot()).tree).find(item => item.id === saved.id && item.parentId === folder.id && item.title === 'Packaged bookmark edited'), 'the moved bookmark retaining its stable ID');
        expected.bookmarks = [folder, nested, moved].map(({ children, dateGroupModified, ...item }) => item);
        await screenshot('bookmarks');
        await command('identity-switch', expected.secondIdentity);
        assert.equal((await command('history-query', { text: personalUrl })).total, 0, 'History from another identity must not appear');
        await command('bookmarks');
        const foreign = await until(() => evaluate(shell, `window.__packagedBookmarks?.identity === ${JSON.stringify(expected.secondIdentity)} ? window.__packagedBookmarks : null`), 'the second identity bookmark tree');
        assert.ok(!flattenBookmarks(foreign.tree).some(item => item.id === saved.id || item.id === folder.id));
        await assert.rejects(command('bookmark-save', { id: saved.id, title: 'Forbidden cross-identity edit' }), /not found|identity/i);
        await command('activate', expected.personal);
      });
      await check('packaged Rust collections browse folders and bounded pages in both surfaces and restore a real tab',async()=>{
        await command('activate',expected.personal);const identity=(await state()).currentIdentity;
        const saved=await command('collection-import',{identity,title:'Packaged collection',text:Array.from({length:205},(_,i)=>`${context.origin}/page?packaged-collection=${i} | Packaged saved ${i}`).join('\n')});
        const folder=await command('collection-query',{op:'folder-create',identity,title:'Packaged research'});await command('collection-query',{op:'move',identity,group:saved.id,folder:folder.id});
        const page=await command('collection-query',{op:'tabs',identity,group:saved.id});assert.equal(page.items.length,100);assert.equal((await command('collection-query',{op:'groups',identity:expected.secondIdentity})).items.length,0);
        await command('collections');await until(()=>evaluate(shell,`!document.getElementById('collections-content').hasAttribute('aria-busy')&&document.getElementById('collections-content').textContent.includes('Root / Collections')`),'packaged collection root ready');
        const click=async(root,label)=>{await until(()=>evaluate(shell,`!document.getElementById('${root}').hasAttribute('aria-busy')&&[...document.querySelectorAll('#${root} button')].some(b=>b.textContent===${JSON.stringify(label)}&&!b.disabled)`),'enabled collection control '+label);await evaluate(shell,`[...document.querySelectorAll('#${root} button')].find(b=>b.textContent===${JSON.stringify(label)}).click()`);await until(()=>evaluate(shell,`!document.getElementById('${root}').hasAttribute('aria-busy')`),'packaged collection action settled');};
        await click('collections-content','Folders');await click('collections-content','Open folder');await click('collections-content','Browse');assert.equal(await evaluate(shell,`document.querySelectorAll('#collections-content .collection-list .card').length`),100);await click('collections-content','Next');assert.ok(await evaluate(shell,`document.querySelector('#collections-content .collection-list').textContent.includes('Packaged saved 100')`));await screenshot('tab-collections-full');
        await command('sidebar-select','collections');await until(()=>evaluate(shell,`!document.getElementById('sidebar-collections').hasAttribute('aria-busy')&&document.getElementById('sidebar-collections').textContent.includes('Root / Collections')`),'packaged collection sidebar ready');await click('sidebar-collections','Folders');await click('sidebar-collections','Open folder');assert.equal(await evaluate(shell,`document.querySelectorAll('#sidebar-collections .collection-list .card').length`),1);await screenshot('tab-collections-sidebar');
        await command('sidebar-close');await command('panel-close');const opened=await command('collection-open',{identity,id:page.items[0].id});const target=await targetAt(`${context.origin}/page?packaged-collection=0`);await ready(target);assert.equal((await state()).tabs.find(t=>t.id===opened).identity,identity);await command('close',opened);await command('activate',expected.personal);const before=(await state()).tabs.length,beforeTargets=(await targets()).length;const lazy=await command('collection-restore-start',{identity,group:saved.id});assert.equal(lazy.count,205);assert.equal((await state()).tabs.length,before);assert.equal((await targets()).length,beforeTargets);
        const pending=await command('collection-query',{op:'restore-tabs',identity,session:lazy.id});assert.equal(pending.items.length,50);
        await command('collections');await click('collections-content','Lazy restore sessions');await click('collections-content','Browse lazy tabs');assert.equal(await evaluate(shell,`document.querySelectorAll('#collections-content .collection-list .card').length`),50);await screenshot('tab-collections-lazy');
        await click('collections-content','Search entire library');await evaluate(shell,`document.querySelector('#collections-content input[type=search]').value='Packaged saved';`);await click('collections-content','Search');assert.equal(await evaluate(shell,`document.querySelectorAll('#collections-content .collection-list .card').length`),50);assert.ok(await evaluate(shell,`document.querySelector('#collections-content .collection-list').textContent.includes('Packaged research / Packaged collection')`));await click('collections-content','Next');assert.ok(await evaluate(shell,`document.querySelector('#collections-content .collection-list').textContent.includes('Packaged saved 50')`));await screenshot('tab-collections-global-search');await click('collections-content','Browse source collection');assert.equal(await evaluate(shell,`document.querySelectorAll('#collections-content .collection-list .card').length`),100);
        await command('collection-query',{op:'restore-pause',identity,session:lazy.id,paused:true});await assert.rejects(command('collection-restore-open',{identity,session:lazy.id,id:pending.items[0].id}),/paused/);assert.equal((await state()).tabs.length,before);await command('collection-query',{op:'restore-pause',identity,session:lazy.id,paused:false});
        const materialized=await command('collection-restore-open',{identity,session:lazy.id,id:pending.items[0].id});await ready(await targetAt(`${context.origin}/page?packaged-collection=0`));assert.equal((await state()).tabs.length,before+1);assert.equal(await command('collection-restore-open',{identity,session:lazy.id,id:pending.items[0].id}),materialized);assert.equal((await state()).tabs.length,before+1);
        await command('close',materialized);await command('activate',expected.personal);expected.collection={identity,group:saved.id,folder:folder.id,lazy:lazy.id};
      });
      await check('exact packaged Rust helper streams library backup and additive restoration without replacing source',async()=>{
        const {TabCollections}=require('../../browser/tab-collections.cjs'),{CollectionBackups}=require('../../browser/collection-backups.cjs');
        const binary=path.join(packaged.directory,'resources','app.asar.unpacked','browser','bin',process.platform==='win32'?'noxviola-tab-collections.exe':'noxviola-tab-collections'),file=path.join(context.output,'packaged-backup-fixture.sqlite'),backup=path.join(context.output,'packaged-library.noxlibrary');
        const store=new TabCollections({file,binary}),jobs=new CollectionBackups({file,binary});try{
          const source=await store.request({op:'save',identity:'synthetic',title:'Packaged backup',created:1,tabs:Array.from({length:205},(_,i)=>({url:`https://synthetic.example/${i}`,title:`Packaged backup ${i}`}))});
          assert.equal((await jobs.run('export','synthetic',backup)).tabs,205);assert.equal((await jobs.run('import','synthetic',backup)).tabs,205);const groups=await store.request({op:'groups',identity:'synthetic'});assert.equal(groups.items.length,2);assert.ok(groups.items.every(g=>g.count===205));assert.ok(groups.items.some(g=>g.id===source.id));assert.equal((await store.request({op:'health',identity:'synthetic'})).integrity,'ok');
        }finally{store.close();jobs.cancel();}
      });
      await check('packaged native file picker exports and additively restores the library, with cancellation and malformed-file recovery',async()=>{
        const identity=expected.collection.identity;
        await command('activate',expected.personal);await command('collections');
        const root='collections-content';
        await until(()=>evaluate(shell,`!document.getElementById('${root}').hasAttribute('aria-busy')`),'backup controls ready');
        await evaluate(shell,`(()=>{const r=document.getElementById('${root}');[...r.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent==='Library-only backup and additive restore').open=true;})()`);
        assert.ok(await evaluate(shell,`document.getElementById('${root}').textContent.includes('Plaintext backup')`));
        await screenshot('library-backup-warning');
        const choose=async(kind,file=null)=>{
          const title=kind==='export'?'Export all saved collections for this identity; choose a NEW filename':'Add collections from a same-identity backup; existing collections stay untouched';
          const label=kind==='export'?'Export library backup':'Add from library backup';
          const evidence=path.join(context.output,`picker-${result.nativePickerActions?.length||0}-${kind}`);fs.mkdirSync(evidence,{recursive:true});
          const args=['-B',path.join(__dirname,'file-picker.py'),'--pid',String(child.pid),'--title',title,'--evidence-dir',evidence,...(file?['--file',file]:['--cancel'])];
          const picker=executeFile('python',args,{encoding:'utf8',windowsHide:true,timeout:30_000}).catch(error=>{throw new Error(`Native picker failed: ${String(error.stdout||'').slice(0,4000)} ${String(error.stderr||'').slice(0,2000)}`,{cause:error});});
          // Start the owned-dialog observer before opening a modal: GTK can hold CDP dispatch until dismissal.
          const [{stdout}]=await Promise.all([picker,evaluate(shell,`[...document.querySelectorAll('#${root} button')].find(b=>b.textContent===${JSON.stringify(label)}).click()`)]);
          const receipt=JSON.parse(stdout);assert.equal(receipt.pid,child.pid);assert.equal(receipt.title,title);assert.equal(receipt.action,file?'submit':'cancel');assert.equal(receipt.dialogDismissed,true);
          (result.nativePickerActions||=[]).push(receipt);
          await until(()=>evaluate(shell,`!document.getElementById('${root}').hasAttribute('aria-busy')`),'native picker backup settled');
          const status=await evaluate(shell,`document.querySelector('#${root} [role=status]').textContent`);
          (result.nativeBackupStatuses||=[]).push({kind,status});
          return status;
        };
        assert.equal(await choose('export'),'File selection canceled.');
        const file=path.join(context.output,'native-picker-library.noxlibrary');
        assert.match(await choose('export',file),/^Exported .*205 tabs/);assert.ok(fs.statSync(file).size>0);
        const before=digest(file);
        assert.match(await choose('import',file),/^Added .*205 tabs/);
        assert.equal(digest(file).sha256,before.sha256,'Import must not modify the source backup');
        const folders=await command('collection-query',{op:'folders',identity});assert.equal(folders.items.filter(f=>f.title==='Packaged research').length,2);
        assert.match(await choose('import',file),/already imported/i);
        const malformed=path.join(context.output,'native-picker-malformed.noxlibrary');fs.writeFileSync(malformed,'{"type":"header"}\n',{flag:'wx'});
        const invalidStatus=await choose('import',malformed);assert.match(invalidStatus,/missing field|invalid|header|format/i);assert.ok(!/canceled/i.test(invalidStatus));
        assert.equal((await command('collection-query',{op:'folders',identity})).items.length,folders.items.length);
        assert.equal((await command('collection-query',{op:'tabs',identity,group:expected.collection.group})).items.length,100);
        assert.equal((await command('collection-query',{op:'health',identity})).integrity,'ok');
        await screenshot('library-backup-error');await command('panel-close');
      });
      await check('packaged workspace and group forms retain tab identity, pin and mute state', async () => {
        await evaluate(shell, 'window.__packagedWorkspaces = null; void window.browser.onWorkspaces(value => { window.__packagedWorkspaces = value; });');
        await command('workspaces');
        await until(() => evaluate(shell, "!document.getElementById('workspaces').hidden && document.getElementById('workspace-color').options.length > 0"), 'the real workspace form');
        await submitForm('workspace-form', { name: 'Packaged research workspace', color: 'blue' });
        const workspace = await until(() => evaluate(shell, "window.__packagedWorkspaces?.items.find(item => item.name === 'Packaged research workspace')"), 'the saved workspace definition');
        await command('tab-assign', { id: expected.personal, workspaceId: workspace.id });
        await until(() => evaluate(shell, `document.getElementById('workspace-select').value === ${JSON.stringify(workspace.id)}`), 'renderer selection of the assigned workspace');
        await submitForm('group-form', { name: 'Packaged source group', color: 'green' });
        const group = await until(() => evaluate(shell, "window.__packagedWorkspaces?.groups.find(item => item.name === 'Packaged source group')"), 'the saved group definition');
        assert.equal(group.workspaceId, workspace.id);
        const findCard = `[...document.querySelectorAll('#workspace-tabs article')].find(item => item.querySelector('.source')?.textContent.includes(${JSON.stringify(personalUrl)}))`;
        await until(() => evaluate(shell, `!!(${findCard})`), 'the real workspace tab row');
        await evaluate(shell, `(() => { const card = ${findCard}; const group = card.querySelectorAll('select')[1]; group.value = ${JSON.stringify(group.id)}; group.dispatchEvent(new Event('change',{bubbles:true})); [...card.querySelectorAll('button')].find(button => button.textContent === 'Apply').click(); })()`);
        await until(async () => (await state()).tabs.find(tab => tab.id === expected.personal)?.groupId === group.id, 'the real tab group assignment');
        await until(() => evaluate(shell, `(() => {
          const card = document.querySelector('#group-items [data-group-id="'+${JSON.stringify(group.id)}+'"]');
          return card?.querySelector('.workspace-count')?.textContent === '1 tab · Expanded' && card.querySelector('[data-remove-group]').disabled;
        })()`), 'the rendered nonempty group count and disabled removal');
        await evaluate(shell, `(() => { const card = ${findCard}; [...card.querySelectorAll('button')].find(button => button.textContent === 'Pin').click(); })()`);
        await until(async () => (await state()).tabs.find(tab => tab.id === expected.personal)?.pinned, 'the real pinned tab');
        await evaluate(shell, `(() => { const card = ${findCard}; [...card.querySelectorAll('button')].find(button => button.textContent === 'Mute').click(); })()`);
        await until(async () => (await state()).tabs.find(tab => tab.id === expected.personal)?.muted, 'the real muted tab');
        await until(() => evaluate(shell, `(() => {
          const card = ${findCard};
          return card?.querySelector('[data-tab-pin]')?.textContent === 'Unpin' && card.querySelector('[data-tab-mute]')?.textContent === 'Unmute';
        })()`), 'the rendered current Unpin and Unmute controls');
        const assigned = (await state()).tabs.find(tab => tab.id === expected.personal);
        assert.equal(assigned.identity, 'personal');
        assert.equal(assigned.workspaceId, workspace.id);
        assertStores(await evaluate(await targetAt(personalUrl), 'window.fixture.readIdentity()'), 'packaged-personal');
        expected.workspace = workspace; expected.group = group;
        await screenshot('workspace');
        await command('panel-close');
      });
      await check('packaged preference form changes appearance and real page geometry without losing tabs', async () => {
        const tabsBefore = stateTabs(await state());
        await command('settings');
        await until(() => evaluate(shell, "!document.getElementById('settings').hidden && document.getElementById('settings-form').elements.namedItem('homePage').value"), 'the populated preference form');
        await submitForm('settings-form', { tabLayout: 'vertical', theme: 'light', accent: 'teal', density: 'compact', showBookmarksBar: true });
        await until(async () => { const value = (await state()).preferences; return value.tabLayout === 'vertical' && value.theme === 'light' && value.accent === 'teal' && value.density === 'compact' && value.showBookmarksBar; }, 'durable production preference changes');
        await until(() => evaluate(shell, "document.body.dataset.tabLayout === 'vertical' && document.body.dataset.theme === 'light' && document.body.dataset.accent === 'teal' && document.body.dataset.density === 'compact' && !document.getElementById('bookmarks-bar').hidden"), 'applied renderer appearance');
        assert.deepEqual(stateTabs(await state()), tabsBefore);
        await screenshot('customized-settings');
        await command('panel-close');
        const target = await targetAt(personalUrl);
        await until(async () => {
          const outer = await evaluate(shell, '({width:innerWidth,height:innerHeight})');
          const page = await evaluate(target, '({width:innerWidth,height:innerHeight})');
          const current = await state();
          result.customizedGeometry = { shell: outer, page, chromeHeight: current.chromeHeight, verticalTabsWidth: 210, sidebarLauncherWidth: 48 };
          return current.chromeHeight === 72 && page.width === outer.width - 210 - 48 && page.height === outer.height - current.chromeHeight;
        }, 'actual page viewport below the bookmarks bar and beside vertical tabs');
        assertStores(await evaluate(target, 'window.fixture.readIdentity()'), 'packaged-personal');
      });
      if (publicHttps) await check('bounded public HTTPS browsing through the packaged address flow', async () => {
        result.publicHttps = [];
        const spare = (await state()).tabs.find(tab => tab.url === `${context.origin}/page?packaged=duplicate`);
        assert.ok(spare, 'Public browsing must not overwrite either identity storage fixture tab');
        await command('activate', spare.id);
        for (const test of HTTPS_CASES) {
          const start = performance.now();
          await command('navigate', test.url);
          const target = await targetAt(test.url);
          selectedPublicTarget = target;
          await ready(target, false);
          const document = await evaluate(target, `({url:location.href,title:document.title,secureContext:isSecureContext,bodyCharacters:document.body?.innerText.length || 0,nodeRequire:typeof require,privilegedBridge:typeof window.browser,navigation:performance.getEntriesByType('navigation').map(entry=>entry.toJSON())})`);
          assert.equal(new URL(document.url).protocol, 'https:');
          assert.ok(document.title.includes(test.title), `Unexpected public page title for ${test.url}`);
          assert.ok(document.secureContext && document.bodyCharacters > 100, 'A real secure public document must render');
          assert.equal(document.nodeRequire, 'undefined'); assert.equal(document.privilegedBridge, 'undefined');
          const response = documentResponses.get(target.sessionId);
          assert.equal(response?.address.origin, new URL(test.url).origin, 'The real public document response must be observed');
          assert.ok(response.status >= 200 && response.status < 300, 'The public HTTPS document must complete successfully');
          assert.equal(response.securityState, 'secure');
          result.publicHttps.push({ requested: test.url, ...document, response, observedReadyMilliseconds: Math.round(performance.now() - start) });
          await screenshot(`https-${new URL(test.url).hostname}`, target);
          await sample(`public-https-${new URL(test.url).hostname}`, target);
        }
        // Public documents are not reopened as part of the deterministic restart fixture.
        // Several other targets already have this duplicate URL. Observe the
        // exact public-page target returning, never another tab's ready document.
        await navigate(`${context.origin}/page?packaged=duplicate`, selectedPublicTarget);
      });
      await command('activate', expected.personal);
      const final = await state();
      expected.tabs = stateTabs(final); expected.profiles = final.profiles; expected.activeId = final.activeId;
      expected.preferences = final.preferences; expected.activeWorkspaceId = final.activeWorkspaceId;
      result.persistence.expectedRestart = expected;
      fs.writeFileSync(expectationsFile, JSON.stringify(expected, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    } else {
      const expected = JSON.parse(fs.readFileSync(expectationsFile, 'utf8'));
      result.persistence.expectedRestart = expected;
      await check('packaged normal restart restores ordered tabs, identities and preferences', async () => {
        const restored = await state();
        result.persistence.restoredState = restored;
        assert.deepEqual(stateTabs(restored), expected.tabs);
        assert.deepEqual(restored.profiles, expected.profiles);
        assert.deepEqual(restored.preferences, expected.preferences);
        assert.equal(restored.activeId, expected.activeId);
        assert.equal(restored.activeWorkspaceId, expected.activeWorkspaceId);
      });
      await check('packaged collection folders and every saved tab survive process restart',async()=>{
        const {identity,group,folder,lazy}=expected.collection;assert.ok((await command('collection-query',{op:'restore-sessions',identity})).items.some(s=>s.id===lazy&&s.count===205));const groups=await command('collection-query',{op:'groups',identity,folder});assert.equal(groups.items[0].id,group);assert.equal(groups.items[0].count,205);let after=0,total=0;do{const page=await command('collection-query',{op:'tabs',identity,group,after});total+=page.items.length;after=page.next;}while(after!==null);assert.equal(total,205);assert.equal((await command('collection-query',{op:'health',identity})).integrity,'ok');
      });
      await check('packaged restart preserves both identities and persistent cookie lifetimes', async () => {
        await command('activate', expected.personal);
        const personal = await targetAt(personalUrl); await ready(personal);
        assertStores(await evaluate(personal, 'window.fixture.readIdentity()'), 'packaged-personal', { sessionCookieExpected: false });
        await command('activate', expected.second);
        const second = await targetAt(secondUrl); await ready(second);
        assertStores(await evaluate(second, 'window.fixture.readIdentity()'), 'packaged-second', { sessionCookieExpected: false });
        result.cookieLifetimes = { personal: await cookies(personal, 'packaged-personal', true), second: await cookies(second, 'packaged-second', true) };
        await sample('packaged-stores-after-normal-restart', second);
      });
      await check('packaged Library metadata and actual card survive restart', async () => {
        await evaluate(shell, 'window.__packagedVault = null; void window.browser.onVault(value => { window.__packagedVault = value; });');
        await command('vault');
        const items = await until(() => evaluate(shell, 'window.__packagedVault?.items'), 'restored packaged Library');
        assert.deepEqual(items, [expected.library]);
        assert.ok(await evaluate(shell, `document.getElementById('vault-items').textContent.includes(${JSON.stringify(expected.library.notes)})`));
        await screenshot('restored-library');
      });
      await check('packaged history, nested bookmarks and workspace/group IDs survive restart', async () => {
        await command('activate', expected.personal);
        const history = await command('history-query', { text: personalUrl });
        const item = history.items.find(item => item.url === personalUrl);
        assert.ok(item);
        for (const key of ['id', 'url', 'title']) assert.equal(item[key], expected.history[key]);
        assert.ok(item.visitCount >= expected.history.visitCount);
        await evaluate(shell, 'window.__packagedBookmarks = null; window.__packagedWorkspaces = null; void window.browser.onBookmarks(value => { window.__packagedBookmarks = value; }); void window.browser.onWorkspaces(value => { window.__packagedWorkspaces = value; });');
        await command('bookmarks');
        const bookmarks = await until(() => evaluate(shell, "window.__packagedBookmarks?.identity === 'personal' ? window.__packagedBookmarks : null"), 'restored personal bookmarks');
        const flattened = flattenBookmarks(bookmarks.tree);
        for (const expectedItem of expected.bookmarks) {
          const actual = flattened.find(item => item.id === expectedItem.id);
          assert.ok(actual);
          for (const [key, value] of Object.entries(expectedItem)) assert.deepEqual(actual[key], value, `Restored bookmark ${key}`);
        }
        await command('workspaces');
        const workspaces = await until(() => evaluate(shell, 'window.__packagedWorkspaces'), 'restored workspace definitions');
        assert.deepEqual(workspaces.items.find(item => item.id === expected.workspace.id), expected.workspace);
        assert.deepEqual(workspaces.groups.find(item => item.id === expected.group.id), expected.group);
        const tab = (await state()).tabs.find(item => item.id === expected.personal);
        assert.equal(tab.workspaceId, expected.workspace.id); assert.equal(tab.groupId, expected.group.id);
        assert.equal(tab.identity, 'personal'); assert.equal(tab.pinned, true); assert.equal(tab.muted, true);
        await screenshot('restored-workspace');
      });
    }
    await sample('before-normal-packaged-close', shell);
    result.persistence.preCloseState = await state();
    result.persistence.preCloseTargets = await targets();
    if (selectedPublicTarget) {
      result.persistence.selectedPublicTarget = {
        id: selectedPublicTarget.id, sessionId: selectedPublicTarget.sessionId,
        target: result.persistence.preCloseTargets.find(target => target.targetId === selectedPublicTarget.id),
        frameTree: (await connection.send('Page.getFrameTree', {}, selectedPublicTarget.sessionId)).frameTree,
        document: await evaluate(selectedPublicTarget, '({url:location.href,title:document.title,readyState:document.readyState})'),
      };
    }
    normalCloseRequested = true;
    result.normalCloseRequested = true;
    result.closeRequest = { pid: child.pid, method: 'ordinary OS window close', attempted: true };
    // Renderer window.close() destroys Electron WebContents directly and skips
    // the preventable BrowserWindow close event. Request the actual desktop
    // protocol instead; production must admit it and flush its own services.
    try { result.closeRequest = await requestNativeWindowClose(child.pid); }
    catch (error) {
      result.closeRequest.error = { message: error.message, stdout: error.stdout || '', stderr: error.stderr || '' };
      throw error;
    }
    const closing = await bounded(exitPromise, 30_000, 'Packaged application did not complete normal close within 30 seconds.');
    assert.equal(closing.code, 0, 'The packaged process must exit successfully after its real close lifecycle');
    assert.equal(closing.signal, null);
    result.processExitedCleanly = true;
    assert.ok(fs.existsSync(path.join(context.profile, 'browser-session.json')), 'The configured fresh profile must contain the real saved session');
    const saved = JSON.parse(fs.readFileSync(path.join(context.profile, 'browser-session.json'), 'utf8'));
    assert.equal(saved.profiles.length, 2);
    result.profileEvidence = { directory: fs.realpathSync(context.profile), session: digest(path.join(context.profile, 'browser-session.json')), library: digest(path.join(context.profile, 'private-vault.json')) };
    result.persistence.savedSession = saved;
    await check('ordinary OS close durably saves the complete final session before another launch', async () => {
      assertSavedSession(saved, result.persistence.preCloseState);
    });
    result.network.netLogSummary = summarizeNetLog(path.join(context.output, result.network.netLogFile));
    result.passed = true;
    return result;
  } catch (error) {
    result.error = error.stack || error.message;
    if (shell && connection && !exitResult) {
      try { await screenshot('failure'); } catch (captureError) { result.captureError = captureError.message; }
    }
    error.phaseResult = result;
    throw error;
  } finally {
    clearTimeout(timeout);
    if (connection) await bounded(connection.close(), 2_000, 'The packaged debugging connection did not close.').catch(error => {
      result.protocolCleanupError = error.message;
      result.passed = false;
      result.error ||= error.message;
      connection.removeAllListeners('event');
    });
    result.network.captureEndedAt = new Date().toISOString();
    if (child && !exitResult) {
      result.terminatedAfterFailure = true;
      child.kill();
      await bounded(exitPromise.catch(() => {}), 5_000, 'Packaged failure cleanup did not observe process termination.').catch(async error => {
        result.cleanupError = error.message;
        // Only this spawned synthetic-fixture process. A native modal can defer SIGTERM.
        result.forcedFixtureTermination = true;child.kill('SIGKILL');
        await bounded(exitPromise.catch(() => {}),5_000,'Owned fixture process did not exit after forced failure cleanup.').catch(forceError=>{result.cleanupError += ' '+forceError.message;});
      });
    }
    await Promise.all([log, network].map(stream => new Promise(resolve => stream.end(resolve))));
    result.exit = exitResult;
    for (const name of [result.network.rendererEventsFile, result.network.netLogFile]) {
      const file = path.join(context.output, name);
      if (fs.existsSync(file)) (result.network.artifacts ||= []).push(digest(file));
    }
    result.finishedAt = new Date().toISOString();
    fs.writeFileSync(resultFile, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
}

module.exports = { runPackagedPhase, packagedLaunchArguments, nativeWindowCloseArguments, publicAddress, assertStores, assertSavedSession, summarizeNetLog, waitForDocument, HTTPS_CASES };
