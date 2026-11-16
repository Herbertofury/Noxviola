'use strict';

const path = require('node:path');
const policy = require('./extension-policy.cjs');
const {ExtensionMenus} = require('./extension-menus.cjs');
const {ExtensionIcons} = require('./extension-icons.cjs');
const CHANNEL = 'noxviola-extension:invoke';
const MAP_CHANNEL = 'noxviola-extension:tab-id';
const SUBSCRIBE_CHANNEL = 'noxviola-extension:subscription';
const EVENT_CHANNEL = 'noxviola-extension:event';
const PRELOAD = path.join(__dirname, 'extension-api.preload.cjs');
const EVENTS = new Set(['tabs.onCreated','tabs.onUpdated','tabs.onRemoved','tabs.onActivated','tabs.onMoved',
  'windows.onCreated','windows.onRemoved','windows.onFocusChanged','windows.onBoundsChanged',
  'cookies.onChanged','contextMenus.onClicked','action.onClicked','browserAction.onClicked',
  'bookmarks.onCreated','bookmarks.onChanged','bookmarks.onMoved','bookmarks.onRemoved','bookmarks.onChildrenReordered','history.onVisited','history.onVisitRemoved']);
class ExtensionBridgeError extends Error {
  constructor(code, message) { super(message); this.name = 'ExtensionBridgeError'; this.code = code; }
}
function reject(code, message) { throw new ExtensionBridgeError(code, message); }
function object(value, label = 'Options') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject('INVALID_ARGUMENT', label + ' must be an object.');
  return value;
}
function keys(value, names) {
  object(value);
  for (const name of Object.keys(value)) if (!names.includes(name)) reject('UNSUPPORTED_ARGUMENT', 'Unsupported option: ' + name);
  return {...value};
}
function id(value) { if (!Number.isSafeInteger(value) || value < 0) reject('INVALID_TAB_ID', 'A browser tab ID is required.'); return value; }
function booleans(value,names) { for (const name of names) if (value[name] !== undefined && typeof value[name] !== 'boolean') reject('INVALID_ARGUMENT',name+' must be a boolean.'); }
function extensionOrigin(value) {
  try { const url = new URL(value); return url.protocol === 'chrome-extension:' && /^[a-p]{32}$/.test(url.hostname) && !url.port && !url.username && !url.password ? url.hostname : null; }
  catch { return null; }
}
function cookieInfo(cookie) { return {...cookie, domain:cookie.domain || '', path:cookie.path || '/', hostOnly:!!cookie.hostOnly, session:!!cookie.session, httpOnly:!!cookie.httpOnly, secure:!!cookie.secure, storeId:'0'}; }
function bookmarkNode(value) {
  if (Array.isArray(value)) return value.map(bookmarkNode);
  if (!value || typeof value !== 'object') return value;
  const output = {...value}; delete output.identity;
  if (Array.isArray(output.children)) output.children = output.children.map(bookmarkNode);
  return output;
}
function badgeColor(value) {
  if (Array.isArray(value) && value.length === 4 && value.every(channel => Number.isInteger(channel) && channel >= 0 && channel <= 255)) return [...value];
  if (typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) {
    let hex = value.slice(1); if (hex.length <= 4) hex = [...hex].map(char => char+char).join('');
    if (hex.length === 6) hex += 'ff'; return hex.match(/../g).map(pair => parseInt(pair,16));
  }
  reject('UNSUPPORTED_ARGUMENT','Badge colors currently accept RGBA byte arrays or hexadecimal CSS colors.');
}

class ExtensionBridge {
  constructor({ipcMain, manager, host, nativeImage}) {
    if (!ipcMain?.handle || !ipcMain?.on || !manager?.runtimeContext || !host?.tabs) throw new TypeError('Native IPC, canonical extension manager and browser host are required.');
    this.ipcMain = ipcMain; this.manager = manager; this.host = host;
    this.sessions = new Map(); this.listeners = new Map(); this.bindings = new WeakMap();
    this.actions = new Map(); this.activeGrants = new Map(); this.disposed = false;
    this.icons = new ExtensionIcons({nativeImage,readResource:manager.readRuntimeResource?.bind(manager)});
    this.menus = new ExtensionMenus({admit:(context,tab) => {
      if (!this.current(context)) return false;
      try { return this.host.tabs.get(context.identity,tab.id)?.identity === context.identity; }
      catch { return false; } // A native menu can outlive the tab it was opened on.
    }, clicked:(context,info,tab) => this.emitTo(context,'contextMenus.onClicked',[info,this.tab(context,tab)])});
    this.invoke = async (event, method, args) => {
      try {
        const work = async () => {
          const context = this.authenticate(event), value = await this.dispatch(context,event,method,args);
          this.requireCurrent(context);
          if (this.authenticate(event).epoch !== context.epoch) reject('EXTENSION_REVOKED','The extension enrollment changed before the reply.');
          return {ok:true,value};
        };
        return await (host.runOperation ? host.runOperation(work) : work());
      }
      catch (error) { return {ok:false,error:{code:error.code || 'EXTENSION_API_ERROR',message:error.message}}; }
    };
    this.mapId = (event, direction, value) => {
      try {
        const context = this.authenticate(event);
        // Pin an actual native document to its enrollment before its first
        // message. A draining old background must not adopt a later grant.
        if (direction === 'enroll') { event.returnValue = {ok:true}; return; }
        if (direction === 'messageSender') {
          event.returnValue = {ok:true,value:this.messageSender(context,value)};
          return;
        }
        if (!['nativeId','browserId'].includes(direction) || typeof host.tabs[direction] !== 'function') reject('UNSUPPORTED_API','Native tab-ID translation is unavailable.');
        const mapped = host.tabs[direction](context.identity,id(value));
        if (!Number.isSafeInteger(mapped) || mapped < 0) reject('TAB_CONTEXT_UNAVAILABLE','The tab has no live native context in this identity.');
        event.returnValue = {ok:true,value:mapped};
      } catch (error) { event.returnValue = {ok:false,error:{code:error.code || 'EXTENSION_API_ERROR',message:error.message}}; }
    };
    // These synchronous operations only authenticate and change in-memory weak
    // subscriptions. No service mutation, disk work, engine creation or await.
    this.subscribe = (event,operation,name) => {
      try {
        const context = this.authenticate(event);
        this.eventSubscription(context,event,operation,name);
        event.returnValue = {ok:true};
      } catch (error) { event.returnValue = {ok:false,error:{code:error.code || 'EXTENSION_API_ERROR',message:error.message}}; }
    };
    ipcMain.handle(CHANNEL,this.invoke); ipcMain.on(MAP_CHANNEL,this.mapId); ipcMain.on(SUBSCRIBE_CHANNEL,this.subscribe);
    this.unsubscribeManager = manager.subscribeRuntime(event => {
      if (event.kind !== 'revoked') return;
      for (const [name, records] of this.listeners) {
        for (const record of records) if (record.context.id === event.id && record.context.identity === event.identity) records.delete(record);
        if (!records.size) this.listeners.delete(name);
      }
      this.actions.delete(event.identity+'\0'+event.id);
      this.icons.revoke(event.id,event.identity);
      this.activeGrants.delete(event.identity+'\0'+event.id);
      this.menus.revoke(event.id,event.identity);
      this.host.actionsChanged?.(event.identity);
    });
    this.unsubscribeHost = host.subscribe?.(event => this.hostEvent(event));
    this.unsubscribeBookmarks = host.bookmarks?.subscribe?.(event => this.bookmarkEvent(event));
    this.unsubscribeHistory = host.history?.subscribe?.(event => {
      if (event.type === 'visited') { const item = {...event.item}; delete item.identity; this.hostEvent({identity:event.identity,event:'history.onVisited',args:[item]}); }
      if (event.type === 'removed' && (event.allHistory || event.urls?.length)) this.hostEvent({identity:event.identity,event:'history.onVisitRemoved',args:[{allHistory:event.allHistory,urls:event.urls}]});
    });
  }
  attachSession(session) {
    if (this.disposed) reject('BRIDGE_CLOSED','The extension bridge is closed.');
    if (this.sessions.has(session)) return;
    if (typeof session.registerPreloadScript !== 'function' || typeof session.unregisterPreloadScript !== 'function') reject('PRELOAD_UNAVAILABLE','This runtime cannot register the required isolated extension preload.');
    const state = {preloads:[], workers:new Map()};
    this.sessions.set(session,state);
    try {
      for (const type of ['frame','service-worker']) {
        const registration = session.registerPreloadScript({id:'noxviola-extension-'+type,type,filePath:PRELOAD,includeGlobs:['chrome-extension://*/*'],matchOriginAsFallback:false});
        state.preloads.push(registration || 'noxviola-extension-'+type);
      }
      state.cookies = (_event,cookie,cause,removed) => this.emitIdentity(session,'cookies.onChanged',[{cookie:cookieInfo(cookie),cause:cause === 'expired-overwrite' ? 'expired_overwrite' : cause,removed}]);
      session.cookies.on('changed',state.cookies);
      state.worker = details => {
        const worker = session.serviceWorkers.getWorkerFromVersionID(details.versionId);
        if (details.runningStatus === 'stopped' || details.runningStatus === 'stopping') { this.removeWorker(state,details.versionId); return; }
        if (worker && extensionOrigin(worker.scope) && !state.workers.get(details.versionId)?.deref()) {
          if (state.workers.has(details.versionId)) worker.ipc.removeHandler(CHANNEL);
          worker.ipc.handle(CHANNEL,this.invoke); worker.ipc.on(MAP_CHANNEL,this.mapId); worker.ipc.on(SUBSCRIBE_CHANNEL,this.subscribe);
          state.workers.set(details.versionId,new WeakRef(worker));
        }
      };
      session.serviceWorkers?.on('running-status-changed',state.worker);
      for (const versionId of Object.keys(session.serviceWorkers?.getAllRunning?.() || {})) state.worker({versionId:Number(versionId),runningStatus:'running'});
    } catch (error) { this.detachSession(session,state); throw error; }
  }
  removeWorker(state, versionId) {
    const worker = state.workers.get(versionId)?.deref();
    if (!worker) { state.workers.delete(versionId); return; }
    try { worker.ipc.removeHandler(CHANNEL); worker.ipc.removeListener(MAP_CHANNEL,this.mapId); worker.ipc.removeListener(SUBSCRIBE_CHANNEL,this.subscribe); } catch { /* Already destroyed native worker. */ }
    state.workers.delete(versionId);
    for (const records of this.listeners.values()) for (const record of records) if (record.type === 'service-worker' && record.target.deref() === worker) records.delete(record);
  }
  detachSession(session,state) {
    if (state.cookies) session.cookies.removeListener('changed',state.cookies);
    if (state.worker) session.serviceWorkers?.removeListener('running-status-changed',state.worker);
    for (const versionId of state.workers.keys()) this.removeWorker(state,versionId);
    for (const registration of state.preloads) session.unregisterPreloadScript(registration);
    this.sessions.delete(session);
  }
  authenticate(event) {
    if (this.disposed) reject('BRIDGE_CLOSED','The extension bridge is closed.');
    let session, principal, target;
    if (event.type === 'service-worker') {
      session = event.session; target = event.serviceWorker;
      if (!target || target.isDestroyed?.() || session?.serviceWorkers?.getWorkerFromVersionID(event.versionId) !== target || target.versionId !== event.versionId) reject('UNAUTHENTICATED_EXTENSION','Unknown native service worker.');
      principal = extensionOrigin(target.scope);
    } else {
      session = event.sender?.session; target = event.senderFrame;
      if (!target || target.detached || target.isDestroyed?.() || event.sender?.isDestroyed?.()) reject('UNAUTHENTICATED_EXTENSION','A live committed extension frame is required.');
      principal = extensionOrigin(target.url);
    }
    if (!principal || !this.sessions.has(session)) reject('UNAUTHENTICATED_EXTENSION','This caller is not an enrolled extension context.');
    const context = this.manager.runtimeContext(session,principal);
    if (!context) reject('EXTENSION_REVOKED','The extension is disabled, unverified or not authorized in this identity.');
    const previous = this.bindings.get(target);
    if (previous && (previous.epoch !== context.epoch || previous.runtimeId !== principal || previous.session !== session)) reject('STALE_EXTENSION_CONTEXT','This extension context belongs to a previous runtime enrollment.');
    this.bindings.set(target,{epoch:context.epoch,runtimeId:principal,session});
    return context;
  }
  current(context) { const now = this.manager.runtimeContext(context.session,context.runtimeId); return !this.disposed && now?.epoch === context.epoch; }
  requireCurrent(context) { if (!this.current(context)) reject('EXTENSION_REVOKED','The extension grant changed while this operation was running.'); }
  messageSender(context,value) {
    const details = keys(value,['nativeId','frameId','senderId','senderUrl']);
    const nativeId = id(details.nativeId);
    // Electron 45's MaybeGetTabInfo labels every WebContents as a tab. Keep
    // canonical browser tabs first, including an extension document in a tab.
    const browserId = this.host.tabs.browserId?.(context.identity,nativeId);
    if (Number.isSafeInteger(browserId) && browserId >= 0) return {kind:'tab',id:browserId};
    const source = this.host.messageSource?.(nativeId), contents = source?.contents;
    if (!contents || contents.isDestroyed() || contents.id !== nativeId || contents.session !== context.session) {
      reject('MESSAGE_SOURCE_UNAVAILABLE','The message source has no live native context in this identity.');
    }
    // A native tab describes the top-level container, not the actual child
    // frame. Do not mistake web content inside an extension window for the
    // window's own document; unsupported/unknown frames remain rejected.
    if (details.frameId !== 0) reject('MESSAGE_FRAME_UNAVAILABLE','Only an authenticated extension main-frame message can omit its native tab.');
    const frame = contents.mainFrame;
    if (!frame || frame.detached || frame.isDestroyed?.()) reject('MESSAGE_SOURCE_UNAVAILABLE','The message source document is no longer available.');
    const principal = extensionOrigin(frame.url), binding = this.bindings.get(frame);
    const current = principal && this.manager.runtimeContext(contents.session,principal);
    if (principal !== context.runtimeId || !current || current.id !== context.id || current.identity !== context.identity || current.epoch !== context.epoch ||
        !binding || binding.session !== context.session || binding.runtimeId !== principal || binding.epoch !== current.epoch) {
      reject('MESSAGE_SOURCE_UNAUTHENTICATED','The message source is not a current document of this extension enrollment.');
    }
    // Native sender fields may corroborate native ownership, never establish it.
    if (details.senderId !== principal || details.senderUrl !== frame.url) reject('MESSAGE_SOURCE_MISMATCH','The message sender does not match its committed native document.');
    const owner = source.owner;
    if (owner) {
      if (owner.contents !== contents || owner.id !== current.id || owner.identity !== current.identity || owner.runtimeId !== principal || owner.epoch !== current.epoch || owner.session !== contents.session) {
        reject('MESSAGE_SOURCE_UNAUTHENTICATED','The extension window belongs to a different enrollment.');
      }
    } else if (contents.getType() !== 'backgroundPage') {
      reject('MESSAGE_SOURCE_UNAUTHENTICATED','This native context is not an owned extension window or background document.');
    }
    return {kind:'extension-document'};
  }
  permission(context,name) { if (!policy.hasPermission(context,name)) reject('PERMISSION_DENIED','The extension has no accepted '+name+' permission.'); }
  tab(context,tab) { return policy.tabFor(context,tab,(owner,value) => this.activeGrants.get(owner.identity+'\0'+owner.id)?.get(value.id) === this.origin(value.url)); }
  origin(address) { try { return new URL(address).origin; } catch { return null; } }
  async tabList(context) { return (await this.host.tabs.list(context.identity)).filter(tab => tab.identity === context.identity); }
  getTab(context, tabId) {
    const tab = this.host.tabs.get(context.identity,id(tabId));
    if (!tab || tab.identity !== context.identity) reject('TAB_NOT_FOUND','Tab not found in this browser identity.');
    return tab;
  }
  async dispatch(context,event,method,args) {
    if (typeof method !== 'string' || !Array.isArray(args)) reject('INVALID_ARGUMENT','An API method and argument list are required.');
    const [namespace,name,...extra] = method.split('.');
    if (extra.length) reject('UNSUPPORTED_API','This API is not implemented: '+method);
    if (namespace === 'events') return this.eventSubscription(context,event,name,args[0]);
    if (namespace === 'tabs') return this.tabs(context,name,args,event);
    if (namespace === 'windows') return this.windows(context,name,args);
    if (namespace === 'extension' && name === 'isAllowedFileSchemeAccess') {
      if (args.length) reject('INVALID_ARGUMENT','extension.isAllowedFileSchemeAccess does not accept arguments.');
      // The manager passes this exact accepted per-identity flag to native
      // loadExtension. This reads the setting; it grants no new file access.
      return context.allowFileAccess === true;
    }
    if (namespace === 'permissions') return this.permissions(context,name,args);
    if (namespace === 'cookies') { this.permission(context,'cookies'); return this.cookies(context,name,args); }
    if (namespace === 'bookmarks') { this.permission(context,'bookmarks'); return this.bookmarks(context,name,args); }
    if (namespace === 'history') { this.permission(context,'history'); return this.history(context,name,args); }
    if (namespace === 'contextMenus') { this.permission(context,'contextMenus'); return this.menus.invoke(context,name,args); }
    if (namespace === 'action' || namespace === 'browserAction') return this.action(context,event,name,args);
    reject('UNSUPPORTED_API','This browser-host API is not implemented: '+method);
  }
  permissions(context,name,args) {
    if (name === 'getAll') {
      if (args.length) reject('INVALID_ARGUMENT','permissions.getAll does not accept arguments.');
      return policy.grantedPermissions(context);
    }
    if (name === 'contains') {
      if (args.length !== 1) reject('INVALID_ARGUMENT','permissions.contains requires one Permissions object.');
      return policy.containsPermissions(context,keys(args[0],['permissions','origins']));
    }
    reject('UNSUPPORTED_API','Optional permission request/removal requires native grant synchronization and is not implemented. No grants were changed.');
  }
  async tabs(context,name,args,event) {
    const api = this.host.tabs;
    if (name === 'get') return this.tab(context,this.getTab(context,args[0]));
    if (name === 'getCurrent') {
      const browserId = event?.sender && api.browserId?.(context.identity,event.sender.id);
      return Number.isSafeInteger(browserId) ? this.tab(context,this.getTab(context,browserId)) : undefined;
    }
    if (name === 'query') {
      const query = keys(args[0] || {},['active','pinned','audible','muted','discarded','highlighted','status','title','url','index','windowId','currentWindow','lastFocusedWindow','windowType']);
      booleans(query,['active','pinned','audible','muted','discarded','highlighted','currentWindow','lastFocusedWindow']);
      if (query.windowId === -2) query.windowId = (await this.host.windows.getCurrent(context.identity)).id;
      let tabs = await this.tabList(context);
      if (query.currentWindow || query.lastFocusedWindow) { const current = await this.host.windows.getCurrent(context.identity); tabs = tabs.filter(tab => tab.windowId === current.id); }
      if (query.windowType !== undefined && query.windowType !== 'normal') return [];
      return tabs.map(tab => this.tab(context,tab)).filter(tab => Object.entries(query).every(([key,value]) => {
        if (['currentWindow','lastFocusedWindow','windowType'].includes(key)) return true;
        if (key === 'muted') return tab.mutedInfo?.muted === value;
        if (key === 'url') return typeof tab.url === 'string' && (Array.isArray(value) ? value : [value]).some(pattern => policy.matches(pattern,tab.url,{allowFileAccess:context.allowFileAccess,ownExtensionId:context.runtimeId}));
        if (key === 'title') return typeof value === 'string' && typeof tab.title === 'string' && policy.glob(value,tab.title);
        return tab[key] === value;
      }));
    }
    if (name === 'create') {
      if (!api.create) reject('UNSUPPORTED_API','Creating browser tabs is unavailable.');
      const options = keys(args[0] || {},['url','active','pinned','index','windowId']);
      booleans(options,['active','pinned']);
      if (options.url !== undefined) options.url = policy.navigationURL(options.url,context);
      return this.tab(context,await api.create(context.identity,options));
    }
    if (name === 'goBack' || name === 'goForward') {
      // Chromium resolves when traversal is requested. Firefox documents a
      // different completion contract, which this adapter cannot yet ensure.
      if (context.apiProfile === 'firefox') reject('UNSUPPORTED_API','Firefox history traversal completion semantics are not yet supported.');
      if (args.length > 1) reject('INVALID_ARGUMENT','History traversal accepts at most one tab ID.');
      const tabId = args[0] === undefined ? (await this.tabList(context)).find(tab => tab.active)?.id : args[0];
      this.requireCurrent(context);
      this.getTab(context,tabId);
      if (!api.nativeId || !api.browserId || !this.host.messageSource) reject('UNSUPPORTED_API','Native tab history is unavailable.');
      const nativeId = api.nativeId(context.identity,tabId);
      if (!Number.isSafeInteger(nativeId)) reject('TAB_UNAVAILABLE','The tab has no live native history in this identity.');
      const source = this.host.messageSource(nativeId), contents = source?.contents;
      if (!contents || source.owner || contents.isDestroyed() || contents.id !== nativeId || contents.session !== context.session || api.browserId(context.identity,nativeId) !== tabId) reject('TAB_UNAVAILABLE','The tab has no live native history in this identity.');
      const history = contents.navigationHistory, back = name === 'goBack';
      if (!history || typeof history.canGoBack !== 'function' || typeof history.canGoForward !== 'function' || typeof history.getActiveIndex !== 'function' || typeof history.getEntryAtIndex !== 'function' || typeof history[name] !== 'function') reject('UNSUPPORTED_API','Native tab history traversal is unavailable.');
      if (!(back ? history.canGoBack() : history.canGoForward())) reject('NO_NAVIGATION_HISTORY','No history entry exists in that direction.');
      const target = history.getEntryAtIndex(history.getActiveIndex() + (back ? -1 : 1));
      if (!target || typeof target.url !== 'string') reject('TAB_UNAVAILABLE','The target history entry is unavailable.');
      policy.navigationURL(target.url,context);
      this.requireCurrent(context);
      history[name]();
      return;
    }
    let tabId = args[0], options = args[1];
    if (name === 'update' && (tabId === undefined || typeof tabId === 'object')) { options = tabId || {}; tabId = (await this.tabList(context)).find(tab => tab.active)?.id; }
    if (name === 'remove') {
      const ids = Array.isArray(tabId) ? tabId : [tabId];
      for (const value of ids) this.getTab(context,value);
      for (const value of ids) { this.requireCurrent(context); await api.remove(context.identity,value); }
      return;
    }
    if (name === 'move') {
      if (!api.move) reject('UNSUPPORTED_API','Moving browser tabs is unavailable.');
      const ids = Array.isArray(tabId) ? tabId : [tabId], details = keys(options,['index','windowId']);
      for (const value of ids) this.getTab(context,value);
      const result = await api.move(context.identity,Array.isArray(tabId) ? ids : ids[0],details);
      const moved = (Array.isArray(result) ? result : [result]).map(tab => this.tab(context,tab));
      return Array.isArray(tabId) ? moved : moved[0];
    }
    if (name === 'reload' && (tabId === undefined || typeof tabId === 'object')) { options = tabId || {}; tabId = (await this.tabList(context)).find(tab => tab.active)?.id; }
    this.getTab(context,tabId);
    if (name === 'update') {
      const details = keys(options || {},['url','active','pinned','muted']);
      booleans(details,['active','pinned','muted']);
      if (details.url !== undefined) details.url = policy.navigationURL(details.url,context);
      return this.tab(context,await api.update(context.identity,tabId,details));
    }
    if (name === 'reload') { const details = keys(options || {},['bypassCache']); booleans(details,['bypassCache']); await api.reload(context.identity,tabId,details); return; }
    reject('UNSUPPORTED_API','This tabs method is not implemented: '+name);
  }
  async windows(context,name,args) {
    const api = this.host.windows;
    if (!api) reject('UNSUPPORTED_API','Browser window integration is unavailable.');
    if (!['get','getCurrent','getLastFocused','getAll','update'].includes(name)) reject('UNSUPPORTED_API','This host does not implement windows.'+name+'.');
    const options = keys((name === 'update' ? {} : name === 'get' ? args[1] : args[0]) || {},['populate','windowTypes']);
    booleans(options,['populate']);
    if (options.windowTypes !== undefined && (!Array.isArray(options.windowTypes) || options.windowTypes.some(type => !['normal','popup','panel','app','devtools'].includes(type)))) reject('INVALID_ARGUMENT','windowTypes must contain browser window types.');
    const clean = value => {
      if (!value) reject('WINDOW_NOT_FOUND','Window not found.');
      const window = {...value}; delete window.identity;
      if (options.populate) window.tabs = (value.tabs || []).filter(tab => tab.identity === context.identity).map(tab => this.tab(context,tab));
      else delete window.tabs;
      return window;
    };
    if (name === 'getCurrent' || name === 'getLastFocused') return clean(await api.getCurrent(context.identity,options));
    if (name === 'getAll') return (await api.getAll(context.identity,options)).filter(value => !options.windowTypes || options.windowTypes.includes(value.type)).map(clean);
    if (name === 'get') {
      const windows = await api.getAll(context.identity,options), windowId = args[0];
      return clean(windowId === -2 ? await api.getCurrent(context.identity,options) : windows.find(value => value.id === windowId));
    }
    if (name === 'update' && api.update) {
      const details = keys(args[1] || {},['focused','left','top','width','height','state']);
      booleans(details,['focused']);
      return clean(await api.update(context.identity,args[0],details));
    }
    reject('UNSUPPORTED_API','This host does not implement windows.'+name+'.');
  }
  async cookies(context,name,args) {
    const jar = context.session.cookies;
    if (name === 'getAllCookieStores') return [{id:'0',tabIds:(await this.tabList(context)).map(tab => tab.id)}];
    const allowed = name === 'set' ? ['url','name','value','domain','path','secure','httpOnly','sameSite','expirationDate','storeId'] : name === 'getAll' ? ['url','name','domain','path','secure','session','storeId'] : ['url','name','storeId'];
    const details = keys(args[0] || {},allowed);
    if (details.storeId !== undefined && details.storeId !== '0') reject('COOKIE_STORE_NOT_FOUND','Only this identity\'s cookie store is available.');
    delete details.storeId;
    if ((name === 'get' || name === 'remove') && typeof details.name !== 'string') reject('INVALID_ARGUMENT','A cookie name is required.');
    if (name !== 'getAll' && typeof details.url !== 'string') reject('INVALID_ARGUMENT','A cookie URL is required.');
    if (details.url !== undefined) {
      const url = new URL(details.url);
      if (!['http:','https:'].includes(url.protocol) || url.username || url.password || !policy.hasHost(context,url.href)) reject('HOST_PERMISSION_DENIED','This cookie host has no accepted permission.');
    }
    if (name === 'getAll' || name === 'get') {
      const values = (await jar.get(details)).filter(cookie => policy.cookieAccessible(context,cookie));
      this.requireCurrent(context);
      values.sort((a,b) => (b.path?.length || 0)-(a.path?.length || 0));
      return name === 'getAll' ? values.map(cookieInfo) : values[0] ? cookieInfo(values[0]) : null;
    }
    if (name === 'set') {
      if (details.domain) {
        const url = new URL(details.url); url.hostname = details.domain.replace(/^\./,'');
        if (!policy.hasHost(context,url.href)) reject('HOST_PERMISSION_DENIED','The cookie domain would exceed the accepted host grant.');
      }
      await jar.set(details); this.requireCurrent(context);
      const values = await jar.get({url:details.url,name:details.name || ''});
      const value = values.find(cookie => (details.path === undefined || cookie.path === details.path) && policy.cookieAccessible(context,cookie));
      if (!value) reject('COOKIE_WRITE_UNCONFIRMED','The cookie write could not be read back.');
      return cookieInfo(value);
    }
    if (name === 'remove') {
      const values = (await jar.get(details)).filter(cookie => policy.cookieAccessible(context,cookie));
      this.requireCurrent(context);
      if (!values.length) return null;
      if (values.length !== 1) reject('UNSUPPORTED_COOKIE_SELECTION','Removing same-name cookies at multiple paths is not supported by this host adapter.');
      await jar.remove(details.url,details.name);
      return {url:details.url,name:details.name,storeId:'0'};
    }
    reject('UNSUPPORTED_API','This cookies method is not implemented: '+name);
  }
  bookmarks(context,name,args) {
    const api = this.host.bookmarks;
    if (!api || !['get','getTree','getChildren','getSubTree','getRecent','search','create','update','move','remove','removeTree'].includes(name) || typeof api[name] !== 'function') reject('UNSUPPORTED_API','This bookmarks method is not implemented: '+name);
    if (name === 'create') args = [keys(args[0],['parentId','index','title','url','type'])];
    if (name === 'update') args = [args[0],keys(args[1],['title','url'])];
    if (name === 'move') args = [args[0],keys(args[1],['parentId','index'])];
    const value = api[name](context.identity,...args);
    return name === 'remove' || name === 'removeTree' ? undefined : bookmarkNode(value);
  }
  history(context,name,args) {
    const api = this.host.history;
    if (!api) reject('UNSUPPORTED_API','Browser history integration is unavailable.');
    if (name === 'search') {
      const details = keys(args[0] || {},['text','startTime','endTime','maxResults']);
      const items = api.search(context.identity,{startTime:Date.now()-86_400_000,maxResults:100,...details});
      return items.map(item => { const output = {...item}; delete output.identity; return output; });
    }
    if (name === 'getVisits') return api.getVisits(context.identity,keys(args[0],['url'])).map(visit => { const output = {...visit}; delete output.identity; return output; });
    if (name === 'addUrl') { const result = api.record(context.identity,keys(args[0],['url'])); if (!result.recorded) reject('HISTORY_RECORDING_PAUSED','The user has paused history recording.'); return; }
    if (name === 'deleteUrl') { api.deleteUrl(context.identity,keys(args[0],['url'])); return; }
    if (name === 'deleteRange') { api.deleteRange(context.identity,keys(args[0],['startTime','endTime'])); return; }
    if (name === 'deleteAll') { api.deleteAll(context.identity); return; }
    reject('UNSUPPORTED_API','This history method is not implemented: '+name);
  }
  actionRecord(context) {
    if (!(context.manifest.action || context.manifest.browser_action)) reject('ACTION_UNDECLARED','The extension does not declare a toolbar action.');
    const key = context.identity+'\0'+context.id;
    if (!this.actions.has(key)) {
      const manifest=context.manifest.action || context.manifest.browser_action;
      const record={epoch:context.epoch,defaults:{title:manifest.default_title || context.name,popup:context.pages?.popup ? new URL(context.pages.popup,'chrome-extension://'+context.runtimeId+'/').href : '',badgeText:'',color:[95,99,104,255],enabled:true},tabs:new Map(),manifestIcon:null,manifestIconError:'',iconSequence:0,committedIcons:new Map()};
      this.actions.set(key,record);
      if (manifest.default_icon!==undefined) {
        record.defaultIconPromise=this.icons.resolve(context,{path:manifest.default_icon},'chrome-extension://'+context.runtimeId+'/').then(icon=>{
          if (this.current(context) && this.actions.get(key)===record) { record.manifestIcon=icon;this.host.actionsChanged?.(context.identity); }
        },error=>{
          if (this.current(context) && this.actions.get(key)===record) { record.manifestIconError=error.message;this.host.actionsChanged?.(context.identity); }
        });
      }
    }
    return this.actions.get(key);
  }
  async setActionIcon(context,event,record,args) {
    const details=keys(args[0],['tabId','path','imageData']),tabId=details.tabId;
    if (tabId!==undefined) this.getTab(context,tabId);
    const sequence=++record.iconSequence;
    const baseURL=event.type==='service-worker' ? event.serviceWorker.scriptURL || event.serviceWorker.scope : event.senderFrame.url;
    const icon=await this.icons.resolve(context,details,baseURL);
    this.requireCurrent(context);
    if (this.authenticate(event).epoch!==context.epoch) reject('EXTENSION_REVOKED','The icon caller enrollment changed while its image was prepared.');
    if (tabId!==undefined) this.getTab(context,tabId);
    // Prepare concurrently, but a late earlier decode cannot undo a newer
    // successful update/reset. A failed later decode never erases prior intent.
    if (sequence>(record.committedIcons.get(tabId) || 0)) {
      const target=tabId===undefined?record.defaults:record.tabs.get(tabId)||{};
      if (icon===null) delete target.icon; else target.icon=icon;
      if (tabId!==undefined) record.tabs.set(tabId,target);
      record.committedIcons.set(tabId,sequence);
      this.host.actionsChanged?.(context.identity);
    }
  }
  action(context,event,name,args) {
    const record = this.actionRecord(context);
    if (name === 'setIcon') return this.setActionIcon(context,event,record,args);
    if (name === 'openPopup') reject('USER_GESTURE_REQUIRED','Open the extension action through a browser control.');
    if (name === 'enable' || name === 'disable') {
      const tabId = args[0]; if (tabId !== undefined) this.getTab(context,tabId);
      const target = tabId === undefined ? record.defaults : record.tabs.get(tabId) || {};
      target.enabled = name === 'enable'; if (tabId !== undefined) record.tabs.set(tabId,target);
      this.host.actionsChanged?.(context.identity); return;
    }
    const properties = {Title:'title',Popup:'popup',BadgeText:'badgeText',BadgeBackgroundColor:'color'};
    const match = /^(get|set)(Title|Popup|BadgeText|BadgeBackgroundColor)$/.exec(name);
    if (!match) reject('UNSUPPORTED_API','This action method is not implemented: '+name);
    const setting = properties[match[2]], argument = setting === 'badgeText' ? 'text' : setting;
    const details = keys(args[0] || {},match[1] === 'set' ? ['tabId',argument] : ['tabId']);
    if (details.tabId !== undefined) this.getTab(context,details.tabId);
    const current = {...record.defaults,...record.tabs.get(details.tabId)};
    if (match[1] === 'get') return current[setting];
    if (setting === 'color') details.color = badgeColor(details.color);
    else if (typeof details[argument] !== 'string' && !(argument === 'text' && details.text === null && details.tabId !== undefined)) reject('INVALID_ARGUMENT','An action '+argument+' string is required.');
    if (setting === 'popup' && details.popup) {
      const url = new URL(details.popup,'chrome-extension://'+context.runtimeId+'/');
      if (extensionOrigin(url.href) !== context.runtimeId) reject('EXTENSION_PAGE_ORIGIN','The action popup must stay within its authorized extension.');
      details.popup = url.href;
    }
    const target = details.tabId === undefined ? record.defaults : record.tabs.get(details.tabId) || {};
    if (argument === 'text' && details.text === null) delete target[setting];
    else target[setting] = structuredClone(details[argument]);
    if (details.tabId !== undefined) record.tabs.set(details.tabId,target);
    this.host.actionsChanged?.(context.identity);
  }
  actionState(identity,tabId) {
    return this.manager.runtimeContexts(identity).filter(context => context.manifest.action || context.manifest.browser_action).map(context => {
      const record = this.actionRecord(context);
      const tab=record.tabs.get(tabId),overridden=Object.hasOwn(tab||{},'icon') || Object.hasOwn(record.defaults,'icon');
      return {id:context.id,runtimeId:context.runtimeId,identity,name:context.name,...record.defaults,...tab,
        icon:tab?.icon || record.defaults.icon || record.manifestIcon,iconError:overridden?'':record.manifestIconError};
    });
  }
  async activateAction(identity,runtimeId,tabId) {
    const context = this.manager.runtimeContexts(identity).find(value => value.runtimeId === runtimeId);
    if (!context) reject('EXTENSION_REVOKED','The action has no active runtime.');
    const tab = this.getTab(context,tabId), record = this.actionRecord(context), action = {...record.defaults,...record.tabs.get(tabId)};
    if (!action.enabled) reject('ACTION_DISABLED','The extension action is disabled for this tab.');
    if (policy.hasPermission(context,'activeTab')) { const key = identity+'\0'+context.id; if (!this.activeGrants.has(key)) this.activeGrants.set(key,new Map()); this.activeGrants.get(key).set(tabId,this.origin(tab.url)); }
    if (action.popup) {
      const url = new URL(action.popup,'chrome-extension://'+runtimeId+'/');
      if (extensionOrigin(url.href) !== runtimeId) reject('EXTENSION_PAGE_ORIGIN','The action popup must stay within its authorized extension.');
      if (!this.host.openExtensionPage) reject('UNSUPPORTED_API','Extension popups are unavailable.');
      await this.host.openExtensionPage({identity,runtimeId,url:url.href,tabId});
    } else {
      this.emitTo(context,'action.onClicked',[this.tab(context,tab)]);
      this.emitTo(context,'browserAction.onClicked',[this.tab(context,tab)]);
    }
  }
  eventPermission(context,name) {
    if (!EVENTS.has(name)) reject('UNSUPPORTED_EVENT','This extension event is not implemented.');
    const namespace = name.split('.')[0];
    if (['cookies','bookmarks','contextMenus','history'].includes(namespace)) this.permission(context,namespace);
    if (namespace === 'action' || namespace === 'browserAction') this.actionRecord(context);
  }
  eventSubscription(context,event,operation,name) {
    if (operation !== 'add' && operation !== 'remove') reject('UNSUPPORTED_API','Unknown event subscription operation.');
    this.eventPermission(context,name);
    const target = event.type === 'service-worker' ? event.serviceWorker : event.senderFrame;
    const records = this.listeners.get(name) || new Set();
    for (const record of records) if (record.target.deref() === target) { if (operation === 'remove') records.delete(record); return; }
    if (operation === 'add') {
      // Do not keep background documents/workers alive merely because they
      // subscribed. Native lifecycle owns them; stopped workers are not faked.
      records.add({context,type:event.type,versionId:event.versionId,target:new WeakRef(target),sender:event.sender ? new WeakRef(event.sender) : null});
      this.listeners.set(name,records);
    }
  }
  emitTo(context,name,args) {
    for (const record of [...(this.listeners.get(name) || [])]) {
      if (record.context.id !== context.id || record.context.identity !== context.identity) continue;
      try {
        const target = record.target.deref();
        const event = record.type === 'service-worker' ? {type:record.type,serviceWorker:target,versionId:record.versionId,session:record.context.session} : {type:'frame',sender:record.sender?.deref(),senderFrame:target};
        const current = this.authenticate(event); this.eventPermission(current,name);
        if (current.epoch !== context.epoch) continue;
        if (name === 'cookies.onChanged' && !policy.cookieAccessible(current,args[0].cookie)) continue;
        target.send(EVENT_CHANNEL,name,...args);
      } catch { this.listeners.get(name)?.delete(record); }
    }
  }
  emitIdentity(session,name,args) { for (const context of this.manager.runtimeContexts()) if (context.session === session) this.emitTo(context,name,args); }
  hostEvent(event) {
    if (event?.event==='tab-navigation-committed') {
      if (event.args?.[1]?.sameDocument!==false) return;
      let changed=false;
      for (const context of this.manager.runtimeContexts(event.identity)) {
        if (context.apiProfile!=='firefox') continue;
        const record=this.actions.get(context.identity+'\0'+context.id);
        if (!record) continue;
        const tab=record.tabs.get(event.args[0]);
        if (tab && Object.hasOwn(tab,'icon')) {delete tab.icon;changed=true;}
        record.committedIcons.set(event.args[0],++record.iconSequence);
      }
      if (changed) this.host.actionsChanged?.(event.identity);
      return;
    }
    if (!event || !EVENTS.has(event.event)) return;
    if (event.event === 'tabs.onRemoved') { for (const grants of this.activeGrants.values()) grants.delete(event.args[0]); for (const record of this.actions.values()) {record.tabs.delete(event.args[0]);record.committedIcons.delete(event.args[0]);} }
    if (event.event === 'tabs.onUpdated') for (const grants of this.activeGrants.values()) if (grants.has(event.args[0]) && grants.get(event.args[0]) !== this.origin(event.args[2]?.url)) grants.delete(event.args[0]);
    for (const context of this.manager.runtimeContexts(event.identity)) {
      let args = event.args;
      try {
        if (event.event === 'tabs.onCreated') args = [this.tab(context,args[0])];
        if (event.event === 'tabs.onUpdated') {
          const tab = this.tab(context,args[2]), changes = {...args[1]};
          for (const key of ['url','pendingUrl','title','favIconUrl']) if (!(key in tab)) delete changes[key];
          args = [args[0],changes,tab];
        }
        if (event.event.startsWith('windows.') && typeof args[0] === 'object') {
          const window = {...args[0]}; delete window.identity;
          if (window.tabs) window.tabs = window.tabs.filter(tab => tab.identity === context.identity).map(tab => this.tab(context,tab));
          args = [window,...args.slice(1)];
        }
        this.emitTo(context,event.event,args);
      } catch { /* An identity-scoped event cannot authorize another identity. */ }
    }
  }
  bookmarkEvent(event) {
    let name, args;
    if (event.type === 'created') { name = 'bookmarks.onCreated'; args = [event.id,bookmarkNode(event.node)]; }
    if (event.type === 'changed') {
      const changes = Object.fromEntries(Object.entries(event.changes).filter(([key]) => ['title','url'].includes(key)));
      if (!Object.keys(changes).length) return; name = 'bookmarks.onChanged'; args = [event.id,changes];
    }
    if (event.type === 'moved') { name = 'bookmarks.onMoved'; args = [event.id,{parentId:event.parentId,index:event.index,oldParentId:event.oldParentId,oldIndex:event.oldIndex}]; }
    if (event.type === 'removed') { name = 'bookmarks.onRemoved'; args = [event.id,{parentId:event.parentId,index:event.index,node:bookmarkNode(event.node)}]; }
    if (event.type === 'reordered') { name = 'bookmarks.onChildrenReordered'; args = [event.id,{childIds:event.childIds}]; }
    if (name) this.hostEvent({identity:event.identity,event:name,args});
  }
  contextMenuItems(identity,tabId,params) {
    return this.manager.runtimeContexts(identity).filter(context => policy.hasPermission(context,'contextMenus')).flatMap(context => this.menus.build(context,this.getTab(context,tabId),params));
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.ipcMain.removeHandler(CHANNEL); this.ipcMain.removeListener(MAP_CHANNEL,this.mapId); this.ipcMain.removeListener(SUBSCRIBE_CHANNEL,this.subscribe);
    this.unsubscribeManager?.(); this.unsubscribeHost?.(); this.unsubscribeBookmarks?.(); this.unsubscribeHistory?.();
    for (const [session,state] of this.sessions) this.detachSession(session,state);
    this.listeners.clear(); this.actions.clear(); this.activeGrants.clear(); this.menus.owners.clear();this.icons.clear();
  }
}
function createExtensionBridge(options) { return new ExtensionBridge(options); }
module.exports = {createExtensionBridge,ExtensionBridge,ExtensionBridgeError,CHANNEL,MAP_CHANNEL,SUBSCRIBE_CHANNEL,EVENT_CHANNEL,PRELOAD};
