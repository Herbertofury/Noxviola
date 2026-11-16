'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {createExtensionBridge,CHANNEL,MAP_CHANNEL,SUBSCRIBE_CHANNEL} = require('../browser/extension-bridge.cjs');
const policy = require('../browser/extension-policy.cjs');
const {rgbaPNG,pngDimensions} = require('../browser/extension-icons.cjs');
// Actual production router; only Electron primitives and canonical host services
// are substituted. These tests establish admission/routing contracts, not native
// preload execution or marketplace extension compatibility.
const EXT = 'a'.repeat(32), OTHER = 'b'.repeat(32);
function fixture(t,{permissions=['tabs','cookies','bookmarks','contextMenus','activeTab'],hosts=['https://allowed.test/*'],nativeImage,readResource,defaultIcon,apiProfile='chromium'}={}) {
  const ipc = Object.assign(new EventEmitter(),{handlers:new Map(),handle(name,fn){this.handlers.set(name,fn);},removeHandler(name){this.handlers.delete(name);}});
  const sessions = ['personal','work'].map(() => {
    const jar = Object.assign(new EventEmitter(),{values:[],calls:[],async get(query){this.calls.push(['get',query]);return this.values.filter(cookie => (!query.name || cookie.name === query.name) && (!query.url || new URL(query.url).hostname === cookie.domain.replace(/^\./,'')));},async set(value){this.calls.push(['set',value]);this.values.push({name:value.name,value:value.value,domain:value.domain || new URL(value.url).hostname,path:value.path || '/',hostOnly:!value.domain,secure:!!value.secure,session:value.expirationDate===undefined,expirationDate:value.expirationDate});},async remove(url,name){this.calls.push(['remove',url,name]);this.values=this.values.filter(cookie=>!(cookie.name===name&&cookie.domain===new URL(url).hostname));}});
    const workers = Object.assign(new EventEmitter(),{getAllRunning:()=>({}),getWorkerFromVersionID:()=>null});
    return {cookies:jar,serviceWorkers:workers,preloads:new Map(),registerPreloadScript(value){this.preloads.set(value.id,value);return value.id;},unregisterPreloadScript(id){this.preloads.delete(id);}};
  });
  const contexts = new Map(sessions.map((session,index) => [session,{id:'package-1',identity:index?'work':'personal',runtimeId:EXT,epoch:'epoch-1',session,name:'Real fixture',permissions:{required:permissions,hosts},manifest:{action:{default_title:'Fixture action'}},pages:{popup:null},allowFileAccess:false}]));
  if(defaultIcon!==undefined)for(const context of contexts.values())context.manifest.action.default_icon=defaultIcon;
  for(const context of contexts.values())context.apiProfile=apiProfile;
  let runtimeObserver, hostObserver, bookmarkObserver;
  const manager = {runtimeContext(session,id){return id===EXT?contexts.get(session)||null:null;},runtimeContexts(identity){return [...contexts.values()].filter(value=>identity===undefined||value.identity===identity);},subscribeRuntime(fn){runtimeObserver=fn;return()=>{runtimeObserver=null;};}};
  if(readResource)manager.readRuntimeResource=readResource;
  const tabs = new Map([[10,{id:10,identity:'personal',windowId:1,url:'https://allowed.test/page',title:'Allowed secret',active:true,pinned:false,mutedInfo:{muted:false}}],[11,{id:11,identity:'personal',windowId:1,url:'https://private.test/',title:'Private title',active:false,pinned:false,mutedInfo:{muted:false}}],[20,{id:20,identity:'work',windowId:1,url:'https://allowed.test/work',title:'Work private',active:true}]]);
  const mutations=[], opened=[], bookmarkCalls=[]; let nextId=30;
  const host={tabs:{list:identity=>[...tabs.values()].filter(tab=>tab.identity===identity),get:(identity,id)=>tabs.get(id)?.identity===identity?tabs.get(id):undefined,nativeId:(identity,id)=>tabs.get(id)?.identity===identity&&id!==11?id+100:undefined,browserId:(identity,id)=>tabs.get(id-100)?.identity===identity?id-100:undefined,async create(identity,options){const tab={id:nextId++,identity,windowId:1,url:'about:blank',title:'New tab',active:true,...options};tabs.set(tab.id,tab);mutations.push(['create',identity,options]);return tab;},async update(identity,id,options){Object.assign(tabs.get(id),options);mutations.push(['update',identity,id,options]);return tabs.get(id);},async remove(identity,id){tabs.delete(id);mutations.push(['remove',identity,id]);},async move(identity,ids,options){return (Array.isArray(ids)?ids:[ids]).map(id=>{Object.assign(tabs.get(id),options);return tabs.get(id);});},async reload(identity,id,options){mutations.push(['reload',identity,id,options]);}},windows:{getCurrent:(identity,options={})=>({id:1,type:'normal',focused:true,...(options.populate?{tabs:[...tabs.values()].filter(tab=>tab.identity===identity)}:{})}),getAll:(identity,options)=>[host.windows.getCurrent(identity,options)],update:(identity,id,options)=>({...host.windows.getCurrent(identity),...options})},bookmarks:{getTree(identity){bookmarkCalls.push(['getTree',identity]);return[{id:identity+'-root',identity,children:[]}];},create(identity,options){bookmarkCalls.push(['create',identity,options]);const node={id:'new-bookmark',...options};bookmarkObserver?.({type:'created',identity,id:node.id,node});return node;},subscribe(fn){bookmarkObserver=fn;return()=>{bookmarkObserver=null;};}},subscribe(fn){hostObserver=fn;return()=>{hostObserver=null;};},openExtensionPage(value){opened.push(value);},actionsChanged() {}};
  const bridge=createExtensionBridge({ipcMain:ipc,manager,host,nativeImage});for(const session of sessions)bridge.attachSession(session);
  t.after(()=>bridge.dispose());
  function event(index=0,runtimeId=EXT){const frame={url:'chrome-extension://'+runtimeId+'/popup.html',detached:false,sent:[],send(...args){this.sent.push(args);},isDestroyed:()=>false};return {type:'frame',sender:{session:sessions[index],isDestroyed:()=>false},senderFrame:frame};}
  const personal=event();
  async function call(method,args=[],sender=personal){const result=await ipc.handlers.get(CHANNEL)(sender,method,args);if(!result.ok)throw Object.assign(new Error(result.error.message),{code:result.error.code});return result.value;}
  return {bridge,ipc,sessions,contexts,manager,host,tabs,mutations,opened,bookmarkCalls,event,personal,call,emit:payload=>hostObserver?.(payload),revoke(index=0){const session=sessions[index],context=contexts.get(session);contexts.delete(session);runtimeObserver?.({kind:'revoked',id:context.id,identity:context.identity,runtimeId:context.runtimeId});},bookmark:payload=>bookmarkObserver?.(payload)};
}
function iconCodec(){return {createFromBuffer:png=>({isEmpty:()=>false,getSize:()=>pngDimensions(png),toPNG:()=>png})};}
const imageData=color=>({width:1,height:1,data:new Uint8ClampedArray(color)});
test('extension tab queries find only the caller’s own page in its identity',async t=>{
  const f=fixture(t),url=`chrome-extension://${EXT}/options.html`,other=`chrome-extension://${OTHER}/options.html`;
  f.tabs.set(31,{id:31,identity:'personal',windowId:1,url,title:'Options'});
  f.tabs.set(32,{id:32,identity:'work',windowId:1,url,title:'Work options'});
  f.tabs.set(33,{id:33,identity:'personal',windowId:1,url:other,title:'Other extension'});
  assert.deepEqual((await f.call('tabs.query',[{url}])).map(tab=>tab.id),[31]);
  assert.deepEqual((await f.call('tabs.query',[{url:`chrome-extension://${EXT}/*`}])).map(tab=>tab.id),[31]);
  assert.deepEqual(await f.call('tabs.query',[{url:other}]),[]);
  assert.deepEqual((await f.call('tabs.query',[{url}],f.event(1))).map(tab=>tab.id),[32]);
  await assert.rejects(f.call('tabs.create',[{url:other}]),/not supported/);
});
test('history traversal operates on the live tab in the extension identity and rejects unsafe contexts',async t=>{
  const f=fixture(t,{permissions:[]}),calls=[];
  let canBack=true,canForward=true,target='https://allowed.test/previous',owner=null;
  const history={canGoBack:()=>canBack,canGoForward:()=>canForward,getActiveIndex:()=>1,getEntryAtIndex:index=>({url:target,index}),goBack:()=>calls.push('back'),goForward:()=>calls.push('forward')};
  const contents={id:110,session:f.sessions[0],isDestroyed:()=>false,navigationHistory:history};
  f.host.messageSource=id=>id===110?{contents,owner}:null;
  assert.equal(await f.call('tabs.goBack',[]),undefined);
  assert.equal(await f.call('tabs.goForward',[10]),undefined);
  assert.deepEqual(calls,['back','forward']);
  await assert.rejects(f.call('tabs.goBack',[20]),{code:'TAB_NOT_FOUND'});
  await assert.rejects(f.call('tabs.goBack',[11]),{code:'TAB_UNAVAILABLE'});
  await assert.rejects(f.call('tabs.goBack',[10,11]),{code:'INVALID_ARGUMENT'});
  canBack=false;await assert.rejects(f.call('tabs.goBack',[10]),{code:'NO_NAVIGATION_HISTORY'});canBack=true;
  canForward=false;await assert.rejects(f.call('tabs.goForward',[10]),{code:'NO_NAVIGATION_HISTORY'});canForward=true;
  target='file:///secret';await assert.rejects(f.call('tabs.goBack',[10]),/not supported/);target='https://allowed.test/';
  contents.session=f.sessions[1];await assert.rejects(f.call('tabs.goBack',[10]),{code:'TAB_UNAVAILABLE'});contents.session=f.sessions[0];
  owner={};await assert.rejects(f.call('tabs.goBack',[10]),{code:'TAB_UNAVAILABLE'});owner=null;
  contents.isDestroyed=()=>true;await assert.rejects(f.call('tabs.goBack',[10]),{code:'TAB_UNAVAILABLE'});
  assert.deepEqual(calls,['back','forward']);
});
test('history traversal rejects revoked extensions and Firefox completion semantics',async t=>{
  const f=fixture(t),firefox=fixture(t,{apiProfile:'firefox'});let resolveList,called=false;
  f.host.tabs.list=()=>new Promise(resolve=>{resolveList=resolve;});f.host.messageSource=()=>{called=true;};
  const pending=f.call('tabs.goBack',[]);await Promise.resolve();f.revoke();resolveList([{id:10,identity:'personal',active:true}]);
  await assert.rejects(pending,{code:'EXTENSION_REVOKED'});assert.equal(called,false);
  await assert.rejects(firefox.call('tabs.goBack',[10]),{code:'UNSUPPORTED_API'});
});
function senderFixture(t) {
  const f=fixture(t),sources=new Map();
  f.host.messageSource=nativeId=>sources.get(nativeId);
  f.map=(direction,value,event=f.personal)=>{f.ipc.listeners(MAP_CHANNEL)[0](event,direction,value);return event.returnValue;};
  f.document=({nativeId=404,index=0,type='window',owned=true,enroll=true,url='chrome-extension://'+EXT+'/popup.html'}={})=>{
    const event=f.event(index);event.senderFrame.url=url;
    Object.assign(event.sender,{id:nativeId,mainFrame:event.senderFrame,getType:()=>type});
    const context=f.contexts.get(f.sessions[index]);
    const source={contents:event.sender,owner:owned?{id:context.id,identity:context.identity,runtimeId:context.runtimeId,epoch:context.epoch,session:context.session,contents:event.sender}:null};
    sources.set(nativeId,source);
    if(enroll)assert.equal(f.map('enroll',undefined,event).ok,true);
    return {event,source,details:{nativeId,frameId:0,senderId:EXT,senderUrl:url}};
  };
  return f;
}
test('message sender classification keeps canonical browser tabs and admits only native enrolled extension windows or backgrounds',t=>{
  const f=senderFixture(t);
  for(const options of [{nativeId:404},{nativeId:405,url:'chrome-extension://'+EXT+'/options.html'},{nativeId:406,type:'backgroundPage',owned:false}]){
    const {details}=f.document(options);
    assert.deepEqual(f.map('messageSender',details),{ok:true,value:{kind:'extension-document'}});
    assert.equal(f.map('browserId',details.nativeId).ok,false,'Strict tab APIs must still reject an extension window.');
  }
  const canonical=f.document({nativeId:110});f.tabs.get(10).url=canonical.details.senderUrl;
  assert.deepEqual(f.map('messageSender',canonical.details),{ok:true,value:{kind:'tab',id:10}},'An extension document in a canonical tab remains a tab.');
  assert.deepEqual(f.map('nativeId',10),{ok:true,value:110});
  assert.equal(f.map('messageSender',{nativeId:120,frameId:0,senderId:EXT,senderUrl:'chrome-extension://'+EXT+'/popup.html'}).ok,false);
  assert.equal(f.mutations.length,0);
});
test('message sender ownership cannot be established by forged fields, unknown objects, other identities or child-frame containers',t=>{
  const f=senderFixture(t),good=f.document();
  const denied=details=>assert.equal(f.map('messageSender',details).ok,false);
  denied({...good.details,nativeId:999});
  denied({...good.details,senderId:OTHER});
  denied({...good.details,senderUrl:'chrome-extension://'+EXT+'/different-document.html'});
  denied({...good.details,identity:'work'});
  for(const frameId of [undefined,-1,1,7])denied({...good.details,frameId});
  const foreign=f.document({nativeId:407,index:1});denied(foreign.details);
  const unowned=f.document({nativeId:408,owned:false});denied(unowned.details);
  const unbound=f.document({nativeId:409,enroll:false});denied(unbound.details);
  const previous=good.event.senderFrame.url;
  for(const url of ['https://allowed.test/','chrome-extension://'+OTHER+'/popup.html','about:blank']){
    good.event.senderFrame.url=url;denied({...good.details,senderUrl:url});
  }
  good.event.senderFrame.url=previous;
  good.event.senderFrame.detached=true;denied(good.details);good.event.senderFrame.detached=false;
  good.event.sender.isDestroyed=()=>true;denied(good.details);
});
test('message source enrollment rejects stale windows and draining backgrounds after disable or re-enable',t=>{
  for(const kind of ['window','backgroundPage']){
    const f=senderFixture(t),old=f.document({type:kind,owned:kind==='window'});
    const oldReceiver=f.personal;assert.equal(f.map('enroll',undefined,oldReceiver).ok,true);
    const prior=f.contexts.get(f.sessions[0]);f.contexts.set(f.sessions[0],{...prior,epoch:'epoch-2'});
    const newReceiver=f.event();
    assert.equal(f.map('messageSender',old.details,newReceiver).ok,false,'An old source frame must not adopt the new enrollment.');
    const fresh=f.document({nativeId:405,type:kind,owned:kind==='window'});
    assert.equal(f.map('messageSender',fresh.details,oldReceiver).ok,false,'An old recipient must not obtain a new-enrollment result.');
    assert.deepEqual(f.map('messageSender',fresh.details,newReceiver),{ok:true,value:{kind:'extension-document'}});
    f.revoke();assert.equal(f.map('messageSender',fresh.details,newReceiver).ok,false);
  }
});
test('registered window ownership independently binds exact WebContents, package, identity, runtime, Session and epoch',t=>{
  const f=senderFixture(t),{source,details}=f.document(),owner={...source.owner};
  for(const [key,value] of [['contents',{...source.contents}],['id','other-package'],['identity','work'],['runtimeId',OTHER],['epoch','old-epoch'],['session',f.sessions[1]]]){
    source.owner={...owner,[key]:value};assert.equal(f.map('messageSender',details).ok,false,key+' must match the current native enrollment.');
  }
  source.owner=owner;assert.equal(f.map('messageSender',details).ok,true);
  source.contents.id=999;assert.equal(f.map('messageSender',details).ok,false);
});
test('permission queries use the authenticated identity grant and reject mutation, payload identity and revoked replies',async t=>{
  const f=fixture(t,{permissions:['tabs','storage','<all_urls>'],hosts:[]});
  f.contexts.get(f.sessions[0]).permissions.optional=['contextMenus'];
  f.contexts.get(f.sessions[1]).permissions={required:['bookmarks'],hosts:['https://work.test/*']};
  assert.deepEqual(await f.call('permissions.getAll'),{permissions:['tabs','storage'],origins:['<all_urls>']});
  assert.equal(await f.call('permissions.contains',[{permissions:['tabs'],origins:['https://example.test/*']}]),true);
  assert.equal(await f.call('permissions.contains',[{permissions:['contextMenus']}]),false);
  assert.equal(await f.call('permissions.contains',[{permissions:['bookmarks']}]),false);
  assert.equal(await f.call('permissions.contains',[{permissions:['bookmarks']}],f.event(1)),true);
  assert.equal(await f.call('permissions.contains',[{origins:['file:///*']}]),false);
  await assert.rejects(f.call('permissions.contains',[{identity:'work',permissions:['bookmarks']}]),{code:'UNSUPPORTED_ARGUMENT'});
  await assert.rejects(f.call('permissions.contains',[{data_collection:['healthInfo']}]),{code:'UNSUPPORTED_ARGUMENT'});
  for(const method of ['request','remove'])await assert.rejects(f.call('permissions.'+method,[{permissions:['contextMenus']}]),{code:'UNSUPPORTED_API'});
  await assert.rejects(f.call('events.add',['permissions.onRemoved']),{code:'UNSUPPORTED_EVENT'});
  const website=f.event();website.senderFrame.url='https://example.test/';
  await assert.rejects(f.call('permissions.getAll',[],website),{code:'UNAUTHENTICATED_EXTENSION'});
  const pending=f.call('permissions.getAll');f.revoke();
  await assert.rejects(pending,{code:'EXTENSION_REVOKED'});
  assert.equal(f.mutations.length,0);
});
test('permission query replies from a prior enrollment cannot survive re-enable',async t=>{
  const f=fixture(t);const pending=f.call('permissions.contains',[{permissions:['tabs']}]);
  f.contexts.set(f.sessions[0],{...f.contexts.get(f.sessions[0]),epoch:'new-enrollment'});
  await assert.rejects(pending,{code:'EXTENSION_REVOKED'});
});
test('file-scheme query reads the current per-identity accepted flag without host permissions or mutations',async t=>{
  const f=fixture(t,{permissions:[],hosts:[]});
  f.contexts.get(f.sessions[1]).allowFileAccess=true;
  assert.equal(await f.call('extension.isAllowedFileSchemeAccess'),false);
  assert.equal(await f.call('extension.isAllowedFileSchemeAccess',[],f.event(1)),true);
  // It is the user-controlled setting, not effective manifest host coverage.
  f.contexts.get(f.sessions[0]).allowFileAccess=true;
  assert.equal(await f.call('extension.isAllowedFileSchemeAccess'),true);
  delete f.contexts.get(f.sessions[0]).allowFileAccess;
  assert.equal(await f.call('extension.isAllowedFileSchemeAccess'),false);
  f.contexts.get(f.sessions[0]).allowFileAccess='true';
  assert.equal(await f.call('extension.isAllowedFileSchemeAccess'),false);
  assert.equal(f.mutations.length,0);assert.equal(f.sessions[0].cookies.calls.length,0);
  assert.equal(f.bridge.listeners.size,0);assert.equal(f.opened.length,0);
});
test('file-scheme query refuses caller-selected identities, foreign contexts and unsupported sibling APIs',async t=>{
  const f=fixture(t);f.contexts.get(f.sessions[1]).allowFileAccess=true;
  for(const args of [[{identity:'work'}],[true],['work'],[null]])await assert.rejects(f.call('extension.isAllowedFileSchemeAccess',args),{code:'INVALID_ARGUMENT'});
  const website=f.event();website.senderFrame.url='https://allowed.test/';
  await assert.rejects(f.call('extension.isAllowedFileSchemeAccess',[],website),{code:'UNAUTHENTICATED_EXTENSION'});
  const foreign=f.event();foreign.sender.session={};
  await assert.rejects(f.call('extension.isAllowedFileSchemeAccess',[],foreign),{code:'UNAUTHENTICATED_EXTENSION'});
  await assert.rejects(f.call('extension.isAllowedFileSchemeAccess',[],f.event(0,OTHER)),{code:'EXTENSION_REVOKED'});
  const dead=f.event();dead.senderFrame.detached=true;
  await assert.rejects(f.call('extension.isAllowedFileSchemeAccess',[],dead),{code:'UNAUTHENTICATED_EXTENSION'});
  await assert.rejects(f.call('extension.isAllowedIncognitoAccess'),{code:'UNSUPPORTED_API'});
});
test('file-scheme replies revalidate revocation, native origin and enrollment before returning a grant',async t=>{
  for(const change of ['revoke','epoch','origin']){
    const f=fixture(t);f.contexts.get(f.sessions[0]).allowFileAccess=true;
    const pending=f.call('extension.isAllowedFileSchemeAccess');
    if(change==='revoke')f.revoke();
    else if(change==='epoch')f.contexts.set(f.sessions[0],{...f.contexts.get(f.sessions[0]),epoch:'new-enrollment',allowFileAccess:false});
    else f.personal.senderFrame.url='https://outside.test/';
    await assert.rejects(pending,{code:change==='origin'?'UNAUTHENTICATED_EXTENSION':'EXTENSION_REVOKED'});
    if(change==='epoch'){
      await assert.rejects(f.call('extension.isAllowedFileSchemeAccess'),{code:'STALE_EXTENSION_CONTEXT'});
      assert.equal(await f.call('extension.isAllowedFileSchemeAccess',[],f.event()),false);
    }
  }
});
test('action icons load manifest defaults once and apply real global/per-tab ImageData and reset inheritance',async t=>{
  const png=Buffer.from((await rgbaPNG(imageData([100,80,60,255]))).dataUrl.split(',')[1],'base64');let reads=0;
  const f=fixture(t,{apiProfile:'firefox',defaultIcon:{16:'icons/default.png',32:'icons/default.png'},nativeImage:iconCodec(),readResource:async()=>{reads++;return png;}});
  assert.equal(f.bridge.actionState('personal',10)[0].icon,null);
  f.bridge.actionState('personal',10);
  await f.bridge.actions.get('personal\0package-1').defaultIconPromise;
  const manifest=f.bridge.actionState('personal',10)[0].icon;
  assert.deepEqual(manifest.variants.map(item=>item.size),[16,32]);assert.equal(reads,1);
  await f.call('action.setIcon',[{imageData:imageData([1,2,3,255])}]);const global=f.bridge.actionState('personal',10)[0].icon;
  assert.notEqual(global.variants[0].dataUrl,manifest.variants[0].dataUrl);
  await f.call('browserAction.setIcon',[{tabId:10,imageData:{16:imageData([4,5,6,128]),32:imageData([7,8,9,255])}}]);
  assert.equal(f.bridge.actionState('personal',10)[0].icon.variants.length,2);
  assert.deepEqual(f.bridge.actionState('personal',11)[0].icon,global);
  await f.call('action.setIcon',[{tabId:10,imageData:null,path:{}}]);assert.deepEqual(f.bridge.actionState('personal',10)[0].icon,global);
  await f.call('action.setIcon',[{}]);assert.deepEqual(f.bridge.actionState('personal',10)[0].icon,manifest);
  await assert.rejects(f.call('action.setIcon',[{path:'https://outside.test/icon.png'}]),{code:'ICON_ORIGIN_DENIED'});
  assert.deepEqual(f.bridge.actionState('personal',10)[0].icon,manifest);
  await assert.rejects(f.call('action.setIcon',[{tabId:20,imageData:imageData([1,2,3,4])}]),{code:'TAB_NOT_FOUND'});
});
test('failed default icon reports its cause while a valid explicit icon remains usable',async t=>{
  const f=fixture(t,{apiProfile:'firefox',defaultIcon:'missing.png',nativeImage:iconCodec(),readResource:async()=>{throw new Error('Verified resource is missing');}});
  f.bridge.actionState('personal',10);await f.bridge.actions.get('personal\0package-1').defaultIconPromise;
  assert.equal(f.bridge.actionState('personal',10)[0].icon,null);assert.match(f.bridge.actionState('personal',10)[0].iconError,/missing/);
  await f.call('action.setIcon',[{imageData:imageData([10,20,30,255])}]);assert.equal(f.bridge.actionState('personal',10)[0].iconError,'');
  await f.call('action.setIcon',[{}]);assert.match(f.bridge.actionState('personal',10)[0].iconError,/missing/);
});
test('revocation, navigation or tab removal while reading an icon cannot publish stale image state',async t=>{
  const png=Buffer.from((await rgbaPNG(imageData([1,2,3,255]))).dataUrl.split(',')[1],'base64');
  for(const change of ['revoke','navigate','remove']){
    let finish;const f=fixture(t,{nativeImage:iconCodec(),readResource:()=>new Promise(resolve=>{finish=resolve;})});
    const pending=f.call('action.setIcon',[{tabId:10,path:'icon.png'}]);await Promise.resolve();
    if(change==='revoke')f.revoke();else if(change==='navigate')f.personal.senderFrame.url='https://outside.test/';else{f.tabs.delete(10);f.emit({identity:'personal',event:'tabs.onRemoved',args:[10,{windowId:1,isWindowClosing:false}]});}
    finish(png);await assert.rejects(pending,{code:change==='revoke'?'EXTENSION_REVOKED':change==='navigate'?'UNAUTHENTICATED_EXTENSION':'TAB_NOT_FOUND'});
    if(change==='revoke'){assert.equal(f.bridge.actions.size,0);assert.equal(f.bridge.icons.cache.size,0);}else assert.equal(f.bridge.actions.get('personal\0package-1').tabs.has(10),false);
  }
});
test('an earlier slow icon decode cannot overwrite a later successful icon or reset',async t=>{
  const png=Buffer.from((await rgbaPNG(imageData([1,2,3,255]))).dataUrl.split(',')[1],'base64');let finish;
  const f=fixture(t,{apiProfile:'firefox',nativeImage:iconCodec(),readResource:()=>new Promise(resolve=>{finish=resolve;})});
  const older=f.call('action.setIcon',[{path:'older.png'}]);await Promise.resolve();
  await f.call('action.setIcon',[{imageData:imageData([50,60,70,255])}]);const later=f.bridge.actionState('personal',10)[0].icon;
  finish(png);await older;assert.deepEqual(f.bridge.actionState('personal',10)[0].icon,later);
  const pending=f.call('action.setIcon',[{path:'another.png'}]);await Promise.resolve();await f.call('action.setIcon',[{}]);finish(png);await pending;
  assert.equal(f.bridge.actionState('personal',10)[0].icon,null);
});
test('chosen API profile controls empty setters and full-document navigation without trusting public method arguments',async t=>{
  const chromium=fixture(t),firefox=fixture(t,{apiProfile:'firefox'});
  for(const f of [chromium,firefox])await f.call('action.setIcon',[{tabId:10,imageData:{width:32,height:1,data:new Uint8ClampedArray(128)}}]);
  assert.deepEqual(chromium.bridge.actionState('personal',10)[0].icon.variants.map(({size,width,height})=>({size,width,height})),[{size:16,width:32,height:1}]);
  await assert.rejects(chromium.call('action.setIcon',[{}]),{code:'INVALID_ICON_ARGUMENT'});
  await assert.rejects(chromium.call('action.setIcon',[{apiProfile:'firefox'}]),{code:'UNSUPPORTED_ARGUMENT'});
  for(const f of [chromium,firefox]){
    f.emit({identity:'personal',event:'tab-navigation-committed',args:[10,{sameDocument:true}]});assert.ok(f.bridge.actionState('personal',10)[0].icon);
    f.emit({identity:'work',event:'tab-navigation-committed',args:[10,{sameDocument:false}]});assert.ok(f.bridge.actionState('personal',10)[0].icon);
    f.emit({identity:'personal',event:'tab-navigation-committed',args:[10,{sameDocument:false}]});
  }
  assert.ok(chromium.bridge.actionState('personal',10)[0].icon);assert.equal(firefox.bridge.actionState('personal',10)[0].icon,null);
});
test('Firefox navigation invalidates an older pending tab icon while allowing the global icon to remain',async t=>{
  const png=Buffer.from((await rgbaPNG(imageData([1,2,3,255]))).dataUrl.split(',')[1],'base64');let finish;
  const f=fixture(t,{apiProfile:'firefox',nativeImage:iconCodec(),readResource:()=>new Promise(resolve=>{finish=resolve;})});
  await f.call('action.setIcon',[{imageData:imageData([9,8,7,255])}]);const global=f.bridge.actionState('personal',10)[0].icon;
  const pending=f.call('action.setIcon',[{tabId:10,path:'pending.png'}]);await Promise.resolve();
  f.emit({identity:'personal',event:'tab-navigation-committed',args:[10,{sameDocument:false}]});finish(png);await pending;
  assert.deepEqual(f.bridge.actionState('personal',10)[0].icon,global);
});
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
