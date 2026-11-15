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
function fixture({address='chrome-extension://'+EXT+'/popup.html',contextIsolated=true,invoke=async()=>({ok:true,value:undefined}),subscribe=()=>({ok:true})}={}) {
  const calls=[], mappings=[], subscriptions=[], nativeCalls=[], errors=[], contextBridgeCalls=[];
  const ipcRenderer=Object.assign(new EventEmitter(),{invoke:async(method,...args)=>{calls.push([method,...args]);return invoke(...args);},sendSync:(channel,direction,id)=>{
    if(channel==='noxviola-extension:subscription'){subscriptions.push([direction,id]);return subscribe(direction,id);}
    mappings.push([direction,id]);return id===11?{ok:false,error:{message:'No native context'}}:{ok:true,value:direction==='nativeId'?id+100:id-100};
  }});
  const nativeRuntime={id:EXT,getManifest:()=>({permissions:['tabs','contextMenus']}),onMessage:nativeEvent(),onConnect:nativeEvent(),getURL:value=>'chrome-extension://'+EXT+'/'+value};
  const nativePort={name:'real-port',sender:{tab:{id:110,url:'https://allowed.test/'}},postMessage:value=>nativeCalls.push(['port.postMessage',value]),disconnect:()=>nativeCalls.push(['port.disconnect']),onMessage:nativeEvent(),onDisconnect:nativeEvent()};
  const main=vm.createContext({crypto:webcrypto,chrome:{runtime:nativeRuntime,tabs:{sendMessage:(...args)=>{nativeCalls.push(['sendMessage',...args]);if(typeof args.at(-1)==='function'){args.at(-1)('native reply');return;}return Promise.resolve('native reply');},executeScript:(id,details,callback)=>{nativeCalls.push(['tabs.executeScript',id,details]);callback(['actual native result']);},connect:(...args)=>{nativeCalls.push(['connect',...args]);return nativePort;}},scripting:{executeScript:details=>{nativeCalls.push(['executeScript',details]);return Promise.resolve([{result:true}]);}}},console:{error:error=>errors.push(error.message),log(){},warn(){}}});
  let required=0;
  const contextBridge={exposeInMainWorld:(key,value)=>{assert.equal(contextIsolated,true,'Native contextBridge rejects non-isolated contexts.');contextBridgeCalls.push('expose');Object.defineProperty(main,key,{value,configurable:true});},executeInMainWorld:({func})=>{assert.equal(contextIsolated,true);contextBridgeCalls.push('execute');return vm.runInContext('('+func.toString()+')()',main);}};
  const executionContext=contextIsolated?vm.createContext({location:{href:address},console:main.console}):main;
  if(!contextIsolated)main.location={href:address};
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
  assert.deepEqual(f.nativeRuntime.onMessage.emit('message',{tab:{id:110,url:'https://allowed.test/'}},()=>{}),[true]);assert.equal(sender.tab.id,10);
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
