'use strict';
// Browser lifecycle adapted from Herbertofury/Enderloom main.js (GPL-3.0-only).
const {app, BrowserWindow, WebContentsView, ipcMain, session, dialog, Menu, shell, webContents, nativeImage, screen, systemPreferences, safeStorage, protocol,net} = require('electron');
const path = require('node:path');
const crypto = require('node:crypto');
const fs = require('node:fs');
const {EventEmitter} = require('node:events');
const {pathToFileURL}=require('node:url');
const {address, httpUrl, extensionUrl, cleanState, inspectState, recoverState, SEARCH} = require('./state.cjs');
const preferenceStore = require('./preferences.cjs');
const {ResourceMonitor} = require('./resources.cjs');
const {SpellcheckService} = require('./spellcheck.cjs');
const {HistoryService} = require('./history.cjs');
const {FollowService} = require('./follows.cjs');
const {BookmarkService,rootIds:bookmarkRootIds} = require('./bookmarks.cjs');
const {WorkspaceService} = require('./workspaces.cjs');
const storage = require('./storage.cjs');
const {SessionWriter} = require('./session-writer.cjs');
const paneLayout=require('./pane-layout.cjs');
const {DownloadManager} = require('./downloads.cjs');
const {ExtensionManager} = require('./extensions.cjs');
const {createExtensionLoader} = require('./extension-runtime.cjs');
const {createIdentitySessionResolver} = require('./session-path.cjs');
const {PermissionManager} = require('./permissions.cjs');
const {createFaviconLoader} = require('./favicons.cjs');
const {sidebarLayout} = require('./sidebar-layout.cjs');
const {sidebarEase,sidebarDuration} = require('./sidebar-motion.cjs');
const {createSidebarWebPanel} = require('./sidebar-web-panel.cjs');
const {sidebarAccountData,sidebarAccountRoute} = require('./sidebar-accounts.cjs');
const {PasswordStore}=require('./passwords.cjs');
const passwordPage=require('./password-page.cjs');
const {createMediaControls}=require('./media-controls.cjs');
const {services:playerServices,presets:audioPresets}=require('./player-audio.cjs');
const {GxModLibrary}=require('./gx-mods.cjs');
const {mountStyles}=require('./gx-web-styles.cjs');
const {createSidebarExtensionPanel}=require('./sidebar-extension-panel.cjs');
const {createSidebarExtensionAPI}=require('./sidebar-extension-api.cjs');
const findSession = require('./find-session.cjs').createFindSession();
const accountStore = require('./accounts.cjs');
const vaultStore = require('./vault.cjs');
app.enableSandbox();
protocol.registerSchemesAsPrivileged([{scheme:'nox-mod',privileges:{standard:true,secure:true,stream:true}}]);

let win, tabs = [], profiles = [{id:'personal', name:'Personal'}], activeId, currentIdentity = 'personal';
let originalSession = cleanState({}), preferences = originalSession.preferences;
let paneTree=null,paneLayouts=[];
let splitId = null, panel = null, closed = [], saveTimer, queuedPublish = false, closing = false, allowClose = false;
let writer, saveError = '', sessionFile, dataDirectory, downloads, permissions, extensions, extensionError = '';
let vaultFile, vaultDocument = {version:1, items:[]}, vaultError = '', vaultRecovery = null, vaultImport = null;
let accountFile, accounts = [], accountError = '', accountRecovery = null;
let permissionOpening = null, extensionBusy = false;
let passwords,sidebarExtension,sidebarExtensionAPI,mods,modPresentation={};
let activeWebMod;
let resolveIdentitySession, history, bookmarks, workspaces, follows, followTimer, resourceMonitor, extensionBridge, spellcheck;
let activeWorkspaceId = 'default', nextRuntimeTabId = 1, preferencePreview = null;
let sidebarProgress=0,sidebarRailProgress=0,sidebarTimer=null,sidebarDismissTimer=null,sidebarDismissGeneration=0;
const runtimeTabs = new Map(), nativeTabs = new Map(), sessionTargets = new Map(), workspaceLastTabs = new Map(), browserEvents = new EventEmitter();
const configuredSessions = new Set(), identityInitializations = new Map(), extensionWindows = new Map(), pendingOperations = new Set();
const SIDEBAR = 210;
const chromeHeight = () => (preferences.tabLayout === 'vertical' ? 40 : 76) + (preferences.showBookmarksBar ? 32 : 0);
const active = () => tabs.find(tab => tab.id === activeId);
const tabWorkspace = tab => tab.saved.workspaceId || 'default';
const visibleTabs = () => tabs.filter(tab => tabWorkspace(tab) === activeWorkspaceId);
const favicons = createFaviconLoader({nativeImage});
const gxStyles=mountStyles(url=>mods.styles(url),error=>notice(error.message));
const sidebarWeb=createSidebarWebPanel({WebContentsView,getWindow:()=>win,getSession:identitySession,identityReady,loadFavicon:favicons.load,onInteraction:cancelSidebarDismiss,onChange:value=>send('sidebar-web-state',value),onContents:gxStyles.attach});
const mediaControls=createMediaControls({getSources:()=>[
  ...tabs.filter(tab=>tab.view&&!tab.view.webContents.isDestroyed()).map(tab=>({id:`tab:${tab.id}`,identity:tab.identity,kind:'tab',title:tab.title,webContents:tab.view.webContents})),
  ...sidebarWeb.sources(),
],onChange:()=>send('media-changed',{})});
const tabPreview = require('./tab-preview-host.cjs').createTabPreview({
  WebContentsView, ipcMain, root:__dirname, getWindow:()=>win, blocked:()=>Boolean(panel)||closing,
  getTabInfo:id=>{const tab=tabs.find(row=>row.id===id && tabWorkspace(row)===activeWorkspaceId);return tab?{title:tab.title,url:tab.url,identity:tab.identity,contents:tab.view?.webContents}:null;},
});
const tabSearch = require('./tab-search-host.cjs').createTabSearch({BrowserWindow,screen,ipcMain,root:__dirname,getWindow:()=>win,
  getData:tabSearchData,selectTab:id=>{if(closing)throw new Error('Browser is closing.');findTab(id);activate(id);},
  closeTab:id=>{if(closing)throw new Error('Browser is closing.');findTab(id);closeTab(id);},
  restoreTab:id=>{if(closing)throw new Error('Browser is closing.');restoreClosed(id);}});
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
function snapshot() { const tabWorkspaces=new Map(tabs.map(tab=>[tab.id,tabWorkspace(tab)]));return {...originalSession, version:1, profiles, preferences, activeId, activeWorkspaceId, paneTree, paneLayouts, workspaceLastTabs:Object.fromEntries([...workspaceLastTabs].filter(([workspace,id])=>tabWorkspaces.get(id)===workspace)), tabs:tabs.map(savedTab)}; }
function tabFromSaved(saved) {
  const tab = {saved, id:saved.id, runtimeId:nextRuntimeTabId++,url:saved.url,title:saved.title,identity:saved.identity,view:null,loading:false,initializing:false,favicon:'',faviconRevision:0};
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
  return {version:1, profiles, preferences, activeId, currentIdentity, splitId, paneTree, paneLayouts, paneGeometry:currentPaneGeometry(), panel, closing, saveError,
    activeWorkspaceId,chromeHeight:chromeHeight(),sidebarGeometry:currentSidebarGeometry(),sidebarWeb:sidebarWeb.state(),sidebarExtension:sidebarExtension?.state(),modPresentation,shortcuts:preferenceStore.shortcutList(preferences),downloadHistory:downloads?.getStatus(),
    canRestore:closed.length > 0, tabs:tabs.map(tab => ({id:tab.id,url:tab.url,title:tab.title,identity:tab.identity,loading:tab.loading,live:!!tab.view,favicon:tab.favicon,
      workspaceId:tabWorkspace(tab),groupId:tab.saved.groupId||null,pinned:!!tab.saved.pinned,muted:tab.view?.webContents.isAudioMuted()??!!tab.saved.muted,audible:tab.view?.webContents.isCurrentlyAudible()||false})),
    canBack:active()?.view?.webContents.navigationHistory.canGoBack() || false,
    canForward:active()?.view?.webContents.navigationHistory.canGoForward() || false,
    engine:{electron:process.versions.electron,chromium:process.versions.chrome,isPackaged:app.isPackaged,appVersion:app.getVersion()}};
}
function tabSearchData(){
  let workspaceList=[],groups=[];
  try{workspaceList=workspaces?.list()||[];groups=workspaceList.flatMap(item=>workspaces.listGroups(item.id));}catch{}
  const state=stateView();return {tabs:state.tabs,profiles:state.profiles,activeId:state.activeId,workspaces:workspaceList,groups,style:preferences.tabSearchStyle,
    closed:closed.map(item=>({closedId:item.closedId,title:item.saved.title,url:item.saved.url,identity:item.saved.identity,workspaceId:item.saved.workspaceId,groupId:item.saved.groupId})).reverse()};
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
  setImmediate(() => { queuedPublish = false; send('state', stateView());tabSearch.update(); });
}
function publishVault() { send('vault', {items:vaultDocument.items, open:panel === 'vault', error:vaultError, recoveryAvailable:!!vaultRecovery, preview:vaultImport?.preview.summary || null}); }
function publishAccounts() { send('accounts', {accounts,profiles,open:panel === 'accounts',error:accountError,recoveryAvailable:!!accountRecovery}); }
function passwordData(){const state=passwords?.state()||{locked:true};return {...state,identity:currentIdentity,items:state.locked?[]:passwords.list(currentIdentity)};}
function publishPasswords(){send('passwords',passwordData());}
function publishMods(){
  modPresentation=mods.presentation();
  const selected=mods.data.active.page_styles;
  if(selected!==activeWebMod){activeWebMod=selected;gxStyles.refresh();}
  if(panel==='mods')send('mods',mods.snapshot());
  publish(false);
}
function requireCurrentIdentity(value){if(value?.identity!==currentIdentity)throw new Error('The browser identity changed. Try again.');return currentIdentity;}
function passwordTarget(identity){const tab=active(),contents=tab?.view?.webContents;if(!contents||contents.isDestroyed()||tab.identity!==identity||currentIdentity!==identity)throw new Error('Open a login page in the selected identity first.');return {tab,contents};}
function requirePasswordTarget(target,identity){const current=passwordTarget(identity);if(current.tab!==target.tab||current.contents!==target.contents)throw new Error('The selected login page changed. Try again.');}
function publishExtensions() { send('extensions', {items:extensions?.list() || [],profiles,currentIdentity,open:panel === 'extensions',error:extensionError,busy:extensionBusy}); }
function publishExtensionActions() {send('extension-actions',extensionBridge?.actionState(currentIdentity,active()?.runtimeId)||[]);}
function publishPermissions() { send('permissions', {items:permissions?.list() || [],profiles,open:panel === 'permissions',status:permissions?.status || 'blocked',error:permissions?.error || '',recoveryAvailable:permissions?.status === 'recovery'}); }
function serviceView(service, read) {
  try{return {status:service?.status||'blocked',error:service?.error||'',recoveryAvailable:service?.status==='recovery',...read()};}
  catch(error){return {status:service?.status||'blocked',error:error.message,recoveryAvailable:service?.status==='recovery'};}
}
function publishFollows() { if(panel==='following')send('follows',serviceView(follows,()=>({identity:currentIdentity,items:follows.list(currentIdentity)}))); }
function publishHistory() { if(panel==='history'||preferences.sidebarVisible&&preferences.sidebarExpanded&&preferences.sidebarActive==='history')send('history',serviceView(history,()=>({identity:currentIdentity,...history.query(currentIdentity,{}),settings:history.settings(currentIdentity)}))); }
function publishBookmarks() { if(panel==='bookmarks'||preferences.showBookmarksBar||preferences.sidebarVisible&&preferences.sidebarExpanded&&preferences.sidebarActive==='bookmarks')send('bookmarks',serviceView(bookmarks,()=>({identity:currentIdentity,tree:bookmarks.getTree(currentIdentity)}))); }
function publishWorkspaces() { send('workspaces',serviceView(workspaces,()=>({items:workspaces.list(),groups:workspaces.list().flatMap(item=>workspaces.listGroups(item.id)),activeWorkspaceId}))); }
function recordHistory(tab,url) {
  if(!httpUrl(url)||!history)return;
  try{history.record(tab.identity,{url,title:tab.title,transition:tab.pendingTransition||'link'});tab.committedURL=url;tab.pendingTransition=null;publishHistory();}
  catch(error){notice(`History was not saved: ${error.message}`);}
}
function currentSidebarGeometry(){
  const [width,height]=win&&!win.isDestroyed()?win.getContentSize():[1320,860];
  return sidebarLayout({width,height,chromeHeight:chromeHeight(),verticalTabs:preferences.tabLayout==='vertical',visible:preferences.sidebarVisible||sidebarProgress>0,expanded:sidebarProgress>0,side:preferences.sidebarSide,panelWidth:preferences.sidebarWidth,progress:sidebarProgress,railProgress:sidebarRailProgress});
}
function syncSidebarWeb({skipExtension=false,tabChanged=false}={}){
  const extension=preferences.sidebarActive.match(/^extension:([^:]+):(sidebar_action|side_panel)$/);
  if(sidebarExtension&&!skipExtension){
    const state=sidebarExtension.state();
    if(preferences.sidebarVisible&&preferences.sidebarExpanded&&extension){
      if(state.identity!==currentIdentity)sidebarExtension.hide();
      if(tabChanged||!state.visible||state.id!==extension[1]||state.identity!==currentIdentity||state.kind!==extension[2]){
        const identity=currentIdentity,id=extension[1],kind=extension[2];
        void sidebarExtensionAPI.openFromUser({id,identity,kind}).catch(error=>{
          if(currentIdentity!==identity||preferences.sidebarActive!==`extension:${id}:${kind}`)return;
          notice(error.message);
          if(!sidebarExtension.state().error)changeSidebar({sidebarActive:'extension-panels'});
        });
      }
    }else if(state.visible)sidebarExtension.hide();
  }
  const provider=preferences.sidebarActive.startsWith('player:')&&playerServices[preferences.sidebarActive.slice(7)];
  const appEntry=provider?{url:provider[1]}:preferences.sidebarActive.startsWith('app:')?preferences.sidebarApps.find(item=>item.id===preferences.sidebarActive.slice(4)):null;
  const visible=preferences.sidebarVisible&&preferences.sidebarExpanded&&appEntry;
  const state=sidebarWeb.state();
  if(!visible){if(state.visible)sidebarWeb.hide();return;}
  if(!state.visible||state.identity!==currentIdentity||state.site!==httpUrl(appEntry.url)){
    try{sidebarWeb.open({identity:currentIdentity,url:appEntry.url});}catch(error){notice(`Sidebar page could not open: ${error.message}`);}
  }
}
function changeSidebar(patch,options){
  cancelSidebarDismiss();preferences=preferenceStore.applyPreferences(preferences,patch);syncSidebarWeb(options);animateSidebar();publish(false);publishHistory();publishBookmarks();queueSave();
}
function cancelSidebarDismiss(){sidebarDismissGeneration++;clearTimeout(sidebarDismissTimer);sidebarDismissTimer=null;}
function scheduleSidebarDismiss(tab,view){
  if(closing||panel||preferences.sidebarPanelPinned||!preferences.sidebarVisible||!preferences.sidebarExpanded)return;
  cancelSidebarDismiss();const generation=sidebarDismissGeneration;
  // Wait for the page renderer to finish the input task before changing view
  // geometry. An unresponsive or navigated-away renderer leaves the panel open.
  setImmediate(async()=>{try{if(view.webContents.isDestroyed())return;await view.webContents.executeJavaScript('void 0');}catch{return;}
    if(generation!==sidebarDismissGeneration)return;
    sidebarDismissTimer=setTimeout(()=>{sidebarDismissTimer=null;if(generation===sidebarDismissGeneration&&!closing&&!panel&&!preferences.sidebarPanelPinned&&preferences.sidebarVisible&&preferences.sidebarExpanded&&tab.view===view&&paneLayout.ids(paneTree).includes(tab.id))changeSidebar({sidebarExpanded:false});},180);
  });
}
function animateSidebar(){
  clearTimeout(sidebarTimer);const target=preferences.sidebarVisible&&preferences.sidebarExpanded?1:0,from=sidebarProgress,railTarget=preferences.sidebarRailExpanded?1:0,railFrom=sidebarRailProgress;
  let reduced=false;try{reduced=systemPreferences.getAnimationSettings().prefersReducedMotion;}catch{}
  const panelDuration=sidebarDuration(from,target,230,190,reduced),railDuration=sidebarDuration(railFrom,railTarget,200,160,reduced),duration=Math.max(panelDuration,railDuration),start=performance.now();
  const tick=()=>{const elapsed=performance.now()-start,panelT=panelDuration?Math.min(1,elapsed/panelDuration):1,railT=railDuration?Math.min(1,elapsed/railDuration):1;sidebarProgress=from+(target-from)*sidebarEase(panelT);sidebarRailProgress=railFrom+(railTarget-railFrom)*sidebarEase(railT);layout();if(elapsed<duration)sidebarTimer=setTimeout(tick,8);else{sidebarTimer=null;sidebarProgress=target;sidebarRailProgress=railTarget;layout();}};
  tick();
}
function syncPanes(){
  const allowed=new Set(visibleTabs().map(tab=>tab.id));for(const id of paneLayout.ids(paneTree))if(!allowed.has(id))paneTree=paneLayout.remove(paneTree,id);
  if(!paneTree&&activeId)paneTree={tabId:activeId};splitId=paneLayout.ids(paneTree).find(id=>id!==activeId)||null;
}
function currentPaneGeometry(){if(!win||win.isDestroyed())return {panes:[],dividers:[]};const [,height]=win.getContentSize(),g=currentSidebarGeometry();return paneLayout.layout(paneTree,{x:g.pageX,y:chromeHeight(),width:g.pageWidth,height:Math.max(0,height-chromeHeight())});}
function layout() {
  if (!win || win.isDestroyed()) return;
  syncPanes();const [width,height] = win.getContentSize(), geometry=currentSidebarGeometry(),panes=currentPaneGeometry();
  const visible=new Map(panes.panes.map(pane=>[pane.tabId,pane]));
  for (const tab of tabs) {if(!tab.view)continue;const pane=visible.get(tab.id);tab.view.setVisible(Boolean(pane)&&!panel);if(pane)tab.view.setBounds(pane.content);}
  send('pane-layout',panes);
  const grip=Math.min(6,geometry.panel);
  const sidebarBounds={x:geometry.panelX+(preferences.sidebarSide==='right'?grip:0),y:chromeHeight()+40,width:Math.max(0,geometry.panel-grip),height:Math.max(0,height-chromeHeight()-40)};
  sidebarWeb.layout(sidebarBounds);sidebarExtension?.layout(sidebarBounds);
  send('sidebar-layout',geometry);
  tabPreview.layout();
}
function setPanel(value) {
  tabPreview.hide();
  panel = panel === value ? null : value;
  layout(); publish(false); publishVault(); publishAccounts(); publishExtensions(); publishPermissions();
  publishHistory();publishBookmarks();publishWorkspaces();publishFollows();
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
function authorizedExtensionURL(identity, value) {
  const url = extensionUrl(value);
  if (!url || !extensions || extensionError) return null;
  const partition = identitySession(identity), runtimeId = new URL(url).hostname;
  const context = extensions.runtimeContext(partition,runtimeId);
  return context?.identity === identity && context.runtimeId === runtimeId ? url : null;
}
function tabNavigationAllowed(tab, value) {
  if (httpUrl(value)) return true;
  const target = authorizedExtensionURL(tab.identity,value), current = extensionUrl(tab.url);
  return !!target && !!current && new URL(target).hostname === new URL(current).hostname;
}
function ensureView(tab) {
  if (tab.view || tab.url === 'about:blank') return tab.view;
  const view = new WebContentsView({webPreferences:{session:identitySession(tab.identity),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,spellcheck:true}});
  tab.view = view; tab.initializing = true; win.contentView.addChildView(view);
  const wc = view.webContents;
  gxStyles.attach(wc);
  wc.on('before-mouse-event',(_event,input)=>{if(input.type==='mouseUp'&&input.button==='left')scheduleSidebarDismiss(tab,view);});
  wc.on('before-input-event',(_event,input)=>{if(input.type==='keyDown'&&!input.isAutoRepeat&&!input.control&&!input.meta&&!input.alt&&input.key&&!['Shift','Control','Meta','Alt','Escape'].includes(input.key))scheduleSidebarDismiss(tab,view);});
wc.on('focus',()=>{if(activeId!==tab.id&&paneLayout.ids(paneTree).includes(tab.id))activate(tab.id);});
  nativeTabs.set(wc.id,tab);wc.setAudioMuted(!!tab.saved.muted);
  wc.setWindowOpenHandler(({url}) => { if (httpUrl(url) && !closing) eventAction(() => newTab(url,tab.identity)); return {action:'deny'}; });
  wc.on('will-navigate', (event,url) => { if (!tabNavigationAllowed(tab,url)) event.preventDefault(); });
  wc.on('will-redirect', (event,url) => { if (!tabNavigationAllowed(tab,url)) event.preventDefault(); });
  wc.on('did-start-navigation', (_event,_url,isSameDocument,isMainFrame) => {
    if (isMainFrame && !isSameDocument) {tab.faviconRevision++;if(tab.favicon){tab.favicon='';publish(false);}}
  });
  wc.on('page-favicon-updated', (_event, urls) => {
    const page=wc.getURL(),revision=++tab.faviconRevision;
    void favicons.load(wc.session,page,urls).then(icon=>{
      if (closing || wc.isDestroyed() || tab.view !== view || tab.faviconRevision !== revision) return;
      if (tab.favicon !== icon) {tab.favicon=icon;publish(false);}
    });
  });
  wc.on('page-title-updated', (_event,title) => { if (!closing && tab.title !== title) {
    tab.title = title;publish();hostEvent(tab.identity,'tabs.onUpdated',tab.runtimeId,{title},tabDescriptor(tab));
    if(tab.committedURL===httpUrl(wc.getURL()))try{history?.updateTitle(tab.identity,tab.committedURL,title);}catch(error){notice(`History title was not saved: ${error.message}`);}
  } });
  wc.on('did-start-loading', () => {tabPreview.invalidate(tab.id);tab.loading=true;publish(false);hostEvent(tab.identity,'tabs.onUpdated',tab.runtimeId,{status:'loading'},tabDescriptor(tab));});
  wc.on('did-stop-loading', () => {tab.loading=false;publish(false);hostEvent(tab.identity,'tabs.onUpdated',tab.runtimeId,{status:'complete'},tabDescriptor(tab));});
  wc.on('audio-state-changed',()=>{publish(false);hostEvent(tab.identity,'tabs.onUpdated',tab.runtimeId,{audible:wc.isCurrentlyAudible()},tabDescriptor(tab));});
  wc.on('found-in-page',(_event,result)=>{if(tab.id===activeId && findSession.accepts(wc,result))send('find-result',result);});
  function navigated(_event,url,isMainFrame=true,sameDocument=false) {
    if(isMainFrame===false)return;tabPreview.invalidate(tab.id);const target=httpUrl(url)||(tabNavigationAllowed(tab,url)?extensionUrl(url):null);
    if(!closing&&target){tab.url=target;if(httpUrl(target)){recordHistory(tab,target);const zoom=originalSession.siteZooms?.[tab.identity]?.[new URL(target).origin];if(zoom!==undefined)wc.setZoomFactor(zoom);}publish();hostEvent(tab.identity,'tab-navigation-committed',tab.runtimeId,{sameDocument});hostEvent(tab.identity,'tabs.onUpdated',tab.runtimeId,{url:target},tabDescriptor(tab));}else publish(false);
  }
  wc.on('did-navigate', (event,url)=>navigated(event,url,true,false));
  wc.on('did-navigate-in-page', (event,url,isMainFrame)=>navigated(event,url,isMainFrame,true));
  wc.on('render-process-gone', (_event,details) => { tabPreview.invalidate(tab.id);tab.loading = false; notice(`Tab stopped (${details.reason}). Reload to recover.`); publish(false); });
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
    if (!closing && tab.view === view && !wc.isDestroyed()) {
      if (extensionUrl(tab.url) && !authorizedExtensionURL(tab.identity,tab.url)) {
        removeView(tab); notice('This extension tab is preserved but unavailable until its extension is enabled in this identity.'); publish(false); return;
      }
      wc.loadURL(tab.url).catch(error => notice(`Navigation failed: ${error.message}`));
    }
  });
  return view;
}
function activate(id) {
  tabPreview.hide();
  const tab = tabs.find(row => row.id === id); if (!tab || closing) return;
  const changed = activeId !== id; activeId = id; currentIdentity = tab.identity;activeWorkspaceId=tabWorkspace(tab);workspaceLastTabs.set(activeWorkspaceId,id);
  if(!paneLayout.ids(paneTree).includes(id)){
    if(paneLayout.ids(paneTree).length>1)paneLayouts.push(paneTree);
    const saved=paneLayouts.find(tree=>paneLayout.ids(tree).includes(id));
    paneLayouts=paneLayouts.filter(tree=>tree!==saved);paneTree=saved||{tabId:id};
  }
  showPage();for(const paneId of paneLayout.ids(paneTree))ensureView(findTab(paneId));syncSidebarWeb({tabChanged:changed});layout();publish(changed);publishHistory();publishBookmarks();publishWorkspaces();publishExtensionActions();
  if(changed)hostEvent(tab.identity,'tabs.onActivated',{tabId:tab.runtimeId,windowId:win.id});
}
function newTab(url = 'about:blank', identity = currentIdentity, saved = null, position = tabs.length, options = {}) {
  if (closing) return;
  if (!profiles.some(profile => profile.id === identity)) throw new Error('Unknown browser identity.');
  const target = ((saved || options.extension) && extensionUrl(url)) || address(url,preferences.searchEngine,preferences.customSearchURL); if (!target) throw new Error('Use an HTTP(S) address without embedded credentials, or a search.');
  if (!saved && extensionUrl(target) && !authorizedExtensionURL(identity,target)) throw new Error('The extension page is not currently authorized in this identity.');
  const record = saved || {id:crypto.randomUUID(),url:target,title:target === 'about:blank' ? 'New tab' : 'Loading…',identity,workspaceId:activeWorkspaceId};
  const tab = tabFromSaved({...record,url:target,identity});
  const foreground=options.active!==false||!active();
  tabs.splice(Math.min(position,tabs.length),0,tab);hostEvent(tab.identity,'tabs.onCreated',{...tabDescriptor(tab),active:foreground,highlighted:foreground});
  if(foreground)activate(tab.id);else ensureView(tab);publish();
  if(foreground&&target==='about:blank')send('focus-address');return tab.id;
}
function removeView(tab) {
  tabPreview.invalidate(tab.id);
  tab.faviconRevision++;tab.favicon='';
  if (!tab.view) return;
  const view = tab.view; tab.view = null;
  nativeTabs.delete(view.webContents.id);win.contentView.removeChildView(view);view.webContents.close();
}
function closeTab(id) {
  tabPreview.invalidate(id);
  if (closing) return;
  const index = tabs.findIndex(tab => tab.id === id); if (index < 0) return;
  const workspaceIndex=visibleTabs().findIndex(tab=>tab.id===id);
  const [tab] = tabs.splice(index,1);if(workspaceLastTabs.get(tabWorkspace(tab))===id)workspaceLastTabs.delete(tabWorkspace(tab));closed.push({saved:savedTab(tab),position:index,closedId:crypto.randomUUID()}); removeView(tab);runtimeTabs.delete(tab.runtimeId);
  sidebarExtensionAPI?.dropTab(tab.identity,tab.runtimeId);
  hostEvent(tab.identity,'tabs.onRemoved',tab.runtimeId,{windowId:win.id,isWindowClosing:false});
  paneLayouts=paneLayouts.map(tree=>paneLayout.remove(tree,id)).filter(tree=>paneLayout.ids(tree).length>1);
  paneTree=paneLayout.remove(paneTree,id);if(paneTree&&activeId===id)activate(paneLayout.ids(paneTree)[0]);
  if (!tabs.length) newTab();
  else if (activeId === id) {const candidates=visibleTabs();if(candidates.length)activate(candidates[Math.min(Math.max(workspaceIndex,0),candidates.length-1)].id);else newTab();}
  layout(); publish();
}
function restoreTab() {
  const record = closed.pop();
  if (record) newTab(record.saved.url,record.saved.identity,record.saved,record.position);
}
function restoreClosed(id) {
  const index=closed.findIndex(item=>item.closedId===id);
  if (index<0) throw new Error('That closed tab is no longer available.');
  const record=closed[index];newTab(record.saved.url,record.saved.identity,record.saved,record.position);closed.splice(index,1);
}
function navigate(value) {
  const url = address(value,preferences.searchEngine,preferences.customSearchURL); if (!url) throw new Error('Use an HTTP(S) address without embedded credentials, or a search.');
  let tab = active(); if (!tab) return newTab(url); tabPreview.invalidate(tab.id);
  showPage(); tab.url = url;tab.pendingTransition='typed';
  if (url === 'about:blank') { removeView(tab); tab.title = 'New tab';hostEvent(tab.identity,'tab-navigation-committed',tab.runtimeId,{sameDocument:false}); }
  else if (!tab.view) ensureView(tab);
  else if (!tab.initializing) tab.view.webContents.loadURL(url).catch(error => notice(`Navigation failed: ${error.message}`));
  layout(); publish();
}
function focusChrome(channel) {win.webContents.focus();send(channel);}
function findTab(id) {const tab=tabs.find(row=>row.id===id);if(!tab)throw new Error('Tab not found.');return tab;}
function runtimeTab(identity,id) {const tab=runtimeTabs.get(id);if(!tab||tab.identity!==identity)throw new Error('No tab with this ID exists in this browser identity.');return tab;}
function paneMembers(tab){const tree=[paneTree,...paneLayouts].find(tree=>paneLayout.ids(tree).includes(tab.id)),ids=paneLayout.ids(tree);return ids.length>1?tabs.filter(t=>ids.includes(t.id)):[tab];}
function requirePaneIdentity(tab,identity){if(paneMembers(tab).some(member=>member.identity!==identity))throw new Error('A split spanning other identities can only be rearranged by the browser user.');}
function moveTab(tab,index,after) {
  if(!Number.isInteger(index)||index<0||index>=tabs.length)throw new Error('Choose an existing tab position.');
  const members=paneMembers(tab),anchor=tabs[index];if(members.includes(anchor))return;
  const before=new Map(members.map(t=>[t.id,tabDescriptor(t).index])),forward=after??(index>tabs.indexOf(tab));tabs=paneLayout.moveUnit(tabs,members,paneMembers(anchor),forward);
  publish();for(const item of members)hostEvent(item.identity,'tabs.onMoved',item.runtimeId,{windowId:win.id,fromIndex:before.get(item.id),toIndex:tabDescriptor(item).index});
}
function pinTab(tab,pinned) {
  if(typeof pinned!=='boolean')throw new Error('Choose whether this tab is pinned.');
  const members=paneMembers(tab);if(members.every(t=>Boolean(t.saved.pinned)===pinned))return;
  for(const item of members){item.saved={...item.saved,pinned};hostEvent(item.identity,'tabs.onUpdated',item.runtimeId,{pinned},tabDescriptor(item));}
  const peers=tabs.filter(t=>!members.includes(t)&&tabWorkspace(t)===tabWorkspace(tab)),anchor=pinned?peers.find(t=>!t.saved.pinned):peers.filter(t=>t.saved.pinned).at(-1);if(anchor)moveTab(tab,tabs.indexOf(anchor),!pinned);publish();
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
  const members=paneMembers(tab),movingUnit=members.length>1;
  if(members.every(member=>tabWorkspace(member)===workspaceId&&(member.saved.groupId||null)===groupId))return;
  for(const member of members){const previousWorkspace=tabWorkspace(member);if(previousWorkspace!==workspaceId&&workspaceLastTabs.get(previousWorkspace)===member.id)workspaceLastTabs.delete(previousWorkspace);member.saved={...member.saved,workspaceId,groupId};}
  if(members.some(member=>member.id===activeId)){activeWorkspaceId=workspaceId;workspaceLastTabs.set(workspaceId,activeId);if(!movingUnit)paneTree={tabId:activeId};}
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
    sidebar:sidebarExtensionAPI,
    messageSource:nativeId=>{
      const contents=webContents.fromId(nativeId);
      if(!contents||contents.isDestroyed())return null;
      return {contents,owner:extensionWindows.get(BrowserWindow.fromWebContents(contents))||sidebarExtension?.ownerFor(nativeId)||null};
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
        if(url!=='about:blank'&&!httpUrl(url)&&!authorizedExtensionURL(identity,url))throw new Error('This tab URL is not supported or is not authorized in this identity.');
        const position=properties.index===undefined?tabs.length:tabs.indexOf(tabs.filter(tab=>tab.identity===identity)[properties.index]);
        if(properties.index!==undefined&&(!Number.isInteger(properties.index)||properties.index<0||properties.index>tabs.filter(tab=>tab.identity===identity).length))throw new Error('Invalid new-tab index.');
        const id=newTab(url,identity,null,position<0?tabs.length:position,{active:properties.active!==false,extension:!!extensionUrl(url)}),tab=findTab(id);
        if(properties.pinned!==undefined)pinTab(tab,properties.pinned);
        return tabDescriptor(tab);
      },
      update:(identity,id,properties={})=>{
        options(properties,['url','pinned','muted','active'],['pinned','muted','active']);
        if(properties.url!==undefined&&properties.url!=='about:blank'&&!httpUrl(properties.url)&&!authorizedExtensionURL(identity,properties.url))throw new Error('This tab URL is not supported or is not authorized in this identity.');
        const tab=id===undefined?tabs.find(row=>row.identity===identity&&row.id===activeId):runtimeTab(identity,id);
        if(!tab)throw new Error('No active tab in this browser identity.');
        if(properties.pinned!==undefined)requirePaneIdentity(tab,identity);
        if(properties.url!==undefined){tab.url=properties.url;tab.pendingTransition='link';
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
        for(const tab of selected)requirePaneIdentity(tab,identity);
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
  cancelSidebarDismiss();
  const proposed=preferenceStore.applyPreferences(preferences,value);
  const oldApps=preferences.sidebarApps;
  spellcheck.setEnabled(proposed.spellcheckEnabled);
  preferences=proposed;
  for(const old of oldApps)if(!proposed.sidebarApps.some(item=>item.id===old.id&&item.url===old.url))for(const profile of profiles)sidebarWeb.release({identity:profile.id,url:old.url});
  preferencePreview=null;buildMenu();syncSidebarWeb();animateSidebar();publish(false);publishHistory();publishBookmarks();
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
    {label:'Following · creators and projects',click:()=>invoke('following')},{label:'Workspaces and tab groups',click:()=>invoke('workspaces')},{label:'Save page as PDF',click:()=>invoke('save-pdf')},
    {label:'Save visible screenshot',click:()=>invoke('save-screenshot')},{label:'Resource monitor',click:()=>invoke('resources')},
    {label:'Customize',click:()=>invoke('settings')},{type:'separator'},{role:'quit'}]}]));
}
function showBrowserMenu(anchor){
  const invoke=(name,value)=>runBrowserOperation(name,value).catch(error=>{notice(error.message);layout();publish(false);});
  const shortcuts=new Map(preferenceStore.shortcutList(preferences).map(item=>[item.id,item.accelerator]));
  const panels=new Set(['history','downloads','bookmarks','extensions','vault','workspaces','accounts','permissions','following','resources','tools','settings','mods']);
  const item=(label,name,extra={})=>({label,...(shortcuts.get(name)?{accelerator:shortcuts.get(name)}:{}),...extra,click:()=>{if(!panels.has(name)||panel!==name)invoke(name);}});
  const menu=Menu.buildFromTemplate([
    item('New tab','new'),item('Reopen closed tab','restore',{enabled:closed.length>0}),{type:'separator'},
    item('Find in page','focus-find'),item('Search tabs','search-tabs'),{label:'Zoom',submenu:[item('Zoom in','zoom-in'),item('Zoom out','zoom-out'),item('Reset zoom','zoom-reset')]},
    {type:'separator'},item('History','history'),item('Downloads','downloads'),item('Bookmarks','bookmarks'),item('Extensions','extensions'),item('Library','vault'),
    item('Workspaces and tab groups','workspaces'),item('Accounts and identities','accounts'),item('Passwords','show-passwords'),item('Site permissions','permissions'),
    {label:'More tools',submenu:[item('Following','following'),item('Resource monitor','resources'),item('Save page as PDF','save-pdf'),item('Save visible screenshot','save-screenshot'),item('Developer tools','devtools'),item('All browser tools','tools')]},
    item('Mods','mods'),{type:'separator'},item('Settings','settings'),{type:'separator'},{role:'quit',label:'Exit Noxviola'}
  ]);
  const [width,height]=win.getContentSize(),valid=anchor&&['x','y','width','height'].every(key=>Number.isFinite(anchor[key]));
  const options={window:win};if(valid){options.x=Math.max(0,Math.min(width-1,Math.round(anchor.x+anchor.width-250)));options.y=Math.max(0,Math.min(height-1,Math.round(anchor.y+anchor.height)));}menu.popup(options);
}
async function perform(name, value) {
  const wc = active()?.view?.webContents;
  switch (name) {
    case 'state': return stateView();
    case 'browser-menu':showBrowserMenu(value?.anchor);break;
    case 'tab-preview': if (value?.open) {void tabPreview.show(String(value.id||''),value.position).catch(()=>notice('Tab preview is unavailable.'));} else tabPreview.hide(); break;
    case 'search-tabs': {const width=win.getContentSize()[0],right=preferences.tabSearchPosition==='right',anchor=value?.anchor||{x:right?width-180:38,y:0,width:28,height:34,align:right?'right':'left'};tabPreview.hide();tabSearch.show(anchor);break;}
    case 'sidebar-toggle':changeSidebar({sidebarVisible:!preferences.sidebarVisible});break;
    case 'show-passwords':case 'show-notifications':case 'show-media':case 'show-extension-panels':{
      if(panel)setPanel(panel);
      changeSidebar({sidebarVisible:true,sidebarExpanded:true,sidebarActive:name.slice(5)});
      break;
    }
    case 'sidebar-rail-expand':changeSidebar({sidebarRailExpanded:!preferences.sidebarRailExpanded});break;
    case 'sidebar-pin':changeSidebar({sidebarPanelPinned:!preferences.sidebarPanelPinned});break;
    case 'sidebar-select':{
      if(typeof value!=='string')throw new Error('Choose a sidebar panel.');
      const closingCurrent=preferences.sidebarVisible&&preferences.sidebarExpanded&&preferences.sidebarActive===value;
      changeSidebar({sidebarVisible:true,sidebarActive:value,sidebarExpanded:!closingCurrent});break;
    }
    case 'sidebar-close':changeSidebar({sidebarExpanded:false});if(!panel&&active()?.view)active().view.webContents.focus();else win.webContents.focus();break;
    case 'sidebar-width':if(!Number.isInteger(value))throw new Error('Choose a sidebar width.');changeSidebar({sidebarWidth:Math.max(180,Math.min(1600,value))});break;
    case 'sidebar-web-reload':sidebarWeb.reload();break;
    case 'sidebar-web-back':sidebarWeb.back();break;
    case 'sidebar-web-forward':sidebarWeb.forward();break;
    case 'sidebar-web-mute':sidebarWeb.mute(value===true);break;
    case 'sidebar-web-unload':{
      const opened=sidebarWeb.state();
      if(!opened.visible||opened.identity!==currentIdentity)throw new Error('Choose an open sidebar application.');
      changeSidebar({sidebarExpanded:false});sidebarWeb.release({identity:currentIdentity,url:opened.site});break;
    }
    case 'sidebar-data':{
      const type=preferences.sidebarActive;
      if(type==='passwords')return passwordData();
      if(type==='media')return mediaControls.list(currentIdentity);
      if(type==='notifications')return {identity:currentIdentity,items:permissions.list().filter(item=>item.identity===currentIdentity&&item.permission==='notifications')};
      if(type==='extension-panels')return {identity:currentIdentity,items:sidebarExtensionAPI.list(currentIdentity)};
      if(type==='bookmarks')return serviceView(bookmarks,()=>({identity:currentIdentity,tree:bookmarks.getTree(currentIdentity)}));
      if(type==='history')return serviceView(history,()=>({identity:currentIdentity,...history.query(currentIdentity,{})}));
      if(type==='downloads')return {identity:currentIdentity,items:downloads.list().filter(item=>item.identity===currentIdentity)};
      if(type==='tabs')return {identity:currentIdentity,tabs:stateView().tabs,activeId};
      if(type==='accounts')return sidebarAccountData({identity:currentIdentity,profiles,accounts,error:accountError,recoveryAvailable:!!accountRecovery});
      return {identity:currentIdentity};
    }
    case 'sidebar-account-open':{const target=sidebarAccountRoute({id:value?.id,identity:value?.identity,currentIdentity,profiles,accounts,error:accountError});newTab(target.url,target.identity);break;}
    case 'password-list':return passwordData();
    case 'password-unlock':await passwords.unlock();publishPasswords();return passwordData();
    case 'password-lock':passwords.lock();publishPasswords();break;
    case 'password-save':{requireCurrentIdentity(value);return passwords.save(value);}
    case 'password-remove':{const identity=requireCurrentIdentity(value);await passwords.remove(identity,value.id);break;}
    case 'password-read-page':{const identity=requireCurrentIdentity(value),target=passwordTarget(identity),context=await passwordPage.prepare(target.contents);requirePasswordTarget(target,identity);const result=await passwordPage.read(context);requirePasswordTarget(target,identity);return {...result,identity};}
    case 'password-fill':{
      const identity=requireCurrentIdentity(value),target=passwordTarget(identity),context=await passwordPage.prepare(target.contents);
      const credential=await passwords.reveal(identity,value.id,context.origin);requirePasswordTarget(target,identity);
      const result=await passwordPage.fill(context,credential);requirePasswordTarget(target,identity);return result;
    }
    case 'password-reveal':{
      const identity=requireCurrentIdentity(value),choice=await dialog.showMessageBox(win,{type:'question',title:'Reveal saved password',message:'Show this password in the sidebar?',detail:'Anyone viewing your screen can read it.',buttons:['Cancel','Reveal password'],defaultId:0,cancelId:0,noLink:true});
      if(choice.response!==1)return null;requireCurrentIdentity(value);const result=await passwords.reveal(identity,value.id);requireCurrentIdentity(value);return {identity,id:result.id,password:result.password};
    }
    case 'password-recover':{const choice=await dialog.showMessageBox(win,{type:'warning',message:'Restore the previous encrypted password checkpoint?',detail:'The current file will be preserved separately.',buttons:['Cancel','Restore'],defaultId:0,cancelId:0,noLink:true});if(choice.response===1)await passwords.recover();publishPasswords();break;}
    case 'player-options':return {services:Object.entries(playerServices).map(([id,[name]])=>({id,name})),presets:Object.keys(audioPresets)};
    case 'mods-state':return mods.snapshot();
    case 'mods-store':return newTab('https://store.gx.me/mods/');
    case 'mods-addons':return newTab('https://addons.opera.com/');
    case 'mods-inspect':{
      const archive=value==='zip';
      const {canceled,filePaths}=await dialog.showOpenDialog(win,{title:archive?'Inspect a GX mod ZIP':'Inspect an unpacked GX mod',
        properties:[archive?'openFile':'openDirectory'],...(archive?{filters:[{name:'GX mod source ZIP',extensions:['zip']}]}:{})});
      if(canceled||!filePaths[0])return;
      try{await mods.prepare(filePaths[0],archive);}
      finally{publishMods();}
      break;
    }
    case 'mods-accept':try{await mods.accept();}finally{publishMods();}break;
    case 'mods-cancel':await mods.cancel();publishMods();break;
    case 'mods-choose':mods.choose(value?.category,value?.id);publishMods();break;
    case 'mods-remove':mods.remove(value);publishMods();break;
    case 'mods-recover':{
      const choice=await dialog.showMessageBox(win,{type:'question',message:'Restore the previous mod library?',detail:'The current checkpoint is preserved separately.',buttons:['Cancel','Restore'],defaultId:0,cancelId:0,noLink:true});
      if(choice.response===1){await mods.recover();publishMods();}
      break;
    }
    case 'media-list':return mediaControls.list(currentIdentity);
    case 'media-action':{const identity=requireCurrentIdentity(value);return mediaControls.act(identity,value);}
    case 'sidebar-extension-open':{requireCurrentIdentity(value);return sidebarExtensionAPI.openFromUser(value);}
    case 'sidebar-extension-reload':return sidebarExtension.reload();
    case 'sidebar-extension-unload':{const state=sidebarExtension.state();sidebarExtension.release({id:state.id,identity:state.identity,kind:state.kind});changeSidebar({sidebarExpanded:false});break;}
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
    case 'tab-duplicate':{const tab=findTab(value);newTab(tab.url,tab.identity,{...savedTab(tab),id:crypto.randomUUID()},tabs.indexOf(tab)+1);break;}
    case 'tab-reload':{const tab=findTab(value);if(tab.url==='about:blank')break;const view=ensureView(tab);if(view&&!tab.initializing&&!view.webContents.isDestroyed())view.webContents.reload();break;}
    case 'tab-move':{const tab=findTab(value?.id),members=paneMembers(tab),peers=tabs.filter(row=>tabWorkspace(row)===tabWorkspace(tab));let index=value?.index;
      if(index===undefined&&Number.isInteger(value?.offset)){const positions=members.map(t=>peers.indexOf(t));index=(value.offset<0?Math.min(...positions):Math.max(...positions))+value.offset;}
      if(!Number.isInteger(index)||index<0||index>=peers.length)throw new Error('This tab cannot move farther in that direction.');moveTab(tab,tabs.indexOf(peers[index]));break;}
    case 'tab-assign':assignTab(findTab(value?.id),value?.workspaceId,value?.groupId||null);break;
    case 'tab-menu':{
      const tab=findTab(typeof value==='string'?value:value?.id),invoke=(command,arg)=>runBrowserOperation(command,arg).catch(error=>notice(error.message));
      const peers=visibleTabs(),index=peers.indexOf(tab),workspace=tabWorkspace(tab),groups=workspaces.listGroups(workspace);
      const [width,height]=win.getContentSize(),position=value?.position,popup={window:win};
      if(position&&Number.isFinite(position.x)&&Number.isFinite(position.y)){popup.x=Math.max(0,Math.min(width-1,Math.round(position.x)));popup.y=Math.max(0,Math.min(height-1,Math.round(position.y)));}
      Menu.buildFromTemplate([
        {label:'Reload tab',enabled:tab.url!=='about:blank',click:()=>invoke('tab-reload',tab.id)},
        {label:'Duplicate tab',click:()=>invoke('tab-duplicate',tab.id)},
        {type:'separator'},
        {label:tab.saved.pinned?'Unpin tab':'Pin tab',click:()=>invoke('tab-pin',{id:tab.id,pinned:!tab.saved.pinned})},
        {label:tab.saved.muted?'Unmute tab':'Mute tab',click:()=>invoke('tab-mute',{id:tab.id,muted:!tab.saved.muted})},
        {label:'Move left / up',enabled:index>0,click:()=>invoke('tab-move',{id:tab.id,offset:-1})},
        {label:'Move right / down',enabled:index>=0&&index<peers.length-1,click:()=>invoke('tab-move',{id:tab.id,offset:1})},
        {label:'Move to workspace',submenu:workspaces.list().map(item=>({label:item.name,type:'radio',checked:tabWorkspace(tab)===item.id,click:()=>invoke('tab-assign',{id:tab.id,workspaceId:item.id})}))},
        {label:'Move to group',submenu:[{label:'No group',type:'radio',checked:!tab.saved.groupId,click:()=>invoke('tab-assign',{id:tab.id,workspaceId:workspace})},...groups.map(group=>({label:group.name,type:'radio',checked:tab.saved.groupId===group.id,click:()=>invoke('tab-assign',{id:tab.id,workspaceId:workspace,groupId:group.id})})),{type:'separator'},{label:'Manage tab groups…',click:()=>{if(panel!=='workspaces')invoke('workspaces');}}]},
        {type:'separator'},{label:'Close tab',click:()=>invoke('close',tab.id)}
      ]).popup(popup);break;
    }
    case 'pane-focus':{if(!paneLayout.ids(paneTree).includes(value))throw new Error('Pane not found.');activate(value);active()?.view?.webContents.focus();break;}
    case 'pane-split':{const id=value?.id||activeId;if(!paneLayout.ids(paneTree).includes(id)||!['x','y'].includes(value?.axis))throw new Error('Invalid pane split.');const tab=tabs.find(t=>t.id===id);const next=newTab('about:blank',tab.identity,null,tabs.length,{active:false});const added=findTab(next);added.saved={...added.saved,groupId:tab.saved.groupId||null,pinned:!!tab.saved.pinned};paneTree=paneLayout.split(paneTree,id,next,value.axis);activate(next);publish();break;}
    case 'pane-hide':{if(!paneLayout.ids(paneTree).includes(value)||paneLayout.ids(paneTree).length<2)throw new Error('Keep at least one pane open.');paneTree=paneLayout.remove(paneTree,value);if(activeId===value)activate(paneLayout.ids(paneTree)[0]);layout();publish();break;}
    case 'pane-swap':{const ids=paneLayout.ids(paneTree);if(!ids.includes(value?.first)||!ids.includes(value?.second)||value.first===value.second)throw new Error('Choose two different panes.');const swap=n=>n.tabId?{tabId:n.tabId===value.first?value.second:n.tabId===value.second?value.first:n.tabId}:{...n,first:swap(n.first),second:swap(n.second)};paneTree=swap(paneTree);layout();publish();break;}
    case 'pane-resize':{paneTree=paneLayout.resize(paneTree,value?.path,value?.ratio);layout();publish();break;}
    case 'pane-navigate':{if(!paneLayout.ids(paneTree).includes(value?.id))throw new Error('Pane not found.');activate(value.id);navigate(value.url);break;}
    case 'pane-identity':{const tab=tabs.find(t=>t.id===value?.id);if(!tab||!paneLayout.ids(paneTree).includes(tab.id)||!profiles.some(p=>p.id===value?.identity))throw new Error('Choose an existing pane and identity.');if(tab.identity===value.identity)break;if(extensionUrl(tab.url))throw new Error('Open extension pages separately in their enrolled identity.');const next=newTab(tab.url,value.identity,null,tabs.length,{active:false});const added=findTab(next);added.saved={...added.saved,groupId:tab.saved.groupId||null,pinned:!!tab.saved.pinned};paneTree=paneLayout.replace(paneTree,tab.id,{tabId:next});activate(next);publish();break;}
    case 'split': {
      if(paneLayout.ids(paneTree).length>1)paneTree={tabId:activeId};
      else {const other=visibleTabs().find(tab=>tab.id!==activeId&&tab.url!=='about:blank'&&!paneLayouts.some(tree=>paneLayout.ids(tree).includes(tab.id)));if(other){other.saved={...other.saved,groupId:active().saved.groupId||null,pinned:!!active().saved.pinned};paneTree=paneLayout.split(paneTree||{tabId:activeId},activeId,other.id,'x');ensureView(other);}else{const owner=active(),next=newTab('about:blank',currentIdentity,null,tabs.length,{active:false});findTab(next).saved={...findTab(next).saved,groupId:owner.saved.groupId||null,pinned:!!owner.saved.pinned};paneTree=paneLayout.split(paneTree||{tabId:activeId},activeId,next,'x');}}
      showPage();layout();publish();break;
    }
    // Electron's findNext maps to Chromium new_session: true starts a search.
    // Our command's findNext means a follow-up, so its native flag is inverted.
    case 'find':{const query=typeof value==='string'?value:value?.query;if(query&&wc)findSession.search(wc,String(query),{forward:value?.forward!==false,findNext:value?.findNext!==true});else{if(wc)findSession.clear(wc);send('find-result',{matches:0,activeMatchOrdinal:0});}break;}
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
    case 'following':case 'tools':case 'vault':case 'accounts':case 'extensions':case 'downloads':case 'permissions':case 'settings':case 'capabilities':case 'bookmarks':case 'history':case 'workspaces':case 'resources':case 'mods':setPanel(name);break;
    case 'resource-sample':return resourceMonitor.sample();
    case 'history-query':return history.query(currentIdentity,value||{});
    case 'history-settings':{const {identity=currentIdentity,...changes}=value||{};history.configure(identity,changes);publishHistory();break;}
    case 'history-open':{const identity=typeof value==='object'?value.identity:currentIdentity,url=typeof value==='object'?value.url:value;if(!httpUrl(url))throw new Error('Invalid history address.');newTab(url,identity);break;}
    case 'history-remove':history.deleteUrl(typeof value==='object'?value.identity:currentIdentity,typeof value==='object'?value.url:value);publishHistory();break;
    case 'history-clear':{const identity=value?.identity||currentIdentity;history.settings(identity);const choice=await dialog.showMessageBox(win,{type:'question',message:`Remove history for ${profiles.find(profile=>profile.id===identity)?.name||identity}?`,detail:'This removes the active history list. Recovery checkpoints can retain earlier records; this is not secure erasure of browsing data.',buttons:['Cancel','Remove history entries'],defaultId:0,cancelId:0,noLink:true});if(choice.response===1)history.clear(identity);publishHistory();break;}
    case 'history-recover':await recoverService(history,'history');publishHistory();break;
    case 'follow-add':{const {identity=currentIdentity,...input}=value||{};const result=follows.add(identity,input);publishFollows();return result;}
    case 'follow-list':publishFollows();break;
    case 'follow-change':{const {identity=currentIdentity,id,...patch}=value||{};follows.change(identity,id,patch);publishFollows();break;}
    case 'follow-refresh':await follows.refresh(value?.identity||currentIdentity,value?.id);publishFollows();break;
    case 'follow-evidence-open':{const source=follows.get(value?.identity||currentIdentity,value?.id);const record=source.transitions?.[value?.transitionIndex];const section=['status_evidence','identity_evidence','project_mappings'].includes(value?.section)?value.section:null;const address=section?record?.[section]?.[value?.evidenceIndex]?.[section==='project_mappings'?'evidence_url':'url']:null;if(!address)throw new Error('Saved transition evidence not found.');newTab(address,source.identity);break;}
    case 'follow-open':{const source=follows.get(value?.identity||currentIdentity,value?.id);const address=value?.itemId?source.items.find(item=>item.id===value.itemId)?.url:source.url;if(!address)throw new Error('Saved update not found.');newTab(address,source.identity);break;}
    case 'follow-recover':await recoverService(follows,'following');publishFollows();break;
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
    case 'workspace-remove':workspaces.remove(value);workspaceLastTabs.delete(value);publish();publishWorkspaces();break;
    case 'workspace-switch':{
      workspaces.get(value);if(value===activeWorkspaceId){showPage();break;}activeWorkspaceId=value;splitId=null;const candidates=visibleTabs(),tab=candidates.find(item=>item.id===workspaceLastTabs.get(value))||candidates[0];if(tab)activate(tab.id);else newTab();publishWorkspaces();break;
    }
    case 'workspace-recover':await recoverService(workspaces,'workspaces');publishWorkspaces();break;
    case 'group-split':{
      const group=workspaces.getGroup(value),members=tabs.filter(tab=>tab.saved.groupId===group.id&&tabWorkspace(tab)===group.workspaceId),ids=members.map(tab=>tab.id);if(!ids.length)throw new Error('This group has no tabs to show.');
      const membership=new Set(ids),existing=[paneTree,...paneLayouts].find(tree=>{const leaves=paneLayout.ids(tree);return leaves.length===ids.length&&leaves.every(id=>membership.has(id));});if(existing){activate(ids.includes(activeId)?activeId:ids[0]);break;}
      const next=paneLayout.fromTabs(ids),selected=new Set(ids),remaining=[paneTree,...paneLayouts].map(tree=>{for(const id of selected)tree=paneLayout.remove(tree,id);return tree;}).filter(tree=>paneLayout.ids(tree).length>1);
      paneLayouts=remaining;paneTree=next;activate(ids.includes(activeId)?activeId:ids[0]);publish();break;
    }
    case 'group-menu':{
      const group=workspaces.getGroup(value),count=tabs.filter(tab=>tab.saved.groupId===group.id&&tabWorkspace(tab)===group.workspaceId).length;
      Menu.buildFromTemplate([{label:group.name,enabled:false},{label:`Show all ${count} tabs in split view`,enabled:count>0,click:()=>invoke('group-split',group.id)},{label:group.collapsed?'Expand group':'Collapse group',click:()=>invoke('group-update',{id:group.id,collapsed:!group.collapsed})},{type:'separator'},{label:'Manage group name and color…',click:()=>invoke('workspaces')}]).popup({window:win});break;
    }
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
    case 'extension-enable': return extensionOperation(async () => { if (value?.enabled === false) closeExtensionWindows(value.id,value.identity); const result=await extensions.setEnabled(value?.id,value?.identity,value?.enabled);if(value?.enabled===true&&active()?.identity===value?.identity)ensureView(active());return result; });
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
  closing = false;refreshLiveTabs();animateSidebar();
  notice(message); publish();
}
async function requestClose() {
  if (closing || allowClose || !win || win.isDestroyed()) return;
  tabPreview.hide();tabSearch.dismiss();clearTimeout(sidebarTimer);cancelSidebarDismiss();
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
  closeExtensionWindows();sidebarWeb.destroy();sidebarExtensionAPI?.destroy();sidebarExtension?.destroy();passwords?.dispose();mediaControls.dispose();
  try { if (!extensionError) await extensions.dispose(); } catch (error) { notice(error.message); }
  try{await extensionBridge?.dispose();}catch(error){notice(`Extension host cleanup: ${error.message}`);}clearInterval(followTimer);follows?.dispose();history?.dispose();bookmarks?.dispose();workspaces?.dispose();
  permissions.dispose(); downloads.dispose(); await writer.close().catch(() => {});
  allowClose = true; win.close();
}
async function start() {
  app.setAppUserModelId('org.noxviola.browser'); dataDirectory = app.getPath('userData'); sessionFile = path.join(dataDirectory,'browser-session.json');
  mods=new GxModLibrary(path.join(dataDirectory,'gx-mods'));
  try{await mods.open();modPresentation=mods.presentation();activeWebMod=mods.data.active.page_styles;}catch(error){mods.error=error.message;}
  session.defaultSession.protocol.handle('nox-mod',async request=>{
    try{
      if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405});
      const asset=await mods.verifyAsset(request.url);
      if(!asset)return new Response(null,{status:404});
      const response=await net.fetch(pathToFileURL(asset.location).href,{method:request.method,signal:request.signal});
      const headers=new Headers(response.headers);
      headers.set('Content-Type',asset.format);
      headers.set('Content-Security-Policy','sandbox');
      headers.set('X-Content-Type-Options','nosniff');
      return new Response(response.body,{status:response.status,headers});
    }catch{return new Response(null,{status:404});}
  });
  let restored = inspectState(sessionFile);
  if (restored.status === 'recovery') {
    const choice = await dialog.showMessageBox({type:'warning',title:'Recover your Noxviola session',message:'The current session needs recovery.',detail:`${restored.reason}\nRestore the previous checkpoint? The current file will be preserved separately.`,buttons:['Exit without changing files','Restore previous checkpoint'],defaultId:0,cancelId:0,noLink:true});
    if (choice.response !== 1) {app.quit();return;}
    restored = {value:recoverState(sessionFile,restored.preview).value};
  }
  originalSession = restored.value; profiles = originalSession.profiles; preferences = originalSession.preferences;sidebarProgress=preferences.sidebarVisible&&preferences.sidebarExpanded?1:0;sidebarRailProgress=preferences.sidebarRailExpanded?1:0;
  spellcheck=new SpellcheckService({enabled:preferences.spellcheckEnabled,canAct:()=>!closing,onError:notice});
  spellcheck.attach(session.defaultSession);
  resolveIdentitySession = createIdentitySessionResolver({session,root:app.getPath('sessionData')});
  tabs = originalSession.tabs.map(tabFromSaved); activeId = originalSession.activeId;paneTree=originalSession.paneTree|| (activeId?{tabId:activeId}:null);paneLayouts=originalSession.paneLayouts||[];
  for(const [workspace,id] of Object.entries(originalSession.workspaceLastTabs||{}))workspaceLastTabs.set(workspace,id);
  currentIdentity = active()?.identity || 'personal';
  passwords=new PasswordStore({file:path.join(dataDirectory,'browser-passwords.encrypted.json'),safeStorage,getIdentities:()=>profiles.map(profile=>profile.id),onChange:publishPasswords});
  try{await passwords.open();}catch{/* The password sidebar exposes its preserved recovery/error state. */}
  activeWorkspaceId=active()?tabWorkspace(active()):originalSession.activeWorkspaceId||'default';
  if(active())workspaceLastTabs.set(activeWorkspaceId,activeId);
  vaultFile = path.join(dataDirectory,'private-vault.json'); accountFile = path.join(dataDirectory,'private-accounts.json');
  try { const opened = vaultStore.inspect(vaultFile); if (opened.status === 'recovery') {vaultRecovery = opened;vaultError = 'The library needs explicit recovery before editing.';} else vaultDocument = opened.value; } catch (error) {vaultError = error.message;}
  try { const opened = accountStore.inspect(accountFile); if (opened.status === 'recovery') {accountRecovery = opened;accountError = 'The account inventory needs explicit recovery before editing.';} else accounts = opened.value.accounts; } catch (error) {accountError = error.message;}
  follows=new FollowService({file:path.join(dataDirectory,'browser-follows.json'),getIdentities:()=>profiles.map(profile=>profile.id),onChange:publishFollows});
  history=new HistoryService({file:path.join(dataDirectory,'browser-history.json'),getIdentities:()=>profiles.map(profile=>profile.id),onChange:publishHistory});
  bookmarks=new BookmarkService({file:path.join(dataDirectory,'browser-bookmarks.json'),getIdentities:()=>profiles.map(profile=>profile.id),onChange:publishBookmarks});
  workspaces=new WorkspaceService({file:path.join(dataDirectory,'browser-workspaces.json'),onChange:publishWorkspaces,isWorkspaceInUse:id=>tabs.some(tab=>tabWorkspace(tab)===id),isGroupInUse:id=>tabs.some(tab=>tab.saved.groupId===id)});
  for(const service of [history,bookmarks,workspaces,follows])try{service.open();}catch{/* The corresponding panel retains the service error and recovery state. */}
  followTimer=setInterval(()=>follows.tick().catch(error=>notice(`Following: ${error.message}`)),60000);followTimer.unref();
  permissions = new PermissionManager({file:path.join(dataDirectory,'site-permissions.json'),onChange:publishPermissions,prompt:async request => {
    if (closing || !win || win.isDestroyed() || request.signal?.aborted) return 'block';
    const identity = profiles.find(profile => profile.id === request.identity)?.name || request.identity;
    const response = await dialog.showMessageBox(win,{type:'question',title:'Site permission',message:`Allow ${request.permissions.join(' and ')}?`,detail:`Requesting site: ${request.requestingOrigin}\nEmbedded by: ${request.embeddingOrigin}\nIdentity: ${identity}`,buttons:['Block','Allow once','Always allow'],defaultId:0,cancelId:0,noLink:true,signal:request.signal});
    if (closing || request.signal?.aborted) return 'block';
    return response.response === 2 ? 'allow' : response.response === 1 ? 'allow-once' : 'block';
  }});
  try {permissionOpening = permissions.open();} catch (error) {permissionOpening = {status:'blocked',error:error.message};}
  downloads = new DownloadManager({directory:app.getPath('downloads'),reveal:file => shell.showItemInFolder(file),file:path.join(dataDirectory,'browser-downloads.json'),getIdentities:()=>profiles.map(profile=>profile.id)});
  downloads.on('change', () => { if (panel === 'downloads'||preferences.sidebarVisible&&preferences.sidebarExpanded&&preferences.sidebarActive==='downloads') send('downloads',downloads.list()); });
  downloads.on('status', () => publish(false));
  try { downloads.open(); } catch { /* Downloads exposes its history error and recovery controls without hiding live transfers. */ }
  extensions = new ExtensionManager({directory:path.join(dataDirectory,'extensions'),getSession:identitySession,getIdentities:() => profiles.map(profile => profile.id),loadExtension:createExtensionLoader({app,webContents})});
  sidebarExtension=createSidebarExtensionPanel({WebContentsView,getWindow:()=>win,manager:extensions,onInteraction:cancelSidebarDismiss,
    onExternalOpen:({url,context})=>{if(currentIdentity===context.identity)eventAction(()=>newTab(url,context.identity));},
    onUserGesture:context=>{if(currentIdentity===context.identity)sidebarExtensionAPI.grantGesture(context);},
    onChange:value=>{if(!value.identity||value.identity===currentIdentity)send('sidebar-extension-state',value);}});
  sidebarExtensionAPI=createSidebarExtensionAPI({manager:extensions,panelHost:sidebarExtension,
    tabs:{get:(identity,id)=>tabDescriptor(runtimeTab(identity,id)),list:identity=>tabs.filter(tab=>tab.identity===identity).map(tabDescriptor)},
    windows:{getCurrent:windowDescriptor},
    reveal:({id,identity,kind,tabId})=>{
      if(closing||identity!==currentIdentity||active()?.runtimeId!==tabId)throw new Error('The selected tab or browser identity changed.');
      if(!preferences.sidebarExpanded||!preferences.sidebarVisible||preferences.sidebarActive!==`extension:${id}:${kind}`)
        changeSidebar({sidebarVisible:true,sidebarExpanded:true,sidebarActive:`extension:${id}:${kind}`},{skipExtension:true});
    },
    hide:({id,identity})=>{if(identity===currentIdentity&&preferences.sidebarActive.startsWith(`extension:${id}:`))changeSidebar({sidebarActive:'extension-panels'});},
    onChange:identity=>{if(identity===currentIdentity)send('sidebar-extension-state',sidebarExtension.state());}});
  extensions.subscribeRuntime(event => {
    if (event.kind !== 'revoked' || !event.runtimeId) return;
    for (const tab of tabs) if (tab.identity === event.identity && extensionUrl(tab.url) && new URL(tab.url).hostname === event.runtimeId) removeView(tab);
    if(event.identity===currentIdentity&&preferences.sidebarActive.startsWith(`extension:${event.id}:`))changeSidebar({sidebarActive:'extension-panels'});
    layout(); publish(false);
  });
  const {createExtensionBridge}=require('./extension-bridge.cjs');
  extensionBridge=createExtensionBridge({ipcMain,manager:extensions,host:extensionHost(),nativeImage});
  try {await extensions.open();} catch (error) {extensionError = error.message;}
  resourceMonitor=new ResourceMonitor({app,webContents,tabs:()=>tabs.map(tab=>({id:tab.id,title:tab.title,identity:tab.identity,webContentsId:tab.view?.webContents.id})),
    extensions:()=>extensions.list().map(item=>({...item,identities:item.identities.map(grant=>({...grant,session:sessionTargets.get(grant.identity)}))}))});
  session.defaultSession.setPermissionCheckHandler(() => false); session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback) => callback(false));
  writer = new SessionWriter(sessionFile); writer.on('result',result => {saveError = result.error || '';if (result.error) notice(`Session not saved: ${result.error}`);publish(false);});
  win = new BrowserWindow({title:'Noxviola',icon:path.join(__dirname,'assets/noxviola.png'),width:1320,height:860,minWidth:700,minHeight:480,backgroundColor:'#171122',autoHideMenuBar:true,
    ...(process.platform === 'win32' ? {titleBarStyle:'hidden',titleBarOverlay:{color:'#171021',symbolColor:'#d9c7ee',height:38}} : {}),
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  win.webContents.setWindowOpenHandler(() => ({action:'deny'})); win.webContents.on('will-navigate',event => event.preventDefault());
  win.webContents.on('context-menu',(_event,params)=>Menu.buildFromTemplate([
    ...spellcheck.contextMenu(win.webContents,params),{role:'copy',enabled:!!params.selectionText},{role:'paste',enabled:params.isEditable},
  ]).popup({window:win}));
  ipcMain.handle('command',command); win.on('resize',()=>{layout();tabSearch.dismiss();});win.on('move',tabSearch.dismiss);win.on('blur',()=>{tabPreview.hide();cancelSidebarDismiss();});win.on('minimize',()=>{tabPreview.hide();tabSearch.dismiss();});
  win.webContents.on('before-mouse-event',(_event,input)=>{if(input.type==='mouseDown')cancelSidebarDismiss();});win.webContents.on('before-input-event',(_event,input)=>{if(input.type==='keyDown')cancelSidebarDismiss();});
  win.on('close',event => {if (!allowClose) {event.preventDefault();requestClose().catch(error => resumeAfterCloseError(error.message));}});
  win.webContents.on('did-finish-load',() => {
    eventAction(() => {if (tabs.length) {for(const id of paneLayout.ids(paneTree))ensureView(tabs.find(tab=>tab.id===id));ensureView(active() || tabs[0]);syncSidebarWeb();layout();publish(false);} else newTab();});
    publishVault();publishAccounts();publishExtensions();publishPermissions();publishBookmarks();publishWorkspaces();publishExtensionActions();
  });
  buildMenu();
  win.setMenuBarVisibility(false);
  await win.loadFile(path.join(__dirname,'index.html'));
}
if (!app.requestSingleInstanceLock()) app.quit();
else app.whenReady().then(start).catch(error => {dialog.showErrorBox('Noxviola could not open safely',`${error.message}\nExisting data was preserved.`);app.quit();});
app.on('second-instance',() => {win?.show();win?.focus();});
app.on('before-quit',event => {if (win && !win.isDestroyed() && !allowClose) {event.preventDefault();requestClose().catch(error => resumeAfterCloseError(error.message));}});
app.on('window-all-closed',() => {sidebarWeb.destroy();tabSearch.destroy();tabPreview.destroy();app.quit();});
