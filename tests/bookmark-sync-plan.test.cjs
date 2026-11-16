'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {planBookmarkSync,verifyPreview} = require('../browser/bookmark-sync-plan.cjs');
const row = (id,url,title=id,path=[]) => ({id,url,title,path});
const input = () => ({authority:'opera-gx:personal',participants:['opera-gx:personal','chrome:personal','firefox:container-2','edge:personal','noxviola:personal'],snapshots:[
  {participant:'opera-gx:personal',revision:'a',bookmarks:[row('a','https://example.test/a','A',['Work'])]},
  {participant:'chrome:personal',revision:'b',bookmarks:[row('b','https://example.test/b','B',['Read'])]},
  {participant:'firefox:container-2',revision:'c',bookmarks:[row('c','https://example.test/b','Duplicate')]},
  {participant:'edge:personal',revision:'d',bookmarks:[]},
  {participant:'noxviola:personal',revision:'e',bookmarks:[row('e','https://example.test/c','C')]}
]});
test('all selected participants, including authority and Noxviola, receive missing bookmarks',()=>{
  const p=planBookmarkSync(input()); assert.equal(p.targets.length,5);
  assert.deepEqual(p.targets.map(x=>x.additions.length),[2,2,2,3,2]);
  assert.equal(p.targets[0].additions[0].path[0],'Temporary organize');
  assert.equal(p.targets[3].additions[0].path[0],'Authority bookmarks');
});
test('deterministic duplicate arbitration and provenance do not lose sources',()=>{
  const p=planBookmarkSync(input()); const b=p.targets[3].additions.find(x=>x.title==='B');
  assert.equal(b.sources.length,2); assert.equal(b.sources[1].participant,'firefox:container-2');
});
test('original input is unchanged',()=>{const i=input(), before=JSON.stringify(i);planBookmarkSync(i);assert.equal(JSON.stringify(i),before);});
test('repeated completed additive cycle has no further additions',()=>{
  const i=input(), p=planBookmarkSync(i);
  for(const target of p.targets){const s=i.snapshots.find(x=>x.participant===target.participant);s.bookmarks.push(...target.additions.map(x=>row(x.key,x.url,x.title,x.path)));s.revision+='1';}
  assert.ok(planBookmarkSync(i).targets.every(x=>x.additions.length===0));
});
test('query parameters, fragments, escaped bytes and trailing slash stay distinct',()=>{
  const i=input(); i.snapshots[0].bookmarks=['https://x.test/a','https://x.test/a/','https://x.test/a#b','https://x.test/a?b=1&c=2','https://x.test/a?c=2&b=1','https://x.test/%61'].map((url,n)=>row(String(n),url));
  assert.equal(planBookmarkSync(i).targets[3].additions.length,8);
});
test('authority wins incoming labels but never overwrites destination edits or duplicates',()=>{
  const i=input();i.snapshots[1].bookmarks.push(row('z','https://example.test/a','Local edit'),row('zz','https://example.test/a','Another'));
  const t=planBookmarkSync(i).targets[1];assert.equal(t.additions.length,1);assert.equal(t.conflicts[0].preferredTitle,'A');assert.deepEqual(t.conflicts[0].existingIds,['z','zz']);
});
test('unsafe URLs are visibly quarantined without echoing embedded credentials',()=>{
  const i=input();i.snapshots[0].bookmarks.push(row('secret','https://user:secret@example.test/'),row('js','javascript:alert(1)'),row('file','file:///private'));
  const p=planBookmarkSync(i);assert.equal(p.quarantined.length,3);assert.ok(!JSON.stringify(p).includes('user:secret'));
});
test('no cookie, login or password category is silently accepted',()=>{
  for(const category of ['cookies','logins','passwords']) assert.throws(()=>planBookmarkSync({...input(),categories:['bookmarks',category]}),/not implemented/);
});
test('missing, repeated or foreign profile snapshots fail closed',()=>{
  const i=input();i.snapshots.pop();assert.throws(()=>planBookmarkSync(i),/Every/);
  const j=input();j.snapshots[4]=j.snapshots[0];assert.throws(()=>planBookmarkSync(j),/exactly/);
});
test('ambiguous bookmark IDs and malformed input fail closed',()=>{
  const i=input();i.snapshots[0].bookmarks.push(i.snapshots[0].bookmarks[0]);assert.throws(()=>planBookmarkSync(i),/unique/);
  const j=input();j.snapshots[0].bookmarks[0].path=null;assert.throws(()=>planBookmarkSync(j),/path/i);
});
test('stale previews, changed scope and modified operations are refused',()=>{
  const i=input(),p=planBookmarkSync(i);assert.deepEqual(verifyPreview(p,i),p);
  i.snapshots[0].revision='new';assert.throws(()=>verifyPreview(p,i),/stale/);
  const j=input(),q=planBookmarkSync(j);q.targets[0].additions[0].title='edited';assert.throws(()=>verifyPreview(q,j),/modified/);
});
test('large complete snapshots are not capped or truncated',()=>{
  const i=input();i.snapshots[0].bookmarks=Array.from({length:10000},(_,n)=>row(String(n),`https://example.test/${n}`));
  assert.equal(planBookmarkSync(i).targets[3].additions.length,10002);
});

test('obvious authentication and signed links are quarantined without copying or echoing secrets',()=>{
  const i=input(); const urls=['https://example.test/reset?token=PRIVATE_SENTINEL','https://example.test/?X-Amz-Signature=PRIVATE_SENTINEL','https://example.test/#access_token=PRIVATE_SENTINEL','https://example.test/callback?code=PRIVATE_SENTINEL','https://example.test/reset/PRIVATE_SENTINEL'];
  i.snapshots[0].bookmarks.push(...urls.map((url,n)=>row(`s${n}`,url)));
  const p=planBookmarkSync(i);assert.equal(p.quarantined.length,urls.length);assert.ok(!JSON.stringify(p).includes('PRIVATE_SENTINEL'));
});

test('oversized whole inputs fail without truncation or mutation',()=>{
  const {LIMITS}=require('../browser/bookmark-sync-plan.cjs');
  const i=input();i.snapshots[0].bookmarks[0].title='x'.repeat(LIMITS.stringLength+1);const before=JSON.stringify(i);
  assert.throws(()=>planBookmarkSync(i),/Text limit/);assert.equal(JSON.stringify(i),before);
  const j=input();j.participants=Array.from({length:33},(_,n)=>String(n));assert.throws(()=>planBookmarkSync(j),/participants/);
  const k=input();k.snapshots[0].bookmarks=Array(100001).fill(row('a','https://example.test/'));assert.throws(()=>planBookmarkSync(k),/count limit/);
  const l=input();l.snapshots[0].bookmarks[0].path=Array(257).fill('folder');assert.throws(()=>planBookmarkSync(l),/path limit/);
});
