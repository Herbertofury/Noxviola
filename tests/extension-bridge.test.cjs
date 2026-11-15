'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {createExtensionBridge,CHANNEL,MAP_CHANNEL,SUBSCRIBE_CHANNEL} = require('../browser/extension-bridge.cjs');
const policy = require('../browser/extension-policy.cjs');
// Actual production router; only Electron primitives and canonical host services
// are substituted. These tests establish admission/routing contracts, not native
// preload execution or marketplace extension compatibility.
const EXT = 'a'.repeat(32), OTHER = 'b'.repeat(32);
function fixture(t,{permissions=['tabs','cookies','bookmarks','contextMenus','activeTab'],hosts=['https://allowed.test/*']}={}) {
  const ipc = Object.assign(new EventEmitter(),{handlers:new Map(),handle(name,fn){this.handlers.set(name,fn);},removeHandler(name){this.handlers.delete(name);}});
  const sessions = ['personal','work'].map(() => {
    const jar = Object.assign(new EventEmitter(),{values:[],calls:[],async get(query){this.calls.push(['get',query]);return this.values.filter(cookie => (!query.name || cookie.name === query.name) && (!query.url || new URL(query.url).hostname === cookie.domain.replace(/^\./,'')));},async set(value){this.calls.push(['set',value]);this.values.push({name:value.name,value:value.value,domain:value.domain || new URL(value.url).hostname,path:value.path || '/',hostOnly:!value.domain,secure:!!value.secure,session:value.expirationDate===undefined,expirationDate:value.expirationDate});},async remove(url,name){this.calls.push(['remove',url,name]);this.values=this.values.filter(cookie=>!(cookie.name===name&&cookie.domain===new URL(url).hostname));}});
    const workers = Object.assign(new EventEmitter(),{getAllRunning:()=>({}),getWorkerFromVersionID:()=>null});
    return {cookies:jar,serviceWorkers:workers,preloads:new Map(),registerPreloadScript(value){this.preloads.set(value.id,value);return value.id;},unregisterPreloadScript(id){this.preloads.delete(id);}};
  });
  const contexts = new Map(sessions.map((session,index) => [session,{id:'package-1',identity:index?'work':'personal',runtimeId:EXT,epoch:'epoch-1',session,name:'Real fixture',permissions:{required:permissions,hosts},manifest:{action:{default_title:'Fixture action'}},pages:{popup:null},allowFileAccess:false}]));
  let runtimeObserver, hostObserver, bookmarkObserver;
  const manager = {runtimeContext(session,id){return id===EXT?contexts.get(session)||null:null;},runtimeContexts(identity){return [...contexts.values()].filter(value=>identity===undefined||value.identity===identity);},subscribeRuntime(fn){runtimeObserver=fn;return()=>{runtimeObserver=null;};}};
  const tabs = new Map([[10,{id:10,identity:'personal',windowId:1,url:'https://allowed.test/page',title:'Allowed secret',active:true,pinned:false,mutedInfo:{muted:false}}],[11,{id:11,identity:'personal',windowId:1,url:'https://private.test/',title:'Private title',active:false,pinned:false,mutedInfo:{muted:false}}],[20,{id:20,identity:'work',windowId:1,url:'https://allowed.test/work',title:'Work private',active:true}]]);
  const mutations=[], opened=[], bookmarkCalls=[]; let nextId=30;
  const host={tabs:{list:identity=>[...tabs.values()].filter(tab=>tab.identity===identity),get:(identity,id)=>tabs.get(id)?.identity===identity?tabs.get(id):undefined,nativeId:(identity,id)=>tabs.get(id)?.identity===identity&&id!==11?id+100:undefined,browserId:(identity,id)=>tabs.get(id-100)?.identity===identity?id-100:undefined,async create(identity,options){const tab={id:nextId++,identity,windowId:1,url:'about:blank',title:'New tab',active:true,...options};tabs.set(tab.id,tab);mutations.push(['create',identity,options]);return tab;},async update(identity,id,options){Object.assign(tabs.get(id),options);mutations.push(['update',identity,id,options]);return tabs.get(id);},async remove(identity,id){tabs.delete(id);mutations.push(['remove',identity,id]);},async move(identity,ids,options){return (Array.isArray(ids)?ids:[ids]).map(id=>{Object.assign(tabs.get(id),options);return tabs.get(id);});},async reload(identity,id,options){mutations.push(['reload',identity,id,options]);}},windows:{getCurrent:(identity,options={})=>({id:1,type:'normal',focused:true,...(options.populate?{tabs:[...tabs.values()].filter(tab=>tab.identity===identity)}:{})}),getAll:(identity,options)=>[host.windows.getCurrent(identity,options)],update:(identity,id,options)=>({...host.windows.getCurrent(identity),...options})},bookmarks:{getTree(identity){bookmarkCalls.push(['getTree',identity]);return[{id:identity+'-root',identity,children:[]}];},create(identity,options){bookmarkCalls.push(['create',identity,options]);const node={id:'new-bookmark',...options};bookmarkObserver?.({type:'created',identity,id:node.id,node});return node;},subscribe(fn){bookmarkObserver=fn;return()=>{bookmarkObserver=null;};}},subscribe(fn){hostObserver=fn;return()=>{hostObserver=null;};},openExtensionPage(value){opened.push(value);},actionsChanged() {}};
  const bridge=createExtensionBridge({ipcMain:ipc,manager,host});for(const session of sessions)bridge.attachSession(session);
  t.after(()=>bridge.dispose());
  function event(index=0,runtimeId=EXT){const frame={url:'chrome-extension://'+runtimeId+'/popup.html',detached:false,sent:[],send(...args){this.sent.push(args);},isDestroyed:()=>false};return {type:'frame',sender:{session:sessions[index],isDestroyed:()=>false},senderFrame:frame};}
  const personal=event();
  async function call(method,args=[],sender=personal){const result=await ipc.handlers.get(CHANNEL)(sender,method,args);if(!result.ok)throw Object.assign(new Error(result.error.message),{code:result.error.code});return result.value;}
  return {bridge,ipc,sessions,contexts,manager,host,tabs,mutations,opened,bookmarkCalls,event,personal,call,emit:payload=>hostObserver?.(payload),revoke(index=0){const session=sessions[index],context=contexts.get(session);contexts.delete(session);runtimeObserver?.({kind:'revoked',id:context.id,identity:context.identity,runtimeId:context.runtimeId});},bookmark:payload=>bookmarkObserver?.(payload)};
}
test('extension principals come from committed native origin and exact Session, never payload claims',async t=>{
  const f=fixture(t);
  assert.deepEqual((await f.call('tabs.query',[{}])).map(tab=>tab.id),[10,11]);
  await assert.rejects(f.call('tabs.get',[20]),{code:'TAB_NOT_FOUND'});
  await assert.rejects(f.call('tabs.query',[{identity:'work'}]),{code:'UNSUPPORTED_ARGUMENT'});
  const website=f.event();website.senderFrame.url='https://allowed.test/';
  await assert.rejects(f.call('tabs.query',[{}],website),{code:'UNAUTHENTICATED_EXTENSION'});
  await assert.rejects(f.call('tabs.query',[{}],f.event(0,OTHER)),{code:'EXTENSION_REVOKED'});
  const foreign=f.event();foreign.sender.session={};
  await assert.rejects(f.call('tabs.query',[{}],foreign),{code:'UNAUTHENTICATED_EXTENSION'});
  assert.equal(f.sessions[0].preloads.size,2);
  for(const registration of f.sessions[0].preloads.values()){assert.deepEqual(registration.includeGlobs,['chrome-extension://*/*']);assert.equal(registration.matchOriginAsFallback,false);}
});
test('tabs without tabs permission expose only host-authorized metadata and queries do not awaken lazy views',async t=>{
  const f=fixture(t,{permissions:[]});
  const tabs=await f.call('tabs.query',[{}]);
  assert.equal(tabs[0].title,'Allowed secret');assert.equal(tabs[0].identity,undefined);
  assert.equal(tabs[1].url,undefined);assert.equal(tabs[1].title,undefined);
  f.tabs.get(10).pendingUrl='https://private.test/new';assert.equal((await f.call('tabs.get',[10])).pendingUrl,undefined);
  assert.deepEqual(await f.call('tabs.query',[{url:'https://private.test/*'}]),[]);
  assert.equal(f.mutations.length,0);
  const map=f.ipc.listeners(MAP_CHANNEL)[0];map(f.personal,'nativeId',10);assert.deepEqual(f.personal.returnValue,{ok:true,value:110});
  map(f.personal,'nativeId',11);assert.equal(f.personal.returnValue.ok,false);assert.equal(f.personal.returnValue.error.code,'TAB_CONTEXT_UNAVAILABLE');
  map(f.personal,'browserId',120);assert.equal(f.personal.returnValue.ok,false);
});
test('real tab and window operations use canonical hooks and reject unsupported window creation',async t=>{
  const f=fixture(t);
  const created=await f.call('tabs.create',[{url:'https://allowed.test/new',active:false,pinned:true}]);
  assert.equal(f.tabs.get(created.id).pinned,true);assert.equal(created.identity,undefined);
  await f.call('tabs.update',[created.id,{muted:true}]);await f.call('tabs.reload',[created.id,{bypassCache:true}]);
  assert.equal((await f.call('tabs.move',[created.id,{index:0}])).id,created.id);
  await f.call('tabs.remove',[created.id]);assert.equal(f.tabs.has(created.id),false);
  await assert.rejects(f.call('tabs.create',[{url:'javascript:alert(1)'}]));
  await assert.rejects(f.call('tabs.remove',[20]),{code:'TAB_NOT_FOUND'});
  assert.deepEqual((await f.call('windows.getCurrent',[{populate:true}])).tabs.map(tab=>tab.id),[10,11]);
  assert.equal((await f.call('windows.update',[1,{focused:true}])).focused,true);
  await assert.rejects(f.call('windows.create',[{url:'https://allowed.test/'}]),{code:'UNSUPPORTED_API'});
  const before=f.mutations.length;
  await assert.rejects(f.call('tabs.update',[10,{url:'https://allowed.test/changed',highlighted:true}]),{code:'UNSUPPORTED_ARGUMENT'});
  await assert.rejects(f.call('tabs.create',[{url:'https://allowed.test/new',active:'yes'}]),{code:'INVALID_ARGUMENT'});
  assert.equal(f.mutations.length,before);
});
test('asynchronous replies revalidate committed origin and participate in host close admission',async t=>{
  const f=fixture(t);let complete,closing=false,admitted=0;
  f.host.runOperation=async work=>{if(closing)throw new Error('Browser is closing');admitted++;return work();};
  f.sessions[0].cookies.get=()=>new Promise(resolve=>{complete=resolve;});
  const pending=f.call('cookies.getAll',[{}]);await Promise.resolve();assert.equal(admitted,1);
  f.personal.senderFrame.url='https://allowed.test/';complete([{name:'secret',domain:'allowed.test',secure:true,path:'/'}]);
  await assert.rejects(pending,{code:'UNAUTHENTICATED_EXTENSION'});
  closing=true;await assert.rejects(f.call('tabs.create',[{}],f.event()),/closing/);assert.equal(f.mutations.length,0);
});
test('cookies require both named permission and actual host grants for calls and change events',async t=>{
  const f=fixture(t,{permissions:['cookies']});
  f.sessions[0].cookies.values=[{name:'allowed',value:'a',domain:'allowed.test',secure:true,hostOnly:true,path:'/'},{name:'private',value:'p',domain:'private.test',secure:true,hostOnly:true,path:'/'}];
  assert.deepEqual((await f.call('cookies.getAll',[{}])).map(cookie=>cookie.name),['allowed']);
  await assert.rejects(f.call('cookies.get',[{url:'https://allowed.test/'}]),{code:'INVALID_ARGUMENT'});
  await assert.rejects(f.call('cookies.get',[{url:'https://private.test/',name:'private'}]),{code:'HOST_PERMISSION_DENIED'});
  await assert.rejects(f.call('cookies.getAll',[{storeId:'work'}]),{code:'COOKIE_STORE_NOT_FOUND'});
  await assert.rejects(f.call('cookies.set',[{url:'https://allowed.test/',domain:'.test',name:'x',value:'x'}]),{code:'HOST_PERMISSION_DENIED'});
  await f.call('events.add',['cookies.onChanged']);
  for(const cookie of f.sessions[0].cookies.values)f.sessions[0].cookies.emit('changed',{},cookie,'explicit',false);
  assert.equal(f.personal.senderFrame.sent.length,1);assert.equal(f.personal.senderFrame.sent[0][2].cookie.name,'allowed');
  f.contexts.get(f.sessions[0]).permissions.required=[];
  await assert.rejects(f.call('cookies.getAll',[{}]),{code:'PERMISSION_DENIED'});
  const before=f.personal.senderFrame.sent.length;f.sessions[0].cookies.emit('changed',{},f.sessions[0].cookies.values[0],'explicit',false);assert.equal(f.personal.senderFrame.sent.length,before);
});
test('disable revokes in-flight reads, subscriptions, menus and old native contexts even if runtime still exists',async t=>{
  const f=fixture(t);let complete;
  f.sessions[0].cookies.get=()=>new Promise(resolve=>{complete=resolve;});
  await f.call('events.add',['tabs.onCreated']);await f.call('contextMenus.create',[{id:'save',title:'Save'}]);
  const pending=f.call('cookies.getAll',[{}]);await Promise.resolve();
  const old=f.contexts.get(f.sessions[0]);f.revoke();complete([{name:'x',value:'secret',domain:'allowed.test',path:'/',secure:true}]);
  await assert.rejects(pending,{code:'EXTENSION_REVOKED'});
  assert.equal(f.bridge.listeners.size,0);assert.equal(f.bridge.menus.owners.size,0);
  f.contexts.set(f.sessions[0],{...old,epoch:'epoch-2'});
  await assert.rejects(f.call('tabs.query',[{}]),{code:'STALE_EXTENSION_CONTEXT'});
  assert.equal((await f.call('tabs.query',[{}],f.event())).length,2);
});
test('event delivery revalidates sender frame and never forwards foreign-identity tab metadata',async t=>{
  const f=fixture(t,{permissions:[]});
  await f.call('events.add',['tabs.onUpdated']);
  f.emit({identity:'work',event:'tabs.onUpdated',args:[20,{title:'Work private'},f.tabs.get(20)]});assert.equal(f.personal.senderFrame.sent.length,0);
  f.emit({identity:'personal',event:'tabs.onUpdated',args:[11,{url:'https://private.test/',title:'Private title',status:'complete'},f.tabs.get(11)]});
  assert.deepEqual(f.personal.senderFrame.sent[0][3],{status:'complete'});
  f.personal.senderFrame.url='https://allowed.test/';
  f.emit({identity:'personal',event:'tabs.onUpdated',args:[10,{title:'Allowed secret'},f.tabs.get(10)]});assert.equal(f.personal.senderFrame.sent.length,1);
});
test('context menu mutations validate hierarchy and native clicks change checkbox state with scoped events',async t=>{
  const f=fixture(t);await f.call('events.add',['contextMenus.onClicked']);
  await f.call('contextMenus.create',[{id:'parent',title:'Tools'}]);
  await f.call('contextMenus.create',[{id:'check',title:'Select %s',type:'checkbox',checked:false,parentId:'parent',contexts:['selection']}]);
  await assert.rejects(f.call('contextMenus.update',['parent',{parentId:'check'}]));
  await assert.rejects(f.call('contextMenus.create',[{id:'parent',title:'Duplicate'}]));
  const menu=f.bridge.contextMenuItems('personal',10,{pageURL:'https://allowed.test/',selectionText:'word'});assert.equal(menu[0].submenu[0].label,'Select word');
  menu[0].submenu[0].click();const event=f.personal.senderFrame.sent[0];assert.equal(event[2].checked,true);assert.equal(event[2].wasChecked,false);assert.equal(event[3].id,10);
  f.host.tabs.get=()=>{throw new Error('Tab closed');};assert.doesNotThrow(()=>menu[0].submenu[0].click());assert.equal(f.personal.senderFrame.sent.length,1);
  f.host.tabs.get=(identity,id)=>f.tabs.get(id)?.identity===identity?f.tabs.get(id):undefined;
  await f.call('contextMenus.remove',['parent']);assert.deepEqual(f.bridge.contextMenuItems('personal',10,{pageURL:'https://allowed.test/'}),[]);
});
test('synchronous event admission is authenticated and complete before the first host event',t=>{
  const f=fixture(t),subscribe=f.ipc.listeners(SUBSCRIBE_CHANNEL)[0];
  subscribe(f.personal,'add','tabs.onCreated');assert.equal(f.personal.returnValue.ok,true);
  f.emit({identity:'personal',event:'tabs.onCreated',args:[f.tabs.get(10)]});assert.equal(f.personal.senderFrame.sent.length,1);
  subscribe(f.personal,'anything-else','tabs.onCreated');assert.equal(f.personal.returnValue.ok,false);
  const website=f.event();website.senderFrame.url='https://allowed.test/';subscribe(website,'add','tabs.onCreated');assert.equal(website.returnValue.ok,false);
  subscribe(f.personal,'remove','tabs.onCreated');f.emit({identity:'personal',event:'tabs.onCreated',args:[f.tabs.get(10)]});assert.equal(f.personal.senderFrame.sent.length,1);
});
test('actions drive real popup hook or click event and retain per-tab state without widening origins',async t=>{
  const f=fixture(t,{permissions:['activeTab']});await f.call('events.add',['action.onClicked']);
  await f.call('action.setTitle',[{tabId:11,title:'Private tab action'}]);await f.call('action.setBadgeText',[{text:'2'}]);
  await f.call('action.setBadgeBackgroundColor',[{color:'#abc'}]);assert.equal(f.bridge.actionState('personal',11)[0].badgeText,'2');assert.deepEqual(await f.call('action.getBadgeBackgroundColor',[{}]),[170,187,204,255]);
  await f.bridge.activateAction('personal',EXT,11);assert.equal(f.personal.senderFrame.sent[0][2].url,'https://private.test/');
  await f.call('action.setPopup',[{popup:'popup.html'}]);await f.bridge.activateAction('personal',EXT,10);assert.equal(f.opened[0].url,'chrome-extension://'+EXT+'/popup.html');
  await assert.rejects(f.call('action.setPopup',[{popup:'https://private.test/'}]),{code:'EXTENSION_PAGE_ORIGIN'});
  await f.call('action.disable',[10]);await assert.rejects(f.bridge.activateAction('personal',EXT,10),{code:'ACTION_DISABLED'});
});
test('bookmark reads and durable event adaptation use the identity-first canonical service',async t=>{
  const f=fixture(t);await f.call('events.add',['bookmarks.onCreated']);
  await f.call('bookmarks.getTree',[]);assert.deepEqual(f.bookmarkCalls,[['getTree','personal']]);
  const created=await f.call('bookmarks.create',[{title:'Saved',url:'https://allowed.test/'}]);assert.equal(created.id,'new-bookmark');assert.equal(f.personal.senderFrame.sent[0][1],'bookmarks.onCreated');
  f.bookmark({type:'created',identity:'work',id:'secret',node:{id:'secret'}});assert.equal(f.personal.senderFrame.sent.length,1);
  await assert.rejects(f.call('bookmarks.create',[{identity:'work',title:'Spoof'}]),{code:'UNSUPPORTED_ARGUMENT'});
});
test('worker authentication binds native worker object, version and Session, with lifecycle cleanup',async t=>{
  const f=fixture(t),workerIPC=Object.assign(new EventEmitter(),{handlers:new Map(),handle(name,fn){this.handlers.set(name,fn);},removeHandler(name){this.handlers.delete(name);}});
  const worker={scope:'chrome-extension://'+EXT+'/',versionId:7,ipc:workerIPC,isDestroyed:()=>false,send(){}};
  f.sessions[0].serviceWorkers.getWorkerFromVersionID=value=>value===7?worker:null;
  f.sessions[0].serviceWorkers.emit('running-status-changed',{versionId:7,runningStatus:'starting'});
  const event={type:'service-worker',session:f.sessions[0],serviceWorker:worker,versionId:7};
  assert.equal((await workerIPC.handlers.get(CHANNEL)(event,'tabs.query',[{}])).ok,true);
  assert.equal((await workerIPC.handlers.get(CHANNEL)({...event,serviceWorker:{...worker}},'tabs.query',[{}])).ok,false);
  f.sessions[0].serviceWorkers.emit('running-status-changed',{versionId:7,runningStatus:'stopped'});assert.equal(workerIPC.handlers.size,0);
  f.bridge.dispose();assert.equal(f.ipc.handlers.size,0);assert.equal(f.sessions[0].preloads.size,0);assert.equal(f.sessions[0].cookies.listenerCount('changed'),0);
});
test('match-pattern admission respects scheme, exact domain boundaries, file consent and literal punctuation',()=>{
  assert.equal(policy.matches('https://*.example.com/*','https://sub.example.com/x'),true);
  assert.equal(policy.matches('https://*.example.com/*','https://example.com.evil/x'),false);
  assert.equal(policy.matches('https://example.com/*','http://example.com/x'),false);
  assert.equal(policy.matches('https://example.com:443/*','https://example.com/x'),false);
  assert.equal(policy.matches('<all_urls>','file:///private'),false);
  assert.equal(policy.matches('<all_urls>','https://user:secret@example.com/'),false);
  assert.equal(policy.matches('https://example.com/a.b*','https://example.com/axb'),false);
});
