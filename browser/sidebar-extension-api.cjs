'use strict';

// Actual browser services for the portable packaged-page sidebar APIs. Remote
// Firefox panels, setIcon and panel lifecycle events remain explicit unsupported
// capabilities; they must not be advertised as implemented by a namespace list.
const {manifestPanels,panelResource,panelURL}=require('./sidebar-extension-panel.cjs');
const SIDEBAR_API_METHODS={
  sidebarAction:['getPanel','setPanel','getTitle','setTitle','open','close','toggle','isOpen'],
  sidePanel:['getOptions','setOptions','open','close','getPanelBehavior','setPanelBehavior'],
};
function fail(code,message){const error=new Error(message);error.code=code;throw error;}
function object(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value))fail('INVALID_ARGUMENT','Sidebar details must be an object.');for(const key of Object.keys(value))if(!allowed.includes(key))fail('UNSUPPORTED_OPTION','This sidebar option is not implemented: '+key);return value;}
function integer(value){if(!Number.isSafeInteger(value)||value<0)fail('INVALID_ARGUMENT','A browser tab or window ID is required.');return value;}

function createSidebarExtensionAPI({manager,panelHost,tabs,windows,reveal=async()=>{},hide=()=>{},onChange=()=>{},now=Date.now}) {
  if(!manager?.runtimeContext||!manager.runtimeContexts||!manager.subscribeRuntime||!manager.readRuntimeResource||!panelHost?.openPage||!tabs?.get||!tabs.list||!windows?.getCurrent)
    throw new TypeError('Canonical extension, sidebar, browser tab and window services are required.');
  const records=new Map(),gestures=new Map(),selection=new Map();let disposed=false;
  const key=context=>JSON.stringify([context.identity,context.id]);
  function current(context){const actual=manager.runtimeContext(context.session,context.runtimeId);return !disposed&&actual?.id===context.id&&actual.identity===context.identity&&actual.epoch===context.epoch;}
  function requireCurrent(context){if(!current(context))fail('EXTENSION_REVOKED','The extension sidebar enrollment is no longer current.');}
  function record(context,namespace){
    requireCurrent(context);
    if(namespace==='sidebarAction'&&!context.manifest.sidebar_action)fail('SIDEBAR_UNDECLARED','This extension does not declare a Firefox sidebar.');
    if(namespace==='sidePanel'&&!context.permissions?.required?.includes('sidePanel'))fail('PERMISSION_DENIED','The sidePanel permission has not been accepted for this identity.');
    const owner=key(context);let value=records.get(owner);
    if(!value||value.epoch!==context.epoch){
      const panels=manifestPanels(context.manifest),firefox=panels.find(panel=>panel.kind==='sidebar_action'),chrome=panels.find(panel=>panel.kind==='side_panel');
      value={context,epoch:context.epoch,firefox:{defaults:{panel:firefox?.path,title:firefox?.title||context.name},global:{},windows:new Map(),tabs:new Map()},
        chrome:{defaults:{path:chrome?.path,enabled:true},global:{},tabs:new Map(),openPanelOnActionClick:false}};
      records.set(owner,value);
    }
    return value;
  }
  function browserTab(context,id){const tab=tabs.get(context.identity,integer(id));if(!tab||tab.identity!==context.identity)fail('TAB_NOT_FOUND','The sidebar tab is not in this identity.');return tab;}
  async function browserWindow(context,id){const win=await windows.getCurrent(context.identity);requireCurrent(context);if(!win||!Number.isSafeInteger(win.id))fail('WINDOW_NOT_FOUND','The browser window is unavailable.');if(id!==undefined&&id!==-2&&integer(id)!==win.id)fail('WINDOW_NOT_FOUND','This browser window does not belong to the selected identity.');return win;}
  async function scope(context,details){
    if(details.tabId!==undefined&&details.windowId!==undefined)fail('INVALID_ARGUMENT','Choose either a sidebar tab or window, not both.');
    if(details.tabId!==undefined){const tab=browserTab(context,details.tabId);return {tabId:tab.id,windowId:tab.windowId};}
    if(details.windowId!==undefined)return {windowId:(await browserWindow(context,details.windowId)).id};
    return {};
  }
  async function active(context){
    const win=await browserWindow(context),all=await tabs.list(context.identity);requireCurrent(context);
    const tab=all.find(value=>value.identity===context.identity&&value.windowId===win.id&&value.active);
    if(!tab)fail('TAB_NOT_FOUND','No active tab is available for this identity.');return tab;
  }
  function firefoxValue(value,target){return {...value.defaults,...value.global,...value.windows.get(target.windowId),...value.tabs.get(target.tabId)};}
  function chromeValue(value,tabId){return {...value.defaults,...value.global,...value.tabs.get(tabId)};}
  function path(context,address){
    if(typeof address!=='string'||!address)fail('SIDEBAR_PANEL_PATH','A packaged sidebar page is required.');
    if(/^[a-z][a-z\d+.-]*:/i.test(address)){
      let url;try{url=new URL(address);}catch{fail('SIDEBAR_PANEL_PATH','The sidebar page URL is invalid.');}
      if(url.protocol!=='chrome-extension:'||url.hostname!==context.runtimeId||url.username||url.password||url.port)
        fail('UNSUPPORTED_REMOTE_PANEL','Remote or foreign-origin extension panels are not implemented. Choose a packaged page.');
      address=url.pathname+url.search+url.hash;
    }
    panelResource(address);return address;
  }
  async function verify(context,address){await manager.readRuntimeResource(context,panelResource(address));requireCurrent(context);}
  function target(value,where){if(where.tabId!==undefined){if(!value.tabs.has(where.tabId))value.tabs.set(where.tabId,{});return value.tabs.get(where.tabId);}if(where.windowId!==undefined){if(!value.windows.has(where.windowId))value.windows.set(where.windowId,{});return value.windows.get(where.windowId);}return value.global;}
  function selected(context,namespace){const chosen=selection.get(context.identity);return chosen?.id===context.id&&chosen.namespace===namespace;}
  function isOpen(context,namespace){const state=panelHost.state();return state.visible&&state.identity===context.identity&&state.id===context.id&&state.kind===(namespace==='sidebarAction'?'sidebar_action':'side_panel');}
  function grantGesture(context){requireCurrent(context);gestures.set(key(context),{epoch:context.epoch,until:now()+1000});}
  function requireGesture(context){const owner=key(context),grant=gestures.get(owner);gestures.delete(owner);if(!grant||grant.epoch!==context.epoch||grant.until<now())fail('USER_GESTURE_REQUIRED','Open or close the sidebar from a browser extension action or direct sidebar interaction.');}
  async function show(context,namespace,chosenTab){
    const state=record(context,namespace),tab=chosenTab||await active(context);requireCurrent(context);
    const kind=namespace==='sidebarAction'?'sidebar_action':'side_panel';
    const options=namespace==='sidebarAction'?firefoxValue(state.firefox,{tabId:tab.id,windowId:tab.windowId}):chromeValue(state.chrome,tab.id);
    const address=namespace==='sidebarAction'?options.panel:options.path;
    if(!address||options.enabled===false)fail('SIDEBAR_PANEL_DISABLED','No enabled sidebar page is configured for this tab.');
    const specific=namespace==='sidePanel'&&state.chrome.tabs.has(tab.id),viewScope=specific?'tab:'+tab.id:'window:'+tab.windowId;
    reveal({id:context.id,identity:context.identity,kind,tabId:tab.id});requireCurrent(context);
    selection.set(context.identity,{id:context.id,namespace});
    await panelHost.openPage({context,panel:{kind,path:address,title:options.title||context.name},scope:viewScope});requireCurrent(context);
  }
  async function refresh(context,namespace){if(!selected(context,namespace)||!isOpen(context,namespace))return;const state=record(context,namespace),tab=await active(context);const options=namespace==='sidebarAction'?firefoxValue(state.firefox,{tabId:tab.id,windowId:tab.windowId}):chromeValue(state.chrome,tab.id);if(options.enabled===false||!(options.panel||options.path)){panelHost.hide();hide({identity:context.identity,id:context.id});}else await show(context,namespace,tab);}
  async function invoke(context,namespace,name,args){
    if(!SIDEBAR_API_METHODS[namespace]?.includes(name))fail('UNSUPPORTED_API','This sidebar API is not implemented: '+namespace+'.'+name);
    if(!Array.isArray(args))fail('INVALID_ARGUMENT','Sidebar arguments must be an array.');
    const state=record(context,namespace);
    if(namespace==='sidebarAction'){
      if(['getPanel','setPanel','getTitle','setTitle'].includes(name)){
        if(args.length!==1)fail('INVALID_ARGUMENT','Sidebar property operations require one details object.');
        const set=name.startsWith('set'),field=name.endsWith('Panel')?'panel':'title',details=object(args[0],set?['tabId','windowId',field]:['tabId','windowId']),where=await scope(context,details);
        if(!set){const value=firefoxValue(state.firefox,where)[field];return field==='panel'?panelURL(context.runtimeId,value):value;}
        if(details[field]!==null&&typeof details[field]!=='string')fail('INVALID_ARGUMENT','The sidebar '+field+' must be a string or null.');
        const reset=details[field]===null||(field==='panel'&&details.panel==='');let value=details[field];
        if(!reset&&field==='panel'){value=path(context,value);await verify(context,value);}
        requireCurrent(context);if(where.tabId!==undefined)browserTab(context,where.tabId);
        const destination=target(state.firefox,where);if(reset)delete destination[field];else destination[field]=value;
        onChange(context.identity);await refresh(context,namespace);return;
      }
      if(name==='isOpen'){if(args.length>1)fail('INVALID_ARGUMENT','isOpen accepts one optional details object.');const details=object(args[0]||{},['windowId']);await browserWindow(context,details.windowId);return isOpen(context,namespace);}
      if(args.length)fail('INVALID_ARGUMENT','This sidebar operation accepts no arguments.');
      requireGesture(context);
      if(name==='open'||(name==='toggle'&&!isOpen(context,namespace))){await show(context,namespace);return;}
      if(isOpen(context,namespace)){const hostState=panelHost.state();panelHost.release({id:context.id,identity:context.identity,kind:'sidebar_action',scope:hostState.scope});selection.delete(context.identity);hide({identity:context.identity,id:context.id});}
      return;
    }
    if(name==='getOptions'||name==='setOptions'){
      if(args.length!==1)fail('INVALID_ARGUMENT','Side panel options require one details object.');
      const details=object(args[0],name==='setOptions'?['tabId','enabled','path']:['tabId']);if(details.tabId!==undefined)browserTab(context,details.tabId);
      if(name==='getOptions'){const options=chromeValue(state.chrome,details.tabId);return {...options,...(details.tabId===undefined?{}:{tabId:details.tabId})};}
      if(details.enabled!==undefined&&typeof details.enabled!=='boolean')fail('INVALID_ARGUMENT','Side panel enabled must be a boolean.');
      if(details.path!==undefined){details.path=path(context,details.path);await verify(context,details.path);}
      requireCurrent(context);if(details.tabId!==undefined)browserTab(context,details.tabId);
      const destination=target(state.chrome,details.tabId===undefined?{}:{tabId:details.tabId});
      if(details.enabled!==undefined)destination.enabled=details.enabled;if(details.path!==undefined)destination.path=details.path;
      onChange(context.identity);await refresh(context,namespace);return;
    }
    if(name==='getPanelBehavior'){if(args.length)fail('INVALID_ARGUMENT','getPanelBehavior accepts no arguments.');return {openPanelOnActionClick:state.chrome.openPanelOnActionClick};}
    if(name==='setPanelBehavior'){if(args.length!==1)fail('INVALID_ARGUMENT','setPanelBehavior requires one object.');const details=object(args[0],['openPanelOnActionClick']);if(typeof details.openPanelOnActionClick!=='boolean')fail('INVALID_ARGUMENT','openPanelOnActionClick must be a boolean.');state.chrome.openPanelOnActionClick=details.openPanelOnActionClick;return;}
    if(args.length!==1)fail('INVALID_ARGUMENT','Side panel open/close requires one target object.');
    const details=object(args[0],['tabId','windowId']);if(details.tabId===undefined&&details.windowId===undefined)fail('INVALID_ARGUMENT','Choose the tab or window for the side panel.');
    const tab=details.tabId===undefined?await active(context):browserTab(context,details.tabId),win=await browserWindow(context,details.windowId);
    if(tab.windowId!==win.id)fail('WINDOW_NOT_FOUND','The side panel tab is not in the requested window.');
    if(name==='open'){requireGesture(context);if(details.tabId!==undefined){const activeTab=await active(context);if(activeTab.id!==tab.id)fail('UNSUPPORTED_BACKGROUND_PANEL','Opening a sidebar in an inactive tab is not implemented.');}await show(context,namespace,tab);return;}
    const hostState=panelHost.state();
    if(!isOpen(context,namespace))fail('SIDEBAR_PANEL_CLOSED','This extension has no open side panel in this window.');
    // Chrome 145+: tab-only close must not fall back to closing a global panel.
    if(details.tabId!==undefined&&hostState.scope!=='tab:'+details.tabId)fail('SIDEBAR_PANEL_SCOPE','No tab-specific panel is open for this tab.');
    if(details.tabId===undefined&&hostState.scope!=='window:'+win.id)fail('SIDEBAR_PANEL_SCOPE','No global panel is open for this window.');
    panelHost.release({id:context.id,identity:context.identity,kind:'side_panel',scope:hostState.scope});selection.delete(context.identity);hide({identity:context.identity,id:context.id});
  }
  async function openFromUser({id,identity,kind}={}){const context=manager.runtimeContexts(identity).find(value=>value.id===id);if(!context)fail('EXTENSION_REVOKED','Enable this extension in the selected identity first.');const namespace=kind==='sidebar_action'?'sidebarAction':kind==='side_panel'?'sidePanel':context.apiProfile==='firefox'&&context.manifest.sidebar_action?'sidebarAction':context.permissions?.required?.includes('sidePanel')?'sidePanel':'sidebarAction';await show(context,namespace);}
  async function reconcile(identity){const chosen=selection.get(identity);if(!chosen)return;const context=manager.runtimeContexts(identity).find(value=>value.id===chosen.id);if(!context){selection.delete(identity);return;}const state=record(context,chosen.namespace),tab=await active(context),options=chosen.namespace==='sidebarAction'?firefoxValue(state.firefox,{tabId:tab.id,windowId:tab.windowId}):chromeValue(state.chrome,tab.id);if(options.enabled===false||!(options.panel||options.path)){panelHost.hide();hide({identity,id:context.id});}else await show(context,chosen.namespace,tab);}
  async function handleActionClick(context){if(!context.permissions?.required?.includes('sidePanel'))return false;const state=record(context,'sidePanel');if(!state.chrome.openPanelOnActionClick)return false;await show(context,'sidePanel');return true;}
  function dropTab(identity,tabId){for(const value of records.values())if(value.context.identity===identity){value.firefox.tabs.delete(tabId);value.chrome.tabs.delete(tabId);}const state=panelHost.state();if(state.identity===identity&&state.scope==='tab:'+tabId)panelHost.release({id:state.id,identity,kind:state.kind,scope:state.scope});}
  function list(identity){
    const result=panelHost.list(identity);
    for(const context of manager.runtimeContexts(identity)){
      const value=records.get(key(context));
      if(!value)continue;
      const firefox=result.find(panel=>panel.id===context.id&&panel.kind==='sidebar_action');
      if(firefox)firefox.title=firefoxValue(value.firefox,{}).title;
      const chrome=chromeValue(value.chrome,undefined);
      if(chrome.path&&chrome.enabled&&!result.some(panel=>panel.id===context.id&&panel.kind==='side_panel'))
        result.push({id:context.id,identity,kind:'side_panel',name:context.name,title:context.name,path:chrome.path});
    }
    return result;
  }
  const unsubscribe=manager.subscribeRuntime(event=>{if(event.kind==='revoked'){const owner=JSON.stringify([event.identity,event.id]);records.delete(owner);gestures.delete(owner);if(selection.get(event.identity)?.id===event.id)selection.delete(event.identity);}});
  function destroy(){if(disposed)return;unsubscribe();records.clear();gestures.clear();selection.clear();disposed=true;}
  return {invoke,openFromUser,reconcile,grantGesture,handleActionClick,dropTab,list,destroy};
}
module.exports={SIDEBAR_API_METHODS,createSidebarExtensionAPI};
