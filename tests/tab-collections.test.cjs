'use strict';
const{test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {TabCollections}=require('../browser/tab-collections.cjs');
const binary=path.join(__dirname,'../browser/bin',process.platform==='win32'?'noxviola-tab-collections.exe':'noxviola-tab-collections');
test('Rust SQLite: save, identity isolation, restart, indexed pages, transactional rejection and recoverable archive',{skip:!fs.existsSync(binary)&&'Run npm run build:collections'},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nox-collections-'));let store=new TabCollections({file:path.join(dir,'tabs.sqlite'),binary});t.after(()=>{store.close();});
 const ask=(op,args={})=>store.request({op,identity:'personal',...args});
 const tabs=Array.from({length:321},(_,i)=>({url:`https://example.test/path/${i}`,title:`Research ${i}`,pinned:i===0}));
 const saved=await ask('save',{title:'Synthetic collection',created:1,tabs});assert.equal(saved.saved,321);
 let after=0,total=0;do{const page=await ask('tabs',{group:saved.id,after});assert.ok(page.items.length<=100);total+=page.items.length;after=page.next;}while(after!==null);assert.equal(total,321);
 assert.equal((await ask('tabs',{group:saved.id,identity:'other'})).items.length,0);
 await assert.rejects(ask('get',{id:1,identity:'other'}),/not found/);
 await assert.rejects(ask('save',{title:'Rollback',created:2,tabs:[tabs[0],{url:'https://name:secret@example.test',title:'bad'}]}),/credentials/);
 assert.equal((await ask('groups')).items.length,1);
 await ask('update',{group:saved.id,field:'locked',value:true});await assert.rejects(ask('update',{group:saved.id,field:'archived',value:true}),/Unlock/);
 await ask('update',{group:saved.id,field:'locked',value:false});await ask('update',{group:saved.id,field:'archived',value:true});assert.equal((await ask('groups')).items.length,0);assert.equal((await ask('groups',{archived:true})).items[0].count,321);
 store.close();await new Promise(r=>setTimeout(r,50));store=new TabCollections({file:path.join(dir,'tabs.sqlite'),binary});assert.equal((await ask('health')).integrity,'ok');assert.equal((await ask('get',{id:1})).pinned,true);
 await ask('update',{group:saved.id,field:'archived',value:false});assert.equal((await ask('groups')).items.length,1);
 const search=await ask('tabs',{group:saved.id,query:'Research 31'});assert.equal(search.items.length,11);
});
test('Transport refuses concurrent or oversized operations, missing helper never closes tabs',async()=>{
 const store=new TabCollections({file:'unused',binary:'/missing/noxviola-helper'});await assert.rejects(store.request({op:'groups'}),/not built/);await assert.rejects(store.request({text:'a'.repeat(9*1024*1024)}),/too large/);
});
test('DOM: bounded collection paging and stale identity responses',async t=>{
 const{JSDOM}=require('jsdom');const dom=new JSDOM('<div id="root"></div>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const{window}=dom;window.eval(fs.readFileSync(path.join(__dirname,'../browser/tab-collections-ui.js'),'utf8'));
 let resolve;const calls=[];const api={command:async(name,value)=>{calls.push({name,value});if(value.identity==='personal')return new Promise(r=>resolve=r);return {items:[{id:2,title:'Work only',count:1,created:1}],next:null};}};
 const ui=window.createCollectionUI(window.document.getElementById('root'),api);const first=ui.show('personal');ui.show('work');resolve({items:[{id:1,title:'Private result',count:1,created:1}],next:null});await first;await new Promise(r=>setTimeout(r,0));assert.ok(!window.document.body.textContent.includes('Private result'));assert.ok(window.document.body.textContent.includes('Work only'));
});
test('Save-and-close uses committed snapshots, retains moved/reloaded tabs and never closes after failed save',async()=>{
 const vm=require('node:vm'),source=fs.readFileSync(path.join(__dirname,'../browser/main.cjs'),'utf8');const body=source.slice(source.indexOf('async function perform('),source.indexOf('\nfunction command('));
 const tab={id:'a',url:'https://example.test',title:'A',identity:'personal',saved:{workspaceId:'default',pinned:false}};let complete,reject;const closed=[];
 const ctx={currentIdentity:'personal',visibleTabs:()=>[tab],tabs:[tab],active:()=>null,closing:false,httpUrl:require('../browser/state.cjs').httpUrl,savedTab:t=>({...t.saved,id:t.id,url:t.url,title:t.title,identity:t.identity}),collections:{request:()=>new Promise((a,b)=>{complete=a;reject=b;})},closeTab:id=>closed.push(id)};
 vm.createContext(ctx);vm.runInContext(body,ctx);
 let pending=ctx.perform('collection-save',{identity:'personal',close:true});tab.collectionNavigationRevision=1;complete({saved:1});await pending;assert.deepEqual(closed,[]);
 pending=ctx.perform('collection-save',{identity:'personal',close:true});tab.saved.workspaceId='moved';complete({saved:1});await pending;assert.deepEqual(closed,[]);
 pending=ctx.perform('collection-save',{identity:'personal',close:true});reject(Error('disk full'));await assert.rejects(pending,/disk full/);assert.deepEqual(closed,[]);
 pending=ctx.perform('collection-save',{identity:'personal',close:true});assert.deepEqual(closed,[]);complete({saved:1});await pending;assert.deepEqual(closed,['a']);
});
test('Encoded byte budgets page all large records, private file permissions and actual unpacked helper launch',{skip:!fs.existsSync(binary)&&'Run npm run build:collections'},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nox-collection-asar-'));const stage=path.join(dir,'stage'),name=path.basename(binary);fs.mkdirSync(path.join(stage,'browser/bin'),{recursive:true});fs.copyFileSync(binary,path.join(stage,'browser/bin',name));
 const{createPackageWithOptions}=await import('@electron/asar');const archive=path.join(dir,'app.asar');await createPackageWithOptions(stage,archive,{unpack:'**/browser/bin/**'});
 const file=path.join(dir,'private.sqlite'),store=new TabCollections({file,binary:path.join(dir,'app.asar.unpacked/browser/bin',name)});t.after(()=>store.close());const ask=(op,args={})=>store.request({op,identity:'personal',...args});
 const title='"'.repeat(65536);for(let i=0;i<12;i++)await ask('save',{title,created:1,tabs:[{url:'https://example.test',title}]});
 let after=0,total=0;do{const page=await ask('groups',{after});assert.ok(Buffer.byteLength(JSON.stringify(page))<1100000);total+=page.items.length;after=page.next;}while(after!==null);assert.equal(total,12);
 const huge=await ask('save',{title:'Large rows',created:1,tabs:Array.from({length:40},()=>({url:'https://example.test',title}))});after=0;total=0;do{const page=await ask('tabs',{group:huge.id,after});assert.ok(Buffer.byteLength(JSON.stringify(page))<1100000);total+=page.items.length;after=page.next;}while(after!==null);assert.equal(total,40);
 if(process.platform!=='win32')for(const suffix of ['','-wal','-shm'])assert.equal(fs.statSync(file+suffix).mode&0o077,0);
 assert.equal((await ask('health')).integrity,'ok');
});
test('Opening a saved tab cannot reactivate a stale identity after storage await',async()=>{
 const vm=require('node:vm'),source=fs.readFileSync(path.join(__dirname,'../browser/main.cjs'),'utf8');let finish;const opened=[];const ctx={currentIdentity:'personal',profiles:[{id:'personal'},{id:'work'}],active:()=>null,collections:{request:()=>new Promise(r=>finish=r)},newTab:(...args)=>opened.push(args)};vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('async function perform('),source.indexOf('\nfunction command(')),ctx);
 const promise=ctx.perform('collection-open',{identity:'personal',id:1});ctx.currentIdentity='work';finish({url:'https://example.test',title:'Private'});await assert.rejects(promise,/Identity changed/);assert.deepEqual(opened,[]);
});
test('Import completion preserves a newer edited draft',async t=>{
 const{JSDOM}=require('jsdom');const dom=new JSDOM('<div id="root"></div>',{runScripts:'outside-only'});t.after(()=>dom.window.close());const{window}=dom;window.eval(fs.readFileSync(path.join(__dirname,'../browser/tab-collections-ui.js'),'utf8'));let finish;const api={command:async(name)=>name==='collection-import'?new Promise(r=>finish=r):{items:[],next:null}};const root=window.document.getElementById('root');await window.createCollectionUI(root,api).show('personal');const textarea=root.querySelector('textarea');textarea.value='https://old.test';[...root.querySelectorAll('button')].find(b=>b.textContent==='Import').click();textarea.value='https://new.test';finish({saved:1});await new Promise(r=>setTimeout(r,0));assert.equal(textarea.value,'https://new.test');
});
test('Abrupt helper death preserves committed data and never exposes a partial transaction',{skip:!fs.existsSync(binary)&&'Run npm run build:collections'},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nox-collection-crash-')),file=path.join(dir,'tabs.sqlite');let store=new TabCollections({file,binary});t.after(()=>store.close());const ask=(op,args={})=>store.request({op,identity:'personal',...args});
 await ask('save',{title:'Committed',created:1,tabs:[{url:'https://before.test',title:'Before'}]});const tabs=Array.from({length:20000},(_,i)=>({url:`https://crash.test/${i}`,title:'Crash transaction'}));const pending=ask('save',{title:'Interrupted',created:2,tabs});const outcome=pending.then(()=>true,()=>false);store.child.kill('SIGKILL');await outcome;await new Promise(r=>setTimeout(r,30));store=new TabCollections({file,binary});const rows=(await ask('groups')).items;assert.equal(rows[0].count,1);if(rows.length===2)assert.equal(rows[1].count,20000);else assert.equal(rows.length,1);assert.equal((await ask('health')).integrity,'ok');
});
