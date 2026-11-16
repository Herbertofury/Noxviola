'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {FollowService,decode,sourceFor,githubCollect,INTERVAL,serverTiming}=require('../browser/follows.cjs');
function fixture(t, options={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nox-follow-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 let now=1000;const setup={file:path.join(dir,'following.json'),getIdentities:()=>['personal','work'],now:()=>now,...options};
 const service=new FollowService(setup);service.open();t.after(()=>service.dispose());
 return {service,file:setup.file,setTime:v=>now=v,reopen:()=>{const next=new FollowService(setup);next.open();t.after(()=>next.dispose());return next;}};
}
const add=(s,owner='personal',extra={})=>s.add(owner,{name:'Project',url:'https://github.com/example/project',...extra});
const row=(id=1,extra={})=>({id,html_url:`https://github.com/example/project/releases/tag/v${id}`,name:`Release ${id}`,tag_name:`v${id}`,published_at:'2026-11-16T00:00:00Z',body:'Release notes',...extra});
const response=(rows,headers={},status=200)=>({status,ok:status>=200&&status<300,headers:{get:k=>headers[k]??null},json:async()=>rows});
const normalized=(id='1',fingerprint='original')=>({id,title:`Release ${id}`,url:`https://github.com/example/project/releases/tag/v${id}`,publishedAt:'2026-11-16T00:00:00Z',fingerprint});
test('follow list persists locally, preserves identity boundary and does not expose cache',t=>{
 const {service,file,reopen}=fixture(t);assert.equal(fs.existsSync(file),false);const s=add(service);add(service,'work');
 assert.equal(service.list('personal').length,1);assert.equal(service.list('personal')[0].cache,undefined);assert.throws(()=>service.get('work',s.id),/identity/);assert.throws(()=>service.list('unknown'),/identity/);
 assert.equal(reopen().list('personal')[0].url,s.url);assert.throws(()=>add(service,'personal',{url:'https://github.com/EXAMPLE/PROJECT/'}),/Already following/);
});
test('manual sources are honestly manual and reject automatic enablement or refresh',async t=>{
 const {service}=fixture(t);const s=add(service,'personal',{url:'https://example.com/artist',automatic:true,kind:'creator'});
 assert.equal(s.provider,'manual');assert.equal(s.automatic,false);assert.equal(s.kind,'creator');assert.throws(()=>service.change('personal',s.id,{automatic:true}),/adapter/);await assert.rejects(service.refresh('personal',s.id),/Manual source/);
});
test('source construction cannot send credentials or HTTP to collection; GitHub routes are fixed',()=>{
 assert.throws(()=>sourceFor('http://github.com/example/project'),/HTTPS/);assert.throws(()=>sourceFor('https://secret:password@github.com/example/project'));
 assert.equal(sourceFor('https://github.com/example').endpoint,'https://api.github.com/users/example/repos?per_page=100&type=owner&sort=updated');
 for(const url of ['https://127.0.0.1/project','https://api.github.com/project','https://github.com.evil.test/example/project'])assert.equal(sourceFor(url).provider,'manual');
});
test('refresh deduplicates unchanged updates, unread state survives restart and modified records become unread',async t=>{
 let fingerprint='one';const {service,reopen,setTime}=fixture(t,{collect:async()=>({cache:{},items:[normalized('1',fingerprint)]})});const s=add(service);
 await service.refresh('personal',s.id);assert.equal(service.get('personal',s.id).items[0].read,false);service.change('personal',s.id,{read:true});
 setTime(2000);await service.refresh('personal',s.id);let source=service.get('personal',s.id);assert.equal(source.items.length,1);assert.equal(source.items[0].read,true);assert.equal(source.items[0].observedAt,1000);assert.equal(reopen().get('personal',s.id).items[0].read,true);
 fingerprint='two';setTime(3000);await service.refresh('personal',s.id);source=service.get('personal',s.id);assert.equal(source.items[0].read,false);assert.equal(source.items[0].observedAt,3000);
});
test('failed refresh retains last-good records and success timestamp, exposes failure and retries later',async t=>{
 let fail=false;const {service,setTime}=fixture(t,{collect:async()=>{if(fail)throw new Error('HTTP 503');return{cache:{},items:[normalized()]};}});const s=add(service);
 await service.refresh('personal',s.id);fail=true;setTime(2000);await service.refresh('personal',s.id);const failed=service.get('personal',s.id);assert.equal(failed.items.length,1);assert.equal(failed.lastSuccess,1000);assert.equal(failed.lastAttempt,2000);assert.equal(failed.nextCheck,2000+INTERVAL);assert.match(failed.error,/503/);
 fail=false;await service.refresh('personal',s.id);assert.equal(service.get('personal',s.id).error,'');
});
test('records missing from a later source response are retained, not silently discarded',async t=>{
 let items=[normalized()];const {service}=fixture(t,{collect:async()=>({cache:{},items})});const s=add(service);await service.refresh('personal',s.id);items=[];await service.refresh('personal',s.id);assert.equal(service.get('personal',s.id).items.length,1);
});
test('pause cancels in-flight collection and late success cannot overwrite pause or add updates',async t=>{
 let resolve,signal;const {service}=fixture(t,{collect:async(_s,opts)=>{signal=opts.signal;return new Promise(r=>resolve=r);}});const s=add(service);const pending=service.refresh('personal',s.id);await new Promise(setImmediate);
 assert.equal(service.list('personal')[0].busy,true);service.change('personal',s.id,{paused:true});assert.equal(signal.aborted,true);resolve({cache:{},items:[normalized()]});await pending;
 assert.equal(service.get('personal',s.id).paused,true);assert.equal(service.get('personal',s.id).items.length,0);assert.equal(service.list('personal')[0].busy,false);await assert.rejects(service.refresh('personal',s.id),/Resume/);
});
test('duplicate in-flight refresh coalesces; dispose aborts without writing results',async t=>{
 let count=0,resolve,signal;const {service,file}=fixture(t,{collect:async(_s,opts)=>{count++;signal=opts.signal;return new Promise(r=>resolve=r);}});const s=add(service);const bytes=fs.readFileSync(file,'utf8');const pending=service.refresh('personal',s.id);await new Promise(setImmediate);await service.refresh('personal',s.id);assert.equal(count,1);
 service.dispose();assert.equal(signal.aborted,true);resolve({cache:{},items:[normalized()]});await pending;assert.equal(fs.readFileSync(file,'utf8'),bytes);
});
test('tick checks only explicitly enabled due and unpaused sources',async t=>{
 const calls=[];const {service,setTime}=fixture(t,{collect:async s=>{calls.push(s.id);return{cache:{},items:[]};}});const automatic=add(service,'personal',{automatic:true});add(service,'work');const paused=add(service,'personal',{url:'https://github.com/other/project',automatic:true});service.change('personal',paused.id,{paused:true});
 await service.tick();assert.deepEqual(calls,[automatic.id]);await service.tick();assert.equal(calls.length,1);setTime(1000+INTERVAL);await service.tick();assert.equal(calls.length,2);
});
test('GitHub collector follows all pages and revalidates ETags without cookies or redirects',async()=>{
 const source={...sourceFor('https://github.com/example/project'),cache:{}};const first=source.endpoint,second=first+'&page=2',requests=[];
 const result=await githubCollect(source,{now:()=>1000,fetcher:async(url,options)=>{requests.push({url,options});if(url.includes('/tags?'))return response([],{etag:'tags'});return url===first?response([row(1)],{etag:'page1',link:`<${second}>; rel="next"`}):response([row(2)],{etag:'page2'});}});
 assert.deepEqual(result.items.map(i=>i.id),['1','2']);assert.equal(requests.length,3);for(const {options}of requests){assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');assert.equal(options.headers.Authorization,undefined);}
 source.cache=result.cache;const cached=await githubCollect(source,{now:()=>1000,fetcher:async(url,options)=>{assert.equal(options.headers['If-None-Match'],url===first?'page1':url.includes('/tags?')?'tags':'page2');return response(null,{},304);}});assert.deepEqual(cached,result);
});
test('pagination blocks cross-origin/local network and changed paths before issuing the unsafe request',async()=>{
 for(const next of ['http://127.0.0.1/private','https://evil.test/path','https://api.github.com/user','https://api.github.com:443@127.0.0.1/path']){
  let count=0;await assert.rejects(githubCollect({...sourceFor('https://github.com/example/project'),cache:{}},{fetcher:async()=>{count++;return response([row()],{link:`<${next}>; rel="next"`});}}),/destination/);assert.equal(count,1);
 }
});
test('collector fails whole check on malformed, duplicate and inaccessible pages',async()=>{
 const source={...sourceFor('https://github.com/example/project'),cache:{}};
 for(const bad of [response({error:'no'}),response([{id:'wrong'}]),response([row(1,{html_url:'https://evil.test/1'})]),response([row(),row()]),response(null,{},429),response(null,{},403),response(null,{},500),response(null,{},304)])await assert.rejects(githubCollect(source,{fetcher:async()=>bad}));
 let n=0;await assert.rejects(githubCollect(source,{fetcher:async()=>++n===1?response([row()],{link:`<${source.endpoint}&page=2>; rel="next"`}):response(null,{},503)}),/503/);
});
test('creator collection captures complete repo metadata changes without pretending to track all socials',async()=>{
 const source={...sourceFor('https://github.com/example'),cache:{}};const result=await githubCollect(source,{fetcher:async()=>response([row(4,{full_name:'example/project',html_url:'https://github.com/example/project',pushed_at:'2026-11-16T01:00:00Z',description:'One',default_branch:'main'})])});
 assert.equal(result.items[0].title,'example/project');assert.equal(result.items[0].publishedAt,'2026-11-16T01:00:00Z');
});
test('decoder rejects duplicate source IDs that could cross identity boundaries',t=>{
 const {service,file}=fixture(t);add(service);add(service,'work');const data=JSON.parse(fs.readFileSync(file,'utf8'));data.sources[1].id=data.sources[0].id;assert.throws(()=>decode(data));
});
test('manual source keeps query that identifies a specific project',()=>{
 assert.equal(sourceFor('https://example.com/view?project=one').url,'https://example.com/view?project=one');
});
test('manual source keeps fragment routes for single-page project sites',()=>{
 assert.equal(sourceFor('https://example.com/#/project/one').url,'https://example.com/#/project/one');
});
test('malformed saved follow documents do not replace last-good disk state on reopen',t=>{
 const {service,file,reopen}=fixture(t);const s=add(service);const original=fs.readFileSync(file,'utf8');service.change('personal',s.id,{paused:true});fs.writeFileSync(file,'{invalid JSON');
 const recovered=reopen();assert.equal(recovered.status,'recovery');assert.throws(()=>recovered.add('personal',{name:'new',url:'https://github.com/other/project'}),/recovery|checkpoint/i);assert.equal(fs.readFileSync(file,'utf8'),'{invalid JSON');assert.ok(original.includes(s.id));
});
test('decoder rejects malformed or off-origin conditional response caches',t=>{
 const {service,file}=fixture(t);add(service);const pristine=JSON.parse(fs.readFileSync(file,'utf8'));const endpoint=sourceFor(pristine.sources[0].url).endpoint;
 const goodPage={etag:'"v1"',next:null,items:[normalized()]};
 const variants=[
  ['https://127.0.0.1/private',goodPage],
  [endpoint,{...goodPage,next:'https://evil.test/page2'}],
  [endpoint,{...goodPage,next:'https://api.github.com/user'}],
  [endpoint,{...goodPage,etag:4}],
  [endpoint,{...goodPage,items:null}],
  [endpoint,{...goodPage,items:[{...normalized(),url:'https://evil.test/update'}]}],
  [endpoint,{...goodPage,items:[{...normalized(),url:'http://github.com/example/project'}]}],
  [endpoint,{...goodPage,items:[{...normalized(),url:'https://user:secret@github.com/example/project'}]}],
 ];
 for(const [address,page] of variants){const data=structuredClone(pristine);data.sources[0].cache={[address]:page};assert.throws(()=>decode(data),`accepted ${address} ${JSON.stringify(page)}`);}
 const valid=structuredClone(pristine);valid.sources[0].cache={[endpoint]:goodPage};assert.deepEqual(decode(valid),valid);
});
test('all follow mutation and collection entry points enforce source ownership',async t=>{
 let calls=0;const {service}=fixture(t,{collect:async()=>{calls++;return{cache:{},items:[]};}});const source=add(service);
 assert.throws(()=>service.change('work',source.id,{paused:true}),/identity/);await assert.rejects(service.refresh('work',source.id),/identity/);assert.equal(calls,0);assert.equal(service.get('personal',source.id).paused,false);
});
test('overlapping scheduler ticks never refresh an already refreshed later source from a stale snapshot',async t=>{
 let unblock;const calls=[];const {service}=fixture(t,{collect:async source=>{calls.push(source.url);if(source.url.endsWith('/first'))await new Promise(resolve=>unblock=resolve);return{cache:{},items:[]};}});
 add(service,'personal',{url:'https://github.com/example/first',automatic:true});add(service,'personal',{url:'https://github.com/example/second',automatic:true});
 const firstTick=service.tick();await new Promise(setImmediate);await service.tick();unblock();await firstTick;assert.equal(calls.filter(url=>url.endsWith('/second')).length,1);
});
test('timeout is a visible failed attempt, not a silent unchanged or successful check',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const {service}=fixture(t,{collect:async(_source,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}))});const source=add(service);const pending=service.refresh('personal',source.id);await new Promise(setImmediate);t.mock.timers.tick(60000);await pending;
 const saved=service.get('personal',source.id);assert.match(saved.error,/timed out/);assert.equal(saved.lastAttempt,1000);assert.equal(saved.lastSuccess,0);assert.equal(saved.nextCheck,1000+INTERVAL);assert.equal(service.list('personal')[0].busy,false);
});
const tag=(name='v1',sha='a'.repeat(40))=>({name,commit:{sha}});
test('project collects every releases and tags page, tag names stay stable and have no invented date',async()=>{
 const source={...sourceFor('https://github.com/example/project'),cache:{}};const tags=source.endpoint.replace('/releases?','/tags?'),second=tags+'&page=2';const called=[];
 const result=await githubCollect(source,{now:()=>1000,fetcher:async address=>{called.push(address);return address===source.endpoint?response([row()]):address===tags?response([tag('feature/a')],{link:`<${second}>; rel="next"`}):response([tag('v2')]);}});
 assert.equal(called.length,3);assert.equal(result.items.length,3);assert.equal(result.items[1].id,'tag:feature/a');assert.equal(result.items[1].url,'https://github.com/example/project/tree/feature%2Fa');assert.equal(result.items[1].publishedAt,'');assert.equal(result.items[1].commit,'a'.repeat(40));
});
test('moved tag becomes unread without duplicate identity and failure on tags retains entire last-good check',async t=>{
 let sha='a'.repeat(40),fail=false;const {service,setTime}=fixture(t,{collect:(source,options)=>githubCollect(source,{...options,fetcher:async address=>address.includes('/releases?')?response([row()]):fail?response(null,{},500):response([tag('v1',sha)])})});const s=add(service);await service.refresh('personal',s.id);service.change('personal',s.id,{read:true});
 sha='b'.repeat(40);setTime(2000);await service.refresh('personal',s.id);let saved=service.get('personal',s.id);assert.equal(saved.items.length,2);assert.equal(saved.items.find(i=>i.id==='tag:v1').read,false);assert.equal(saved.items.find(i=>i.id==='tag:v1').commit,sha);assert.equal(saved.items[0].read,true);
 fail=true;setTime(3000);await service.refresh('personal',s.id);saved=service.get('personal',s.id);assert.equal(saved.lastSuccess,2000);assert.equal(saved.items.length,2);assert.match(saved.error,/500/);
});
test('provider timing parses polling interval, Retry-After seconds/date and rate reset',()=>{
 const now=1700000000000;
 assert.deepEqual(serverTiming(response([],{ 'x-poll-interval':'9000','retry-after':'120','x-ratelimit-remaining':'0','x-ratelimit-reset':String(now/1000+500)}),now),{notBefore:now+9000000,githubNotBefore:now+501000});
 assert.equal(serverTiming(response([],{ 'retry-after':new Date(now+600000).toUTCString()}),now).githubNotBefore,now+600000);
 assert.equal(serverTiming(response([],{ 'retry-after':'bad','x-poll-interval':'Infinity','x-ratelimit-reset':'99999999999999999999','x-ratelimit-remaining':'0'}),now).githubNotBefore,0);
});
test('304 respects polling and shared cooldown headers and does not request later endpoints after pause',async()=>{
 const source={...sourceFor('https://github.com/example'),cache:{}};source.cache[source.endpoint]={etag:'old',next:null,items:[normalized()]};
 const result=await githubCollect(source,{now:()=>1000,fetcher:async()=>response(null,{'x-poll-interval':'7200','retry-after':'60'},304)});assert.equal(result.notBefore,7201000);assert.equal(result.githubNotBefore,61000);assert.equal(result.items.length,1);
 const project={...sourceFor('https://github.com/example/project'),cache:{}};let calls=0;
 await assert.rejects(githubCollect(project,{now:()=>1000,fetcher:async()=>{calls++;return response([row()],{'retry-after':'60'});}}),error=>error.retryAt===61000);assert.equal(calls,1);
});
test('shared cooldown survives restart and suppresses checks for a different source until expiry',async t=>{
 let calls=0;const {service,reopen,setTime}=fixture(t,{collect:async()=>{calls++;const error=new Error('rate limited');error.retryAt=5000000;throw error;}});const a=add(service),b=add(service,'work',{url:'https://github.com/other/project'});
 await service.refresh('personal',a.id);const restarted=reopen();await restarted.refresh('work',b.id);assert.equal(calls,1);assert.equal(restarted.list('work')[0].providerNotBefore,5000000);setTime(5000001);await restarted.refresh('work',b.id);assert.equal(calls,2);
});
test('queued distinct sources never overlap and apply first response cooldown before next request',async t=>{
 let release;const calls=[];let active=0,maxActive=0;const {service}=fixture(t,{collect:async source=>{calls.push(source.url);active++;maxActive=Math.max(maxActive,active);await new Promise(resolve=>release=resolve);active--;return{cache:{},items:[],githubNotBefore:5000000};}});const a=add(service),b=add(service,'work',{url:'https://github.com/other/project'});
 const first=service.refresh('personal',a.id);await new Promise(setImmediate);const second=service.refresh('work',b.id);await new Promise(setImmediate);assert.equal(calls.length,1);release();await first;await new Promise(setImmediate);
 if(calls.length>1)release();await second;assert.equal(maxActive,1);assert.equal(calls.length,1,'queued check must honor preceding source provider cooldown');
});
test('freshness separates never checked, checked, overdue and failed',async t=>{
 let fail=false;const {service,setTime}=fixture(t,{collect:async()=>{if(fail)throw new Error('bad');return{cache:{},items:[]};}});const source=add(service);assert.equal(service.list('personal')[0].freshness,'unchecked');await service.refresh('personal',source.id);assert.equal(service.list('personal')[0].freshness,'checked');setTime(1000+INTERVAL);assert.equal(service.list('personal')[0].freshness,'overdue');fail=true;await service.refresh('personal',source.id);assert.equal(service.list('personal')[0].freshness,'failed');
});
test('source polling pause does not become a provider-wide pause for unrelated sources',async t=>{
 const calls=[];const {service}=fixture(t,{collect:async s=>{calls.push(s.id);return{cache:{},items:[],notBefore:5000000};}});const a=add(service),b=add(service,'work',{url:'https://github.com/other/project'});
 await service.refresh('personal',a.id);await service.refresh('personal',a.id);assert.equal(calls.length,1);await service.refresh('work',b.id);assert.equal(calls.length,2);
});
test('collector preserves timing guidance when later response parsing fails',async()=>{
 const source={...sourceFor('https://github.com/example/project'),cache:{}};
 await assert.rejects(githubCollect(source,{now:()=>1000,fetcher:async()=>response({malformed:true},{'x-poll-interval':'7200','retry-after':'90'})}),error=>error.sourceNotBefore===7201000&&error.retryAt===91000);
});
test('first failed check has failed freshness, not never-attempted freshness',async t=>{
 const {service}=fixture(t,{collect:async()=>{throw new Error('offline');}});const source=add(service);await service.refresh('personal',source.id);assert.equal(service.list('personal')[0].freshness,'failed');assert.equal(service.get('personal',source.id).lastSuccess,0);
});
test('queued check honors prior source error cooldown before any network request',async t=>{
 let unblock;let calls=0;const {service}=fixture(t,{collect:async()=>{calls++;await new Promise(resolve=>unblock=resolve);const error=new Error('rate limited');error.retryAt=5000000;throw error;}});const a=add(service),b=add(service,'work',{url:'https://github.com/other/project'});
 const first=service.refresh('personal',a.id);await new Promise(setImmediate);const second=service.refresh('work',b.id);unblock();await first;await new Promise(setImmediate);if(calls>1)unblock();await second;assert.equal(calls,1);
});

test('CurseForge manual references remain isolated, persistent and explicitly credential-blocked',t=>{
 const {service,reopen}=fixture(t);const s=service.add('personal',{name:'Synthetic CurseForge reference',url:'https://www.curseforge.com/minecraft/mc-mods/example',automatic:true});
 assert.equal(s.provider,'manual');assert.equal(s.automatic,false);assert.match(service.list('personal')[0].coverage,/authorized API key/);assert.equal(service.list('work').length,0);
 assert.throws(()=>service.change('personal',s.id,{automatic:true}),/No automatic adapter/);assert.equal(reopen().list('personal')[0].provider,'manual');
});

test('observed revision history retains changes through restart without unchanged duplicates',async t=>{
 let item=normalized();const {service,reopen,setTime}=fixture(t,{collect:async()=>({cache:{},items:[item]})});const s=add(service);
 await service.refresh('personal',s.id);assert.deepEqual(service.get('personal',s.id).items[0].revisions,[]);
 setTime(2000);await service.refresh('personal',s.id);assert.equal(service.get('personal',s.id).items[0].revisions.length,0);
 item={...item,title:'Changed title',fingerprint:'two'};setTime(3000);await service.refresh('personal',s.id);
 let saved=reopen().get('personal',s.id).items[0];assert.equal(saved.revisions.length,1);assert.equal(saved.revisions[0].metadata.title,'Release 1');assert.equal(saved.revisions[0].observedAt,1000);assert.equal(saved.revisions[0].supersededAt,3000);assert.equal(saved.read,false);
 item={...item,fingerprint:'three'};setTime(4000);await service.refresh('personal',s.id);assert.equal(service.get('personal',s.id).items[0].revisions.length,2);assert.equal(service.list('work').length,0);
 service.collect=async()=>{throw new Error('offline');};await service.refresh('personal',s.id);assert.equal(service.get('personal',s.id).items[0].revisions.length,2);
});
test('malformed revision history enters recovery rather than silently accepting unsafe metadata',async t=>{
 const {service,file}=fixture(t,{collect:async()=>({cache:{},items:[normalized()]})});const s=add(service);await service.refresh('personal',s.id);const data=JSON.parse(fs.readFileSync(file,'utf8'));
 data.sources[0].items[0].revisions=[{observedAt:1000,supersededAt:2000,metadata:{title:'old',url:'javascript:alert(1)',publishedAt:'',fingerprint:'old'}}];assert.throws(()=>decode(data),/HTTP/);
 data.sources[0].items[0].revisions='invalid';assert.throws(()=>decode(data),/revision history/);
});

test('revision history preserves provider declarations and tags without altering current metadata',async t=>{
 let item={...normalized(),kind:'tag',commit:'a'.repeat(40)};const {service,setTime}=fixture(t,{collect:async()=>({cache:{},items:[item]})});const s=add(service);await service.refresh('personal',s.id);
 item={...item,commit:'b'.repeat(40),fingerprint:'moved'};setTime(2000);await service.refresh('personal',s.id);const saved=service.get('personal',s.id).items[0];assert.equal(saved.commit,'b'.repeat(40));assert.equal(saved.revisions[0].metadata.commit,'a'.repeat(40));
 const old=saved.revisions[0].metadata;assert.equal(old.revisions,undefined);assert.equal(old.read,undefined);assert.equal(old.observedAt,undefined);
});

test('ModHold project follows persist snapshots/history and respect separate provider pause',async t=>{
 let fingerprint='one';const {service,reopen,setTime}=fixture(t,{collect:async()=>({items:[{...normalized('modhold-project:12',fingerprint),url:'https://modholdmods.com/g/skyrim-se/mods/12',kind:'modhold-project',versionNumber:'1.0',authorHandle:'Example'}],cache:{},providerNotBefore:2000})});
 const source=service.add('personal',{name:'ModHold project',url:'https://modholdmods.com/g/skyrim-se/mods/12/example',automatic:true});assert.equal(source.provider,'modhold-project');await service.refresh('personal',source.id);assert.equal(reopen().list('personal')[0].items.length,1);assert.equal(service.list('work').length,0);assert.match(service.list('personal')[0].coverage,/does not verify a ban/);
 const github=add(service);assert.equal(service.list('personal').find(s=>s.id===github.id).providerNotBefore,0);setTime(3000);fingerprint='two';await service.refresh('personal',source.id);assert.equal(service.get('personal',source.id).items[0].revisions.length,1);
});
test('saved manual ModHold source upgrades only on explicit action without enabling background checks',t=>{
 const {service,file,reopen}=fixture(t);const s=add(service,'personal',{url:'https://example.com/reference'});const data=JSON.parse(fs.readFileSync(file,'utf8'));data.sources[0].url='https://modholdmods.com/u/ExampleAuthor';fs.writeFileSync(file,JSON.stringify(data));const next=reopen();assert.equal(next.list('personal')[0].provider,'manual');assert.equal(next.list('personal')[0].adapterAvailable,true);next.change('personal',s.id,{enableAdapter:true});assert.equal(next.get('personal',s.id).provider,'modhold-author');assert.equal(next.get('personal',s.id).automatic,false);
});

test('ModHold file hash and size history retain old values rather than inventing additions',async t=>{
 let item={...normalized('modhold-file:31'),kind:'modhold-file',url:'https://modholdmods.com/g/skyrim-se/mods/12',fileKind:'main',sizeBytes:42,sha256:'a'.repeat(64)};const {service,reopen,setTime}=fixture(t,{collect:async()=>({items:[item],cache:{}})});const s=service.add('personal',{name:'Fixture',url:item.url});await service.refresh('personal',s.id);
 item={...item,sizeBytes:84,sha256:'b'.repeat(64),fingerprint:'two'};setTime(2000);await service.refresh('personal',s.id);const old=reopen().get('personal',s.id).items[0].revisions[0].metadata;assert.equal(old.sizeBytes,42);assert.equal(old.sha256,'a'.repeat(64));assert.equal(old.fileKind,'main');
});

test('ModHold real collector contract survives durable cache validation and reopen',async t=>{
 const modhold=require('../browser/modhold-follow.cjs');const {service,reopen}=fixture(t,{collect:(s,o)=>modhold.collect(s,{...o,fetcher:async()=>new Response(JSON.stringify({id:12,name:'Fixture',version:'1.0',updated:'2026-11-16 12:00:00',author:{handle:'Example'},page:'https://modholdmods.com/g/skyrim-se/mods/12/example',files:[]}))})});const s=service.add('personal',{name:'Fixture',url:'https://modholdmods.com/g/skyrim-se/mods/12'});await service.refresh('personal',s.id);const saved=reopen().get('personal',s.id);assert.equal(saved.error,'');assert.equal(saved.lastSuccess,1000);assert.equal(saved.items[0].title,'Fixture');assert.equal(Object.keys(saved.cache).length,1);
});

test('transition reports persist with source identity corrections but never add or switch follows',t=>{
 const {fixture:transitionFixture}=require('./fixtures/transition.cjs');const {service,reopen,setTime}=fixture(t);setTime(150000);const r=transitionFixture();const s=service.add('personal',{name:'Fixture author',url:r.source_account});service.change('personal',s.id,{transition:r});service.change('personal',s.id,{transition:r});assert.equal(service.get('personal',s.id).transitions.length,1);assert.equal(service.list('personal').length,1);assert.equal(service.get('personal',s.id).automatic,false);assert.equal(service.list('work').length,0);
 setTime(170000);service.change('personal',s.id,{transition:{...r,lifecycle:'retracted',observed_unix:160}});assert.equal(reopen().list('personal')[0].transitionNotices[1].state,'retracted');assert.throws(()=>service.change('work',s.id,{transition:r}),/identity/);assert.throws(()=>service.change('personal',s.id,{transition:r}),/Older/);
});
