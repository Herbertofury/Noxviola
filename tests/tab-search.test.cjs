'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createTabSearch}=require('../browser/tab-search-host.cjs');
function fixture(){
  const calls=[],handlers=new Map(),windows=[];
  class Window extends EventEmitter{constructor(options){super();this.options=options;this.dead=false;this.webContents=new EventEmitter();this.webContents.mainFrame={};this.webContents.setWindowOpenHandler=handler=>{this.windowOpen=handler};this.webContents.isLoading=()=>false;this.webContents.send=(...v)=>calls.push(['send',...v]);windows.push(this)}isDestroyed(){return this.dead}loadFile(file){this.file=file;return Promise.resolve()}show(){calls.push(['show'])}focus(){calls.push(['focus'])}close(){this.dead=true;this.emit('closed')}}
  const ipc={handle:(name,fn)=>handlers.set(name,fn),removeHandler:name=>handlers.delete(name)},parent={isDestroyed:()=>false,getContentBounds:()=>({x:50,y:60,width:1000,height:700})};
  const data={tabs:[{id:'one',title:'One'}],closed:[{closedId:'closed-one'}],style:'detailed'};
  const search=createTabSearch({BrowserWindow:Window,screen:{getDisplayMatching:()=>({workArea:{x:0,y:0,width:1920,height:1080}})},ipcMain:ipc,root:'test',getWindow:()=>parent,getData:()=>data,selectTab:id=>calls.push(['activate',id]),closeTab:id=>calls.push(['close',id]),restoreTab:id=>calls.push(['restore',id])});
  return {search,calls,handlers,windows,data};
}
test('tab search binds actions to the exact sandboxed popup and preserves real tab actions',async()=>{
  const f=fixture();f.search.show({x:100,y:3,width:28,height:30});const w=f.windows[0],invoke=f.handlers.get('tab-search-command');
  assert.equal(w.options.webPreferences.sandbox,true);assert.equal(w.options.webPreferences.nodeIntegration,false);assert.equal(w.options.x,150);assert.equal(w.options.y,96);
  assert.deepEqual(w.windowOpen(),{action:'deny'});const event={sender:w.webContents,senderFrame:w.webContents.mainFrame};
  await assert.rejects(invoke({sender:{},senderFrame:{}},{name:'state'}),/Untrusted/);
  await assert.rejects(invoke({sender:w.webContents,senderFrame:{}},{name:'state'}),/Untrusted/);
  assert.equal(await invoke(event,{name:'state'}),f.data);
  await invoke(event,{name:'close',value:'one'});assert.ok(f.calls.some(c=>c[0]==='close'&&c[1]==='one'));assert.ok(f.calls.some(c=>c[0]==='send'));
  await invoke(event,{name:'activate',value:'one'});assert.ok(w.dead);assert.ok(f.calls.some(c=>c[0]==='activate'&&c[1]==='one'));
  await assert.rejects(invoke(event,{name:'state'}),/Untrusted/);f.search.destroy();assert.equal(f.handlers.size,0);
});
test('right placement stays inside the display and restore selects a real closed entry',async()=>{
  const f=fixture();f.search.show({x:900,y:3,width:28,height:30,align:'right'});const w=f.windows[0];assert.equal(w.options.x,50+900+28-390);
  const invoke=f.handlers.get('tab-search-command'),event={sender:w.webContents,senderFrame:w.webContents.mainFrame};
  await assert.rejects(invoke(event,{name:'restore',value:0}),/Invalid/);await invoke(event,{name:'restore',value:'closed-one'});assert.ok(f.calls.some(c=>c[0]==='restore'&&c[1]==='closed-one'));
});
