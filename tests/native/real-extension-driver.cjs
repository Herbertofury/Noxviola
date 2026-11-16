'use strict';
// A separate source-app entry for one unchanged upstream release. Never staged
// into a product package and never launched by portable Node contracts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { readContext, preflight } = require('../../scripts/native-smoke.cjs');
const { PIN, CHECKS, readRegular, sha256, realSourceEvidence, readCorpusReceipt, publicAddress,
  assertLight, assertPinnedPermissions, assertDarkened } = require('./real-extension-support.cjs');

function errorDetails(error) {
  return { name: String(error?.name || typeof error), message: String(error?.message || error), stack: String(error?.stack || '') };
}
function stackDetails(stack) {
  if (!stack) return null;
  return { description: stack.description, callFrames: (stack.callFrames || []).map(frame => ({
    functionName: frame.functionName, url: publicAddress(frame.url), lineNumber: frame.lineNumber, columnNumber: frame.columnNumber,
  })), ...(stack.parent ? { parent: stackDetails(stack.parent) } : {}) };
}

async function main() {
  const { app, BrowserWindow, dialog, session, webContents } = require('electron');
  const { createIdentitySessionResolver } = require('../../browser/session-path.cjs');
  const context = readContext(process.argv[2]);
  const corpus = readCorpusReceipt(context, process.argv[3]);
  const source = realSourceEvidence();
  assert.equal(source.manifestSha256, corpus.sourceManifestSha256, 'The child must execute the exact admitted source bytes');
  assert.equal(preflight(), null);
  assert.equal(process.versions.electron, require('../../package.json').devDependencies.electron);
  for (const name of ['no-sandbox', 'disable-setuid-sandbox', 'disable-seccomp-filter-sandbox', 'disable-gpu-sandbox', 'disable-web-security']) {
    assert.equal(app.commandLine.hasSwitch(name), false, `Refusing unsafe switch ${name}`);
  }
  app.enableSandbox();
  app.setPath('userData', context.profile);
  fs.mkdirSync(path.join(context.profile, 'engine'), { recursive: true });
  app.setPath('sessionData', path.join(context.profile, 'engine'));
  for (const [key, directory] of [['downloads', 'downloads'], ['logs', 'logs'], ['crashDumps', 'crash']]) app.setPath(key, path.join(context.directory, directory));

  const started = performance.now();
  const result = {
    schema: 1, corpusId: PIN.id, source, archive: corpus, fixtureToken: context.token, origin: context.origin,
    startedAt: new Date().toISOString(), passed: false, completedWorkflows: false, normalCloseObserved: false, runtimeReady: false,
    versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
    sandboxForced: true, checks: [], lifecycle: [], console: [], exceptions: [], network: [], observerErrors: [], pages: [],
    plannedChecks: CHECKS,
    dialogBoundary: 'Only the native picker response is supplied with the verified corpus archive. Permission requests are explicitly denied; no account or native OS dialog interaction is claimed. Review, identity/profile consent, Install, toolbar, toggle and Settings controls are the actual production/package handlers.',
    networkScope: 'Ordinary unchanged package traffic is observed through native WebContents CDP Network events. No webRequest interceptor, response rewrite, offline fence, credential or account action. Generated local page has no external resources. This does not capture every browser/worker request or establish a full privacy audit.',
    unverified: ['Packaged executable behavior', 'Native file picker UI', 'Other extension features and packages', 'Settings mutation/persistence beyond the recorded controls', 'Complete network and performance qualification'],
  };
  const record = fields => ({ capturedAt: new Date().toISOString(), milliseconds: Math.round(performance.now() - started), ...fields });
  const resultFile = path.join(context.output, 'real-extension.json');
  const write = () => fs.writeFileSync(resultFile, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  write();
  let shell, fixtureContents, selectedArchive = null, installed = null, identity, runtimeId;
  let closeRequested = false, shellClosed = false;
  const observed = new Map(), observedSessions = new WeakSet(), extensionIds = new Set();

  function isPackageURL(address) {
    try { const value = new URL(address); return value.protocol === 'chrome-extension:' && extensionIds.has(value.hostname); }
    catch { return false; }
  }
  function targetFields(contents) {
    const item = observed.get(contents.id);
    return { webContentsId: contents.id, type: item?.type, url: contents.isDestroyed() ? item?.lastURL : contents.getURL() };
  }
  function networkTargetFields(contents) {
    const fields = targetFields(contents);
    return { ...fields, url: publicAddress(fields.url) };
  }
  function observeSession(partition) {
    if (observedSessions.has(partition)) return;
    observedSessions.add(partition);
    for (const name of ['extension-loaded', 'extension-ready', 'extension-unloaded']) partition.on(name, (_event, extension) => {
      if (extension.name !== PIN.name || extension.version !== PIN.version) return;
      const relative = path.relative(path.join(context.profile, 'extensions/packages'), extension.path);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return;
      extensionIds.add(extension.id);
      result.lifecycle.push(record({ event: name, runtimeId: extension.id, packagePath: extension.path, storagePath: partition.getStoragePath() }));
    });
  }
  function observeContents(contents) {
    const entry = { contents, type: contents.getType(), lastURL: contents.getURL() };
    observed.set(contents.id, entry);
    observeSession(contents.session);
    contents.on('did-start-navigation', details => {
      entry.lastURL = details.url;
      result.lifecycle.push(record({ ...targetFields(contents), event: 'did-start-navigation', target: publicAddress(details.url), isMainFrame: details.isMainFrame }));
    });
    contents.on('did-finish-load', () => { entry.lastURL = contents.getURL(); result.lifecycle.push(record({ ...targetFields(contents), event: 'did-finish-load' })); });
    contents.on('console-message', details => result.console.push(record({ ...targetFields(contents), level: details.level, message: details.message, lineNumber: details.lineNumber, sourceId: details.sourceId })));
    contents.on('preload-error', (_event, preloadPath, error) => result.exceptions.push(record({ ...targetFields(contents), kind: 'preload-error', preloadPath, ...errorDetails(error) })));
    contents.on('render-process-gone', (_event, details) => result.exceptions.push(record({ ...targetFields(contents), kind: 'render-process-gone', message: `${details.reason} (${details.exitCode})`, details })));
    contents.on('did-fail-load', (_event, errorCode, errorDescription, address, isMainFrame) => result.lifecycle.push(record({ ...targetFields(contents), event: 'did-fail-load', address: publicAddress(address), errorCode, errorDescription, isMainFrame })));
    try {
      contents.debugger.attach('1.3');
      contents.debugger.on('message', (_event, method, params) => {
        if (method === 'Runtime.exceptionThrown') {
          const details = params.exceptionDetails;
          result.exceptions.push(record({ ...targetFields(contents), kind: 'uncaught', url: details.url || targetFields(contents).url,
            message: details.exception?.description || details.text, lineNumber: details.lineNumber, columnNumber: details.columnNumber, stackTrace: stackDetails(details.stackTrace) }));
        } else if (method === 'Network.requestWillBeSent') {
          result.network.push(record({ ...networkTargetFields(contents), event: method, requestId: params.requestId, address: publicAddress(params.request.url),
            method: params.request.method, resourceType: params.type, document: publicAddress(params.documentURL),
            initiator: { type: params.initiator?.type, address: publicAddress(params.initiator?.url || ''), stack: stackDetails(params.initiator?.stack) } }));
        } else if (method === 'Network.responseReceived') {
          result.network.push(record({ ...networkTargetFields(contents), event: method, requestId: params.requestId, address: publicAddress(params.response.url),
            status: params.response.status, mimeType: params.response.mimeType, fromDiskCache: params.response.fromDiskCache, fromServiceWorker: params.response.fromServiceWorker }));
        } else if (method === 'Network.loadingFailed') {
          result.network.push(record({ ...networkTargetFields(contents), event: method, requestId: params.requestId, errorText: params.errorText, blockedReason: params.blockedReason, canceled: params.canceled }));
        } else if (method === 'Log.entryAdded') {
          const item = params.entry;
          result.console.push(record({ ...targetFields(contents), level: item.level, message: item.text, sourceId: item.url, source: item.source }));
        }
      });
      entry.observerReady = Promise.all(['Runtime.enable', 'Network.enable', 'Log.enable'].map(method => contents.debugger.sendCommand(method).catch(error => {
        if (!contents.isDestroyed()) result.observerErrors.push(record({ webContentsId: contents.id, method, ...errorDetails(error) }));
      })));
    } catch (error) { result.observerErrors.push(record({ ...targetFields(contents), ...errorDetails(error) })); }
  }
  function assertNoUncaught() {
    const failure = result.exceptions.find(item => isPackageURL(item.url) || isPackageURL(observed.get(item.webContentsId)?.lastURL));
    if (failure) {
      const error = new Error(`Unchanged package ${failure.kind}: ${failure.message}`);
      error.runtimeFailure = failure;
      throw error;
    }
  }
  async function requireObservation(contents) {
    const entry = observed.get(contents.id);
    assert.ok(entry?.observerReady, 'Every gated native extension document must have a real CDP observer');
    await entry.observerReady;
    assert.equal(result.observerErrors.filter(error => error.webContentsId === contents.id).length, 0,
      'The native document observer must initialize before its workflow can be accepted');
  }
  async function until(predicate, description, { timeout = 15_000, checkRuntime = true } = {}) {
    const deadline = performance.now() + timeout;
    while (performance.now() < deadline) {
      if (checkRuntime) assertNoUncaught();
      const value = await predicate();
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assertNoUncaught();
    throw new Error(`Timed out observing ${description}. The operation was invoked once; it was not retried.`);
  }
  async function check(name, operation) {
    const start = performance.now(); result.activeCheck = name;
    try {
      await operation();
      assertNoUncaught();
      result.checks.push({ name, passed: true, milliseconds: Math.round(performance.now() - start) });
      result.activeCheck = null; write(); console.log(`PASS: ${name}`);
    } catch (error) {
      const detail = { ...errorDetails(error), ...(error.runtimeFailure ? { runtimeFailure: error.runtimeFailure } : {}) };
      result.checks.push({ name, passed: false, milliseconds: Math.round(performance.now() - start), error: detail });
      result.firstFailure ||= { check: name, ...detail }; write(); throw error;
    }
  }
  async function command(name, value) {
    return shell.webContents.executeJavaScript(`window.browser.command(${JSON.stringify(name)}, ${JSON.stringify(value) || 'undefined'})`);
  }
  const state = () => command('state');
  async function click(contents, selector) {
    return contents.executeJavaScript(`(() => {
      const controls = [...document.querySelectorAll(${JSON.stringify(selector)})].filter(control => control.getClientRects().length && !control.disabled);
      if (controls.length !== 1) throw new Error('Expected one visible enabled real control: '+${JSON.stringify(selector)}+', got '+controls.length);
      controls[0].scrollIntoView({block:'nearest'}); controls[0].click();
    })()`);
  }
  async function navigate(address) {
    await shell.webContents.executeJavaScript(`(() => {
      const input=document.getElementById('address'); input.value=${JSON.stringify(address)}; input.dispatchEvent(new Event('input',{bubbles:true}));
      document.getElementById('navigate').requestSubmit();
    })()`);
    return until(async () => {
      const current = await state(), tab = current.tabs.find(item => item.id === current.activeId);
      if (!tab || tab.url !== address) return null;
      const view = shell.contentView.children.find(candidate => candidate.webContents && candidate.getVisible() && !candidate.webContents.isDestroyed() && candidate.webContents.getURL() === address);
      if (!view || view.webContents.isLoading()) return null;
      const marker = await view.webContents.executeJavaScript('document.documentElement.dataset.noxviolaRealExtensionFixture');
      return marker === 'light-v1' ? view.webContents : null;
    }, 'the selected actual light document');
  }
  async function sample(contents, name, capture = true) {
    const values = await contents.executeJavaScript(`(() => ({
      fixture:document.documentElement.dataset.noxviolaRealExtensionFixture,
      url:location.href,title:document.title,readyState:document.readyState,
      bodyBackground:getComputedStyle(document.body).backgroundColor,bodyColor:getComputedStyle(document.body).color,
      htmlBackground:getComputedStyle(document.documentElement).backgroundColor,
      surfaceBackground:getComputedStyle(document.getElementById('surface')).backgroundColor,
      styleCount:document.querySelectorAll('style.darkreader').length,
      privilegedBridge:typeof window.__noxviolaExtensionHost,nodeRequire:typeof require
    }))()`);
    const pixelImage = await contents.capturePage({ x: 8, y: 8, width: 1, height: 1 });
    assert.equal(pixelImage.isEmpty(), false, 'Native page capture must contain pixels');
    const bitmap = pixelImage.toBitmap();
    assert.ok(bitmap.length >= 4, 'A captured native pixel is required');
    // Electron's native bitmap uses BGRA. The neutral-surface mean is also
    // invariant to R/B ordering; the original bytes remain in the PNG artifact.
    values.pixel = { bgra: [...bitmap.subarray(0, 4)], meanRGB: (bitmap[0] + bitmap[1] + bitmap[2]) / 3, alpha: bitmap[3] };
    if (capture) {
      const image = await contents.capturePage(), bytes = image.toPNG();
      const filename = `real-extension-${name}.png`;
      fs.writeFileSync(path.join(context.output, filename), bytes);
      values.screenshot = { file: filename, bytes: bytes.length, sha256: sha256(bytes), size: image.getSize() };
      result.pages.push({ name, ...values });
    }
    return values;
  }
  async function backgroundDiagnostics() {
    const contexts = [];
    for (const entry of observed.values()) {
      const contents = entry.contents;
      if (contents.isDestroyed() || !isPackageURL(contents.getURL())) continue;
      const preferences = contents.getLastWebPreferences();
      const detail = { ...targetFields(contents), loading: contents.isLoading(), preferences: {
        contextIsolation: preferences.contextIsolation, nodeIntegration: preferences.nodeIntegration,
        sandbox: preferences.sandbox, webSecurity: preferences.webSecurity, preload: preferences.preload,
      } };
      if (!contents.isLoading()) detail.document = await contents.executeJavaScript(`(() => ({url:location.href,readyState:document.readyState,title:document.title,
        api:{alarms:typeof chrome.alarms,alarmListener:typeof chrome.alarms?.onAlarm?.addListener,
        permissionsContains:typeof chrome.permissions?.contains,storageLocal:typeof chrome.storage?.local,
        tabsCreate:typeof chrome.tabs?.create,tabsQuery:typeof chrome.tabs?.query,setIcon:typeof chrome.browserAction?.setIcon}}))()`);
      contexts.push(detail);
    }
    return contexts;
  }

  dialog.showOpenDialog = async () => {
    assert.equal(selectedArchive, corpus.archive, 'The only native picker response must be the admitted original package copy');
    selectedArchive = null;
    return { canceled: false, filePaths: [corpus.archive] };
  };
  dialog.showMessageBox = async (_window, options) => {
    const settings = options || _window;
    const response = settings.buttons?.findIndex(button => /^(deny|block|cancel)$/i.test(button.trim()));
    assert.ok(response >= 0, 'No unrecognized permissive native dialog may be accepted');
    (result.deniedDialogs ||= []).push({ message: settings.message, buttons: settings.buttons, choice: settings.buttons[response] });
    return { response, checkboxChecked: false };
  };
  dialog.showSaveDialog = async () => { throw new Error('This corpus workflow never exports or downloads a file through a native save dialog.'); };
  dialog.showErrorBox = (title, message) => { result.exceptions.push(record({ kind: 'native-error-box', message: `${title}: ${message}` })); write(); };
  app.on('session-created', observeSession);
  app.on('web-contents-created', (_event, contents) => observeContents(contents));
  app.once('will-quit', () => {
    result.normalCloseObserved = closeRequested && shellClosed;
    result.passed = result.completedWorkflows && result.normalCloseObserved && !result.firstFailure && result.observerErrors.length === 0;
    result.finishedAt = new Date().toISOString(); write();
  });

  require('../../browser/main.cjs');
  try {
    await app.whenReady();
    shell = await until(() => BrowserWindow.getAllWindows().find(window => !window.isDestroyed()), 'production browser window');
    shell.once('closed', () => { shellClosed = true; });
    await until(() => !shell.webContents.isLoading() && shell.webContents.getURL().startsWith('file:'), 'trusted shell');
    await until(() => shell.webContents.executeJavaScript('typeof window.browser?.command === "function"'), 'actual shell preload');
    result.runtimeReady = true;
    const initial = await state();
    identity = initial.tabs.find(tab => tab.id === initial.activeId).identity;
    const resolveSession = createIdentitySessionResolver({ session, root: app.getPath('sessionData') });
    const partition = resolveSession(identity);
    result.identity = identity;
    await shell.webContents.executeJavaScript('window.__realPreview=null;void window.browser.onExtensionPreview(value=>{window.__realPreview=value;});window.__realActions=[];void window.browser.onExtensionActions(value=>{window.__realActions=value;});');
    let baseline;
    await check('sandboxed light baseline', async () => {
      fixtureContents = await navigate(`${context.origin}/light?baseline=1`);
      baseline = await sample(fixtureContents, 'baseline');
      assertLight(baseline);
      assert.equal(baseline.privilegedBridge, 'undefined'); assert.equal(baseline.nodeRequire, 'undefined');
      const prefs = fixtureContents.getLastWebPreferences();
      assert.equal(prefs.nodeIntegration, false); assert.equal(prefs.sandbox, true); assert.equal(prefs.contextIsolation, true);
      result.rendererPreferences = { nodeIntegration: prefs.nodeIntegration, sandbox: prefs.sandbox, contextIsolation: prefs.contextIsolation };
    });
    await check('real reviewed ZIP installation', async () => {
      await click(shell.webContents, 'nav button[data-command="extensions"]');
      selectedArchive = corpus.archive;
      await click(shell.webContents, '#extension-import-package');
      const preview = await until(() => shell.webContents.executeJavaScript('window.__realPreview'), 'actual ZIP inspection preview');
      assert.equal(selectedArchive, null);
      assert.equal(preview.name, PIN.name); assert.equal(preview.version, PIN.version); assert.equal(preview.format, 'zip');
      assert.equal(preview.provenance.archiveDigest, PIN.asset.sha256); assert.equal(preview.provenance.codeRewritten, false);
      assert.equal(preview.provenance.publisherVerified, false);
      assertPinnedPermissions(preview.permissions);
      const consent = await shell.webContents.executeJavaScript(`(() => {
        const preview=document.getElementById('extension-preview'), permission=document.getElementById('extension-accept'), install=document.getElementById('extension-install');
        if(preview.hidden||permission.checked||!install.disabled)throw new Error('A fresh visible review and unchecked acceptance are required');
        const choices=[...document.querySelectorAll('#extension-preview-identities input')];
        if(!choices.some(input=>input.value===${JSON.stringify(identity)}))throw new Error('The selected identity is absent');
        for(const input of choices)if(input.checked!==(input.value===${JSON.stringify(identity)}))input.click();
        const profile=document.getElementById('extension-api-profile');profile.value='chromium';profile.dispatchEvent(new Event('change',{bubbles:true}));
        permission.click();
        return {identities:choices.filter(input=>input.checked).map(input=>input.value),apiProfile:profile.value,accepted:permission.checked,enabled:!install.disabled,
          permissions:document.getElementById('extension-preview-permissions').textContent,compatibility:document.getElementById('extension-preview-compatibility').textContent};
      })()`);
      assert.deepEqual(consent.identities, [identity]); assert.equal(consent.accepted, true); assert.equal(consent.enabled, true); assert.equal(consent.apiProfile, 'chromium');
      for (const permission of [...PIN.permissions.required, ...PIN.permissions.hosts, ...PIN.permissions.optional]) assert.ok(consent.permissions.includes(permission));
      result.review = { preview, consent };
      await click(shell.webContents, '#extension-install');
      installed = await until(async () => {
        const error = await shell.webContents.executeJavaScript("document.getElementById('extension-error').textContent");
        if (error) throw new Error(`Actual installation UI: ${error}`);
        if (!await shell.webContents.executeJavaScript("document.getElementById('extension-preview').hidden")) return null;
        return (await command('extension-list')).find(item => item.packageDigest === preview.packageDigest);
      }, 'real Install handler and matching manager enrollment', { checkRuntime: false });
      assert.deepEqual(installed.identities.map(grant => grant.identity), [identity]);
      assert.equal(installed.apiProfile, 'chromium'); assert.equal(installed.provenance.archiveDigest, PIN.asset.sha256);
      result.installation = installed;
      await until(() => shell.webContents.executeJavaScript(`([...document.querySelectorAll('#extension-items article')].some(card=>card.querySelector('h2')?.textContent===${JSON.stringify(`${PIN.name} · ${PIN.version}`)}&&card.textContent.includes(${JSON.stringify(installed.packageDigest)})))`), 'matching actual installed card', { checkRuntime: false });
      const grant = installed.identities.find(item => item.identity === identity);
      assert.equal(grant.status, 'loaded', `Runtime admission must succeed: ${grant.error || grant.status}`);
      runtimeId = grant.runtimeId;
      const native = partition.extensions.getExtension(runtimeId);
      assert.ok(native, 'The actual identity Session must contain the loaded runtime');
      result.installedFileVerification = PIN.packageFiles.map(file => {
        const bytes = readRegular(path.join(native.path, file.path));
        assert.equal(bytes.length, file.bytes); assert.equal(sha256(bytes), file.sha256);
        return { ...file, matched: true };
      });
    });
    await check('persistent background startup', async () => {
      const background = await until(() => webContents.getAllWebContents().find(contents => !contents.isDestroyed() && contents.session === partition && contents.getURL() === `chrome-extension://${runtimeId}/background/index.html` && !contents.isLoading()), 'the real persistent background document');
      result.background = { ...targetFields(background), document: await background.executeJavaScript('({url:location.href,readyState:document.readyState})') };
      assert.equal(result.background.document.readyState, 'complete');
      await requireObservation(background);
      result.backgroundDiagnostics = await backgroundDiagnostics();
      assert.equal(result.observerErrors.length, 0, 'Startup observers must actually attach; missing diagnostics do not prove successful startup');
    });
    await click(shell.webContents, '#extensions button[data-command="panel-close"]');
    await check('actual page darkening', async () => {
      fixtureContents = await navigate(`${context.origin}/light?installed=1`);
      await until(async () => {
        const value = await sample(fixtureContents, 'waiting-dark', false);
        return value.styleCount > 0 && value.pixel.meanRGB < 128;
      }, 'actual darkening of the generated page');
      const dark = await sample(fixtureContents, 'darkened'); assertDarkened(baseline, dark);
    });
    let popup;
    await check('actual toolbar popup', async () => {
      await until(() => shell.webContents.executeJavaScript(`window.__realActions.find(item=>item.runtimeId===${JSON.stringify(runtimeId)}&&item.enabled!==false)`), 'real extension toolbar action');
      const action = await shell.webContents.executeJavaScript(`(() => {
        const item=window.__realActions.find(value=>value.runtimeId===${JSON.stringify(runtimeId)}), buttons=[...document.querySelectorAll('#extension-actions button')];
        const target=buttons.find(button=>button.textContent.includes(${JSON.stringify(PIN.name)}));
        if(!target||target.disabled||!target.getClientRects().length)throw new Error('Actual Dark Reader toolbar control unavailable');
        const image=target.querySelector('img.extension-icon');if(!image||!image.complete||!image.naturalWidth)throw new Error('Real package toolbar icon is not displayed');
        target.click();return {item,title:target.title,image:{src:image.currentSrc,width:image.naturalWidth,height:image.naturalHeight}};
      })()`);
      result.action = action;
      popup = await until(() => BrowserWindow.getAllWindows().find(window => window !== shell && !window.isDestroyed() && window.webContents.session === partition && window.webContents.getURL() === `chrome-extension://${runtimeId}/ui/popup/index.html` && !window.webContents.isLoading()), 'actual same-identity extension popup');
      await requireObservation(popup.webContents);
      await until(() => popup.webContents.executeJavaScript('Boolean(document.querySelector(".header__app-toggle .toggle__on.toggle__btn--active"))'), 'the package popup initialized with enabled state');
      const bytes = (await popup.webContents.capturePage()).toPNG(); fs.writeFileSync(path.join(context.output, 'real-extension-popup.png'), bytes);
      result.popup = { url: popup.webContents.getURL(), screenshot: { file: 'real-extension-popup.png', bytes: bytes.length, sha256: sha256(bytes) } };
    });
    await check('popup off returns light pixels', async () => {
      await click(popup.webContents, '.header__app-toggle .toggle__off');
      await until(async () => (await sample(fixtureContents, 'waiting-light', false)).pixel.meanRGB >= 230, 'the one actual Off command to restore light page pixels');
      assertLight(await sample(fixtureContents, 'toggled-off'));
      assert.equal(await popup.webContents.executeJavaScript('Boolean(document.querySelector(".header__app-toggle .toggle__off.toggle__btn--active"))'), true);
    });
    await check('popup on restores dark pixels', async () => {
      await click(popup.webContents, '.header__app-toggle .toggle__on');
      await until(async () => (await sample(fixtureContents, 'waiting-on', false)).pixel.meanRGB < 128, 'the one actual On command to restore dark pixels');
      assertDarkened(baseline, await sample(fixtureContents, 'toggled-on'));
    });
    await check('package settings control opens and changes section', async () => {
      await popup.webContents.executeJavaScript(`(() => {
        const buttons=[...document.querySelectorAll('.tab-panel__buttons .tab-panel__button')];
        if(buttons.length!==3)throw new Error('Pinned popup expected three real sections');buttons[2].click();
      })()`);
      await click(popup.webContents, '.tab-panel__tab--active .more-settings__settings-button');
      const options = await until(() => webContents.getAllWebContents().find(contents => !contents.isDestroyed() && contents.session === partition && contents.getURL() === `chrome-extension://${runtimeId}/ui/options/index.html` && !contents.isLoading()), 'the package-requested actual options document');
      await requireObservation(options);
      await until(() => options.executeJavaScript('document.querySelectorAll(".settings-tab-panel__button").length>1'), 'actual settings sections');
      const changed = await options.executeJavaScript(`(() => {
        const buttons=[...document.querySelectorAll('.settings-tab-panel__button')];
        const previous=buttons.findIndex(button=>button.classList.contains('settings-tab-panel__button--active'));
        const target=buttons.findIndex((button,index)=>index!==previous&&!button.disabled&&button.getClientRects().length);
        if(target<0)throw new Error('No alternate real settings section');
        const before=document.querySelector('.settings-tab-panel__tab--active')?.textContent;buttons[target].click();
        return {previous,target,before,after:document.querySelector('.settings-tab-panel__tab--active')?.textContent,active:buttons[target].classList.contains('settings-tab-panel__button--active')};
      })()`);
      assert.equal(changed.active, true); assert.ok(changed.after); assert.notEqual(changed.after, changed.before);
      result.options = { url: options.getURL(), navigation: changed, declaredOptionsPage: false, route: 'The unchanged popup Settings handler invoked its own native browser API; the harness did not navigate directly.' };
      fs.writeFileSync(path.join(context.output, 'real-extension-options.png'), (await options.capturePage()).toPNG());
    });
    result.backgroundDiagnostics = await backgroundDiagnostics();
    await Promise.all([...observed.values()].map(entry => entry.observerReady));
    assert.equal(result.observerErrors.length, 0, 'Popup/options observation errors must prevent a passing real-package receipt');
    assertNoUncaught();
    result.completedWorkflows = true;
    result.beforeClose = await state();
    write();
    for (const window of BrowserWindow.getAllWindows()) if (window !== shell && !window.isDestroyed()) window.close();
    closeRequested = true;
    result.closeMethod = 'The actual main BrowserWindow.close(), entering the preventable production close event and awaited session writer. No DOM window.close(), app.exit(), artificial flush or delay is used on the success path.';
    write();
    shell.close();
  } catch (error) {
    result.passed = false;
    result.firstFailure ||= { check: result.activeCheck || 'startup or shutdown', ...errorDetails(error), ...(error.runtimeFailure ? { runtimeFailure: error.runtimeFailure } : {}) };
    result.error = result.firstFailure.message;
    write(); // Preserve the causal failure before optional diagnostic reads.
    let timer;
    try {
      await Promise.race([(async () => {
        result.backgroundDiagnostics = await backgroundDiagnostics();
        if (shell && !shell.isDestroyed()) { result.failureState = await state(); result.failureExtensions = await command('extension-list'); }
        if (fixtureContents && !fixtureContents.isDestroyed()) await sample(fixtureContents, 'failure');
      })(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Failure diagnostics exceeded two seconds')), 2000); })]);
    } catch (diagnosticError) { result.diagnosticError = errorDetails(diagnosticError); }
    finally { clearTimeout(timer); }
    write(); console.error(result.firstFailure.stack || result.firstFailure.message);
    app.exit(1); // Failed generated run only; never a successful close receipt.
  }
}

if (require.main === module) main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
module.exports = { errorDetails, stackDetails, main };
