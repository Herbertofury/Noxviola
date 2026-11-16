'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createSidebarWebPanel}=require('../browser/sidebar-web-panel.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({ready=async()=>{}}={}){
 const sessions={personal:{id:'personal'},work:{id:'work'}},views=[],events=[];
 class View{
  constructor(options){this.options=options;this.visible=false;this.webContents=new EventEmitter();const wc=this.webContents;wc.session=options.webPreferences.session;wc.destroyed=false;wc.muted=false;wc.isDestroyed=()=>wc.destroyed;wc.isAudioMuted=()=>wc.muted;wc.setAudioMuted=v=>{wc.muted=v;};wc.focus=()=>{throw Error('sidebar must not steal focus');};wc.setWindowOpenHandler=fn=>{wc.popup=fn;};wc.loadURL=async url=>{events.push(['load',wc.session.id,url]);};wc.reload=()=>events.push(['reload',wc.session.id]);wc.close=()=>{wc.destroyed=true;};views.push(this);}
  setBackgroundColor(){} setVisible(v){this.visible=v;} setBounds(v){this.bounds=v;}
 }
 const win={isDestroyed:()=>false,getContentSize:()=>[800,600],contentView:{addChildView:()=>{},removeChildView:()=>{}}};
 const host=createSidebarWebPanel({WebContentsView:View,getWindow:()=>win,getSession:id=>{if(!sessions[id])throw Error('Unknown identity');return sessions[id];},identityReady:ready});
 return {host,views,events,sessions};
}
test('panels use the selected sandboxed identity session and deny unsafe navigation and popups',async()=>{
 const f=fixture();assert.throws(()=>f.host.open({identity:'personal',url:'file:///example'}),/HTTP/);assert.throws(()=>f.host.open({identity:'personal',url:'https://u:p@example.test/'}),/HTTP/);assert.throws(()=>f.host.open({identity:'unknown',url:'https://site.test/'}),/identity/i);
 f.host.layout({x:450,y:76,width:350,height:524});f.host.open({identity:'personal',url:'https://site.test/chat'});await tick();
 const v=f.views[0],wc=v.webContents;assert.equal(v.options.webPreferences.session,f.sessions.personal);assert.equal(v.options.webPreferences.nodeIntegration,false);assert.equal(v.options.webPreferences.sandbox,true);assert.equal(v.options.webPreferences.contextIsolation,true);assert.equal(v.options.webPreferences.webSecurity,true);assert.deepEqual(wc.popup({url:'https://other.test/'}),{action:'deny'});assert.equal(v.visible,true);assert.deepEqual(v.bounds,{x:450,y:76,width:350,height:524});assert.deepEqual(f.events.filter(e=>e[0]==='load'),[['load','personal','https://site.test/chat']]);
 for(const name of ['will-navigate','will-redirect']){let blocked=false;wc.emit(name,{preventDefault:()=>{blocked=true;}},'file:///example');assert.equal(blocked,true);}
 let blocked=false;wc.emit('will-navigate',{preventDefault:()=>{blocked=true;}},'https://next.test/');assert.equal(blocked,false);wc.emit('did-navigate',{},'https://next.test/');assert.equal(f.host.state().url,'https://next.test/');
 f.host.mute(true);assert.equal(wc.muted,true);f.host.reload();assert.ok(f.events.some(e=>e[0]==='reload'));f.host.destroy();assert.equal(wc.destroyed,true);assert.throws(()=>f.host.open({identity:'personal',url:'https://site.test/'}),/closed/);
});
test('hiding preserves the page, identities do not share views, and release unloads only one panel',async()=>{
 const f=fixture();f.host.layout({x:500,y:100,width:500,height:600});f.host.open({identity:'personal',url:'https://site.test/'});await tick();const personal=f.views[0];assert.deepEqual(personal.bounds,{x:500,y:100,width:300,height:500});
 f.host.hide();assert.equal(personal.visible,false);f.host.open({identity:'personal',url:'https://site.test/'});await tick();assert.equal(f.views.length,1);assert.equal(f.events.filter(e=>e[0]==='load').length,1);
 f.host.open({identity:'work',url:'https://site.test/'});await tick();const work=f.views[1];assert.notEqual(work.webContents.session,personal.webContents.session);assert.equal(personal.visible,false);assert.equal(work.visible,true);
 f.host.open({identity:'personal',url:'https://site.test/'});assert.equal(work.visible,false);assert.equal(personal.visible,true);assert.equal(f.host.release({identity:'work',url:'https://site.test/'}),true);assert.equal(work.webContents.destroyed,true);assert.equal(personal.webContents.destroyed,false);
 delete f.sessions.personal;assert.throws(()=>f.host.open({identity:'personal',url:'https://site.test/'}),/Unknown identity/);
 personal.webContents.emit('did-navigate',{},'https://site.test/other');f.host.destroy();assert.equal(personal.webContents.destroyed,true);
});
test('a hidden panel does not start a pending request and reopening starts it once',async()=>{
 let resolve;const ready=new Promise(r=>{resolve=r;}),f=fixture({ready:()=>ready});f.host.layout({x:0,y:0,width:300,height:500});f.host.open({identity:'personal',url:'https://site.test/'});f.host.hide();resolve();await tick();assert.equal(f.events.filter(e=>e[0]==='load').length,0);
 f.host.open({identity:'personal',url:'https://site.test/'});await tick();assert.equal(f.events.filter(e=>e[0]==='load').length,1);
});
test('identity initialization failures are surfaced without exposing internal details',async()=>{
 const f=fixture({ready:async()=>{throw Error('internal detail');}});f.host.open({identity:'personal',url:'https://site.test/'});await tick();assert.match(f.host.state().error,/identity/i);assert.doesNotMatch(f.host.state().error,/internal detail/);assert.equal(f.events.some(e=>e[0]==='load'),false);
});
test('back and forward traverse the real panel history only when the target is safe',async()=>{
 const f=fixture();f.host.open({identity:'personal',url:'https://site.test/'});await tick();const wc=f.views[0].webContents;
 const urls=['https://site.test/one','https://site.test/two','https://site.test/three'];let index=1;
 wc.navigationHistory={canGoBack:()=>index>0,canGoForward:()=>index<urls.length-1,getActiveIndex:()=>index,getEntryAtIndex:i=>({url:urls[i]}),goBack:()=>{index--;},goForward:()=>{index++;}};
 assert.equal(f.host.state().canGoBack,true);assert.equal(f.host.state().canGoForward,true);f.host.back();assert.equal(index,0);assert.equal(f.host.state().canGoBack,false);f.host.forward();assert.equal(index,1);
 urls[2]='file:///example';assert.equal(f.host.state().canGoForward,false);assert.throws(()=>f.host.forward(),/No later/);assert.equal(index,1);
});
