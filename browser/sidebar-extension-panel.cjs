'use strict';

// Native, lazy extension documents. The canonical ExtensionManager remains the
// authority for package bytes, identity permission grants and runtime epochs.
// Hosting a declared document does not imply sidebarAction/sidePanel API parity.
function fail(code,message) { const error=new Error(message);error.code=code;throw error; }

function panelResource(value) {
  if(typeof value!=='string'||!value||value!==value.trim()||/[\u0000-\u0020\\]/.test(value)||/^[a-z][a-z\d+.-]*:/i.test(value)||value.startsWith('//'))
    fail('SIDEBAR_PANEL_PATH','The extension sidebar must use a packaged local page.');
  let resource;
  try { resource=decodeURIComponent(value.split(/[?#]/,1)[0]).replace(/^\//,''); }
  catch { fail('SIDEBAR_PANEL_PATH','The extension sidebar path contains invalid escaping.'); }
  // Avoid URL/filesystem normalization disagreement, including Windows paths,
  // encoded traversal and nested encoding. The resource inventory uses / paths.
  if(!resource||/[\u0000-\u001f\\:]/.test(resource)||/%[a-f\d]{2}/i.test(resource)||resource.split('/').some(part=>!part||part==='.'||part==='..'))
    fail('SIDEBAR_PANEL_PATH','The extension sidebar path must stay inside its package.');
  return resource;
}

function manifestPanels(manifest) {
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))fail('SIDEBAR_MANIFEST','An extension manifest is required.');
  const result=[];
  for(const kind of ['sidebar_action','side_panel']) {
    const value=manifest[kind];if(value===undefined)continue;
    if(!value||typeof value!=='object'||Array.isArray(value))fail('SIDEBAR_MANIFEST',kind+' must be an object.');
    const page=kind==='sidebar_action'?value.default_panel:value.default_path;
    // Chromium also allows extensions to choose a path later with setOptions.
    // Such an extension has no declarative page for this host to display yet.
    if(page===undefined&&kind==='side_panel')continue;
    const resource=panelResource(page);
    if(value.default_title!==undefined&&typeof value.default_title!=='string')fail('SIDEBAR_MANIFEST','The sidebar title must be a string.');
    const icons=value.default_icon;
    if(icons!==undefined&&(typeof icons!=='string'&&(!icons||typeof icons!=='object'||Array.isArray(icons))))fail('SIDEBAR_MANIFEST','Sidebar icons must be packaged paths.');
    const iconPaths=icons===undefined?[]:typeof icons==='string'?[icons]:Object.values(icons);
    const resources=[resource,...iconPaths.map(panelResource)];
    result.push({kind,path:page,resource,title:value.default_title||manifest.name||'Extension sidebar',resources,
      permission:kind==='side_panel'?'sidePanel':null,
      browserStyleRequested:kind==='sidebar_action'&&value.browser_style===true,
      openAtInstallRequested:kind==='sidebar_action'&&value.open_at_install!==false});
  }
  return result;
}

function panelURL(runtimeId,address) {
  if(!/^[a-p]{32}$/.test(runtimeId||''))fail('SIDEBAR_EXTENSION_ID','A current native extension identity is required.');
  panelResource(address);
  const result=new URL(address,'chrome-extension://'+runtimeId+'/');
  if(result.protocol!=='chrome-extension:'||result.hostname!==runtimeId||result.username||result.password||result.port)
    fail('SIDEBAR_PANEL_ORIGIN','The sidebar must stay inside its own extension origin.');
  return result.href;
}

function createSidebarExtensionPanel({WebContentsView,getWindow,manager,onExternalOpen=()=>{},onInteraction=()=>{},onUserGesture=()=>{},onChange=()=>{}}) {
  if(typeof WebContentsView!=='function'||typeof getWindow!=='function'||!manager?.runtimeContext||!manager.runtimeContexts||!manager.readRuntimeResource||!manager.subscribeRuntime)
    throw new TypeError('A native view, browser window and canonical extension manager are required.');
  const entries=new Map();let current=null,visible=false,bounds=null,disposed=false;
  const keyFor=(id,identity,kind,scope)=>JSON.stringify([identity,id,kind,scope]);
  const live=context=>{const actual=manager.runtimeContext(context.session,context.runtimeId);return actual&&actual.id===context.id&&actual.identity===context.identity&&actual.epoch===context.epoch;};
  function sameOrigin(context,url) {
    try {const target=new URL(url);return target.protocol==='chrome-extension:'&&target.hostname===context.runtimeId&&!target.username&&!target.password&&!target.port;}
    catch {return false;}
  }
  function requireLive(context) {if(disposed||!live(context))fail('EXTENSION_REVOKED','This extension is disabled or no longer authorized in this identity.');}
  function allowedPanels(context) {
    return manifestPanels(context.manifest).filter(panel=>!panel.permission||context.permissions?.required?.includes(panel.permission));
  }
  function list(identity) {
    if(disposed)return [];
    return manager.runtimeContexts(identity).flatMap(context=>allowedPanels(context).map(panel=>({id:context.id,identity:context.identity,runtimeId:context.runtimeId,
      name:context.name,kind:panel.kind,title:panel.title,path:panel.path,browserStyleRequested:panel.browserStyleRequested,
      hosting:'declared-package-page',apiCompatibility:'separate-from-document-hosting'})));
  }
  function snapshot() {
    return {visible:Boolean(visible&&current),id:current?.context.id||null,identity:current?.context.identity||null,
      runtimeId:current?.context.runtimeId||null,kind:current?.panel.kind||null,scope:current?.scope||null,title:current?.title||'',url:current?.url||null,
      loading:Boolean(current?.loading),error:current?.error||'',loadedPanels:[...entries.values()].filter(entry=>entry.view).length};
  }
  function notify() {onChange(snapshot());}
  function clip(rect,win) {
    if(!rect||!['x','y','width','height'].every(name=>Number.isFinite(rect[name])))return null;
    const [width,height]=win.getContentSize(),x=Math.max(0,Math.min(width,Math.round(rect.x))),y=Math.max(0,Math.min(height,Math.round(rect.y)));
    return {x,y,width:Math.max(0,Math.min(Math.round(rect.width),width-x)),height:Math.max(0,Math.min(Math.round(rect.height),height-y))};
  }
  function layout(rect) {
    if(rect!==undefined)bounds=rect;
    const win=getWindow(),entry=current;
    if(disposed||!win||win.isDestroyed()||!entry?.view||entry.view.webContents.isDestroyed())return;
    if(!live(entry.context)){releaseEntry(entry);return;}
    const clipped=clip(bounds,win),show=visible&&!!clipped&&clipped.width>0&&clipped.height>0;
    if(clipped)entry.view.setBounds(clipped);
    entry.view.setVisible(show);if(show)win.contentView.addChildView(entry.view);
  }
  function releaseEntry(entry) {
    if(entries.get(entry.key)!==entry)return false;
    entries.delete(entry.key);
    if(current===entry){current=null;visible=false;}
    const win=getWindow();
    if(entry.view) {
      if(win&&!win.isDestroyed())win.contentView.removeChildView(entry.view);
      if(!entry.view.webContents.isDestroyed())entry.view.webContents.close();
    }
    notify();return true;
  }
  function external(entry,url) {
    if(!live(entry.context))return;
    let parsed;try {parsed=new URL(url);}catch{return;}
    if(['https:','http:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password)onExternalOpen({context:entry.context,url:parsed.href});
  }
  function makeView(entry) {
    const win=getWindow();if(!win||win.isDestroyed())fail('SIDEBAR_WINDOW','The browser window is unavailable.');
    requireLive(entry.context);
    const view=new WebContentsView({webPreferences:{session:entry.context.session,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false}});
    const wc=view.webContents;
    if(wc.session!==entry.context.session){wc.close();fail('SIDEBAR_IDENTITY','The extension sidebar identity session could not be verified.');}
    entry.view=view;view.setBackgroundColor('#14101c');view.setVisible(false);win.contentView.addChildView(view);
    wc.setWindowOpenHandler(({url})=>{if(entries.get(entry.key)===entry)external(entry,url);return {action:'deny'};});
    for(const name of ['will-navigate','will-redirect'])wc.on(name,(event,url)=>{
      if(!live(entry.context)||!sameOrigin(entry.context,url)){event.preventDefault();external(entry,url);}
    });
    wc.on('before-mouse-event',(_event,input)=>{if(input.type==='mouseDown'){onInteraction();if(live(entry.context))onUserGesture(entry.context);}});
    wc.on('before-input-event',(_event,input)=>{if(input.type==='keyDown'){onInteraction();if(live(entry.context))onUserGesture(entry.context);}});
    const stillHere=()=>!disposed&&entries.get(entry.key)===entry&&live(entry.context);
    wc.on('did-start-loading',()=>{if(stillHere()){entry.loading=true;entry.error='';if(current===entry)notify();}});
    wc.on('did-stop-loading',()=>{if(stillHere()){entry.loading=false;if(current===entry)notify();}});
    wc.on('page-title-updated',(_event,title)=>{if(stillHere()){entry.title=title||entry.panel.title;if(current===entry)notify();}});
    wc.on('did-navigate',(_event,url)=>{
      if(!stillHere()||!sameOrigin(entry.context,url)){releaseEntry(entry);return;}
      entry.url=url;if(current===entry)notify();
    });
    wc.on('did-navigate-in-page',(_event,url,isMainFrame)=>{
      if(isMainFrame&&stillHere()&&sameOrigin(entry.context,url)){entry.url=url;if(current===entry)notify();}
    });
    wc.on('did-fail-load',(_event,code,_description,_url,isMainFrame)=>{
      if(stillHere()&&isMainFrame&&code!==-3){entry.loading=false;entry.error='This extension sidebar could not load.';if(current===entry)notify();}
    });
    wc.on('render-process-gone',()=>{if(stillHere()){entry.started=false;entry.loading=false;entry.error='This extension sidebar stopped. Reopen it to try again.';if(current===entry)notify();}});
    wc.once('destroyed',()=>{if(entries.get(entry.key)===entry)releaseEntry(entry);});
    return view;
  }
  function start(entry) {
    if(entry.pending)return entry.pending;
    if(entry.started)return Promise.resolve();
    entry.loading=true;entry.error='';
    entry.pending=Promise.resolve().then(async()=>{
      requireLive(entry.context);
      // Reads only the requested owned package page, checked against its accepted
      // digest, regular-file inventory and pinned runtime enrollment.
      await manager.readRuntimeResource(entry.context,entry.panel.resource);
      requireLive(entry.context);
      if(entries.get(entry.key)!==entry||current!==entry||!visible)return;
      const view=entry.view||makeView(entry);
      entry.started=true;layout();
      await view.webContents.loadURL(entry.url);
      requireLive(entry.context);
      entry.loading=false;if(current===entry)notify();
    }).catch(error=>{
      if(entries.get(entry.key)!==entry)throw error;
      entry.loading=false;entry.started=false;entry.error=error.code==='EXTENSION_REVOKED'?'This extension is no longer enabled.':'This extension sidebar could not be verified or loaded.';
      if(!live(entry.context))releaseEntry(entry);else if(current===entry)notify();
      throw error;
    }).finally(()=>{entry.pending=null;});
    return entry.pending;
  }
  async function open({id,identity,kind}={}) {
    if(disposed)fail('SIDEBAR_CLOSED','The extension sidebar is closed.');
    if(typeof id!=='string'||typeof identity!=='string'||!id||!identity)fail('SIDEBAR_EXTENSION','Choose an installed extension and browser identity.');
    const context=manager.runtimeContexts(identity).find(value=>value.id===id&&value.identity===identity);
    if(!context)fail('EXTENSION_REVOKED','Enable and load this extension in the selected identity first.');
    requireLive(context);
    const panels=allowedPanels(context),panel=kind?panels.find(value=>value.kind===kind):panels.find(value=>value.kind===(context.apiProfile==='firefox'?'sidebar_action':'side_panel'))||panels[0];
    if(!panel)fail('SIDEBAR_PANEL_MISSING','This extension has no permitted declared sidebar page.');
    return openPage({context,panel,scope:'global'});
  }
  // Main-process only. A compatibility adapter may choose another VERIFIED
  // packaged page for this same manifest-declared sidebar and current grant.
  // This must never be exposed directly as a renderer-controlled context.
  async function openPage({context,panel,scope='global'}={}) {
    requireLive(context);
    const declared=allowedPanels(context).find(value=>value.kind===panel?.kind)||
      (panel?.kind==='side_panel'&&context.permissions?.required?.includes('sidePanel')?{kind:'side_panel',title:context.name,permission:'sidePanel'}:null);
    if(!declared)fail('SIDEBAR_PANEL_MISSING','This extension has no permitted declared sidebar.');
    const resource=panelResource(panel.path),url=panelURL(context.runtimeId,panel.path);
    if(typeof scope!=='string'||!scope)fail('SIDEBAR_SCOPE','An owned sidebar scope is required.');
    panel={...declared,...panel,resource};
    const {id,identity}=context,key=keyFor(id,identity,panel.kind,scope);let entry=entries.get(key);
    if(entry&&(entry.context.epoch!==context.epoch||entry.context.runtimeId!==context.runtimeId||entry.context.session!==context.session)){releaseEntry(entry);entry=null;}
    if(entry&&entry.url!==url){releaseEntry(entry);entry=null;}
    if(!entry){entry={key,context,panel,scope,title:panel.title,url,view:null,started:false,pending:null,loading:false,error:''};entries.set(key,entry);}
    entry.title=panel.title;
    if(current&&current!==entry&&current.view&&!current.view.webContents.isDestroyed())current.view.setVisible(false);
    current=entry;visible=true;layout();notify();await start(entry);return snapshot();
  }
  function hide(){if(disposed)return;visible=false;if(current?.view&&!current.view.webContents.isDestroyed())current.view.setVisible(false);notify();}
  function release({id,identity,kind,scope}={}) {
    let released=false;for(const entry of [...entries.values()])if(entry.context.id===id&&entry.context.identity===identity&&(!kind||entry.panel.kind===kind)&&(!scope||entry.scope===scope))released=releaseEntry(entry)||released;
    return released;
  }
  function ownerFor(nativeId) {
    if(disposed)return null;
    for(const entry of entries.values())if(entry.view&&!entry.view.webContents.isDestroyed()&&entry.view.webContents.id===nativeId&&live(entry.context))
      return {id:entry.context.id,identity:entry.context.identity,runtimeId:entry.context.runtimeId,epoch:entry.context.epoch,session:entry.context.session,contents:entry.view.webContents};
    return null;
  }
  async function reload(){if(disposed||!current)fail('SIDEBAR_PANEL_MISSING','Open an extension sidebar first.');const entry=current;requireLive(entry.context);entry.started=false;await start(entry);return snapshot();}
  const unsubscribe=manager.subscribeRuntime(event=>{if(event.kind==='revoked')release({id:event.id,identity:event.identity});});
  function destroy(){if(disposed)return;unsubscribe();for(const entry of [...entries.values()])releaseEntry(entry);disposed=true;current=null;visible=false;}
  return {list,open,openPage,hide,layout,reload,release,ownerFor,state:snapshot,destroy};
}

module.exports={manifestPanels,panelResource,panelURL,createSidebarExtensionPanel};
