'use strict';

// Production HTML + production renderer, with ONLY the preload IPC boundary
// substituted. These DOM contracts do not launch Electron, execute extensions,
// prove Chromium isolation, or establish native/visual acceptance.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM, VirtualConsole} = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '../browser/index.html'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, '../browser/renderer.js'), 'utf8');
const inventory = JSON.parse(fs.readFileSync(path.join(__dirname, '../browser/capabilities.json'), 'utf8'));
const ipcMethods = ['onState', 'onVault', 'onVaultDraft', 'onAccounts', 'onExtensions', 'onExtensionPreview', 'onDownloads', 'onPermissions', 'onCapabilities', 'onNotice', 'onAddress', 'onFind', 'onHistory','onBookmarks','onWorkspaces','onResources','onSettingsPreview','onFindResult','onExtensionActions'];
const profiles = [{id: 'personal', name: 'Personal'}, {id: 'work', name: 'Work'}];
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));

function state(overrides = {}) {
  return {version: 1, profiles: copy(profiles), preferences: {searchEngine: 'duckduckgo', tabLayout: 'horizontal'},
    activeId: 'tab-0', currentIdentity: 'personal', splitId: null, panel: null, closing: false, saveError: '', canRestore: false,
    canBack: false, canForward: false, engine: {electron: '44.11.3', chromium: 'fixture'},
    tabs: [{id: 'tab-0', identity: 'personal', url: 'https://initial.example/', title: 'Initial page', loading: false, live: true}], ...overrides};
}
function extension(overrides = {}) {
  return {id: 'installed-fixture', name: 'Synthetic package', version: '1', description: 'Fixture description', format: 'unpacked', manifestVersion: 3,
    packageDigest: 'a'.repeat(64), installedAt: '2026-11-15T00:00:00Z',
    permissions: {required: ['storage'], hosts: ['https://example.test/*'], optional: ['downloads'], optionalHosts: [], contentScripts: [{matches: ['https://example.test/*'], excludeMatches: ['https://example.test/private/*'], allFrames: false, runAt: 'document_idle'}]},
    compatibility: {status: 'limited', functionalVerification: 'not-tested', detection: 'Static dotted references only.', issues: [{status: 'unknown', detail: 'tabs.create needs a browser bridge.'}]},
    provenance: {filename: 'local.zip', signature: 'not-verified', publisherVerified: false},
    pages: {popup: 'popup.html', options: 'options.html'},
    identities: [{identity: 'personal', enabled: true, allowFileAccess: false, status: 'loaded', runtimeId: 'a'.repeat(32), error: null}], ...overrides};
}
function preview(overrides = {}) {
  return {...extension(), token: 'review-token', files: 4, bytes: 1024, requiresUnsignedImportAcceptance: false, ...overrides};
}
async function harness(t, {initial = state(), command = async () => undefined} = {}) {
  const calls = [], listeners = new Map(), errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, {url: 'https://noxviola.invalid/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole});
  const {window} = dom;
  window.addEventListener('error', event => { errors.push(event.error?.message || event.message); event.preventDefault(); });
  const api = {command: async (name, value) => {
    calls.push({name, value: copy(value)});
    return copy(name === 'state' ? initial : await command(name, copy(value)));
  }};
  for (const method of ipcMethods) api[method] = callback => { listeners.set(method, callback); return () => listeners.delete(method); };
  window.browser = Object.freeze(api);
  window.eval(source);
  await tick();
  t.after(() => { window.close(); assert.deepEqual(errors, [], 'production renderer must not throw DOM errors'); });
  let current = initial;
  function emit(method, data) {
    assert.ok(listeners.has(method), `production subscribes to ${method}`);
    listeners.get(method)(copy(data));
  }
  return {window, document: window.document, calls, emit,
    $: id => window.document.getElementById(id),
    update(partial) { current = {...current, ...partial}; emit('onState', current); },
    input(control, value) { control.value = value; control.dispatchEvent(new window.Event('input', {bubbles: true})); },
    check(control, checked) { control.checked = checked; control.dispatchEvent(new window.Event('change', {bubbles: true})); },
    submit(form) { form.dispatchEvent(new window.Event('submit', {bubbles: true, cancelable: true})); },
  };
}
async function painted(h, id) {
  const target = h.$(id);
  if (target.getAttribute('aria-busy') !== 'true') return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { observer.disconnect(); reject(new Error(`${id} did not finish rendering all records`)); }, 3000);
    const observer = new h.window.MutationObserver(() => {
      if (target.getAttribute('aria-busy') !== 'true') { clearTimeout(timeout); observer.disconnect(); resolve(); }
    });
    observer.observe(target, {attributes: true});
  });
}
function findButton(root, label) {
  const found = [...root.querySelectorAll('button')].find(button => button.textContent === label);
  assert.ok(found, `button ${label} exists`);
  return found;
}

test('DOM: background state preserves an address draft and focused tab node; navigation rejection preserves the draft', async t => {
  const h = await harness(t, {command: async name => { if (name === 'navigate') throw new Error('Address rejected by host'); }});
  const selected = h.document.querySelector('[role="tab"]');
  selected.focus();
  h.update({tabs: [{...state().tabs[0], title: 'Background title changed', loading: true}]});
  assert.equal(h.document.querySelector('[role="tab"]'), selected);
  assert.equal(h.document.activeElement, selected);
  h.$('address').focus(); h.input(h.$('address'), 'my unfinished address');
  h.update({tabs: [{...state().tabs[0], title: 'Another title', url: 'https://redirect.example/'}], canBack: true});
  assert.equal(h.$('address').value, 'my unfinished address');
  h.submit(h.$('navigate')); await tick();
  assert.equal(h.$('address').value, 'my unfinished address');
  assert.match(h.$('notice').textContent, /Address rejected/);
  h.update({canForward: true});
  assert.equal(h.$('address').value, 'my unfinished address');
  h.$('address').dispatchEvent(new h.window.KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
  assert.equal(h.$('address').value, 'https://redirect.example/');
});

test('DOM: rejected library and account saves preserve every entered draft field', async t => {
  const h = await harness(t, {command: async name => { if (['vault-save', 'account-save'].includes(name)) throw new Error('Synthetic disk write failed'); }});
  h.update({panel: 'vault'});
  const form = h.$('vault-add');
  for (const [name, value] of Object.entries({id: 'old-id', title: 'Unsent title', url: 'https://example.test/resource', kind: 'character', group: 'My collection', characters: 'Original character', notes: 'Preserve\nall this text'})) form.elements.namedItem(name).value = value;
  h.$('vault-editor').open = true;
  const before = [...new h.window.FormData(form)];
  h.submit(form); await tick();
  assert.deepEqual([...new h.window.FormData(form)], before);
  assert.equal(h.$('vault-editor').open, true);
  assert.equal(form.querySelector('button.primary').disabled, false);
  assert.match(h.$('notice').textContent, /disk write failed/);
  h.update({panel: 'accounts'});
  const account = h.$('account-form');
  for (const [name, value] of Object.entries({id: 'record-id', label: 'Unsent account', handle: 'public-handle', origin: 'https://account.test', identity: 'work'})) account.elements.namedItem(name).value = value;
  account.elements.namedItem('created').checked = true;
  account.elements.namedItem('inPasswordManager').checked = true;
  account.dataset.archived = 'true';
  const accountBefore = [...new h.window.FormData(account)];
  h.submit(account); await tick();
  assert.deepEqual([...new h.window.FormData(account)], accountBefore);
  assert.equal(account.dataset.archived, 'true');
  assert.equal(account.querySelector('button.primary').disabled, false);
  const request = h.calls.find(call => call.name === 'account-save');
  assert.equal(request.value.identity, 'work');
  assert.equal(request.value.created, true);
  assert.equal(request.value.archived, true);
});

test('DOM: a delayed navigation reply cannot erase a newer editable address draft', async t => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = await harness(t, {command: async name => name === 'navigate' ? pending : undefined});
  h.input(h.$('address'), 'https://submitted.example/');
  h.submit(h.$('navigate')); await tick();
  const editable = !h.$('address').disabled && !h.$('navigate').inert;
  if (editable) h.input(h.$('address'), 'new draft typed while navigation was pending');
  finish(); await tick();
  h.update({tabs: [{...state().tabs[0], url: 'https://submitted.example/'}]});
  assert.equal(h.$('address').value, editable ? 'new draft typed while navigation was pending' : 'https://submitted.example/');
  assert.equal(h.$('address').disabled, false);
});

test('DOM: pending saves lock form controls, restore prior flags, and preserve newer asynchronously supplied drafts', async t => {
  const pending = new Map();
  const h = await harness(t, {command: name => new Promise(resolve => pending.set(name, resolve))});
  for (const [panel, formId, fieldName, commandName] of [
    ['vault', 'vault-add', 'notes', 'vault-save'],
    ['accounts', 'account-form', 'label', 'account-save'],
  ]) {
    h.update({panel});
    const form = h.$(formId), field = form.elements.namedItem(fieldName);
    if (panel === 'vault') { form.elements.namedItem('title').value = 'Initial title'; form.elements.namedItem('url').value = 'https://source.test/'; }
    else { form.elements.namedItem('label').value = 'Initial label'; form.elements.namedItem('origin').value = 'https://account.test'; }
    h.input(field, 'submitted draft');
    const reset = h.$(panel === 'vault' ? 'vault-reset' : 'account-reset');
    reset.disabled = true;
    const disabledBefore = [...form.elements].map(control => control.disabled);
    h.submit(form); await tick();
    assert.ok(pending.has(commandName));
    assert.ok([...form.elements].every(control => control.disabled), `${panel} fields and reset controls are locked during the write`);
    if (panel === 'vault') {
      h.emit('onVaultDraft', {title: 'New bookmark arrived while saving', url: 'https://new-source.test/', kind: 'website'});
      field.value = 'New draft details supplied while the old write was pending';
    } else {
      h.emit('onAccounts', {open: true, profiles, accounts: [{id: 'another-record', label: 'New draft details supplied while the old write was pending', handle: 'another', origin: 'https://other-account.test', identity: 'work', archived: false, created: false, inPasswordManager: false}]});
      await painted(h, 'account-items');
      findButton(h.$('account-items'), 'Edit').click(); await tick();
    }
    pending.get(commandName)(); await tick();
    assert.equal(field.value, 'New draft details supplied while the old write was pending', `${panel} retains a draft newer than the saved snapshot`);
    assert.deepEqual([...form.elements].map(control => control.disabled), disabledBefore);
    assert.equal(Boolean(form.inert), false);
  }
});

test('DOM: all 37 tabs remain selectable and all matching collection items render beyond the former small-list size', async t => {
  const tabs = Array.from({length: 37}, (_, index) => ({id: `tab-${index}`, identity: index % 2 ? 'work' : 'personal', title: `Page ${index}`, url: `https://example.test/${index}`, loading: false}));
  const h = await harness(t, {initial: state({tabs})});
  const nodes = h.document.querySelectorAll('[role="tab"]');
  assert.equal(nodes.length, 37);
  nodes[36].click(); await tick();
  assert.ok(h.calls.some(call => call.name === 'activate' && call.value === 'tab-36'));
  h.update({panel: 'vault'});
  const items = Array.from({length: 59}, (_, index) => ({id: `item-${index}`, title: `Reference ${index}`, url: `https://source.test/${index}`, kind: 'website', group: index < 47 ? 'Full collection' : 'Other collection', characters: '', notes: '', favorite: false, archived: false}));
  h.emit('onVault', {items, open: true, error: '', recoveryAvailable: false, preview: null});
  h.input(h.$('vault-search'), 'full collection'); await painted(h, 'vault-items');
  const cards = h.$('vault-items').querySelectorAll('article');
  assert.equal(cards.length, 47);
  assert.match(h.$('vault-count').textContent, /47 matching items/);
  findButton(cards[46], 'Open source').click(); await tick();
  assert.ok(h.calls.some(call => call.name === 'vault-open' && call.value === 'item-46'));
});

test('DOM: panel commands and state visibility cover every implemented panel, including tools and preferences', async t => {
  const h = await harness(t);
  for (const panel of ['vault', 'accounts', 'extensions', 'downloads', 'permissions', 'settings', 'capabilities']) {
    h.document.querySelector(`[data-command="${panel}"]`).click(); await tick();
    assert.equal(h.calls.at(-1).name, panel);
    h.update({panel});
    assert.equal(h.$(panel).hidden, false, `${panel} is shown by actual renderer state`);
    for (const section of h.document.querySelectorAll('#workspace > section')) if (section.id !== panel) assert.equal(section.hidden, true);
  }
  h.$('open-tools').click(); await tick(); assert.equal(h.calls.at(-1).name, 'tools');
  h.update({panel: 'tools'}); assert.equal(h.$('tools').hidden, false);
  h.$('tools').querySelector('[data-command="panel-close"]').click(); await tick(); assert.equal(h.calls.at(-1).name, 'panel-close');
  h.update({panel: null, tabs: [{...state().tabs[0], url: 'about:blank'}]});
  assert.equal(h.$('start').hidden, false);
  assert.equal(h.$('address').value, '');
});

test('DOM: exact extension consent and selected identities are required; rejected installation retains the review', async t => {
  const h = await harness(t, {command: async name => { if (name === 'extension-install') throw new Error('Inspected bytes changed; inspect again'); }});
  h.update({panel: 'extensions'});
  h.emit('onExtensions', {items: [], profiles, currentIdentity: 'personal', open: true, error: '', busy: false});
  h.emit('onExtensionPreview', preview({token: 'exact-xpi-token', format: 'xpi', requiresUnsignedImportAcceptance: true, apiProfileSuggestion: 'firefox'}));
  assert.equal(h.$('extension-api-profile').value, 'firefox');
  assert.equal(h.$('extension-accept').checked, false);
  assert.equal(h.$('extension-unsigned').checked, false);
  assert.equal(h.$('extension-install').disabled, true);
  h.$('extension-install').click(); await tick();
  assert.equal(h.calls.some(call => call.name === 'extension-install'), false);
  const identityInputs = h.$('extension-preview-identities').querySelectorAll('input');
  for (const control of identityInputs) h.check(control, control.value === 'work');
  h.check(h.$('extension-accept'), true);
  assert.equal(h.$('extension-install').disabled, true, 'XPI trust choice is still missing');
  h.check(h.$('extension-unsigned'), true);
  assert.equal(h.$('extension-install').disabled, false);
  h.$('extension-install').click(); await tick();
  const request = h.calls.find(call => call.name === 'extension-install');
  assert.deepEqual(request.value, {token: 'exact-xpi-token', identities: ['work'], permissionsAccepted: true, unsignedImportAccepted: true, apiProfile: 'firefox'});
  assert.equal(h.$('extension-preview').hidden, false);
  assert.equal(h.$('extension-accept').checked, true);
  assert.equal(h.$('extension-api-profile').value, 'firefox', 'failed installation preserves the reviewed compatibility choice');
  assert.deepEqual([...h.$('extension-preview-identities').querySelectorAll('input:checked')].map(control => control.value), ['work']);
  assert.match(h.$('notice').textContent, /Inspected bytes changed/);
  assert.doesNotMatch(h.$('notice').textContent, /installed|loaded in/i);
  h.emit('onExtensionPreview', preview({token: 'different-package'}));
  assert.equal(h.$('extension-accept').checked, false, 'consent does not carry to another package');
  assert.equal(h.$('extension-unsigned').checked, false);
  assert.equal(h.$('extension-api-profile').value, 'chromium', 'a new package starts with its own suggested profile');
  assert.equal(h.$('extension-install').disabled, true);
});

test('DOM: a committed package with failed runtime is reported as not loaded and gets no popup controls', async t => {
  const failed = extension({identities: [{identity: 'personal', enabled: true, allowFileAccess: false, status: 'load-failed', runtimeId: null, error: 'Engine rejected fixture API'}]});
  const h = await harness(t, {command: async name => name === 'extension-install' ? failed : undefined});
  h.update({panel: 'extensions'});
  h.emit('onExtensions', {items: [], profiles, open: true, busy: false});
  h.emit('onExtensionPreview', preview());
  h.check(h.$('extension-accept'), true);
  h.$('extension-install').click(); await tick();
  assert.match(h.$('notice').textContent, /not loaded/);
  assert.doesNotMatch(h.$('notice').textContent, /fully compatible|successfully working/i);
  h.emit('onExtensions', {items: [failed], profiles, open: true, busy: false}); await painted(h, 'extension-items');
  assert.match(h.$('extension-items').textContent, /load-failed.*Engine rejected fixture API/);
  assert.match(h.$('extension-items').textContent, /Functional compatibility not verified/);
  assert.equal([...h.$('extension-items').querySelectorAll('button')].some(button => ['Open popup', 'Options'].includes(button.textContent)), false);
});

test('DOM: extension actions target the exact identity and additional authorization never bypasses consent', async t => {
  const h = await harness(t);
  h.update({panel: 'extensions'});
  h.emit('onExtensions', {items: [extension()], profiles, open: true, busy: false}); await painted(h, 'extension-items');
  const card = h.$('extension-items').querySelector('article');
  findButton(card, 'Open popup').click(); await tick();
  assert.deepEqual(h.calls.at(-1), {name: 'extension-popup', value: {id: 'installed-fixture', identity: 'personal'}});
  findButton(card, 'Disable').click(); await tick();
  assert.deepEqual(h.calls.at(-1), {name: 'extension-enable', value: {id: 'installed-fixture', identity: 'personal', enabled: false}});
  const authorize = findButton(card, 'Authorize identity');
  assert.equal(authorize.disabled, true); authorize.click(); await tick();
  assert.equal(h.calls.some(call => call.name === 'extension-authorize'), false);
  h.check(card.querySelector('label.consent input'), true);
  authorize.click(); await tick();
  assert.deepEqual(h.calls.at(-1), {name: 'extension-authorize', value: {id: 'installed-fixture', identity: 'work', permissionsAccepted: true}});
  findButton(card, 'Uninstall').click(); await tick();
  assert.deepEqual(h.calls.at(-1), {name: 'extension-uninstall', value: 'installed-fixture'});
});

test('DOM: a failed unload offers a stop retry instead of enabling possibly-running code', async t => {
  const h = await harness(t);
  h.update({panel: 'extensions'});
  const failed = extension({identities: [{identity: 'personal', enabled: false, allowFileAccess: false, status: 'disable-failed', runtimeId: 'a'.repeat(32), error: 'Extension may still be running: fixture unload failed'}]});
  h.emit('onExtensions', {items: [failed], profiles, open: true, busy: false}); await painted(h, 'extension-items');
  const grant = h.$('extension-items').querySelector('.identity-grant');
  assert.match(grant.textContent, /may still be running/);
  const retry = [...grant.querySelectorAll('button')].find(control => /disable|stop/i.test(control.textContent));
  assert.ok(retry, 'a possibly-running extension exposes an explicit stop retry');
  retry.click(); await tick();
  assert.deepEqual(h.calls.at(-1), {name: 'extension-enable', value: {id: 'installed-fixture', identity: 'personal', enabled: false}});
});

test('DOM: untrusted names, notes, permissions and diagnostics are text rather than executable markup', async t => {
  const payload = '<img src="untrusted" onerror="window.injected=true"><svg onload="window.injected=true"></svg>';
  const h = await harness(t);
  h.update({panel: 'vault', profiles: [{id: 'personal', name: payload}], tabs: [{...state().tabs[0], title: payload}]});
  h.emit('onVault', {items: [{id: 'unsafe', title: payload, url: 'https://safe.example/', kind: 'website', group: payload, notes: payload}], open: true});
  await painted(h, 'vault-items');
  assert.equal(h.$('vault-items').querySelector('h2').textContent, payload);
  assert.equal(h.$('vault-items').querySelector('img,svg,script'), null);
  assert.equal(h.$('tabs').querySelector('img,svg,script'), null);
  h.update({panel: 'extensions'});
  h.emit('onExtensionPreview', preview({name: payload, description: payload, permissions: {required: [payload]}, compatibility: {functionalVerification: 'not-tested', issues: [{status: 'unknown', detail: payload}]}}));
  assert.match(h.$('extension-preview-title').textContent, /<img/);
  assert.match(h.$('extension-preview-permissions').textContent, /<svg/);
  assert.equal(h.$('extension-preview').querySelector('img,svg,script'), null);
  assert.equal(h.window.injected, undefined);
});

test('DOM: import review uses actual remapped and input-count fields and requires an explicit apply action', async t => {
  const h = await harness(t);
  h.update({panel: 'vault'});
  h.emit('onVault', {items: [], open: true, preview: {total: 7, added: 2, skipped: 5, remapped: 1, metadataAdded: 0}});
  const summary = h.$('vault-preview-summary').textContent;
  assert.doesNotMatch(summary, /undefined|7 items after import/);
  assert.match(summary, /1 conflicting/);
  assert.equal(h.calls.some(call => call.name === 'vault-import-apply'), false);
  h.$('vault-preview').querySelector('[data-command="vault-import-apply"]').click(); await tick();
  assert.equal(h.calls.at(-1).name, 'vault-import-apply');
});

test('DOM: terminal interrupted downloads expose no resume/cancel while resumable interruption retains controls', async t => {
  const h = await harness(t);
  h.update({panel: 'downloads'});
  h.emit('onDownloads', [
    {id: 'terminal', filename: 'Terminal fixture', identity: 'personal', state: 'interrupted', terminal: true, canResume: false, paused: false, received: 10, total: 100},
    {id: 'resumable', filename: 'Resumable fixture', identity: 'work', state: 'interrupted', terminal: false, canResume: true, paused: false, received: 30, total: 100},
    {id: 'canceling', filename: 'Canceling fixture', identity: 'work', state: 'progressing', terminal: false, canResume: false, paused: false, received: 30, total: 100, cancelPending:true},
  ]);
  await painted(h, 'download-items');
  const cards = [...h.$('download-items').querySelectorAll('article')];
  const terminal = cards.find(card => card.querySelector('h2').textContent === 'Terminal fixture');
  const resumable = cards.find(card => card.querySelector('h2').textContent === 'Resumable fixture');
  const canceling = cards.find(card => card.querySelector('h2').textContent === 'Canceling fixture');
  assert.equal(terminal.querySelectorAll('button').length, 0);
  assert.deepEqual([...canceling.querySelectorAll('button')].map(button=>[button.textContent,button.disabled]),[['Canceling…',true]]);
  findButton(resumable, 'Resume').click(); await tick();
  assert.deepEqual(h.calls.at(-1), {name: 'download-action', value: {id: 'resumable', action: 'resume'}});
});

test('DOM: saved download history keeps restored results and scopes clear to the selected identity', async t => {
  const h = await harness(t);
  h.update({panel:'downloads',downloadHistory:{status:'ready',persistent:true,pendingCount:0,error:null,recoveryAvailable:false}});
  const rows=[
    {id:'old-complete',filename:'Saved completed file',identity:'personal',state:'completed',terminal:true,received:100,total:100,path:'/generated/completed.bin',restored:true,historySaved:true},
    {id:'old-interrupted',filename:'Saved unfinished file',identity:'personal',state:'interrupted',terminal:true,received:30,total:100,restored:true,interruptedByRestart:true,historySaved:true,error:'The previous process ended before a terminal result was saved. No native download is attached; restart or resume is not available.'},
    {id:'work-active',filename:'Active Work file',identity:'work',state:'progressing',terminal:false,received:20,total:100,hasNativeItem:true,historySaved:true},
  ];
  h.emit('onDownloads',rows);await painted(h,'download-items');
  const completed=[...h.$('download-items').querySelectorAll('article')].find(card=>card.querySelector('h2').textContent==='Saved completed file');
  const interrupted=[...h.$('download-items').querySelectorAll('article')].find(card=>card.querySelector('h2').textContent==='Saved unfinished file');
  assert.match(completed.textContent,/Restored from saved download history/);
  assert.deepEqual([...interrupted.querySelectorAll('button')].map(button=>button.textContent),['Remove from history']);
  findButton(completed,'Show in folder').click();await tick();
  assert.deepEqual(h.calls.at(-1),{name:'download-action',value:{id:'old-complete',action:'reveal'}});
  findButton(interrupted,'Remove from history').click();await tick();
  assert.deepEqual(h.calls.at(-1),{name:'download-history-remove',value:'old-interrupted'});
  const clear=h.$('download-history-clear');assert.equal(clear.textContent,'Clear saved history for Personal');assert.equal(clear.disabled,false);
  clear.click();await tick();assert.deepEqual(h.calls.at(-1),{name:'download-history-clear',value:'personal'});
  h.update({currentIdentity:'work'});assert.equal(clear.textContent,'Clear saved history for Work');assert.equal(clear.disabled,true);
  h.emit('onDownloads',rows.map(row=>row.id==='work-active'?{...row,state:'completed',terminal:true}:row));
  assert.equal(clear.disabled,false);
});

test('DOM: blocked download history exposes recovery while live transfer controls remain usable', async t => {
  const h=await harness(t);
  h.update({panel:'downloads',downloadHistory:{status:'recovery',persistent:true,pendingCount:1,error:'Generated checkpoint requires recovery.',recoveryAvailable:true}});
  h.emit('onDownloads',[
    {id:'saved',filename:'Saved record',identity:'personal',state:'completed',terminal:true,received:100,total:100,historySaved:true},
    {id:'live',filename:'Live pending record',identity:'personal',state:'progressing',terminal:false,received:20,total:100,hasNativeItem:true,historyPending:true},
  ]);await painted(h,'download-items');
  assert.match(h.$('download-history-error').textContent,/requires recovery/);
  assert.match(h.$('download-history-status').textContent,/1 transfer record has changes waiting/);
  assert.equal(h.$('download-history-clear').disabled,true);assert.equal(h.$('download-history-retry').hidden,true);assert.equal(h.$('download-history-recover').hidden,false);
  assert.equal(findButton(h.$('download-items'),'Remove from history').disabled,true);
  findButton(h.$('download-items'),'Pause').click();await tick();
  assert.deepEqual(h.calls.at(-1),{name:'download-action',value:{id:'live',action:'pause'}});
  h.$('download-history-recover').click();await tick();assert.equal(h.calls.at(-1).name,'download-history-recover');
  h.update({downloadHistory:{status:'error',persistent:true,pendingCount:1,error:'Generated write failure.',recoveryAvailable:false}});
  assert.equal(h.$('download-history-retry').hidden,false);assert.equal(h.$('download-history-recover').hidden,true);
  h.$('download-history-retry').click();await tick();assert.equal(h.calls.at(-1).name,'download-history-retry');
  h.update({downloadHistory:{status:'ready',persistent:true,pendingCount:0,error:null,recoveryAvailable:false}});
  assert.equal(h.$('download-history-error').hidden,true);assert.equal(h.$('download-history-retry').hidden,true);
});

test('DOM: a late history action completion cannot re-enable clear after identity or storage changes', async t => {
  let release;
  const h=await harness(t,{command:async name=>{if(name==='download-history-clear')await new Promise(resolve=>{release=resolve;});}});
  h.update({panel:'downloads',downloadHistory:{status:'ready',persistent:true,pendingCount:0,error:null,recoveryAvailable:false}});
  h.emit('onDownloads',[
    {id:'saved',filename:'Personal record',identity:'personal',state:'completed',terminal:true,received:1,total:1},
    {id:'live',filename:'Work transfer',identity:'work',state:'progressing',terminal:false,received:0,total:1,hasNativeItem:true},
  ]);
  h.$('download-history-clear').click();await tick();
  h.update({currentIdentity:'work',downloadHistory:{status:'error',persistent:true,pendingCount:1,error:'History changed externally.',recoveryAvailable:false}});
  release();await tick();await tick();
  assert.equal(h.$('download-history-clear').disabled,true);assert.equal(h.$('download-history-clear').textContent,'Clear saved history for Work');
  assert.match(h.$('download-history-error').textContent,/changed externally/);
  assert.deepEqual(h.calls.find(call=>call.name==='download-history-clear'),{name:'download-history-clear',value:'personal'});
});

test('DOM: permission controls retain requesting site, embedding site, selected identity and document scope', async t => {
  const h = await harness(t);
  h.update({panel: 'permissions', currentIdentity: 'work'});
  h.emit('onPermissions', {open: true, status: 'ready', error: '', items: [{id: 'rule-id', identity: 'work', requestingOrigin: 'https://child.test', embeddingOrigin: 'https://parent.test', permission: 'camera', decision: 'allow-once', scope: 'document'}]});
  await painted(h, 'permission-items');
  assert.match(h.$('permission-items').textContent, /this document only/);
  assert.match(h.$('permission-items').textContent, /Requesting site: https:\/\/child.test/);
  assert.match(h.$('permission-items').textContent, /Embedded by: https:\/\/parent.test/);
  findButton(h.$('permission-items'), 'Forget decision').click(); await tick();
  assert.deepEqual(h.calls.at(-1), {name: 'permission-revoke', value: 'rule-id'});
  h.$('permission-reset').click(); await tick();
  assert.deepEqual(h.calls.at(-1), {name: 'permission-reset', value: 'work'});
});

test('DOM: the real capability inventory renders all records and exposes source links through the browser command', async t => {
  const h = await harness(t);
  h.update({panel: 'capabilities'}); h.emit('onCapabilities', inventory);
  await painted(h, 'capability-items');
  assert.equal(h.$('capability-items').querySelectorAll('article').length, inventory.capabilities.length);
  assert.match(h.$('capability-coverage').textContent, /not an exhaustive|starting inventory|initial/i);
  const sourceButton = h.$('capability-items').querySelector('details button');
  assert.ok(sourceButton); sourceButton.click(); await tick();
  assert.equal(h.calls.at(-1).name, 'new');
  assert.ok(inventory.sources.some(item => item.url === h.calls.at(-1).value));
});

test('DOM: new tab remains next to the tab list in both layouts and invokes the real command', async t => {
  const h = await harness(t);
  const tabs = h.$('tabs'), create = h.$('new-tab');
  assert.equal(tabs.nextElementSibling, create);
  assert.equal(create.getAttribute('aria-label'), 'New tab');
  assert.equal(create.closest('nav'), null);
  create.click(); await tick();
  assert.equal(h.calls.at(-1).name, 'new');
  h.update({preferences:{searchEngine:'duckduckgo',tabLayout:'vertical'}});
  assert.equal(h.document.body.dataset.tabLayout, 'vertical');
  assert.equal(tabs.nextElementSibling, create);
  create.click(); await tick();
  assert.equal(h.calls.at(-1).name, 'new');
});

test('DOM: IME confirmation and cancellation do not execute browser input commands', async t => {
  const h = await harness(t);
  const key = (field, name, extra={}) => field.dispatchEvent(new h.window.KeyboardEvent('keydown', {key:name,bubbles:true,cancelable:true,...extra}));
  for (const id of ['identity-name','find','address']) {
    const field=h.$(id); field.hidden=false; h.input(field,'日本語');
    const before=h.calls.length;
    for (const extra of [{isComposing:true},{keyCode:229}]) {
      key(field,'Enter',extra); key(field,'Escape',extra);
      assert.equal(field.value,'日本語'); assert.equal(field.hidden,false);
    }
    field.dispatchEvent(new h.window.CompositionEvent('compositionstart',{bubbles:true}));
    key(field,'Enter'); key(field,'Escape');
    if(id==='address')h.submit(h.$('navigate'));
    await tick(); assert.equal(h.calls.length,before);
    assert.equal(field.value,'日本語'); assert.equal(field.hidden,false);
    field.dispatchEvent(new h.window.CompositionEvent('compositionend',{bubbles:true,data:'日本語'}));
  }
  key(h.$('identity-name'),'Enter'); await tick();
  assert.ok(h.calls.some(call=>call.name==='identity-add'&&call.value==='日本語'));
  key(h.$('find'),'Enter'); await tick();
  assert.ok(h.calls.some(call=>call.name==='find'&&call.value?.findNext===true));
  h.submit(h.$('navigate'));await tick();
  assert.ok(h.calls.some(call=>call.name==='navigate'&&call.value==='日本語'));
});

test('DOM: focus loss clears an abandoned address composition without losing its draft', async t => {
  const h=await harness(t), field=h.$('address');
  h.input(field,'draft after cancelled IME');
  field.dispatchEvent(new h.window.CompositionEvent('compositionstart'));
  field.dispatchEvent(new h.window.Event('blur'));
  h.submit(h.$('navigate'));await tick();
  assert.ok(h.calls.some(call=>call.name==='navigate'&&call.value==='draft after cancelled IME'));
});
