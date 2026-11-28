'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {containerMenuTemplate,marker}=require('../browser/container-menu.cjs');
test('menu keeps ordinary tab, every container, and create/manage actions',()=>{
 const profiles=[{id:'one',name:'Work & Testing'},{id:'two',name:'Local'},...Array.from({length:100},(_,i)=>({id:'case'+i,name:'Test '+i}))];
 const calls=[];const rows=containerMenuTemplate(profiles,'two',(...args)=>calls.push(args));
 assert.equal(rows.length,107);
 assert.equal(rows[0].label,'New Tab');
 assert.equal(rows[2].label,marker('one')+' Work && Testing');
 assert.match(rows[3].label,/Local \(current\)$/);
 assert.equal(rows.at(-2).label,'Add new container');
 assert.equal(rows.at(-1).label,'Manage containers');
 rows[0].click();rows[3].click();rows.at(-2).click();rows.at(-1).click();
 assert.deepEqual(calls,[['new',undefined],['new-in-container','two'],['container-focus-create',undefined],['accounts',undefined]]);
});
test('untrusted labels cannot inject menu actions or make identity name the routing key',()=>{
 const calls=[];
 const rows=containerMenuTemplate([{id:'id-from-state',name:'Manage containers\nAlpha'}],'other',(...args)=>calls.push(args));
 assert.match(rows[2].label,/Manage containers Alpha$/);
 rows[2].click();
 assert.deepEqual(calls,[['new-in-container','id-from-state']]);
});

test('split choices pin the originating pane and workspace, not the latest active tab',()=>{
 const calls=[], profiles=[{id:'one',name:'One'},{id:'two',name:'Two'}], pane={id:'pane-17',workspaceId:'workspace-9'};
 const rows=containerMenuTemplate(profiles,'one',(...args)=>calls.push(args),pane);
 rows.find(row=>row.label==='Split right in container').submenu[1].click();
 rows.find(row=>row.label==='Split below in container').submenu[0].click();
 assert.deepEqual(calls,[
  ['pane-split',{id:'pane-17',workspaceId:'workspace-9',axis:'x',identity:'two'}],
  ['pane-split',{id:'pane-17',workspaceId:'workspace-9',axis:'y',identity:'one'}]
 ]);
});

test('renaming or restyling a container retains the session key and survives session decode',()=>{
 const {updateAppearance}=require('../browser/container-menu.cjs');
 const {cleanState}=require('../browser/state.cjs');
 const existing=[{id:'personal',name:'Personal'},{id:'work',name:'Work'}];
 const next=updateAppearance(existing,{id:'work',name:'Work Test',color:'purple',icon:'shield'});
 assert.equal(existing[1].name,'Work');
 assert.equal(next[0],existing[0]);
 assert.deepEqual(next[1],{id:'work',name:'Work Test',color:'purple',icon:'shield'});
 assert.deepEqual(cleanState({profiles:next,tabs:[]}).profiles,next);
 assert.match(containerMenuTemplate(next,'personal',()=>{})[3].label,/^🟣 ◆ Work Test$/);
 for(const patch of [{id:'not-a-profile'},{name:'line\nbreak'},{color:'__proto__'},{icon:'constructor'}]){
  assert.throws(()=>updateAppearance(next,{id:'work',name:'Work Test',color:'purple',icon:'shield',...patch}));
 }
});
