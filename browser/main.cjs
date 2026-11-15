'use strict';
// Browser lifecycle adapted from Herbertofury/Enderloom main.js (GPL-3.0-only).
const {app, BrowserWindow, WebContentsView, ipcMain, session, dialog, Menu, shell, webContents} = require('electron');
const path = require('node:path');
const crypto = require('node:crypto');
const {address, httpUrl, cleanState, inspectState, recoverState, SEARCH} = require('./state.cjs');
const storage = require('./storage.cjs');
const {SessionWriter} = require('./session-writer.cjs');
const {DownloadManager} = require('./downloads.cjs');
const {ExtensionManager} = require('./extensions.cjs');
const {createExtensionLoader} = require('./extension-runtime.cjs');
const {createIdentitySessionResolver} = require('./session-path.cjs');
const {PermissionManager} = require('./permissions.cjs');
const accountStore = require('./accounts.cjs');
const vaultStore = require('./vault.cjs');
app.enableSandbox();

let win, tabs = [], profiles = [{id:'personal', name:'Personal'}], activeId, currentIdentity = 'personal';
let originalSession = cleanState({}), preferences = originalSession.preferences;
let splitId = null, panel = null, closed = [], saveTimer, queuedPublish = false, closing = false, allowClose = false;
let writer, saveError = '', sessionFile, dataDirectory, downloads, permissions, extensions, extensionError = '';
let vaultFile, vaultDocument = {version:1, items:[]}, vaultError = '', vaultRecovery = null, vaultImport = null;
let accountFile, accounts = [], accountError = '', accountRecovery = null;
let permissionOpening = null, extensionBusy = false;
let resolveIdentitySession;
const configuredSessions = new Set(), identityInitializations = new Map(), extensionWindows = new Map(), pendingOperations = new Set();
const HEIGHT = 112, SIDEBAR = 210;
const active = () => tabs.find(tab => tab.id === activeId);
const send = (channel, value) => { if (win && !win.isDestroyed()) win.webContents.send(channel, value); };
const notice = message => send('notice', String(message));
function eventAction(action) {
  try { return action(); }
  catch (error) {
    notice(`Browser action could not finish: ${error.message}`);
    layout(); publish(false);
  }
}
function savedTab(tab) { return {...tab.saved, id:tab.id, url:tab.url, title:tab.title, identity:tab.identity}; }
function snapshot() { return {...originalSession, version:1, profiles, preferences, activeId, tabs:tabs.map(savedTab)}; }
function tabFromSaved(saved) { return {saved, id:saved.id, url:saved.url, title:saved.title, identity:saved.identity, view:null, loading:false, initializing:false}; }
function stateView() {
  return {version:1, profiles, preferences, activeId, currentIdentity, splitId, panel, closing, saveError,
    canRestore:closed.length > 0, tabs:tabs.map(tab => ({id:tab.id,url:tab.url,title:tab.title,identity:tab.identity,loading:tab.loading,live:!!tab.view})),
    canBack:active()?.view?.webContents.navigationHistory.canGoBack() || false,
    canForward:active()?.view?.webContents.navigationHistory.canGoForward() || false,
    engine:{electron:process.versions.electron, chromium:process.versions.chrome}};
}
function queueSave() {
  clearTimeout(saveTimer);
  if (!writer || closing || saveError) return;
  saveTimer = setTimeout(() => { try { writer.request(snapshot()); } catch (error) { saveError = error.message; publish(false); } }, 200);
}
function publish(durable = true) {
  if (durable) queueSave();
  if (queuedPublish) return;
  queuedPublish = true;
  setImmediate(() => { queuedPublish = false; send('state', stateView()); });
}
function publishVault() { send('vault', {items:vaultDocument.items, open:panel === 'vault', error:vaultError, recoveryAvailable:!!vaultRecovery, preview:vaultImport?.preview.summary || null}); }
function publishAccounts() { send('accounts', {accounts,profiles,open:panel === 'accounts',error:accountError,recoveryAvailable:!!accountRecovery}); }
function publishExtensions() { send('extensions', {items:extensions?.list() || [],profiles,currentIdentity,open:panel === 'extensions',error:extensionError,busy:extensionBusy}); }
function publishPermissions() { send('permissions', {items:permissions?.list() || [],profiles,open:panel === 'permissions',status:permissions?.status || 'blocked',error:permissions?.error || '',recoveryAvailable:permissions?.status === 'recovery'}); }
function layout() {
  if (!win || win.isDestroyed()) return;
  const [width,height] = win.getContentSize(), left = preferences.tabLayout === 'vertical' ? SIDEBAR : 0;
  const visible = [activeId,splitId].filter((id,index,array) => id && array.indexOf(id) === index);
  const available = Math.max(0,width-left), firstWidth = visible.length === 2 ? Math.floor(available/2) : available;
  for (const tab of tabs) {
    if (!tab.view) continue;
    const index = visible.indexOf(tab.id); tab.view.setVisible(index >= 0 && !panel);
    if (index >= 0) tab.view.setBounds({x:left + firstWidth*index,y:HEIGHT,width:index === 1 ? available-firstWidth : firstWidth,height:Math.max(0,height-HEIGHT)});
  }
}
function setPanel(value) {
  panel = panel === value ? null : value;
  layout(); publish(false); publishVault(); publishAccounts(); publishExtensions(); publishPermissions();
  if (panel === 'downloads') send('downloads', downloads.list());
  if (panel === 'capabilities') send('capabilities', require('./capabilities.json'));
}
function showPage() { if (panel) { panel = null; layout(); publish(false); publishVault(); publishAccounts(); publishExtensions(); publishPermissions(); } }
function identitySession(identity) {
  if (!profiles.some(profile => profile.id === identity)) throw new Error('Select an existing browser identity.');
  const partition = `persist:noxviola-identity-${identity}`, target = resolveIdentitySession(identity);
  if (!configuredSessions.has(partition)) {
    target.setPermissionCheckHandler(() => false); target.setPermissionRequestHandler((_wc,_permission,callback) => callback(false));
    permissions?.attach(target, identity); downloads?.attach(target, identity); configuredSessions.add(partition);
  }
  return target;
}
function identityReady(identity) {
  if (!identityInitializations.has(identity)) {
    identitySession(identity);
    const loading = extensionError ? Promise.resolve() : extensions.restoreIdentity(identity).then(publishExtensions).catch(error => { notice(`Extension startup: ${error.message}`); publishExtensions(); });
    identityInitializations.set(identity, loading);
  }
  return identityInitializations.get(identity);
}
function ensureView(tab) {
  if (tab.view || tab.url === 'about:blank') return tab.view;
  const view = new WebContentsView({webPreferences:{session:identitySession(tab.identity),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,spellcheck:true}});
  tab.view = view; tab.initializing = true; win.contentView.addChildView(view);
  const wc = view.webContents;
  wc.setWindowOpenHandler(({url}) => { if (httpUrl(url) && !closing) eventAction(() => newTab(url,tab.identity)); return {action:'deny'}; });
  wc.on('will-navigate', (event,url) => { if (!httpUrl(url)) event.preventDefault(); });
  wc.on('will-redirect', (event,url) => { if (!httpUrl(url)) event.preventDefault(); });
  wc.on('page-title-updated', (_event,title) => { if (!closing && tab.title !== title) { tab.title = title; publish(); } });
  wc.on('did-start-loading', () => { tab.loading = true; publish(false); });
  wc.on('did-stop-loading', () => { tab.loading = false; publish(false); });
  function navigated(_event,url) { const target = httpUrl(url); if (!closing && target && tab.url !== target) { tab.url = target; publish(); } else publish(false); }
  wc.on('did-navigate', navigated); wc.on('did-navigate-in-page', navigated);
  wc.on('render-process-gone', (_event,details) => { tab.loading = false; notice(`Tab stopped (${details.reason}). Reload to recover.`); publish(false); });
  wc.on('did-fail-load', (_event,code,description,_url,mainFrame) => { if (mainFrame && code !== -3) notice(`Page could not load: ${description}`); });
  wc.on('context-menu', (_event,params) => Menu.buildFromTemplate([
    {role:'copy',enabled:!!params.selectionText},{role:'paste',enabled:params.isEditable},
    {label:'Reload',click:()=>wc.reload()},
    {label:'Open link in new tab',enabled:!!httpUrl(params.linkURL),click:()=>eventAction(() => newTab(params.linkURL,tab.identity))}
  ]).popup({window:win}));
  layout();
  identityReady(tab.identity).then(() => {
    tab.initializing = false;
    if (!closing && tab.view === view && !wc.isDestroyed()) wc.loadURL(tab.url).catch(error => notice(`Navigation failed: ${error.message}`));
  });
  return view;
}
function activate(id) {
  const tab = tabs.find(row => row.id === id); if (!tab || closing) return;
  const changed = activeId !== id; activeId = id; currentIdentity = tab.identity;
  if (splitId === id) splitId = null;
  showPage(); ensureView(tab); layout(); publish(changed);
}
function newTab(url = 'about:blank', identity = currentIdentity, saved = null, position = tabs.length) {
  if (closing) return;
  if (!profiles.some(profile => profile.id === identity)) throw new Error('Unknown browser identity.');
  const target = address(url, preferences.searchEngine); if (!target) throw new Error('Use an HTTP(S) address without embedded credentials, or a search.');
  const record = saved || {id:crypto.randomUUID(),url:target,title:target === 'about:blank' ? 'New tab' : 'Loading…',identity};
  const tab = tabFromSaved({...record,url:target,identity});
  tabs.splice(Math.min(position,tabs.length),0,tab); activate(tab.id); publish(); return tab.id;
}
function removeView(tab) {
  if (!tab.view) return;
  const view = tab.view; tab.view = null;
  win.contentView.removeChildView(view); view.webContents.close();
}
function closeTab(id) {
  if (closing) return;
  const index = tabs.findIndex(tab => tab.id === id); if (index < 0) return;
  const [tab] = tabs.splice(index,1); closed.push({saved:savedTab(tab),position:index}); removeView(tab);
  if (splitId === id) splitId = null;
  if (!tabs.length) newTab();
  else if (activeId === id) activate(tabs[Math.min(index,tabs.length-1)].id);
  layout(); publish();
}
function restoreTab() {
  const record = closed.pop();
  if (record) newTab(record.saved.url,record.saved.identity,record.saved,record.position);
}
function navigate(value) {
  const url = address(value,preferences.searchEngine); if (!url) throw new Error('Use an HTTP(S) address without embedded credentials, or a search.');
  let tab = active(); if (!tab) return newTab(url);
  showPage(); tab.url = url;
  if (url === 'about:blank') { removeView(tab); tab.title = 'New tab'; }
  else if (!tab.view) ensureView(tab);
  else if (!tab.initializing) tab.view.webContents.loadURL(url).catch(error => notice(`Navigation failed: ${error.message}`));
  layout(); publish();
}
function trusted(event) { return win && !win.isDestroyed() && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame; }
function closeExtensionWindows(id, identity) {
  for (const [popup,record] of extensionWindows) if ((!id || record.id === id) && (!identity || record.identity === identity)) { popup.destroy(); extensionWindows.delete(popup); }
}
function extensionPage(id, identity, kind) {
  const url = extensions.pageFor(id,identity,kind), allowed = new URL(url);
  const popup = new BrowserWindow({parent:win,title:'Noxviola extension',width:kind === 'popup' ? 460 : 900,height:kind === 'popup' ? 600 : 700,
    webPreferences:{session:identitySession(identity),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  extensionWindows.set(popup,{id,identity}); popup.once('closed',()=>extensionWindows.delete(popup));
  popup.webContents.setWindowOpenHandler(({url:target}) => { if (httpUrl(target)) eventAction(() => newTab(target,identity)); return {action:'deny'}; });
  const stayInExtension = (event,target) => {
    let parsed;
    try { parsed = new URL(target); }
    catch { event.preventDefault(); notice('The extension requested an invalid address.'); return; }
    if (parsed.protocol !== 'chrome-extension:' || parsed.hostname !== allowed.hostname || parsed.port || parsed.username || parsed.password) {
      event.preventDefault();
      if (httpUrl(target)) eventAction(() => newTab(target,identity));
    }
  };
  popup.webContents.on('will-navigate',stayInExtension); popup.webContents.on('will-redirect',stayInExtension);
  popup.loadURL(url).catch(error=>notice(`Extension page failed: ${error.message}`));
}
async function extensionOperation(work) {
  if (extensionError) throw new Error(extensionError);
  if (extensionBusy) throw new Error('Wait for the current extension operation to finish.');
  extensionBusy = true; publishExtensions();
  try { return await work(); } finally { extensionBusy = false; publishExtensions(); }
}
async function confirmRecovery(label, file, store, opening) {
  const current = opening || store.inspect(file);
  if (current.status !== 'recovery') throw new Error('No recoverable checkpoint is available.');
  const choice = await dialog.showMessageBox(win,{type:'warning',title:`Restore ${label}`,message:`Restore the previous ${label}?`,detail:'The damaged current file will be preserved separately. Cancel leaves all existing files untouched.',buttons:['Cancel','Restore previous checkpoint'],defaultId:0,cancelId:0,noLink:true});
  if (choice.response !== 1) return false;
  store.recover(file,current.preview); return true;
}
async function perform(name, value) {
  const wc = active()?.view?.webContents;
  switch (name) {
    case 'state': return stateView();
    case 'new': return newTab(typeof value === 'string' ? value : 'about:blank');
    case 'activate': activate(value); break;
    case 'close': closeTab(value); break;
    case 'restore': restoreTab(); break;
    case 'duplicate': { const tab = active(); if (tab) newTab(tab.url,tab.identity,{...savedTab(tab),id:crypto.randomUUID()},tabs.indexOf(tab)+1); break; }
    case 'navigate': navigate(value); break;
    case 'back': if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); break;
    case 'forward': if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); break;
    case 'reload': if (wc) wc.reload(); break;
    case 'stop': wc?.stop(); break;
    case 'split': {
      if (splitId) splitId = null;
      else { const other = tabs.find(tab => tab.id !== activeId && tab.url !== 'about:blank'); if (other) {splitId = other.id;ensureView(other);} else notice('Open another website tab to use split view.'); }
      showPage(); layout(); publish(false); break;
    }
    case 'find': if (value) wc?.findInPage(String(value)); else wc?.stopFindInPage('clearSelection'); break;
    case 'zoom-in': if (wc) wc.setZoomLevel(wc.getZoomLevel()+0.5); break;
    case 'zoom-out': if (wc) wc.setZoomLevel(wc.getZoomLevel()-0.5); break;
    case 'identity-add': {
      const name = typeof value === 'string' ? value.trim() : ''; if (!name) throw new Error('Enter an identity name.');
      const profile = {id:crypto.randomUUID(),name}; profiles.push(profile); currentIdentity = profile.id; newTab(); break;
    }
    case 'identity-switch': {
      if (!profiles.some(profile => profile.id === value)) throw new Error('Unknown identity.');
      currentIdentity = value; const tab = tabs.find(row => row.identity === value); if (tab) activate(tab.id); else newTab(); break;
    }
    case 'settings-save': {
      if (!value || !Object.hasOwn(SEARCH,value.searchEngine) || !['horizontal','vertical'].includes(value.tabLayout)) throw new Error('Choose supported search and tab-layout options.');
      preferences = {...preferences,searchEngine:value.searchEngine,tabLayout:value.tabLayout}; layout(); publish(); break;
    }
    case 'save-session': writer.request(snapshot()); await writer.flush(); notice('Session saved.'); break;
    case 'tools': case 'vault': case 'accounts': case 'extensions': case 'downloads': case 'permissions': case 'settings': case 'capabilities': setPanel(name); break;
    case 'panel-close': panel = null; layout(); publish(false); publishVault(); publishAccounts(); publishExtensions(); publishPermissions(); break;
    case 'vault-add': case 'vault-save': {
      if (vaultError) throw new Error(vaultError);
      const updated = vaultStore.upsert(vaultDocument.items,value); vaultDocument = vaultStore.save(vaultFile,updated,vaultDocument); vaultImport = null; publishVault(); break;
    }
    case 'vault-star': case 'vault-archive': {
      if (vaultError) throw new Error(vaultError);
      const item = vaultDocument.items.find(row => row.id === value); if (!item) throw new Error('Library item not found.');
      const field = name === 'vault-star' ? 'favorite' : 'archived';
      vaultDocument = vaultStore.save(vaultFile,vaultStore.upsert(vaultDocument.items,{id:item.id,[field]:!item[field]}),vaultDocument); vaultImport = null; publishVault(); break;
    }
    case 'vault-open': { const item = vaultDocument.items.find(row => row.id === value); if (item) newTab(item.url); break; }
    case 'vault-bookmark': {
      const tab = active(); if (!tab || !httpUrl(tab.url)) throw new Error('Visit an HTTP(S) page before saving it.');
      panel = 'vault'; layout(); publish(false); publishVault(); send('vault-draft',{title:tab.title,url:tab.url,kind:'website'}); break;
    }
    case 'vault-import-preview': {
      if (vaultError) throw new Error(vaultError);
      const chosen = await dialog.showOpenDialog(win,{title:'Preview library backup',properties:['openFile'],filters:[{name:'JSON backup',extensions:['json']}]});
      if (chosen.canceled || !chosen.filePaths[0]) return null;
      const incoming = storage.parse(storage.readRegular(chosen.filePaths[0]));
      vaultImport = {base:structuredClone(vaultDocument),preview:vaultStore.previewImport(vaultDocument,incoming)}; publishVault(); return vaultImport.preview.summary;
    }
    case 'vault-import-apply': {
      if (!vaultImport) throw new Error('Preview a library backup first.');
      vaultDocument = vaultStore.applyImport(vaultFile,vaultImport.preview,vaultImport.base); vaultImport = null; publishVault(); break;
    }
    case 'vault-import-cancel': vaultImport = null; publishVault(); break;
    case 'vault-export': {
      if (vaultError) throw new Error(vaultError);
      const out = await dialog.showSaveDialog(win,{defaultPath:'noxviola-vault.json',filters:[{name:'JSON backup',extensions:['json']}]});
      if (!out.canceled && out.filePath) {vaultStore.exportFile(out.filePath,vaultDocument);notice('Library exported to the selected local file.');} break;
    }
    case 'vault-recover': if (await confirmRecovery('library',vaultFile,vaultStore,vaultRecovery)) {const opened = vaultStore.inspect(vaultFile);vaultDocument = opened.value;vaultRecovery = null;vaultError = '';publishVault();} break;
    case 'account-save': {
      if (accountError) throw new Error(accountError); const updated = accountStore.upsert(accounts,value,profiles); accountStore.save(accountFile,updated,accounts); accounts = updated; publishAccounts(); break;
    }
    case 'account-open': { const item = accounts.find(row => row.id === value); if (!item) throw new Error('Account not found.'); const target = accountStore.route(item,profiles); newTab(target.url,target.identity); break; }
    case 'account-archive': {
      if (accountError) throw new Error(accountError); const item = accounts.find(row => row.id === value); if (!item) throw new Error('Account not found.');
      const updated = accountStore.upsert(accounts,{...item,archived:!item.archived},profiles); accountStore.save(accountFile,updated,accounts);accounts = updated;publishAccounts();break;
    }
    case 'account-recover': if (await confirmRecovery('account inventory',accountFile,accountStore,accountRecovery)) {accounts = accountStore.load(accountFile);accountRecovery = null;accountError = '';publishAccounts();} break;
    case 'download-list': return downloads.list();
    case 'download-action': downloads.action(value?.id,value?.action); break;
    case 'permission-list': return permissions.list();
    case 'permission-revoke': await permissions.revoke(value); publishPermissions(); break;
    case 'permission-reset': await permissions.reset(value || undefined); publishPermissions(); break;
    case 'permission-recover': {
      if (permissionOpening?.status !== 'recovery') throw new Error('No permission checkpoint is available.');
      const choice = await dialog.showMessageBox(win,{type:'warning',message:'Restore previous site permission decisions?',detail:'This may restore earlier allow decisions. The current file will be preserved.',buttons:['Cancel','Restore'],defaultId:0,cancelId:0,noLink:true});
      if (choice.response === 1) {await permissions.recover(permissionOpening.preview);permissionOpening = permissions.open();publishPermissions();} break;
    }
    case 'extension-list': return extensions.list();
    case 'extension-preview-dialog': return extensionOperation(async () => {
      const directory = value === 'directory';
      const chosen = await dialog.showOpenDialog(win,{title:directory ? 'Inspect unpacked extension' : 'Inspect local extension package',properties:[directory ? 'openDirectory' : 'openFile'],...(directory ? {} : {filters:[{name:'Extension packages',extensions:['zip','xpi','crx']}]})});
      if (chosen.canceled || !chosen.filePaths[0]) return null;
      const preview = await extensions.preview(chosen.filePaths[0]); send('extension-preview',preview); return preview;
    });
    case 'extension-preview-cancel': return extensionOperation(() => extensions.cancelPreview(value));
    case 'extension-install': return extensionOperation(() => extensions.install(value?.token,{identities:value?.identities,permissionsAccepted:value?.permissionsAccepted === true,unsignedImportAccepted:value?.unsignedImportAccepted === true,allowFileAccess:false}));
    case 'extension-authorize': return extensionOperation(() => extensions.authorizeIdentity(value?.id,value?.identity,{permissionsAccepted:value?.permissionsAccepted === true,allowFileAccess:false}));
    case 'extension-enable': return extensionOperation(async () => { if (value?.enabled === false) closeExtensionWindows(value.id,value.identity); return extensions.setEnabled(value?.id,value?.identity,value?.enabled); });
    case 'extension-uninstall': return extensionOperation(async () => {
      const choice = await dialog.showMessageBox(win,{type:'question',message:'Uninstall this extension?',detail:'Its owned code and enrollment will be removed. Chromium extension storage remains in its original identities; data erasure is not yet implemented.',buttons:['Cancel','Uninstall'],defaultId:0,cancelId:0,noLink:true});
      if (choice.response !== 1) return null; closeExtensionWindows(value); return extensions.uninstall(value);
    });
    case 'extension-popup': case 'extension-options': extensionPage(value?.id,value?.identity,name === 'extension-popup' ? 'popup' : 'options'); break;
    default: throw new Error('Unknown browser command.');
  }
}
function command(event, payload = {}) {
  if (!trusted(event)) throw new Error('Untrusted browser command.');
  if (!payload || typeof payload.name !== 'string') throw new Error('Invalid browser command.');
  if (closing && !['state','extension-list','download-list','permission-list'].includes(payload.name)) throw new Error('Wait for the close attempt to finish.');
  const operation = Promise.resolve().then(() => perform(payload.name,payload.value));
  pendingOperations.add(operation); operation.finally(() => pendingOperations.delete(operation)).catch(() => {}); return operation;
}
function refreshLiveTabs() {
  for (const tab of tabs) if (tab.view && !tab.view.webContents.isDestroyed()) {
    tab.url = httpUrl(tab.view.webContents.getURL()) || tab.url; tab.title = tab.view.webContents.getTitle() || tab.title;
  }
}
function resumeAfterCloseError(message) {
  closing = false; refreshLiveTabs();
  notice(message); publish();
}
async function requestClose() {
  if (closing || allowClose || !win || win.isDestroyed()) return;
  closing = true; clearTimeout(saveTimer); publish(false);
  const pending = await Promise.allSettled([...pendingOperations]);
  const failed = pending.find(result => result.status === 'rejected');
  if (failed) {resumeAfterCloseError(`Close canceled: ${failed.reason.message}`);return;}
  if (downloads.activeCount()) {
    const choice = await dialog.showMessageBox(win,{type:'question',message:'Downloads are still active.',detail:'Closing now cancels the active downloads.',buttons:['Keep browser open','Cancel downloads and close'],defaultId:0,cancelId:0,noLink:true});
    if (choice.response !== 1) {resumeAfterCloseError('Downloads continue.');return;}
    downloads.cancelActive();
  }
  refreshLiveTabs();
  try { writer.request(snapshot()); await writer.flush(); }
  catch (error) {
    saveError = error.message;
    const choice = await dialog.showMessageBox(win,{type:'warning',message:'Recent tabs could not be saved.',detail:`${error.message}\nKeep the browser open to preserve important addresses, or explicitly exit without saving recent tabs.`,buttons:['Keep browser open','Exit without saving recent tabs'],defaultId:0,cancelId:0,noLink:true});
    if (choice.response !== 1) {resumeAfterCloseError('Close canceled. Fix the save error and choose Retry save.');return;}
  }
  closeExtensionWindows();
  try { if (!extensionError) await extensions.dispose(); } catch (error) { notice(error.message); }
  permissions.dispose(); downloads.dispose(); await writer.close().catch(() => {});
  allowClose = true; win.close();
}
async function start() {
  app.setAppUserModelId('org.noxviola.browser'); dataDirectory = app.getPath('userData'); sessionFile = path.join(dataDirectory,'browser-session.json');
  let restored = inspectState(sessionFile);
  if (restored.status === 'recovery') {
    const choice = await dialog.showMessageBox({type:'warning',title:'Recover your Noxviola session',message:'The current session needs recovery.',detail:`${restored.reason}\nRestore the previous checkpoint? The current file will be preserved separately.`,buttons:['Exit without changing files','Restore previous checkpoint'],defaultId:0,cancelId:0,noLink:true});
    if (choice.response !== 1) {app.quit();return;}
    restored = {value:recoverState(sessionFile,restored.preview).value};
  }
  originalSession = restored.value; profiles = originalSession.profiles; preferences = originalSession.preferences;
  resolveIdentitySession = createIdentitySessionResolver({session,root:app.getPath('sessionData')});
  tabs = originalSession.tabs.map(tabFromSaved); activeId = originalSession.activeId;
  currentIdentity = active()?.identity || 'personal';
  vaultFile = path.join(dataDirectory,'private-vault.json'); accountFile = path.join(dataDirectory,'private-accounts.json');
  try { const opened = vaultStore.inspect(vaultFile); if (opened.status === 'recovery') {vaultRecovery = opened;vaultError = 'The library needs explicit recovery before editing.';} else vaultDocument = opened.value; } catch (error) {vaultError = error.message;}
  try { const opened = accountStore.inspect(accountFile); if (opened.status === 'recovery') {accountRecovery = opened;accountError = 'The account inventory needs explicit recovery before editing.';} else accounts = opened.value.accounts; } catch (error) {accountError = error.message;}
  permissions = new PermissionManager({file:path.join(dataDirectory,'site-permissions.json'),onChange:publishPermissions,prompt:async request => {
    if (closing || !win || win.isDestroyed() || request.signal?.aborted) return 'block';
    const identity = profiles.find(profile => profile.id === request.identity)?.name || request.identity;
    const response = await dialog.showMessageBox(win,{type:'question',title:'Site permission',message:`Allow ${request.permissions.join(' and ')}?`,detail:`Requesting site: ${request.requestingOrigin}\nEmbedded by: ${request.embeddingOrigin}\nIdentity: ${identity}`,buttons:['Block','Allow once','Always allow'],defaultId:0,cancelId:0,noLink:true,signal:request.signal});
    if (closing || request.signal?.aborted) return 'block';
    return response.response === 2 ? 'allow' : response.response === 1 ? 'allow-once' : 'block';
  }});
  try {permissionOpening = permissions.open();} catch (error) {permissionOpening = {status:'blocked',error:error.message};}
  downloads = new DownloadManager({directory:app.getPath('downloads'),reveal:file => shell.showItemInFolder(file)});
  downloads.on('change', rows => { if (panel === 'downloads') send('downloads',rows); });
  extensions = new ExtensionManager({directory:path.join(dataDirectory,'extensions'),getSession:identitySession,getIdentities:() => profiles.map(profile => profile.id),loadExtension:createExtensionLoader({app,webContents})});
  try {await extensions.open();} catch (error) {extensionError = error.message;}
  session.defaultSession.setPermissionCheckHandler(() => false); session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback) => callback(false));
  writer = new SessionWriter(sessionFile); writer.on('result',result => {saveError = result.error || '';if (result.error) notice(`Session not saved: ${result.error}`);publish(false);});
  win = new BrowserWindow({title:'Noxviola',width:1320,height:860,minWidth:700,minHeight:480,backgroundColor:'#171122',webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  win.webContents.setWindowOpenHandler(() => ({action:'deny'})); win.webContents.on('will-navigate',event => event.preventDefault());
  ipcMain.handle('command',command); win.on('resize',layout);
  win.on('close',event => {if (!allowClose) {event.preventDefault();requestClose().catch(error => resumeAfterCloseError(error.message));}});
  win.webContents.on('did-finish-load',() => {
    eventAction(() => {if (tabs.length) {ensureView(active() || tabs[0]);layout();publish(false);} else newTab();});
    publishVault();publishAccounts();publishExtensions();publishPermissions();
  });
  const invoke = (name,value) => {if (!closing) perform(name,value).catch(error => {notice(error.message);layout();publish(false);});};
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Browser',submenu:[
    {label:'New tab',accelerator:'CmdOrCtrl+T',click:() => invoke('new')},
    {label:'Close tab',accelerator:'CmdOrCtrl+W',click:() => panel ? invoke('panel-close') : invoke('close',activeId)},
    {label:'Reopen closed tab',accelerator:'CmdOrCtrl+Shift+T',click:() => invoke('restore')},
    {label:'Duplicate tab',accelerator:'CmdOrCtrl+Shift+D',click:() => invoke('duplicate')},
    {label:'Address',accelerator:'CmdOrCtrl+L',click:() => {showPage();send('focus-address');}},
    {label:'Find',accelerator:'CmdOrCtrl+F',click:() => send('focus-find')},
    {label:'Save current page',accelerator:'CmdOrCtrl+D',click:() => invoke('vault-bookmark')},
    {label:'Downloads',accelerator:'CmdOrCtrl+J',click:() => invoke('downloads')},
    {role:'quit'}
  ]}]));
  await win.loadFile(path.join(__dirname,'index.html'));
}
if (!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(start).catch(error => {dialog.showErrorBox('Noxviola could not open safely',`${error.message}\nExisting data was preserved.`);app.quit();});
app.on('second-instance',() => {win?.show();win?.focus();});
app.on('before-quit',event => {if (win && !win.isDestroyed() && !allowClose) {event.preventDefault();requestClose().catch(error => resumeAfterCloseError(error.message));}});
app.on('window-all-closed',() => app.quit());
