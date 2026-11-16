'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../browser/tab-search.html'),'utf8'),source=fs.readFileSync(path.join(__dirname,'../browser/tab-search.js'),'utf8');
test('tab search filters all identities, uses text safely, and respects IME composition',async t=>{
 const dom=new JSDOM(html,{url:'https://noxviola.invalid/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,calls=[];
 const data={activeId:'a',style:'compact',profiles:[{id:'personal',name:'Personal'},{id:'work',name:'Work'}],workspaces:[{id:'workroom',name:'Research'}],groups:[{id:'g',name:'Ideas'}],tabs:[{id:'a',title:'<img src=x>',url:'https://a.test/',identity:'personal'},{id:'b',title:'Important page',url:'https://b.test/',identity:'work',workspaceId:'workroom',groupId:'g'}],closed:[{closedId:'c',title:'Old page',url:'https://old.test/',identity:'work'}]};
 w.tabSearch={command:async(name,value)=>{calls.push({name,value});return name==='state'?data:undefined;},onUpdate:()=>{}};w.eval(source);await new Promise(resolve=>setImmediate(resolve));t.after(()=>w.close());
 const q=w.document.getElementById('query');assert.equal(w.document.querySelectorAll('#open .row').length,2);assert.equal(w.document.querySelectorAll('.title img').length,0);assert.equal(w.document.body.dataset.style,'compact');
 q.value='research';q.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(w.document.querySelectorAll('#open .row').length,1);assert.equal(w.document.querySelector('#open .title').textContent,'Important page');
 q.dispatchEvent(new w.CompositionEvent('compositionstart'));q.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));q.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(calls.length,1);
 q.dispatchEvent(new w.CompositionEvent('compositionend'));q.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(calls.at(-1),{name:'activate',value:'b'});
 q.value='old';q.dispatchEvent(new w.Event('input',{bubbles:true}));w.document.querySelector('#closed button').click();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(calls.at(-1),{name:'restore',value:'c'});
});
