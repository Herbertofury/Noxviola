'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {manifestPanels,panelResource,panelURL,createSidebarExtensionPanel}=require('../browser/sidebar-extension-panel.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const ids={personal:'a'.repeat(32),work:'b'.repeat(32)};
function fixture({verify=async()=>Buffer.from('<p>Panel</p>')}={}) {
  const views=[],events=[],external=[],sessions={personal:{identity:'personal'},work:{identity:'work'}},observers=new Set();
  const contexts=new Map(Object.entries(sessions).map(([identity,session])=>[identity,{id:'owned-extension',identity,session,runtimeId:ids[identity],epoch:'epoch-'+identity,
    name:'Synthetic sidebar',apiProfile:'chromium',permissions:{required:['sidePanel','storage']},manifest:{name:'Synthetic sidebar',side_panel:{default_path:'panel/index.html'},sidebar_action:{default_panel:'firefox.html',default_title:'Firefox sidebar'}}}]));
  const manager={
    runtimeContexts:identity=>[...contexts.values()].filter(context=>!identity||context.identity===identity),
    runtimeContext:(session,runtimeId)=>[...contexts.values()].find(context=>context.session===session&&context.runtimeId===runtimeId)||null,
    readRuntimeResource:async(context,resource)=>{events.push(['verify',context.identity,resource]);return verify(context,resource);},
    subscribeRuntime:fn=>{observers.add(fn);return()=>observers.delete(fn);},
  };
  class View {
    constructor(options) {
      this.options=options;const wc=this.webContents=new EventEmitter();wc.id=100+views.length;wc.session=options.webPreferences.session;wc.destroyed=false;
      wc.isDestroyed=()=>wc.destroyed;wc.loadURL=async url=>{wc.url=url;events.push(['load',wc.session.identity,url]);};wc.close=()=>{wc.destroyed=true;wc.emit('destroyed');};
      wc.setWindowOpenHandler=fn=>{wc.popup=fn;};wc.focus=()=>assert.fail('Opening extension panels must not steal focus');views.push(this);
    }
    setBackgroundColor(){} setVisible(value){this.visible=value;}setBounds(value){this.bounds=value;}
  }
  const win={isDestroyed:()=>false,getContentSize:()=>[800,600],contentView:{addChildView:()=>{},removeChildView:()=>{}}};
  const host=createSidebarExtensionPanel({WebContentsView:View,getWindow:()=>win,manager,onExternalOpen:value=>external.push(value)});
  const revoke=identity=>{contexts.delete(identity);for(const fn of observers)fn({kind:'revoked',id:'owned-extension',identity,runtimeId:ids[identity]});};
  return {host,manager,contexts,views,events,external,revoke,observers};
}

test('declarative Firefox and Chromium pages retain distinct semantics and permission requirements',()=>{
  const panels=manifestPanels({name:'Both ecosystems',sidebar_action:{default_panel:'sidebar/panel.html?mode=firefox',default_title:'Firefox',default_icon:{16:'icons/16.png'}},side_panel:{default_path:'chrome.html'}});
  assert.equal(panels.length,2);assert.equal(panels[0].kind,'sidebar_action');assert.equal(panels[0].permission,null);assert.deepEqual(panels[0].resources,['sidebar/panel.html','icons/16.png']);
  assert.equal(panels[1].kind,'side_panel');assert.equal(panels[1].permission,'sidePanel');
  assert.deepEqual(manifestPanels({side_panel:{}}),[],'An API-selected page is not invented');
  assert.throws(()=>manifestPanels({sidebar_action:{}}),/packaged/);assert.throws(()=>manifestPanels({sidebar_action:[]}),/object/);
  assert.equal(panelURL(ids.personal,'/sidebar/index.html?q=1#part'),'chrome-extension://'+ids.personal+'/sidebar/index.html?q=1#part');
  assert.equal(panelResource('panel/hello%20world.html'),'panel/hello world.html');
});

test('sidebar paths reject foreign schemes, Windows paths and normalization ambiguity',()=>{
  for(const path of ['https://example.test/panel','//foreign/panel','javascript:alert(1)','file:///C:/secret','../secret','/a/../secret','a/%2e%2e/secret','a/%252e%252e/secret','a\\secret','a/%5csecret','C:/secret','a//secret','a/%00secret',' panel.html'])assert.throws(()=>panelResource(path),{code:'SIDEBAR_PANEL_PATH'},path);
  assert.throws(()=>panelURL('fake','panel.html'),{code:'SIDEBAR_EXTENSION_ID'});
});

test('real native panel view is lazy, sandboxed and bound to its enrolled extension identity',async()=>{
  const f=fixture();assert.equal(f.views.length,0);assert.equal(f.events.length,0);assert.equal(f.host.list('personal').length,2);
  f.host.layout({x:500,y:80,width:500,height:800});await f.host.open({id:'owned-extension',identity:'personal'});
  assert.deepEqual(f.events,[['verify','personal','panel/index.html'],['load','personal','chrome-extension://'+ids.personal+'/panel/index.html']]);
  const view=f.views[0],wc=view.webContents;assert.equal(view.options.webPreferences.session,f.contexts.get('personal').session);assert.equal(view.options.webPreferences.nodeIntegration,false);assert.equal(view.options.webPreferences.sandbox,true);assert.equal(view.options.webPreferences.contextIsolation,true);assert.equal(view.options.webPreferences.webSecurity,true);
  assert.deepEqual(view.bounds,{x:500,y:80,width:300,height:520});assert.equal(view.visible,true);assert.equal(f.host.ownerFor(wc.id).epoch,'epoch-personal');
  assert.equal(f.host.ownerFor(wc.id).contents,wc);assert.equal(f.host.state().loading,false);
  f.host.hide();assert.equal(view.visible,false);await f.host.open({id:'owned-extension',identity:'personal'});assert.equal(f.views.length,1);assert.equal(f.events.filter(value=>value[0]==='load').length,1);
  await f.host.reload();assert.equal(f.events.filter(value=>value[0]==='verify').length,2);assert.equal(f.events.filter(value=>value[0]==='load').length,2);
  f.host.destroy();assert.equal(wc.destroyed,true);assert.equal(f.observers.size,0);await assert.rejects(f.host.open({id:'owned-extension',identity:'personal'}),{code:'SIDEBAR_CLOSED'});
});

test('identities, ecosystems and revocation own separate extension view lifecycles',async()=>{
  const f=fixture();f.host.layout({x:0,y:0,width:300,height:400});await f.host.open({id:'owned-extension',identity:'personal'});const personal=f.views[0];
  await f.host.open({id:'owned-extension',identity:'work'});const work=f.views[1];assert.equal(personal.visible,false);assert.equal(work.visible,true);assert.notEqual(personal.webContents.session,work.webContents.session);
  await f.host.open({id:'owned-extension',identity:'personal',kind:'sidebar_action'});assert.equal(f.views.length,3);assert.equal(f.host.state().title,'Firefox sidebar');assert.equal(f.host.state().kind,'sidebar_action');
  f.revoke('work');assert.equal(work.webContents.destroyed,true);assert.equal(personal.webContents.destroyed,false);assert.equal(f.host.ownerFor(work.webContents.id),null);
  f.revoke('personal');assert.equal(personal.webContents.destroyed,true);assert.equal(f.views[2].webContents.destroyed,true);assert.equal(f.host.state().loadedPanels,0);assert.equal(f.host.state().visible,false);
});

test('undeclared, disabled, ungranted and foreign enrollment pages never become extension views',async()=>{
  const f=fixture();await assert.rejects(f.host.open({id:'other-extension',identity:'personal'}),{code:'EXTENSION_REVOKED'});await assert.rejects(f.host.open({id:'owned-extension',identity:'unknown'}),{code:'EXTENSION_REVOKED'});
  f.contexts.get('personal').permissions.required=[];assert.equal(f.host.list('personal').length,1);await assert.rejects(f.host.open({id:'owned-extension',identity:'personal',kind:'side_panel'}),{code:'SIDEBAR_PANEL_MISSING'});
  await f.host.open({id:'owned-extension',identity:'personal',kind:'sidebar_action'});assert.equal(f.views.length,1);
  await assert.rejects(f.host.open({id:'owned-extension',identity:'personal',kind:'popup'}),{code:'SIDEBAR_PANEL_MISSING'});assert.equal(f.views.length,1);
});

test('a revoked or hidden asynchronous verification cannot start native extension code',async()=>{
  let finish;const f=fixture({verify:()=>new Promise(resolve=>{finish=resolve;})});
  const opening=f.host.open({id:'owned-extension',identity:'personal'});await tick();f.revoke('personal');finish();await assert.rejects(opening,{code:'EXTENSION_REVOKED'});assert.equal(f.views.length,0);assert.equal(f.events.some(value=>value[0]==='load'),false);
  let done;const g=fixture({verify:()=>new Promise(resolve=>{done=resolve;})});const hidden=g.host.open({id:'owned-extension',identity:'personal'});await tick();g.host.hide();done();await hidden;assert.equal(g.views.length,0);
  const reopened=g.host.open({id:'owned-extension',identity:'personal'});await tick();done();await reopened;assert.equal(g.views.length,1);
});

test('concurrent selection creates one view and does not resurrect an old runtime epoch',async()=>{
  let finish;const f=fixture({verify:()=>new Promise(resolve=>{finish=resolve;})});const a=f.host.open({id:'owned-extension',identity:'personal'}),b=f.host.open({id:'owned-extension',identity:'personal'});await tick();assert.equal(f.events.filter(value=>value[0]==='verify').length,1);finish();await Promise.all([a,b]);assert.equal(f.views.length,1);
  const old=f.views[0];f.contexts.set('personal',{...f.contexts.get('personal'),epoch:'new-epoch'});const c=f.host.open({id:'owned-extension',identity:'personal'});await tick();finish();await c;assert.equal(old.webContents.destroyed,true);assert.equal(f.host.ownerFor(f.views[1].webContents.id).epoch,'new-epoch');
});

test('navigation cannot inherit panel privileges across origins and external URLs are handed to the browser',async()=>{
  const f=fixture();await f.host.open({id:'owned-extension',identity:'personal'});const wc=f.views[0].webContents;
  for(const name of ['will-navigate','will-redirect'])for(const url of ['file:///secret','https://example.test/','chrome-extension://'+ids.work+'/panel.html']){let prevented=false;wc.emit(name,{preventDefault:()=>{prevented=true;}},url);assert.equal(prevented,true);}
  let prevented=false;wc.emit('will-navigate',{preventDefault:()=>{prevented=true;}},'chrome-extension://'+ids.personal+'/second.html');assert.equal(prevented,false);
  assert.equal(f.external.length,2);assert.equal(f.external[0].context.identity,'personal');assert.deepEqual(wc.popup({url:'https://example.test/other'}),{action:'deny'});assert.equal(f.external.length,3);
  assert.deepEqual(wc.popup({url:'javascript:alert(1)'}),{action:'deny'});assert.equal(f.external.length,3);
  wc.emit('did-navigate',{},'https://unexpected.test/');assert.equal(wc.destroyed,true);assert.equal(f.host.state().visible,false);assert.equal(f.host.ownerFor(wc.id),null);
});

test('verification failure stays visible and retryable without executing an unverified page',async()=>{
  let bad=true;const f=fixture({verify:async()=>{if(bad)throw Error('private filesystem detail');return Buffer.from('verified');}});
  await assert.rejects(f.host.open({id:'owned-extension',identity:'personal'}),/private filesystem detail/);assert.equal(f.views.length,0);assert.match(f.host.state().error,/verified/);assert.doesNotMatch(f.host.state().error,/private/);
  bad=false;await f.host.reload();assert.equal(f.views.length,1);assert.equal(f.host.state().error,'');
});
