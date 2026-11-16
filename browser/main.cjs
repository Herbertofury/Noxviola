'use strict';
// Browser lifecycle adapted from Herbertofury/Enderloom main.js (GPL-3.0-only).
const {app, BrowserWindow, WebContentsView, ipcMain, session, dialog, Menu, shell, webContents, nativeImage} = require('electron');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');
const {EventEmitter} = require('node:events');
const {address, httpUrl, cleanState, inspectState, recoverState, SEARCH} = require('./state.cjs');
const preferenceStore = require('./preferences.cjs');
const {ResourceMonitor} = require('./resources.cjs');
const {SpellcheckService} = require('./spellcheck.cjs');
const {HistoryService} = require('./history.cjs');
const {BookmarkService,rootIds:bookmarkRootIds} = require('./bookmarks.cjs');
const {WorkspaceService} = require('./workspaces.cjs');
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
let resolveIdentitySession, history, bookmarks, workspaces, resourceMonitor, extensionBridge, spellcheck;
let activeWorkspaceId = 'default', nextRuntimeTabId = 1, preferencePreview = null;
const runtimeTabs = new Map(), nativeTabs = new Map(), sessionTargets = new Map(), browserEvents = new EventEmitter();
const configuredSessions = new Set(), identityInitializations = new Map(), extensionWindows = new Map(), pendingOperations = new Set();
const HEIGHT = 112, SIDEBAR = 210;
const chromeHeight = () => HEIGHT + (preferences.showBookmarksBar ? 32 : 0);
const active = () => tabs.find(tab => tab.id === activeId);
const tabWorkspace = tab => tab.saved.workspaceId || 'default';
const visibleTabs = () => tabs.filter(tab => tabWorkspace(tab) === activeWorkspaceId);
const hostEvent = (identity,event,...args) => browserEvents.emit('event',{identity,event,args});
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
function snapshot() { return {...originalSession, version:1, profiles, preferences, activeId, activeWorkspaceId, tabs:tabs.map(savedTab)}; }
function tabFromSaved(saved) {
  const tab = {saved, id:saved.id, runtimeId:nextRuntimeTabId++,url:saved.url,title:saved.title,identity:saved.identity,view:null,loading:false,initializing:false};
  runtimeTabs.set(tab.runtimeId,tab);return tab;
}
function tabDescriptor(tab) {
  const wc=tab.view?.webContents;
  return {id:tab.runtimeId,identity:tab.identity,index:tabs.filter(row=>row.identity===tab.identity).indexOf(tab),windowId:win?.id||1,
    active:tab.id===activeId,highlighted:tab.id===activeId,pinned:!!tab.saved.pinned,incognito:false,discarded:!wc,
    status:tab.loading?'loading':'complete',title:tab.title,url:tab.url,audible:wc?.isCurrentlyAudible()||false,
    mutedInfo:{muted:wc?.isAudioMuted()??!!tab.saved.muted},groupId:-1,autoDiscardable:false};
}
function stateView() {
  return {version:1, profiles, preferences, activeId, currentIdentity, splitId, panel, closing, saveError,
    activeWorkspaceId,chromeHeight:chromeHeight(),shortcuts:preferenceStore.shortcutList(preferences),downloadHistory:downloads?.getStatus(),
    canRestore:closed.length > 0, tabs:tabs.map(tab => ({id:tab.id,url:tab.url,title:tab.title,identity:tab.identity,loading:tab.loading,live:!!tab.view,
      workspaceId:tabWorkspace(tab),groupId:tab.saved.groupId||null,pinned:!!tab.saved.pinned,muted:tab.view?.webContents.isAudioMuted()??!!tab.saved.muted,audible:tab.view?.webContents.isCurrentlyAudible()||false})),
    canBack:active()?.view?.webContents.navigationHistory.canGoBack() || false,
    canForward:active()?.view?.webContents.navigationHistory.canGoForward() || false,
    engine:{electron:process.versions.electron,chromium:process.versions.chrome,isPackaged:app.isPackaged,appVersion:app.getVersion()}};
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
function publishExtensionActions() {send('extension-actions',extensionBridge?.actionState(currentIdentity,active()?.runtimeId)||[]);}
function publishPermissions() { send('permissions', {items:permissions?.list() || [],profiles,open:panel === 'permissions',status:permissions?.status || 'blocked',error:permissions?.error || '',recoveryAvailable:permissions?.status === 'recovery'}); }
function serviceView(service, read) {
  try{return {status:service?.status||'blocked',error:service?.error||'',recoveryAvailable:service?.status==='recovery',...read()};}
  catch(error){return {status:service?.status||'blocked',error:error.message,recoveryAvailable:service?.status==='recovery'};}
}
function publishHistory() { if(panel==='history')send('history',serviceView(history,()=>({identity:currentIdentity,...history.query(currentIdentity,{}),settings:history.settings(currentIdentity)}))); }
function publishBookmarks() { if(panel==='bookmarks'||preferences.showBookmarksBar)send('bookmarks',serviceView(bookmarks,()=>({identity:currentIdentity,tree:bookmarks.getTree(currentIdentity)}))); }
function publishWorkspaces() { send('workspaces',serviceView(workspaces,()=>({items:workspaces.list(),groups:workspaces.list().flatMap(item=>workspaces.listGroups(item.id)),activeWorkspaceId}))); }
function recordHistory(tab,url) {
  if(!httpUrl(url)||!history)return;
  try{history.record(tab.identity,{url,title:tab.title,transition:tab.pendingTransition||'link'});tab.committedURL=url;tab.pendingTransition=null;}
  catch(error){notice(`History was not saved: ${error.message}`);}
}
function layout() {
  if (!win || win.isDestroyed()) return;
  const [width,height] = win.getContentSize(), left = preferences.tabLayout === 'vertical' ? SIDEBAR : 0;
  const visible = [activeId,splitId].filter((id,index,array) => id && array.indexOf(id) === index);
  const available = Math.max(0,width-left), firstWidth = visible.length === 2 ? Math.floor(available/2) : available;
  for (const tab of tabs) {
    if (!tab.view) continue;
    const index = visible.indexOf(tab.id); tab.view.setVisible(index >= 0 && !panel);
    if (index >= 0) tab.view.setBounds({x:left + firstWidth*index,y:chromeHeight(),width:index === 1 ? available-firstWidth : firstWidth,height:Math.max(0,height-chromeHeight())});
  }
}
function setPanel(value) {
  panel = panel === value ? null : value;
  layout(); publish(false); publishVault(); publishAccounts(); publishExtensions(); publishPermissions();
  publishHistory();publishBookmarks();publishWorkspaces();
  if (panel === 'downloads') send('downloads', downloads.list());
  if (panel === 'capabilities') send('capabilities', require('./capabilities.json'));
  if (panel === 'resources') send('resources',resourceMonitor.sample());
}
function showPage() { if (panel) { panel = null; layout(); publish(false); publishVault(); publishAccounts(); publishExtensions(); publishPermissions(); } }
function identitySession(identity) {
  if (!profiles.some(profile => profile.id === identity)) throw new Error('Select an existing browser identity.');
  const partition = `persist:noxviola-identity-${identity}`, target = resolveIdentitySession(identity);
  sessionTargets.set(identity,target);
  if (!configuredSessions.has(partition)) {
    spellcheck.attach(target);
    target.setPermissionCheckHandler(() => false); target.setPermissionRequestHandler((_wc,_permission,callback) => callback(false));
    permissions?.attach(target, identity); downloads?.attach(target, identity); extensionBridge?.attachSession(target); configuredSessions.add(partition);
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
  nativeTabs.set(wc.id,tab);wc.setAudioMuted(!!tab.saved.muted);
  wc.setWindowOpenHandler(({url}) => { if (httpUrl(url) && !closing) eventAction(() => newTab(url,tab.identity)); return {action:'deny'}; });
  wc.on('will-navigate', (event,url) => { if (!httpUrl(url)) event.preventDefault(); });
  wc.on('will-redirect', (event,url) => { if (!httpUrl(url)) event.preventDefault(); });
  wc.on('page-title-updated', (_event,title) => { if (!closing && tab.title !== title) {
    tab.title = title;publish();hostEvent(tab.identity,'tabs.onUpdated',tab.runtimeId,{title},tabDescriptor(tab));
    if(tab.committedURL===httpUrl(wc.getURL()))try{history?.updateTitle(tab.identity,tab.committedURL,title);}catch(error){notice(`History title was not saved: ${error.message}`);}
  } });
  wc.on('did-start-loading', () => {tab.loading=true;publish(false);hostEvent(tab.identity,'tabs.onUpdated',tab.runtimeId,{status:'loading'},tabDescriptor(tab));});
  wc.on('did-stop-loading', () => {tab.loading=false;publish(false);hostEvent(tab.identity,'tabs.onUpdated',tab.runtimeId,{status:'complete'},tabDescriptor(tab));});
  wc.on('audio-state-changed',()=>{publish(false);hostEvent(tab.identity,'tabs.onUpdated',tab.runtimeId,{audible:wc.isCurrentlyAudible()},tabDescriptor(tab));});
  wc.on('found-in-page',(_event,result)=>{if(tab.id===activeId)send('find-result',result);});
  function navigated(_event,url,isMainFrame=true,sameDocument=false) {
    if(isMainFrame===false)return;const target=httpUrl(url);
    if(!closing&&target){tab.url=target;recordHistory(tab,target);const zoom=originalSession.siteZooms?.[tab.identity]?.[new URL(target).origin];if(zoom!==undefined)wc.setZoomFactor(zoom);publish();hostEvent(tab.identity,'tab-navigation-committed',tab.runtimeId,{sameDocument});hostEvent(tab.identity,'tabs.onUpdated',tab.runtimeId,{url:target},tabDescriptor(tab));}else publish(false);
  }
  wc.on('did-navigate', (event,url)=>navigated(event,url,true,false));
  wc.on('did-navigate-in-page', (event,url,isMainFrame)=>navigated(event,url,isMainFrame,true));
  wc.on('render-process-gone', (_event,details) => { tab.loading = false; notice(`Tab stopped (${details.reason}). Reload to recover.`); publish(false); });
  wc.on('did-fail-load', (_event,code,description,_url,mainFrame) => { if (mainFrame && code !== -3) notice(`Page could not load: ${description}`); });
  wc.on('context-menu', (_event,params) => Menu.buildFromTemplate([
    ...spellcheck.contextMenu(wc,params),
    {role:'copy',enabled:!!params.selectionText},{role:'paste',enabled:params.isEditable},
    {label:'Reload',click:()=>{if(!closing&&!wc.isDestroyed())wc.reload();}},
    {label:'Open link in new tab',enabled:!!httpUrl(params.linkURL),click:()=>eventAction(() => newTab(params.linkURL,tab.identity))},
    {label:'Copy link address',enabled:!!httpUrl(params.linkURL),click:()=>require('electron').clipboard.writeText(params.linkURL)},
    {type:'separator'},...(extensionBridge?.contextMenuItems(tab.identity,tab.runtimeId,params)||[])
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
  const changed = activeId !== id; activeId = id; currentIdentity = tab.identity;activeWorkspaceId=tabWorkspace(tab);
  if (splitId === id) splitId = null;
  showPage(); ensureView(tab); layout(); publish(changed);publishBookmarks();publishWorkspaces();publishExtensionActions();
  if(changed)hostEvent(tab.identity,'tabs.onActivated',{tabId:tab.runtimeId,windowId:win.id});
}
function newTab(url = 'about:blank', identity = currentIdentity, saved = null, position = tabs.length, options = {}) {
  if (closing) return;
  if (!profiles.some(profile => profile.id === identity)) throw new Error('Unknown browser identity.');
  const target = address(url,preferences.searchEngine,preferences.customSearchURL); if (!target) throw new Error('Use an HTTP(S) address without embedded credentials, or a search.');
  const record = saved || {id:crypto.randomUUID(),url:target,title:target === 'about:blank' ? 'New tab' : 'Loading…',identity,workspaceId:activeWorkspaceId};
  const tab = tabFromSaved({...record,url:target,identity});
  const foreground=options.active!==false||!active();
  tabs.splice(Math.min(position,tabs.length),0,tab);hostEvent(tab.identity,'tabs.onCreated',{...tabDescriptor(tab),active:foreground,highlighted:foreground});
  if(foreground)activate(tab.id);else ensureView(tab);publish();
  if(foreground&&target==='about:blank')send('focus-address');return tab.id;
}
function removeView(tab) {
  if (!tab.view) return;
  const view = tab.view; tab.view = null;
  nativeTabs.delete(view.webContents.id);win.contentView.removeChildView(view);view.webContents.close();
}
function closeTab(id) {
  if (closing) return;
  const index = tabs.findIndex(tab => tab.id === id); if (index < 0) return;
  const [tab] = tabs.splice(index,1); closed.push({saved:savedTab(tab),position:index}); removeView(tab);runtimeTabs.delete(tab.runtimeId);
  hostEvent(tab.identity,'tabs.onRemoved',tab.runtimeId,{windowId:win.id,isWindowClosing:false});
  if (splitId === id) splitId = null;
  if (!tabs.length) newTab();
  else if (activeId === id) {const candidates=visibleTabs();if(candidates.length)activate(candidates[Math.min(index,candidates.length-1)].id);else newTab();}
  layout(); publish();
}
function restoreTab() {
  const record = closed.pop();
  if (record) newTab(record.saved.url,record.saved.identity,record.saved,record.position);
}
function navigate(value) {
  const url = address(value,preferences.searchEngine,preferences.customSearchURL); if (!url) throw new Error('Use an HTTP(S) address without embedded credentials, or a search.');
  let tab = active(); if (!tab) return newTab(url);
  showPage(); tab.url = url;tab.pendingTransition='typed';
  if (url === 'about:blank') { removeView(tab); tab.title = 'New tab';hostEvent(tab.identity,'tab-navigation-committed',tab.runtimeId,{sameDocument:false}); }
  else if (!tab.view) ensureView(tab);
  else if (!tab.initializing) tab.view.webContents.loadURL(url).catch(error => notice(`Navigation failed: ${error.message}`));
  layout(); publish();
}
function focusChrome(channel) {win.webContents.focus();send(channel);}
function findTab(id) {const tab=tabs.find(row=>row.id===id);if(!tab)throw new Error('Tab not found.');return tab;}
function runtimeTab(identity,id) {const tab=runtimeTabs.get(id);if(!tab||tab.identity!==identity)throw new Error('No tab with this ID exists in this browser identity.');return tab;}
function moveTab(tab,index) {
  if(!Number.isInteger(index)||index<0||index>=tabs.length)throw new Error('Choose an existing tab position.');
  const before=tabDescriptor(tab).index,old=tabs.indexOf(tab);tabs.splice(old,1);tabs.splice(index,0,tab);
  publish();hostEvent(tab.identity,'tabs.onMoved',tab.runtimeId,{windowId:win.id,fromIndex:before,toIndex:tabDescriptor(tab).index});
}
function pinTab(tab,pinned) {
  if(typeof pinned!=='boolean')throw new Error('Choose whether this tab is pinned.');
  if(Boolean(tab.saved.pinned)===pinned)return;
  const before=tabDescriptor(tab).index;
  tab.saved={...tab.saved,pinned};
  const peers=tabs.filter(row=>row!==tab&&tabWorkspace(row)===tabWorkspace(tab));
  const anchor=pinned?peers.find(row=>!row.saved.pinned):peers.filter(row=>row.saved.pinned).at(-1);
  if(anchor){const old=tabs.indexOf(tab);tabs.splice(old,1);const position=tabs.indexOf(anchor)+(pinned?0:1);tabs.splice(position,0,tab);}
  publish();hostEvent(tab.identity,'tabs.onUpdated',tab.runtimeId,{pinned},tabDescriptor(tab));
  if(before!==tabDescriptor(tab).index)hostEvent(tab.identity,'tabs.onMoved',tab.runtimeId,{windowId:win.id,fromIndex:before,toIndex:tabDescriptor(tab).index});
}
function muteTab(tab,muted) {
  if(typeof muted!=='boolean')throw new Error('Choose whether this tab is muted.');
  if(Boolean(tab.saved.muted)===muted&&(!tab.view||tab.view.webContents.isAudioMuted()===muted))return;
  tab.saved={...tab.saved,muted};tab.view?.webContents.setAudioMuted(muted);publish();
  hostEvent(tab.identity,'tabs.onUpdated',tab.runtimeId,{mutedInfo:{muted}},tabDescriptor(tab));
}
function assignTab(tab,workspaceId,groupId=null) {
  workspaces.get(workspaceId);
  if(groupId&&!workspaces.listGroups(workspaceId).some(group=>group.id===groupId))throw new Error('Choose a group in the selected workspace.');
  if(tabWorkspace(tab)===workspaceId&&(tab.saved.groupId||null)===groupId)return;
  tab.saved={...tab.saved,workspaceId,groupId};
  if(tab.id===activeId){activeWorkspaceId=workspaceId;splitId=null;}
  if(splitId===tab.id&&workspaceId!==activeWorkspaceId)splitId=null;
  layout();publish();publishWorkspaces();
}
function windowDescriptor(identity,populate=false) {
  const bounds=win.getBounds();
  return {id:win.id,focused:win.isFocused(),left:bounds.x,top:bounds.y,width:bounds.width,height:bounds.height,incognito:false,type:'normal',state:win.isFullScreen()?'fullscreen':win.isMinimized()?'minimized':win.isMaximized()?'maximized':'normal',alwaysOnTop:win.isAlwaysOnTop(),...(populate?{tabs:tabs.filter(tab=>tab.identity===identity).map(tabDescriptor)}:{})};
}
function extensionHost() {
  function options(value,allowed,booleans=[]) {
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('API options must be an object.');
    for(const key of Object.keys(value))if(!allowed.includes(key))throw new Error(`This browser does not support the ${key} option.`);
    for(const key of booleans)if(value[key]!==undefined&&typeof value[key]!=='boolean')throw new Error(`${key} must be a boolean.`);
    return value;
  }
  return {
    messageSource:nativeId=>{
      const contents=webContents.fromId(nativeId);
      if(!contents||contents.isDestroyed())return null;
      return {contents,owner:extensionWindows.get(BrowserWindow.fromWebContents(contents))||null};
    },
    tabs:{
      list:identity=>tabs.filter(tab=>tab.identity===identity).map(tabDescriptor),
      get:(identity,id)=>tabDescriptor(runtimeTab(identity,id)),
      nativeId:(identity,id)=>runtimeTab(identity,id).view?.webContents.id??null,
      browserId:(identity,id)=>{const tab=nativeTabs.get(id);return tab?.identity===identity?tab.runtimeId:null;},
      create:(identity,properties={})=>{
        options(properties,['windowId','url','index','active','pinned'],['active','pinned']);
        if(properties.windowId!==undefined&&properties.windowId!==win.id)throw new Error('The requested browser window does not exist.');
        const url=properties.url===undefined?'about:blank':properties.url;
        if(url!=='about:blank'&&!httpUrl(url))throw new Error('This tab URL is not supported.');
        const position=properties.index===undefined?tabs.length:tabs.indexOf(tabs.filter(tab=>tab.identity===identity)[properties.index]);
        if(properties.index!==undefined&&(!Number.isInteger(properties.index)||properties.index<0||properties.index>tabs.filter(tab=>tab.identity===identity).length))throw new Error('Invalid new-tab index.');
        const id=newTab(url,identity,null,position<0?tabs.length:position,{active:properties.active!==false}),tab=findTab(id);
        if(properties.pinned!==undefined)pinTab(tab,properties.pinned);
        return tabDescriptor(tab);
      },
      update:(identity,id,properties={})=>{
        options(properties,['url','pinned','muted','active'],['pinned','muted','active']);
        if(properties.url!==undefined&&properties.url!=='about:blank'&&!httpUrl(properties.url))throw new Error('This tab URL is not supported.');
        const tab=id===undefined?tabs.find(row=>row.identity===identity&&row.id===activeId):runtimeTab(identity,id);
        if(!tab)throw new Error('No active tab in this browser identity.');
        if(properties.url!==undefined){if(properties.url!=='about:blank'&&!httpUrl(properties.url))throw new Error('This tab URL is not supported.');tab.url=properties.url;tab.pendingTransition='link';
          if(tab.url==='about:blank'){removeView(tab);tab.title='New tab';hostEvent(tab.identity,'tab-navigation-committed',tab.runtimeId,{sameDocument:false});}else if(!tab.view)ensureView(tab);else if(!tab.initializing)tab.view.webContents.loadURL(tab.url).catch(error=>notice(error.message));}
        if(properties.pinned!==undefined)pinTab(tab,properties.pinned);if(properties.muted!==undefined)muteTab(tab,properties.muted);
        if(properties.active===true)activate(tab.id);else if(properties.active!==undefined&&properties.active!==false)throw new Error('active must be a boolean.');
        layout();publish();return tabDescriptor(tab);
      },
      remove:(identity,ids)=>{const selected=(Array.isArray(ids)?ids:[ids]).map(id=>runtimeTab(identity,id));for(const tab of selected)closeTab(tab.id);},
      move:(identity,ids,properties)=>{
        if(properties?.windowId!==undefined&&properties.windowId!==win.id)throw new Error('The requested window does not exist.');
        const selected=(Array.isArray(ids)?ids:[ids]).map(id=>runtimeTab(identity,id));let index=properties?.index;
        const count=tabs.filter(tab=>tab.identity===identity).length;if(index===-1)index=count-1;
        if(!Number.isInteger(index)||index<0||index>=count)throw new Error('Invalid tab index.');
        for(const tab of selected){const peers=tabs.filter(row=>row.identity===identity),anchor=peers[Math.min(index,peers.length-1)];moveTab(tab,tabs.indexOf(anchor));index++;}
        return Array.isArray(ids)?selected.map(tabDescriptor):tabDescriptor(selected[0]);
      },
      reload:(identity,id,options={})=>{const tab=id===undefined?tabs.find(row=>row.identity===identity&&row.id===activeId):runtimeTab(identity,id);if(!tab)throw new Error('No active tab in this browser identity.');
        if(tab.url==='about:blank')return;if(!tab.view)ensureView(tab);else if(options.bypassCache)tab.view.webContents.reloadIgnoringCache();else tab.view.webContents.reload();},
    },
    windows:{
      getCurrent:(identity,options={})=>windowDescriptor(identity,!!options.populate),
      getAll:(identity,options={})=>[windowDescriptor(identity,!!options.populate)],
      update:(identity,id,properties={})=>{
        options(properties,['left','top','width','height','state','focused'],['focused']);
        if(properties.focused===false)throw new Error('Defocusing a browser window is not supported by this host.');
        if(id!==win.id)throw new Error('The requested window does not exist.');
        if(properties.state!==undefined&&!['normal','minimized','maximized','fullscreen'].includes(properties.state))throw new Error('Unsupported window state.');
        const bounds={};for(const key of ['left','top','width','height'])if(properties[key]!==undefined){if(!Number.isInteger(properties[key])||(['width','height'].includes(key)&&properties[key]<=0))throw new Error('Invalid window bounds.');bounds[key==='left'?'x':key==='top'?'y':key]=properties[key];}
        if(Object.keys(bounds).length)win.setBounds(bounds);
        if(properties.state==='fullscreen')win.setFullScreen(true);else if(properties.state){win.setFullScreen(false);if(properties.state==='maximized')win.maximize();else if(properties.state==='minimized')win.minimize();else{win.restore();win.unmaximize();}}
        if(properties.focused===true){win.show();win.focus();}else if(properties.focused!==undefined&&properties.focused!==false)throw new Error('focused must be a boolean.');
        return windowDescriptor(identity);
      },
    },
    bookmarks,history,
    actionsChanged:()=>publishExtensionActions(),
    runOperation:work=>{
      if(closing)throw new Error('The browser is finishing pending work and closing.');
      const operation=Promise.resolve().then(work),settled=operation.then(()=>undefined,()=>undefined);pendingOperations.add(settled);settled.finally(()=>pendingOperations.delete(settled)).catch(()=>{});return operation;
    },
    subscribe:listener=>{browserEvents.on('event',listener);return()=>browserEvents.off('event',listener);},
    openExtensionPage:({identity,runtimeId,url})=>openExtensionURL(identity,runtimeId,url),
  };
}
function trusted(event) { return win && !win.isDestroyed() && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame; }
function closeExtensionWindows(id, identity) {
  for (const [popup,record] of extensionWindows) if ((!id || record.id === id) && (!identity || record.identity === identity)) { popup.destroy(); extensionWindows.delete(popup); }
}
function extensionPage(id, identity, kind) {
  const url=extensions.pageFor(id,identity,kind);return openExtensionURL(identity,new URL(url).hostname,url,kind,id);
}
function openExtensionURL(identity,runtimeId,url,kind='popup',id) {
  const item=extensions.list().find(row=>row.identities.some(grant=>grant.identity===identity&&grant.runtimeId===runtimeId&&grant.enabled&&grant.status==='loaded'));
  const allowed=new URL(url);
  if(!item||allowed.protocol!=='chrome-extension:'||allowed.hostname!==runtimeId||allowed.port||allowed.username||allowed.password)throw new Error('The extension page is not currently authorized in this identity.');
  id ||= item.id;
  const partition=identitySession(identity),context=extensions.runtimeContext(partition,runtimeId);
  if(!context||context.id!==id)throw new Error('The extension page has no current runtime enrollment.');
  const popup = new BrowserWindow({parent:win,title:'Noxviola extension',width:kind === 'popup' ? 460 : 900,height:kind === 'popup' ? 600 : 700,
    webPreferences:{session:partition,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  extensionWindows.set(popup,{id,identity,runtimeId,epoch:context.epoch,session:partition,contents:popup.webContents}); popup.once('closed',()=>extensionWindows.delete(popup));
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
async function recoverService(service,label) {
  if(service?.status!=='recovery')throw new Error('No recoverable checkpoint is available.');
  const choice=await dialog.showMessageBox(win,{type:'warning',message:`Restore previous ${label}?`,detail:'The current file will be preserved separately. This can restore records removed since the prior checkpoint.',buttons:['Cancel','Restore'],defaultId:0,cancelId:0,noLink:true});
  if(choice.response===1)service.recover(service.inspection.preview);
}
async function savePreferences(value) {
  const proposed=preferenceStore.applyPreferences(preferences,value);
  spellcheck.setEnabled(proposed.spellcheckEnabled);
  preferences=proposed;preferencePreview=null;buildMenu();layout();publish(false);publishBookmarks();
  writer.request(snapshot());await writer.flush();notice('Preferences saved.');
}
function changeZoom(command) {
  const tab=active(),wc=tab?.view?.webContents;if(!wc)return;
  const factor=command==='zoom-reset'?1:Math.min(5,Math.max(0.25,wc.getZoomFactor()*Math.pow(1.2,command==='zoom-in'?0.5:-0.5)));
  wc.setZoomFactor(factor);
  const url=httpUrl(wc.getURL());
  if(url){const origin=new URL(url).origin,all=originalSession.siteZooms||{};originalSession={...originalSession,siteZooms:{...all,[tab.identity]:{...all[tab.identity],[origin]:factor}}};publish();}
  notice(`Page zoom: ${Math.round(wc.getZoomFactor()*100)}%.`);
}
async function exportPage(kind,wc) {
  if(!wc||!httpUrl(wc.getURL()))throw new Error('Open a website before exporting the page.');
  const extension=kind==='pdf'?'pdf':'png',choice=await dialog.showSaveDialog(win,{title:kind==='pdf'?'Save page as PDF':'Save visible page screenshot',defaultPath:`noxviola-page.${extension}`,filters:[{name:extension.toUpperCase(),extensions:[extension]}]});
  if(choice.canceled||!choice.filePath)return;
  const data=kind==='pdf'?await wc.printToPDF({printBackground:true,preferCSSPageSize:true}):(await wc.capturePage()).toPNG();
  // A new file avoids replacing a file changed between the picker and export.
  // Existing destinations can be replaced only after a separate exact-byte check.
  let previous=null;
  try{previous=storage.readRegular(choice.filePath);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(previous){
    const confirmation=await dialog.showMessageBox(win,{type:'question',message:'Replace the selected file?',detail:choice.filePath,buttons:['Cancel','Replace'],defaultId:0,cancelId:0,noLink:true});
    if(confirmation.response!==1)return;
    if(!storage.readRegular(choice.filePath).equals(previous))throw new Error('The selected file changed; export again to review the current file.');
    storage.replace(choice.filePath,data);
  }else{const handle=await fs.promises.open(choice.filePath,'wx',0o600);try{await handle.writeFile(data);await handle.sync();}finally{await handle.close();}}
  notice(`Page ${kind==='pdf'?'PDF':'screenshot'} saved to the selected local file.`);
}
function buildMenu() {
  const invoke=(name,value)=>runBrowserOperation(name,value).catch(error=>{notice(error.message);layout();publish(false);});
  const entries=preferenceStore.shortcutList(preferences).map(item=>({label:item.label,...(item.accelerator?{accelerator:item.accelerator}:{}),click:()=>invoke(item.id==='close'&&panel?'panel-close':item.id,item.id==='close'?activeId:undefined)}));
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Browser',submenu:[...entries,{type:'separator'},
    {label:'Workspaces and tab groups',click:()=>invoke('workspaces')},{label:'Save page as PDF',click:()=>invoke('save-pdf')},
    {label:'Save visible screenshot',click:()=>invoke('save-screenshot')},{label:'Resource monitor',click:()=>invoke('resources')},
    {label:'Customize',click:()=>invoke('settings')},{type:'separator'},{role:'quit'}]}]));
}
async function perform(name, value) {
  const wc = active()?.view?.webContents;
  switch (name) {
    case 'state': return stateView();
    case 'new': return newTab(typeof value === 'string' ? value : 'about:blank');
    case 'activate': activate(value); break;
    case 'close':closeTab(value);break;
    case 'restore': restoreTab(); break;
    case 'duplicate': { const tab = active(); if (tab) newTab(tab.url,tab.identity,{...savedTab(tab),id:crypto.randomUUID()},tabs.indexOf(tab)+1); break; }
    case 'navigate': navigate(value); break;
    case 'back': if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); break;
    case 'forward': if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); break;
    case 'reload': if (wc) wc.reload(); break;
    case 'reload-bypass-cache': if(wc)wc.reloadIgnoringCache();break;
    case 'stop': wc?.stop(); break;
    case 'home':navigate(preferences.homePage);break;
    case 'focus-address':focusChrome('focus-address');break;
    case 'focus-find':focusChrome('focus-find');break;
    case 'next-tab':case 'previous-tab':{const candidates=visibleTabs(),index=candidates.findIndex(tab=>tab.id===activeId);if(candidates.length)activate(candidates[(index+(name==='next-tab'?1:-1)+candidates.length)%candidates.length].id);break;}
    case 'tab-pin':pinTab(findTab(value?.id||activeId),value?.pinned);break;
    case 'tab-mute':muteTab(findTab(value?.id||activeId),value?.muted);break;
    case 'tab-move':{const tab=findTab(value?.id),peers=tabs.filter(row=>tabWorkspace(row)===tabWorkspace(tab)),index=value?.index??peers.indexOf(tab)+value?.offset;
      if(!Number.isInteger(index)||index<0||index>=peers.length)throw new Error('This tab cannot move farther in that direction.');moveTab(tab,tabs.indexOf(peers[index]));break;}
    case 'tab-assign':assignTab(findTab(value?.id),value?.workspaceId,value?.groupId||null);break;
    case 'tab-menu':{
      const tab=findTab(value),invoke=(command,arg)=>runBrowserOperation(command,arg).catch(error=>notice(error.message));
      const peers=visibleTabs(),index=peers.indexOf(tab);
      Menu.buildFromTemplate([
        {label:tab.saved.pinned?'Unpin tab':'Pin tab',click:()=>invoke('tab-pin',{id:tab.id,pinned:!tab.saved.pinned})},
        {label:tab.saved.muted?'Unmute tab':'Mute tab',click:()=>invoke('tab-mute',{id:tab.id,muted:!tab.saved.muted})},
        {label:'Move left / up',enabled:index>0,click:()=>invoke('tab-move',{id:tab.id,offset:-1})},
        {label:'Move right / down',enabled:index>=0&&index<peers.length-1,click:()=>invoke('tab-move',{id:tab.id,offset:1})},
        {label:'Move to workspace',submenu:workspaces.list().map(item=>({label:item.name,type:'radio',checked:tabWorkspace(tab)===item.id,click:()=>invoke('tab-assign',{id:tab.id,workspaceId:item.id})}))},
        {type:'separator'},{label:'Close tab',click:()=>invoke('close',tab.id)}
      ]).popup({window:win});break;
    }
    case 'split': {
      if (splitId) splitId = null;
      else { const other = visibleTabs().find(tab => tab.id !== activeId && tab.url !== 'about:blank'); if (other) {splitId = other.id;ensureView(other);} else notice('Open another website tab in this workspace to use split view.'); }
      showPage(); layout(); publish(false); break;
    }
    // Electron's findNext maps to Chromium new_session: true starts a search.
    // Our command's findNext means a follow-up, so its native flag is inverted.
    case 'find':{const query=typeof value==='string'?value:value?.query;if(query)wc?.findInPage(String(query),{forward:value?.forward!==false,findNext:value?.findNext!==true});else{wc?.stopFindInPage('clearSelection');send('find-result',{matches:0,activeMatchOrdinal:0});}break;}
    case 'zoom-in':case 'zoom-out':case 'zoom-reset':changeZoom(name);break;
    case 'fullscreen':win.setFullScreen(!win.isFullScreen());break;
    case 'devtools':if(wc)wc.isDevToolsOpened()?wc.closeDevTools():wc.openDevTools({mode:'detach'});break;
    case 'print':if(!wc)throw new Error('Open a website before printing.');await new Promise((resolve,reject)=>wc.print({silent:false,printBackground:true},(success,reason)=>success?resolve():reject(new Error(reason||'Printing was canceled.'))));break;
    case 'save-pdf':await exportPage('pdf',wc);break;
    case 'save-screenshot':await exportPage('png',wc);break;
    case 'identity-add': {
      const name = typeof value === 'string' ? value.trim() : ''; if (!name) throw new Error('Enter an identity name.');
      const profile = {id:crypto.randomUUID(),name}; profiles.push(profile); currentIdentity = profile.id; newTab(); break;
    }
    case 'identity-switch': {
      if (!profiles.some(profile => profile.id === value)) throw new Error('Unknown identity.');
      currentIdentity = value; const tab = tabs.find(row => row.identity === value); if (tab) activate(tab.id); else newTab(); break;
    }
    case 'settings-save': {
      await savePreferences(value);break;
    }
    case 'settings-export':{const out=await dialog.showSaveDialog(win,{title:'Export browser preferences',defaultPath:'noxviola-preferences.json',filters:[{name:'Noxviola preferences',extensions:['json']}]});
      if(!out.canceled&&out.filePath){const preset=preferenceStore.exportPreset(preferences);storage.write(out.filePath,preset,value=>{preferenceStore.previewPreset(preferences,value);return value;});notice('Preferences exported. No browsing history, identities, accounts or extension grants were included.');}break;}
    case 'settings-import-preview':{const chosen=await dialog.showOpenDialog(win,{title:'Review a browser preference preset',properties:['openFile'],filters:[{name:'Noxviola preferences',extensions:['json']}]});
      if(chosen.canceled||!chosen.filePaths[0])return null;const reviewed=preferenceStore.previewPreset(preferences,storage.parse(storage.readRegular(chosen.filePaths[0])));
      preferencePreview={...reviewed,baseline:JSON.stringify(preferences)};send('settings-preview',{changes:reviewed.changes});return reviewed.changes;}
    case 'settings-import-apply':if(!preferencePreview)throw new Error('Review a preference preset first.');if(preferencePreview.baseline!==JSON.stringify(preferences))throw new Error('Preferences changed after this review. Inspect the preset again.');await savePreferences(preferencePreview.preferences);send('settings-preview',null);break;
    case 'settings-import-cancel':preferencePreview=null;send('settings-preview',null);break;
    case 'save-session': writer.request(snapshot()); await writer.flush(); notice('Session saved.'); break;
    case 'tools':case 'vault':case 'accounts':case 'extensions':case 'downloads':case 'permissions':case 'settings':case 'capabilities':case 'bookmarks':case 'history':case 'workspaces':case 'resources':setPanel(name);break;
    case 'resource-sample':return resourceMonitor.sample();
    case 'history-query':return history.query(currentIdentity,value||{});
    case 'history-settings':{const {identity=currentIdentity,...changes}=value||{};history.configure(identity,changes);publishHistory();break;}
    case 'history-open':{const identity=typeof value==='object'?value.identity:currentIdentity,url=typeof value==='object'?value.url:value;if(!httpUrl(url))throw new Error('Invalid history address.');newTab(url,identity);break;}
    case 'history-remove':history.deleteUrl(typeof value==='object'?value.identity:currentIdentity,typeof value==='object'?value.url:value);publishHistory();break;
    case 'history-clear':{const identity=value?.identity||currentIdentity;history.settings(identity);const choice=await dialog.showMessageBox(win,{type:'question',message:`Remove history for ${profiles.find(profile=>profile.id===identity)?.name||identity}?`,detail:'This removes the active history list. Recovery checkpoints can retain earlier records; this is not secure erasure of browsing data.',buttons:['Cancel','Remove history entries'],defaultId:0,cancelId:0,noLink:true});if(choice.response===1)history.clear(identity);publishHistory();break;}
    case 'history-recover':await recoverService(history,'history');publishHistory();break;
    case 'bookmark-current':{
      const tab=active();if(!tab||!httpUrl(tab.url))throw new Error('Open a website before bookmarking it.');
      const item=bookmarks.create(tab.identity,{title:tab.title,url:tab.url,parentId:bookmarkRootIds(tab.identity).bar});notice(`Bookmarked ${item.title}.`);publishBookmarks();return item;
    }
    case 'bookmark-save':{const {identity=currentIdentity,...details}=value||{};const item=details.id?bookmarks.update(identity,details.id,{title:details.title,...(details.url!==undefined?{url:details.url}:{})}):bookmarks.create(identity,details);publishBookmarks();return item;}
    case 'bookmark-open':{const identity=typeof value==='object'?value.identity:currentIdentity,id=typeof value==='object'?value.id:value;const [item]=bookmarks.get(identity,id);if(!item?.url)throw new Error('Select a saved website.');newTab(item.url,identity);try{bookmarks.markUsed(identity,id);}catch(error){notice(`Bookmark opened, but its last-used time was not saved: ${error.message}`);}break;}
    case 'bookmark-move':{const item=bookmarks.move(value?.identity||currentIdentity,value?.id,{parentId:value?.parentId,...(value?.index===undefined?{}:{index:value.index})});publishBookmarks();return item;}
    case 'bookmark-remove':{const identity=value?.identity||currentIdentity,id=typeof value==='object'?value.id:value;const [item]=bookmarks.get(identity,id);if(!item)throw new Error('Bookmark not found.');
      if(item.type==='folder'){const choice=await dialog.showMessageBox(win,{type:'question',message:`Remove “${item.title}” and its bookmarks?`,detail:'The preceding recovery checkpoint is retained.',buttons:['Cancel','Remove folder'],defaultId:0,cancelId:0,noLink:true});if(choice.response!==1)return;bookmarks.removeTree(identity,id);}else bookmarks.remove(identity,id);publishBookmarks();break;}
    case 'bookmark-recover':await recoverService(bookmarks,'bookmarks');publishBookmarks();break;
    case 'workspace-create':{const item=workspaces.create(value);publishWorkspaces();return item;}
    case 'workspace-update':{const {id,...changes}=value||{};const item=workspaces.update(id,changes);publishWorkspaces();return item;}
    case 'workspace-remove':workspaces.remove(value);publishWorkspaces();break;
    case 'workspace-switch':{
      workspaces.get(value);activeWorkspaceId=value;splitId=null;const tab=visibleTabs()[0];if(tab)activate(tab.id);else newTab();publishWorkspaces();break;
    }
    case 'workspace-recover':await recoverService(workspaces,'workspaces');publishWorkspaces();break;
    case 'group-create':{const item=workspaces.createGroup(value);publishWorkspaces();return item;}
    case 'group-update':{const {id,...changes}=value||{};const item=workspaces.updateGroup(id,changes);publishWorkspaces();return item;}
    case 'group-remove':workspaces.removeGroup(value);publishWorkspaces();break;
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
    case 'download-history-remove': downloads.remove(value); break;
    case 'download-history-clear': {
      if (!profiles.some(profile => profile.id === value)) throw new Error('Select an existing identity before clearing download history.');
      const identityName = profiles.find(profile => profile.id === value).name;
      const choice = await dialog.showMessageBox(win,{type:'question',message:`Clear download history for ${identityName}?`,detail:'This removes transfer records for this identity. Downloaded files are kept. Finish or cancel active transfers first.',buttons:['Cancel','Clear history'],defaultId:0,cancelId:0,noLink:true});
      if (choice.response === 1) downloads.clear({identity:value}); break;
    }
    case 'download-history-retry': downloads.open(); downloads.flush(); notice('Download history saved.'); break;
    case 'download-history-recover': {
      if (!downloads.getStatus().recoveryAvailable) throw new Error('No previous download-history checkpoint is available.');
      const choice = await dialog.showMessageBox(win,{type:'warning',message:'Restore the previous download-history checkpoint?',detail:'The current file is preserved separately. Current transfers remain visible; saved transfers are not restarted. Downloaded files are kept.',buttons:['Cancel','Restore history'],defaultId:0,cancelId:0,noLink:true});
      if (choice.response === 1) { downloads.recover(); downloads.flush(); notice('Download history recovered and saved.'); } break;
    }
    case 'permission-list': return permissions.list();
    case 'permission-revoke': await permissions.revoke(value); publishPermissions(); break;
    case 'permission-reset': await permissions.reset(value || undefined); publishPermissions(); break;
    case 'permission-recover': {
      if (permissionOpening?.status !== 'recovery') throw new Error('No permission checkpoint is available.');
      const choice = await dialog.showMessageBox(win,{type:'warning',message:'Restore previous site permission decisions?',detail:'This may restore earlier allow decisions. The current file will be preserved.',buttons:['Cancel','Restore'],defaultId:0,cancelId:0,noLink:true});
      if (choice.response === 1) {await permissions.recover(permissionOpening.preview);permissionOpening = permissions.open();publishPermissions();} break;
    }
    case 'extension-list': return extensions.list();
    case 'extension-action':return extensionBridge.activateAction(currentIdentity,value?.runtimeId,active()?.runtimeId);
    case 'extension-preview-dialog': return extensionOperation(async () => {
      const directory = value === 'directory';
      const chosen = await dialog.showOpenDialog(win,{title:directory ? 'Inspect unpacked extension' : 'Inspect local extension package',properties:[directory ? 'openDirectory' : 'openFile'],...(directory ? {} : {filters:[{name:'Extension packages',extensions:['zip','xpi','crx']}]})});
      if (chosen.canceled || !chosen.filePaths[0]) return null;
      const preview = await extensions.preview(chosen.filePaths[0]); send('extension-preview',preview); return preview;
    });
    case 'extension-preview-cancel': return extensionOperation(() => extensions.cancelPreview(value));
    case 'extension-install': return extensionOperation(() => extensions.install(value?.token,{identities:value?.identities,permissionsAccepted:value?.permissionsAccepted === true,unsignedImportAccepted:value?.unsignedImportAccepted === true,allowFileAccess:false,apiProfile:value?.apiProfile}));
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
  return runBrowserOperation(payload.name,payload.value);
}
function runBrowserOperation(name,value) {
  if(closing&&!['state','extension-list','download-list','permission-list'].includes(name))return Promise.reject(new Error('Wait for the close attempt to finish.'));
  const operation = Promise.resolve().then(() => perform(name,value));
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
    await downloads.cancelActive();
  }
  refreshLiveTabs();
  try { downloads.flush(); }
  catch (error) {
    const choice = await dialog.showMessageBox(win,{type:'warning',message:'Recent download history could not be saved.',detail:`${error.message}\nDownloaded files are kept. Keep the browser open to retry or recover history, or explicitly exit without saving recent transfer records.`,buttons:['Keep browser open','Exit without saving recent download history'],defaultId:0,cancelId:0,noLink:true});
    if (choice.response !== 1) {resumeAfterCloseError('Close canceled. Open Downloads to retry or recover its history.');return;}
  }
  try { writer.request(snapshot()); await writer.flush(); }
  catch (error) {
    saveError = error.message;
    const choice = await dialog.showMessageBox(win,{type:'warning',message:'Recent tabs could not be saved.',detail:`${error.message}\nKeep the browser open to preserve important addresses, or explicitly exit without saving recent tabs.`,buttons:['Keep browser open','Exit without saving recent tabs'],defaultId:0,cancelId:0,noLink:true});
    if (choice.response !== 1) {resumeAfterCloseError('Close canceled. Fix the save error and choose Retry save.');return;}
  }
  closeExtensionWindows();
  try { if (!extensionError) await extensions.dispose(); } catch (error) { notice(error.message); }
  try{await extensionBridge?.dispose();}catch(error){notice(`Extension host cleanup: ${error.message}`);}history?.dispose();bookmarks?.dispose();workspaces?.dispose();
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
  spellcheck=new SpellcheckService({enabled:preferences.spellcheckEnabled,canAct:()=>!closing,onError:notice});
  spellcheck.attach(session.defaultSession);
  resolveIdentitySession = createIdentitySessionResolver({session,root:app.getPath('sessionData')});
  tabs = originalSession.tabs.map(tabFromSaved); activeId = originalSession.activeId;
  currentIdentity = active()?.identity || 'personal';
  activeWorkspaceId=active()?tabWorkspace(active()):originalSession.activeWorkspaceId||'default';
  vaultFile = path.join(dataDirectory,'private-vault.json'); accountFile = path.join(dataDirectory,'private-accounts.json');
  try { const opened = vaultStore.inspect(vaultFile); if (opened.status === 'recovery') {vaultRecovery = opened;vaultError = 'The library needs explicit recovery before editing.';} else vaultDocument = opened.value; } catch (error) {vaultError = error.message;}
  try { const opened = accountStore.inspect(accountFile); if (opened.status === 'recovery') {accountRecovery = opened;accountError = 'The account inventory needs explicit recovery before editing.';} else accounts = opened.value.accounts; } catch (error) {accountError = error.message;}
  history=new HistoryService({file:path.join(dataDirectory,'browser-history.json'),getIdentities:()=>profiles.map(profile=>profile.id),onChange:publishHistory});
  bookmarks=new BookmarkService({file:path.join(dataDirectory,'browser-bookmarks.json'),getIdentities:()=>profiles.map(profile=>profile.id),onChange:publishBookmarks});
  workspaces=new WorkspaceService({file:path.join(dataDirectory,'browser-workspaces.json'),onChange:publishWorkspaces,isWorkspaceInUse:id=>tabs.some(tab=>tabWorkspace(tab)===id),isGroupInUse:id=>tabs.some(tab=>tab.saved.groupId===id)});
  for(const service of [history,bookmarks,workspaces])try{service.open();}catch{/* The corresponding panel retains the service error and recovery state. */}
  permissions = new PermissionManager({file:path.join(dataDirectory,'site-permissions.json'),onChange:publishPermissions,prompt:async request => {
    if (closing || !win || win.isDestroyed() || request.signal?.aborted) return 'block';
    const identity = profiles.find(profile => profile.id === request.identity)?.name || request.identity;
    const response = await dialog.showMessageBox(win,{type:'question',title:'Site permission',message:`Allow ${request.permissions.join(' and ')}?`,detail:`Requesting site: ${request.requestingOrigin}\nEmbedded by: ${request.embeddingOrigin}\nIdentity: ${identity}`,buttons:['Block','Allow once','Always allow'],defaultId:0,cancelId:0,noLink:true,signal:request.signal});
    if (closing || request.signal?.aborted) return 'block';
    return response.response === 2 ? 'allow' : response.response === 1 ? 'allow-once' : 'block';
  }});
  try {permissionOpening = permissions.open();} catch (error) {permissionOpening = {status:'blocked',error:error.message};}
  downloads = new DownloadManager({directory:app.getPath('downloads'),reveal:file => shell.showItemInFolder(file),file:path.join(dataDirectory,'browser-downloads.json'),getIdentities:()=>profiles.map(profile=>profile.id)});
  downloads.on('change', () => { if (panel === 'downloads') send('downloads',downloads.list()); });
  downloads.on('status', () => publish(false));
  try { downloads.open(); } catch { /* Downloads exposes its history error and recovery controls without hiding live transfers. */ }
  extensions = new ExtensionManager({directory:path.join(dataDirectory,'extensions'),getSession:identitySession,getIdentities:() => profiles.map(profile => profile.id),loadExtension:createExtensionLoader({app,webContents})});
  const {createExtensionBridge}=require('./extension-bridge.cjs');
  extensionBridge=createExtensionBridge({ipcMain,manager:extensions,host:extensionHost(),nativeImage});
  try {await extensions.open();} catch (error) {extensionError = error.message;}
  resourceMonitor=new ResourceMonitor({app,webContents,tabs:()=>tabs.map(tab=>({id:tab.id,title:tab.title,identity:tab.identity,webContentsId:tab.view?.webContents.id})),
    extensions:()=>extensions.list().map(item=>({...item,identities:item.identities.map(grant=>({...grant,session:sessionTargets.get(grant.identity)}))}))});
  session.defaultSession.setPermissionCheckHandler(() => false); session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback) => callback(false));
  writer = new SessionWriter(sessionFile); writer.on('result',result => {saveError = result.error || '';if (result.error) notice(`Session not saved: ${result.error}`);publish(false);});
  win = new BrowserWindow({title:'Noxviola',width:1320,height:860,minWidth:700,minHeight:480,backgroundColor:'#171122',webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  win.webContents.setWindowOpenHandler(() => ({action:'deny'})); win.webContents.on('will-navigate',event => event.preventDefault());
  win.webContents.on('context-menu',(_event,params)=>Menu.buildFromTemplate([
    ...spellcheck.contextMenu(win.webContents,params),{role:'copy',enabled:!!params.selectionText},{role:'paste',enabled:params.isEditable},
  ]).popup({window:win}));
  ipcMain.handle('command',command); win.on('resize',layout);
  win.on('close',event => {if (!allowClose) {event.preventDefault();requestClose().catch(error => resumeAfterCloseError(error.message));}});
  win.webContents.on('did-finish-load',() => {
    eventAction(() => {if (tabs.length) {ensureView(active() || tabs[0]);layout();publish(false);} else newTab();});
    publishVault();publishAccounts();publishExtensions();publishPermissions();publishBookmarks();publishWorkspaces();publishExtensionActions();
  });
  buildMenu();
  await win.loadFile(path.join(__dirname,'index.html'));
}
if (!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(start).catch(error => {dialog.showErrorBox('Noxviola could not open safely',`${error.message}\nExisting data was preserved.`);app.quit();});
app.on('second-instance',() => {win?.show();win?.focus();});
app.on('before-quit',event => {if (win && !win.isDestroyed() && !allowClose) {event.preventDefault();requestClose().catch(error => resumeAfterCloseError(error.message));}});
app.on('window-all-closed',() => app.quit());
