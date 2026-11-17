'use strict';
// Production chrome with only the preload boundary replaced; native Menu
// construction and pointer routing are covered by the desktop acceptance test.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../browser/index.html'),'utf8'),source=fs.readFileSync(path.join(__dirname,'../browser/renderer.js'),'utf8');
const events=['onState','onVault','onVaultDraft','onAccounts','onExtensions','onExtensionPreview','onDownloads','onPermissions','onCapabilities','onNotice','onAddress','onFind','onHistory','onBookmarks','onFollows','onWorkspaces','onResources','onSettingsPreview','onFindResult','onExtensionActions'];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(t){
 const state={profiles:[{id:'personal',name:'Personal'}],preferences:{searchEngine:'duckduckgo',tabLayout:'horizontal'},activeId:'one',currentIdentity:'personal',activeWorkspaceId:'default',tabs:[{id:'one',identity:'personal',url:'https://one.test/',title:'One'},{id:'two',identity:'personal',url:'https://two.test/',title:'Two'}],panel:null,engine:{}};
 const calls=[],errors=[],virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>errors.push(error.message));const dom=new JSDOM(html,{url:'https://noxviola.invalid/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole}),win=dom.window;
 win.addEventListener('error',event=>{errors.push(event.error?.message||event.message);event.preventDefault();});win.browser={command:async(name,value)=>{calls.push({name,value});if(name==='state')return state;}};for(const event of events)win.browser[event]=()=>()=>{};
 win.eval(source);await tick();t.after(()=>{win.close();assert.deepEqual(errors,[]);});return {win,doc:win.document,calls,state};
}
test('tabs retain a close control and open actions on right-click without selecting another tab',async t=>{
 const h=await setup(t),tab=h.doc.querySelector('[data-tab-id="two"]'),select=tab.querySelector('[role="tab"]');
 assert.equal(tab.querySelectorAll('button').length,2);assert.equal(tab.querySelector('.tab-menu'),null);assert.equal(select.getAttribute('aria-haspopup'),'menu');assert.equal(tab.querySelector('.tab-close').getAttribute('aria-label'),'Close Two');
 const event=new h.win.MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,clientX:88,clientY:19});tab.dispatchEvent(event);await tick();assert.equal(event.defaultPrevented,true);
 const call=h.calls.find(item=>item.name==='tab-menu');assert.deepEqual(JSON.parse(JSON.stringify(call.value)),{id:'two',position:{x:88,y:19}});assert.equal(h.calls.some(item=>item.name==='activate'),false);
 tab.querySelector('.tab-close').click();await tick();assert.equal(h.calls.find(item=>item.name==='close').value,'two');
});
test('Shift+F10 and the context-menu key open the selected tab menu at the tab',async t=>{
 const h=await setup(t),tab=h.doc.querySelector('[data-tab-id="one"]'),select=tab.querySelector('[role="tab"]');tab.getBoundingClientRect=()=>({left:72,bottom:36});
 assert.equal(select.getAttribute('aria-keyshortcuts'),'Shift+F10');
 for(const spec of [{key:'F10',shiftKey:true},{key:'ContextMenu'}]){const event=new h.win.KeyboardEvent('keydown',{...spec,bubbles:true,cancelable:true});select.dispatchEvent(event);assert.equal(event.defaultPrevented,true);}
 await tick();const calls=h.calls.filter(item=>item.name==='tab-menu');assert.equal(calls.length,2);for(const call of calls)assert.deepEqual(JSON.parse(JSON.stringify(call.value)),{id:'one',position:{x:72,y:36}});
});
