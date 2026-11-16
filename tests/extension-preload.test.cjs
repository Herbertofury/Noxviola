'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');
const {webcrypto,createHash} = require('node:crypto');
const source = fs.readFileSync(require.resolve('../browser/extension-api.preload.cjs'),'utf8');
const EXT = 'a'.repeat(32);
function nativeEvent() { const listeners = new Set();return {addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),hasListener:fn=>listeners.has(fn),emit(...args){return [...listeners].map(fn=>fn(...args));}}; }
function fixture({address='chrome-extension://'+EXT+'/popup.html',contextIsolated=true,hasDocument=true,nativeExtension,invoke=async()=>({ok:true,value:undefined}),subscribe=()=>({ok:true}),map}={}) {
  const calls=[], mappings=[], subscriptions=[], nativeCalls=[], errors=[], contextBridgeCalls=[];
  const ipcRenderer=Object.assign(new EventEmitter(),{invoke:async(method,...args)=>{calls.push([method,...args]);return invoke(...args);},sendSync:(channel,direction,id)=>{
    if(channel==='noxviola-extension:subscription'){subscriptions.push([direction,id]);return subscribe(direction,id);}
    mappings.push([direction,id]);
    if(map)return map(direction,id);
    if(direction==='enroll')return {ok:true};
    if(direction==='messageSender')return {ok:true,value:{kind:'tab',id:id.nativeId-100}};
    return id===11?{ok:false,error:{message:'No native context'}}:{ok:true,value:direction==='nativeId'?id+100:id-100};
  }});
  const nativeRuntime={id:EXT,getManifest:()=>({permissions:['tabs','contextMenus']}),onMessage:nativeEvent(),onConnect:nativeEvent(),getURL:value=>'chrome-extension://'+EXT+'/'+value};
  const nativePort={name:'real-port',sender:{tab:{id:110,url:'https://allowed.test/'}},postMessage:value=>nativeCalls.push(['port.postMessage',value]),disconnect:()=>nativeCalls.push(['port.disconnect']),onMessage:nativeEvent(),onDisconnect:nativeEvent()};
  const main=vm.createContext({crypto:webcrypto,chrome:{runtime:nativeRuntime,tabs:{sendMessage:(...args)=>{nativeCalls.push(['sendMessage',...args]);if(typeof args.at(-1)==='function'){args.at(-1)('native reply');return;}return Promise.resolve('native reply');},executeScript:(id,details,callback)=>{nativeCalls.push(['tabs.executeScript',id,details]);callback(['actual native result']);},connect:(...args)=>{nativeCalls.push(['connect',...args]);return nativePort;}},scripting:{executeScript:details=>{nativeCalls.push(['executeScript',details]);return Promise.resolve([{result:true}]);}}},console:{error:error=>errors.push(error.message),log(){},warn(){}}});
  if(nativeExtension)main.chrome.extension=nativeExtension;
  main.location={href:address};main.URL=URL;if(hasDocument)main.document={baseURI:address};
  let required=0;
  const contextBridge={exposeInMainWorld:(key,value)=>{assert.equal(contextIsolated,true,'Native contextBridge rejects non-isolated contexts.');contextBridgeCalls.push('expose');Object.defineProperty(main,key,{value,configurable:true});},executeInMainWorld:({func})=>{assert.equal(contextIsolated,true);contextBridgeCalls.push('execute');return vm.runInContext('('+func.toString()+')()',main);}};
  const executionContext=contextIsolated?vm.createContext({location:{href:address},console:main.console}):main;
  // Electron passes require/process into its sandboxed preload wrapper. With
  // native background pages, that wrapper shares the extension's main world.
  const execute=vm.runInContext('(function(require,process){'+source+'\n})',executionContext);
  execute(name=>{assert.equal(name,'electron');required++;return {ipcRenderer,contextBridge};},{contextIsolated});
  return {main,chrome:main.chrome,browser:main.browser,calls,mappings,subscriptions,nativeCalls,nativeRuntime,nativePort,ipcRenderer,errors,contextBridgeCalls,get required(){return required;}};
}
test('actual preload exposes no transport or added APIs in ordinary website documents',()=>{
  for(const contextIsolated of [true,false]){
    const f=fixture({address:'https://example.test/',contextIsolated});
    assert.equal(f.required,0);assert.equal(f.main.__noxviolaExtensionHost,undefined);assert.equal(f.chrome.cookies,undefined);
  }
});
test('permission queries expose real callback and Mozilla Promise results without fabricated grant events',async()=>{
  for(const contextIsolated of [true,false]){
    const f=fixture({contextIsolated,invoke:async(method,args)=>{
      if(method==='permissions.getAll')return {ok:true,value:{permissions:['tabs','storage'],origins:['https://allowed.test/*']}};
      if(method==='permissions.contains')return {ok:true,value:args[0].permissions?.includes('contextMenus')!==true};
      return {ok:false,error:{code:'UNSUPPORTED_API',message:'Native optional-grant mutation is unavailable; no grants changed.'}};
    }});
    assert.equal(typeof f.chrome.permissions.contains,'function');assert.equal(typeof f.browser.permissions.getAll,'function');
    assert.equal(f.chrome.permissions.onRemoved,undefined);assert.equal(f.browser.permissions.onAdded,undefined);
    let actual;await new Promise(resolve=>f.chrome.permissions.contains({permissions:['contextMenus']},value=>{actual=value;resolve();}));
    assert.equal(actual,false);assert.equal(await f.browser.permissions.contains({permissions:['tabs']}),true);
    assert.deepEqual(JSON.parse(JSON.stringify(await f.browser.permissions.getAll())),{permissions:['tabs','storage'],origins:['https://allowed.test/*']});
    await assert.rejects(f.browser.permissions.request({permissions:['contextMenus']}),/no grants changed/);
    let error;await new Promise(resolve=>f.chrome.permissions.remove({permissions:['tabs']},()=>{error=f.chrome.runtime.lastError?.message;resolve();}));
    assert.match(error,/no grants changed/);assert.equal(f.chrome.runtime.lastError,undefined);assert.deepEqual(f.subscriptions,[]);
  }
});
test('file-scheme access query returns actual false and true through callbacks and Promises while preserving native extension siblings',async()=>{
  for(const contextIsolated of [true,false]){
    let allowed=false,nativeReads=0,nativeValue='first';const background={native:true};
    const nativeExtension={getBackgroundPage:()=>background,getViews:()=>[background]};
    Object.defineProperty(nativeExtension,'nativeLiveValue',{get:()=>{nativeReads++;return nativeValue;},enumerable:true,configurable:false});
    const f=fixture({contextIsolated,nativeExtension,invoke:async(method,args)=>{assert.equal(method,'extension.isAllowedFileSchemeAccess');assert.equal(args.length,0);return {ok:true,value:allowed};}});
    assert.equal(nativeReads,0,'Installing the query must not evaluate or freeze native getters.');
    assert.equal(f.chrome.extension.getBackgroundPage,nativeExtension.getBackgroundPage);assert.equal(f.chrome.extension.getBackgroundPage(),background);
    assert.equal(f.chrome.extension.getViews,nativeExtension.getViews);
    assert.equal(f.chrome.extension.nativeLiveValue,'first');nativeValue='second';assert.equal(f.chrome.extension.nativeLiveValue,'second');
    assert.equal(f.chrome.extension.isAllowedIncognitoAccess,undefined);
    assert.equal(await f.chrome.extension.isAllowedFileSchemeAccess(),false);
    assert.equal(await f.browser.extension.isAllowedFileSchemeAccess(),false);
    let callbackCalls=0,returned;
    const done=new Promise(resolve=>{returned=f.chrome.extension.isAllowedFileSchemeAccess(value=>{callbackCalls++;assert.equal(value,false);resolve();});});
    assert.equal(returned,undefined);assert.equal(callbackCalls,0);await done;assert.equal(callbackCalls,1);
    allowed=true;assert.equal(await f.browser.extension.isAllowedFileSchemeAccess(),true);
    await new Promise(resolve=>f.chrome.extension.isAllowedFileSchemeAccess(value=>{assert.equal(value,true);resolve();}));
    assert.equal(f.subscriptions.length,0);assert.equal(f.nativeCalls.length,0);
  }
});
test('file-scheme callback errors expose live lastError and Promise rejection without returning a false grant or losing native getters',async()=>{
  for(const contextIsolated of [true,false]){
    let nativeError;const nativeExtension={};
    Object.defineProperty(nativeExtension,'lastError',{get:()=>nativeError,enumerable:true,configurable:false});
    const f=fixture({contextIsolated,nativeExtension,invoke:async()=>({ok:false,error:{code:'EXTENSION_REVOKED',message:'The native enrollment was revoked.'}})});
    await assert.rejects(f.chrome.extension.isAllowedFileSchemeAccess(),error=>error.code==='EXTENSION_REVOKED');
    await assert.rejects(f.browser.extension.isAllowedFileSchemeAccess(),/enrollment was revoked/);
    let count=0;
    await new Promise(resolve=>f.chrome.extension.isAllowedFileSchemeAccess(value=>{
      count++;assert.equal(value,undefined);assert.match(f.chrome.runtime.lastError.message,/enrollment was revoked/);
      assert.equal(f.chrome.extension.lastError,f.chrome.runtime.lastError);resolve();
    }));
    assert.equal(count,1);assert.equal(f.chrome.runtime.lastError,undefined);assert.equal(f.chrome.extension.lastError,undefined);
    nativeError={message:'An actual native API error'};assert.equal(f.chrome.extension.lastError,nativeError);nativeError=undefined;
    assert.equal(f.chrome.extension.lastError,undefined);
  }
});
test('native non-isolated background context installs real host create/event and Promise denial without contextBridge',async()=>{
  let f;
  f=fixture({contextIsolated:false,invoke:async(method,args)=>{
    if(method==='tabs.create'){
      const tab={id:14,url:args[0].url,active:false};
      f.ipcRenderer.emit('noxviola-extension:event',{},'tabs.onCreated',tab);
      return {ok:true,value:tab};
    }
    return {ok:false,error:{message:'The authenticated host denied this operation'}};
  }});
  assert.deepEqual(f.contextBridgeCalls,[]);
  assert.equal(f.main.__noxviolaExtensionHost,undefined);
  assert.equal(f.main.require,undefined);assert.equal(f.main.process,undefined);
  assert.equal(typeof f.chrome.tabs.create,'function');assert.equal(typeof f.browser.tabs.create,'function');
  const created=[];f.browser.tabs.onCreated.addListener(tab=>created.push(tab.id));
  const tab=await f.browser.tabs.create({url:'https://allowed.test/created',active:false});
  assert.equal(tab.id,14);assert.deepEqual(created,[14]);
  assert.deepEqual(f.subscriptions,[['add','tabs.onCreated']]);
  assert.equal(f.calls[0][1],'tabs.create');
  await assert.rejects(f.browser.windows.create({}),/authenticated host denied/);
  let callbackError;
  await new Promise(resolve=>f.chrome.windows.create({},()=>{callbackError=f.chrome.runtime.lastError.message;resolve();}));
  assert.match(callbackError,/authenticated host denied/);assert.equal(f.chrome.runtime.lastError,undefined);
});
test('host methods preserve Promise rejection and callback runtime.lastError instead of success-shaped undefined',async()=>{
  const f=fixture({invoke:async(method,args)=>method==='tabs.query'?{ok:true,value:[{id:10,title:'Actual host tab'}]}:{ok:false,error:{code:'UNSUPPORTED_API',message:'This host has no windows.create'}}});
  const tabs=await f.chrome.tabs.query({active:true});assert.equal(tabs[0].title,'Actual host tab');
  await assert.rejects(f.chrome.windows.create({}),/no windows.create/);
  let callbackError;await new Promise(resolve=>f.chrome.windows.create({},()=>{callbackError=f.chrome.runtime.lastError.message;resolve();}));
  assert.match(callbackError,/no windows.create/);assert.equal(f.chrome.runtime.lastError,undefined);
  assert.equal(f.calls[0][1],'tabs.query');assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0][2])),[{active:true}]);
  assert.equal(f.main.__noxviolaExtensionHost,undefined);
});
test('native tab messaging and scripting translate stable IDs without creating lazy contexts',async()=>{
  const f=fixture();assert.equal(await f.chrome.tabs.sendMessage(10,{hello:true}),'native reply');assert.equal(f.nativeCalls[0][1],110);
  await f.chrome.scripting.executeScript({target:{tabId:10},func:()=>true});assert.equal(f.nativeCalls[1][1].target.tabId,110);
  assert.throws(()=>f.chrome.tabs.sendMessage(11,{hello:true}),/No native context/);assert.equal(f.nativeCalls.length,2);
  let sender;f.chrome.runtime.onMessage.addListener((_message,value)=>{sender=value;return true;});
  assert.deepEqual(f.nativeRuntime.onMessage.emit('message',{tab:{id:110,url:'https://allowed.test/'},frameId:7,documentId:'real-child-document'},()=>{}),[true]);
  assert.equal(sender.tab.id,10);assert.equal(sender.tab.url,'https://allowed.test/');assert.equal(sender.frameId,7);assert.equal(sender.documentId,'real-child-document');
});
test('native extension-window messages omit only tab-only fields after authenticated classification and retain replies and Port semantics',async()=>{
  for(const contextIsolated of [true,false]){
    const f=fixture({contextIsolated,map:(direction)=>direction==='enroll'?{ok:true}:{ok:true,value:{kind:'extension-document'}}});
    assert.deepEqual(f.mappings,[['enroll',undefined]]);
    const original=Object.freeze({id:EXT,url:'chrome-extension://'+EXT+'/popup.html',origin:'chrome-extension://'+EXT,
      documentId:'native-document-uuid',documentLifecycle:'active',frameId:0,tab:Object.freeze({id:404,title:'Actual popup'}),tlsChannelId:''});
    let observed,response;
    f.chrome.runtime.onMessage.addListener((_message,sender,reply)=>{observed=sender;reply({accepted:true});return true;});
    assert.deepEqual(f.nativeRuntime.onMessage.emit('one message',original,value=>{response=value;}),[true]);
    assert.equal(response.accepted,true);assert.equal(Object.hasOwn(observed,'tab'),false);assert.equal(Object.hasOwn(observed,'frameId'),false);
    assert.deepEqual(JSON.parse(JSON.stringify(observed)),{id:EXT,url:original.url,origin:original.origin,documentId:original.documentId,documentLifecycle:'active',tlsChannelId:''});
    assert.equal(original.tab.id,404);assert.equal(original.frameId,0);
    assert.deepEqual(JSON.parse(JSON.stringify(f.mappings.at(-1))),['messageSender',{nativeId:404,frameId:0,senderId:EXT,senderUrl:original.url}]);
    f.nativePort.sender=original;let port;
    f.chrome.runtime.onConnect.addListener(value=>{port=value;return 'listener return';});
    assert.deepEqual(f.nativeRuntime.onConnect.emit(f.nativePort),['listener return']);
    assert.equal(Object.hasOwn(port.sender,'tab'),false);assert.equal(port.sender.documentId,original.documentId);
    let disconnect;const listener=value=>{disconnect=value;};port.onDisconnect.addListener(listener);
    f.nativePort.onDisconnect.emit(f.nativePort);assert.equal(disconnect,port);
    port.onDisconnect.removeListener(listener);assert.equal(port.onDisconnect.hasListener(listener),false);
    port.postMessage('reply');port.disconnect();assert.deepEqual(f.nativeCalls,[['port.postMessage','reply'],['port.disconnect']]);
  }
});
test('native sender translation preserves existing no-tab objects and never converts failed or unknown classification into success',()=>{
  const f=fixture({map:direction=>direction==='enroll'?{ok:true}:{ok:false,error:{code:'MESSAGE_SOURCE_UNAUTHENTICATED',message:'Unknown native source'}}});
  let calls=0,received;f.chrome.runtime.onMessage.addListener((_message,sender)=>{calls++;received=sender;});
  const noTab={id:EXT,url:'chrome-extension://'+EXT+'/worker.js',documentId:'native-worker'};
  f.nativeRuntime.onMessage.emit('no tab',noTab,()=>{});assert.equal(received,noTab);assert.equal(f.mappings.length,1);
  assert.throws(()=>f.nativeRuntime.onMessage.emit('forged tab',{...noTab,tab:{id:404},frameId:0},()=>{}),error=>error.code==='MESSAGE_SOURCE_UNAUTHENTICATED');
  assert.equal(calls,1);
  const invalid=fixture({map:direction=>direction==='enroll'?{ok:true}:{ok:true,value:null}});
  invalid.chrome.runtime.onMessage.addListener(()=>assert.fail('Invalid source must not reach the extension listener.'));
  assert.throws(()=>invalid.nativeRuntime.onMessage.emit('invalid',{tab:{id:404}},()=>{}),/classification is invalid/);
});
test('document enrollment fails closed before installing added APIs while a worker with no document keeps its existing path',()=>{
  for(const contextIsolated of [true,false]){
    assert.throws(()=>fixture({contextIsolated,map:()=>({ok:false,error:{message:'Previous enrollment'}})}),/Previous enrollment/);
    const worker=fixture({contextIsolated,hasDocument:false,map:()=>assert.fail('A worker is not a native frame enrollment.')});
    assert.equal(typeof worker.chrome.tabs.create,'function');assert.equal(worker.mappings.length,0);
  }
});
test('native Port semantics retain functions and listener identities while translating sender tab IDs',()=>{
  const f=fixture(),port=f.chrome.tabs.connect(10,{name:'port'});assert.equal(port.sender.tab.id,10);assert.equal(f.nativeCalls[0][1],110);
  let received;const listener=(message,value)=>{received=[message,value];};port.onMessage.addListener(listener);assert.equal(port.onMessage.hasListener(listener),true);
  f.nativePort.onMessage.emit('hello',f.nativePort);assert.equal(received[0],'hello');assert.equal(received[1],port);
  port.onMessage.removeListener(listener);assert.equal(port.onMessage.hasListener(listener),false);port.postMessage('reply');port.disconnect();assert.deepEqual(f.nativeCalls.slice(1),[['port.postMessage','reply'],['port.disconnect']]);
});
test('host event subscriptions are registered before addListener returns and preserve remove/has semantics',async()=>{
  const f=fixture();let count=0;const listener=()=>count++;
  f.chrome.tabs.onCreated.addListener(listener);f.chrome.tabs.onCreated.addListener(listener);
  assert.equal(f.chrome.tabs.onCreated.hasListener(listener),true);assert.deepEqual(f.subscriptions,[['add','tabs.onCreated']]);
  f.ipcRenderer.emit('noxviola-extension:event',{},'tabs.onCreated',{id:10});assert.equal(count,1);
  f.chrome.tabs.onCreated.removeListener(listener);assert.equal(f.chrome.tabs.onCreated.hasListeners(),false);
  f.ipcRenderer.emit('noxviola-extension:event',{},'tabs.onCreated',{id:11});assert.equal(count,1);
  assert.deepEqual(f.subscriptions,[['add','tabs.onCreated'],['remove','tabs.onCreated']]);assert.equal(f.calls.length,0);
});
test('context menu onclick stays in the extension world while host receives only serializable properties',async()=>{
  const f=fixture();let clicked;
  assert.equal(f.chrome.contextMenus.create({id:'save',title:'Save',onclick:(info,tab)=>{clicked=[info,tab];}}),'save');
  const call=f.calls.find(call=>call[1]==='contextMenus.create');assert.equal(typeof call[2][0].onclick,'undefined');
  f.ipcRenderer.emit('noxviola-extension:event',{},'contextMenus.onClicked',{menuItemId:'save'},{id:10});assert.equal(clicked[1].id,10);
  await Promise.resolve();assert.equal(f.errors.length,0);
  await f.chrome.contextMenus.remove('save');
  clicked=null;f.ipcRenderer.emit('noxviola-extension:event',{},'contextMenus.onClicked',{menuItemId:'save'},{id:10});assert.equal(clicked,null);
});
test('pinned Mozilla distribution remains byte-exact and supplies Promise APIs rather than a chrome alias',async()=>{
  const block=source.split('/* BEGIN VENDORED WEBEXTENSION-POLYFILL 0.12.0 */\n')[1].split('\n/* END VENDORED WEBEXTENSION-POLYFILL 0.12.0 */')[0];
  assert.equal(createHash('sha256').update(block).digest('hex'),'cfc53c3525587467c783ef1c6fdefbaf1d60ed197ea2fe0d45899b18069cf496');
  const f=fixture({invoke:async method=>method==='tabs.query'?{ok:true,value:[{id:10}]}:{ok:false,error:{message:'Real host denial'}}});
  assert.notEqual(f.browser,f.chrome);assert.equal((await f.browser.tabs.query({}))[0].id,10);
  await assert.rejects(f.browser.windows.create({}),/Real host denial/);
  assert.equal(await f.browser.tabs.sendMessage(10,{test:true}),'native reply');
  let response;f.browser.runtime.onMessage.addListener(async()=>({answer:42}));
  assert.deepEqual(f.nativeRuntime.onMessage.emit('hello',{tab:{id:110}},value=>{response=value;}),[true]);
  await Promise.resolve();await Promise.resolve();assert.equal(response.answer,42);
});
test('MV2 injection resolves omitted tab IDs in the same identity and retains native callbacks',async()=>{
  const f=fixture({invoke:async(method,args)=>{assert.equal(method,'tabs.query');assert.equal(args[0].active,true);return {ok:true,value:[{id:10}]};}});
  const result=await f.browser.tabs.executeScript({code:'1+1'});assert.equal(result[0],'actual native result');
  assert.equal(f.nativeCalls[0][1],110);
  await new Promise(resolve=>f.chrome.tabs.executeScript({code:'2+2'},value=>{assert.equal(value[0],'actual native result');resolve();}));
  await assert.rejects(f.browser.tabs.executeScript(11,{code:'3+3'}),/No native context/);assert.equal(f.nativeCalls.length,2);
});
test('subscription failure throws before local success and generated menu IDs are unique across contexts',()=>{
  const denied=fixture({subscribe:()=>({ok:false,error:{message:'No accepted permission'}})}),listener=()=>{};
  assert.throws(()=>denied.chrome.bookmarks.onCreated.addListener(listener),/No accepted permission/);assert.equal(denied.chrome.bookmarks.onCreated.hasListener(listener),false);
  const a=fixture(),b=fixture();assert.notEqual(a.chrome.contextMenus.create({title:'A'}),b.chrome.contextMenus.create({title:'B'}));
});
test('setIcon serializes real ImageData getters and stable byte snapshots while retaining path maps and document bases',async()=>{
  for(const contextIsolated of [true,false]){
    const f=fixture({contextIsolated,address:'chrome-extension://'+EXT+'/background/index.html'});
    f.main.document={baseURI:'chrome-extension://'+EXT+'/ui/popup.html'};
    const value=vm.runInContext('(()=>{const pixels=new Uint8ClampedArray([10,20,30,128]);return {pixels,image:Object.create({get width(){return 1},get height(){return 1},get data(){return pixels},get colorSpace(){return "srgb"}})};})()',f.main);
    const pending=f.browser.browserAction.setIcon({tabId:10,imageData:{16:value.image},path:{16:'https://unused.example/icon.png'}});
    value.pixels[0]=99;await pending;
    const sent=f.calls.at(-1);assert.equal(sent[1],'browserAction.setIcon');assert.equal(sent[2][0].tabId,10);
    assert.equal(sent[2][0].imageData[16].width,1);assert.deepEqual([...sent[2][0].imageData[16].data],[10,20,30,128]);
    await f.browser.action.setIcon({path:{19:'../icons/dr_active_19.png',38:'/icons/dr_active_38.png'}});
    assert.deepEqual(JSON.parse(JSON.stringify(f.calls.at(-1)[2][0].path)),{19:'chrome-extension://'+EXT+'/icons/dr_active_19.png',38:'chrome-extension://'+EXT+'/icons/dr_active_38.png'});
    await f.browser.action.setIcon({imageData:{},path:{}});assert.deepEqual(JSON.parse(JSON.stringify(f.calls.at(-1)[2])),[{imageData:{},path:{}}]);
    const before=f.calls.length;
    await assert.rejects(f.browser.action.setIcon({imageData:{width:1,height:1,data:[1,2,3,4],colorSpace:'display-p3'}}),/8-bit sRGB/);
    assert.equal(f.calls.length,before);
  }
});
