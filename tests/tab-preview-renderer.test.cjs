'use strict';
// Production renderer with its IPC boundary replaced; no real Electron GUI.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM, VirtualConsole} = require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../browser/index.html'),'utf8');
const source=fs.readFileSync(path.join(__dirname,'../browser/renderer.js'),'utf8');
const methods=['onState','onVault','onVaultDraft','onAccounts','onExtensions','onExtensionPreview','onDownloads','onPermissions','onCapabilities','onNotice','onAddress','onFind','onHistory','onBookmarks','onFollows','onWorkspaces','onResources','onSettingsPreview','onFindResult','onExtensionActions'];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(t, orientation='horizontal') {
  const state={version:1,profiles:[{id:'personal',name:'Personal'}],preferences:{searchEngine:'google',tabLayout:orientation},activeId:'a',currentIdentity:'personal',activeWorkspaceId:'default',panel:null,closing:false,saveError:'',tabs:[{id:'a',identity:'personal',url:'https://example.test/',title:'Example',workspaceId:'default',live:true}],engine:{}};
  const calls=[],listeners=new Map(),errors=[],virtualConsole=new VirtualConsole();
  virtualConsole.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM(html,{url:'https://noxviola.invalid/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
  const {window}=dom, nativeSet=window.setTimeout.bind(window), nativeClear=window.clearTimeout.bind(window),timers=new Map();
  let nextTimer=100000;
  window.setTimeout=(callback,delay,...args)=>{if(delay!==650)return nativeSet(callback,delay,...args);const id=nextTimer++;timers.set(id,()=>callback(...args));return id;};
  window.clearTimeout=id=>{if(timers.has(id))timers.delete(id);else nativeClear(id);};
  window.addEventListener('error',event=>{errors.push(event.error?.message||event.message);event.preventDefault();});
  window.browser={command:async(name,value)=>{calls.push({name,value});if(name==='state')return state;}};
  for(const method of methods)window.browser[method]=callback=>{listeners.set(method,callback);return()=>listeners.delete(method);};
  window.eval(fs.readFileSync(path.join(__dirname,'../browser/tab-collections-ui.js'),'utf8')); window.eval(source);await tick();
  t.after(()=>{window.close();assert.deepEqual(errors,[]);});
  const tab=window.document.querySelector('[data-tab-id="a"]');
  tab.getBoundingClientRect=()=>({x:30,y:12,width:120,height:32});
  return {window,tab,calls,timers,listeners,state,fireTimer(){assert.equal(timers.size,1);const [id,callback]=timers.entries().next().value;timers.delete(id);callback();}};
}

test('pointer hover waits 650 ms and dismissal sends a close request',async t=>{
  const h=await setup(t);h.tab.dispatchEvent(new h.window.MouseEvent('pointerover',{bubbles:true}));
  assert.equal(h.timers.size,1);assert.equal(h.calls.filter(call=>call.name==='tab-preview').length,0);
  h.fireTimer();await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.find(call=>call.name==='tab-preview').value)),{open:true,id:'a',position:{x:30,y:12,width:120,height:32,orientation:'horizontal'}});
  h.tab.dispatchEvent(new h.window.MouseEvent('pointerout',{bubbles:true}));await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.filter(call=>call.name==='tab-preview').at(-1).value)),{open:false});
});

test('keyboard focus also schedules a preview and layout/workspace changes dismiss it',async t=>{
  const h=await setup(t,'vertical'),button=h.tab.querySelector('[role="tab"]');
  button.dispatchEvent(new h.window.FocusEvent('focusin',{bubbles:true}));assert.equal(h.timers.size,1);h.fireTimer();await tick();
  assert.equal(h.calls.find(call=>call.name==='tab-preview').value.position.orientation,'vertical');
  h.listeners.get('onState')({...h.state,activeWorkspaceId:'other'});await tick();
  assert.equal(h.calls.filter(call=>call.name==='tab-preview').at(-1).value.open,false);
});

test('scroll and drag cancel a pending preview without opening it',async t=>{
  for(const eventName of ['scroll','dragstart']) {
    const h=await setup(t);h.tab.dispatchEvent(new h.window.MouseEvent('pointerover',{bubbles:true}));assert.equal(h.timers.size,1);
    h.tab.dispatchEvent(new h.window.Event(eventName,{bubbles:true}));assert.equal(h.timers.size,0);
    assert.equal(h.calls.filter(call=>call.name==='tab-preview').length,0);
  }
});
