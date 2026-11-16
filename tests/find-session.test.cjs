'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createFindSession}=require('../browser/find-session.cjs');
function contents(){let id=0;return {findInPage:()=>++id,stopFindInPage:()=>{}};}
test('Find accepts current results only, including incremental final updates',()=>{
  const tracker=createFindSession(), wc=contents();
  const first=tracker.search(wc,'first',{}), next=tracker.search(wc,'next',{});
  assert.equal(tracker.accepts(wc,{requestId:first,matches:5}),false);
  assert.equal(tracker.accepts(wc,{requestId:next,finalUpdate:false}),true);
  assert.equal(tracker.accepts(wc,{requestId:next,finalUpdate:true}),true);
});
test('Clearing Find invalidates results before invoking native stop',()=>{
  const tracker=createFindSession(),wc=contents(); const id=tracker.search(wc,'query',{});
  wc.stopFindInPage=action=>{assert.equal(action,'clearSelection');assert.equal(tracker.accepts(wc,{requestId:id}),false);};
  tracker.clear(wc);assert.equal(tracker.accepts(wc,{requestId:id}),false);
});
test('Find request IDs cannot cross webContents or revive after failed search',()=>{
  const tracker=createFindSession(), a=contents(),b=contents();
  tracker.search(a,'a',{});assert.equal(tracker.accepts(b,{requestId:1}),false);
  tracker.search(b,'b',{});tracker.clear(a);assert.equal(tracker.accepts(b,{requestId:1}),true);
  b.findInPage=()=>{throw new Error('destroyed');};assert.throws(()=>tracker.search(b,'c',{}));
  assert.equal(tracker.accepts(b,{requestId:1}),false);
});
