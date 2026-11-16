'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {projectSource,compatibility,matchesVersion,versionFields,versionEndpoint,modrinthCollect,timing,MAX_RESPONSE_BYTES}=require('../browser/modrinth-follow.cjs');
const json=(data,headers={},status=200)=>new Response(status===304?null:JSON.stringify(data),{status,headers});
const source=()=>({...projectSource('https://modrinth.com/mod/example'),cache:{}});
const version=(extra={})=>({id:'Version1',project_id:'Project1',name:'Version one',version_number:'1.0.0',date_published:'2026-11-16T00:00:00Z',loaders:['forge'],game_versions:['1.19.2'],version_type:'release',...extra});
test('Modrinth source parser supports project types but not arbitrary routes or hosts',()=>{
 for(const kind of ['mod','modpack','resourcepack','shader','datapack','plugin']){const result=projectSource(`https://modrinth.com/${kind}/some-project?tab=versions#top`);assert.equal(result.provider,'modrinth-versions');assert.equal(result.url,`https://modrinth.com/${kind}/some-project`);assert.equal(result.endpoint,'https://api.modrinth.com/v2/project/some-project/version?include_changelog=false');}
 for(const address of ['http://modrinth.com/mod/project','https://modrinth.com:8080/mod/project','https://evil.test/mod/project','https://modrinth.com/user/person','https://modrinth.com/mod/project/version/Version1','https://modrinth.com/mod/bad%2Fslug'])assert.equal(projectSource(address),null);
});
test('resolve slug once to stable project ID and retrieve complete version list without credentials or changelogs',async()=>{
 const calls=[];const versions=Array.from({length:180},(_,index)=>version({id:`v${String(index).padStart(7,'0')}`}));
 const result=await modrinthCollect(source(),{now:()=>1000,fetcher:async(address,options)=>{calls.push({address,options});return address.endsWith('/project/example')?json({id:'Project1'}):json(versions,{etag:'versions-one'});}});
 assert.equal(calls.length,2);assert.equal(calls[1].address,'https://api.modrinth.com/v2/project/Project1/version?include_changelog=false');assert.equal(result.modrinthProjectId,'Project1');assert.equal(result.items.length,180);assert.equal(result.items[179].id,'modrinth:v0000179');
 for(const {options} of calls){assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers.Cookie,undefined);}
 assert.equal(result.items[0].publishedAt,versions[0].date_published);assert.deepEqual(result.items[0].loaders,['forge']);assert.deepEqual(result.items[0].gameVersions,['1.19.2']);
});
test('stable project ID survives slug URL changes and conditional304 retains complete prior snapshot',async()=>{
 const first=await modrinthCollect(source(),{fetcher:async address=>address.endsWith('/project/example')?json({id:'Project1'}):json([version()],{etag:'"one"'})});
 const saved={...source(),url:'https://modrinth.com/mod/renamed',modrinthProjectId:first.modrinthProjectId,cache:first.cache};let calls=0;
 const again=await modrinthCollect(saved,{now:()=>1000,fetcher:async(address,options)=>{calls++;assert.equal(address,'https://api.modrinth.com/v2/project/Project1/version?include_changelog=false');assert.equal(options.headers['If-None-Match'],'"one"');return json(null,{'x-ratelimit-remaining':'0','x-ratelimit-reset':'90'},304);}});
 assert.equal(calls,1);assert.deepEqual(again.items,first.items);assert.equal(again.providerNotBefore,91000);
});
test('compatibility requires loader and game version on the same version record',()=>{
 const forge={kind:'modrinth-version',loaders:['forge'],gameVersions:['1.19.2']},fabric={kind:'modrinth-version',loaders:['fabric'],gameVersions:['1.20.1']};const filters={loader:'forge',gameVersion:'1.20.1'};
 assert.equal([forge,fabric].some(item=>matchesVersion(item,filters)),false);assert.equal(matchesVersion(forge,{loader:' Forge ',gameVersion:'1.19.2'}),true);assert.equal(matchesVersion(fabric,{loader:'',gameVersion:'1.20.1'}),true);
 assert.equal(matchesVersion({...forge,presentInLastSnapshot:false},{loader:'forge',gameVersion:'1.19.2'}),false);assert.equal(matchesVersion({...forge,kind:'release'},filters),false);
});
test('compatibility and version metadata reject malformed shapes instead of inventing support',()=>{
 for(const filters of [null,[],{loader:'forge'},{loader:3,gameVersion:''},{loader:'forge',gameVersion:'',other:true},{loader:'f\norge',gameVersion:''}])assert.throws(()=>compatibility(filters));
 for(const item of [{},{loaders:null,gameVersions:[]},{loaders:['forge'],gameVersions:['']},{loaders:[42],gameVersions:['1.20.1']}])assert.throws(()=>versionFields(item));
 assert.deepEqual(compatibility({loader:' FABRIC ',gameVersion:' 1.20.1 '}),{loader:'fabric',gameVersion:'1.20.1'});
});
test('Modrinth rate reset is relative seconds, Retry-After supports seconds and HTTP dates',()=>{
 const now=1700000000000;assert.equal(timing(json([],{ 'x-ratelimit-remaining':'0','x-ratelimit-reset':'90'}),now),now+90000);assert.equal(timing(json([],{ 'retry-after':'120'}),now),now+120000);assert.equal(timing(json([],{ 'retry-after':new Date(now+300000).toUTCString()}),now),now+300000);
 assert.equal(timing(json([],{ 'x-ratelimit-remaining':'10','x-ratelimit-reset':'90'}),now),0);
});
test('metadata resolution cooldown prevents requesting versions and malformed IDs never route fetches',async()=>{
 let calls=0;await assert.rejects(modrinthCollect(source(),{now:()=>1000,fetcher:async()=>{calls++;return json({id:'Project1'},{'retry-after':'90'});}}),error=>error.retryAt===91000);assert.equal(calls,1);
 for(const id of ['../private','https://127.0.0.1','too-long-id',5])assert.throws(()=>versionEndpoint({...source(),modrinthProjectId:id}));
 await assert.rejects(modrinthCollect(source(),{fetcher:async()=>json({id:'bad'})}),/identify/);
});
test('no partial snapshot for invalid list, cross-project versions, duplicates or invalid compatibility',async()=>{
 for(const rows of [{error:'bad'},[version({project_id:'Different'})],[version(),version()],[version({id:'bad'})],[version({loaders:null})],[version({game_versions:[null]})]])await assert.rejects(modrinthCollect({...source(),modrinthProjectId:'Project1'},{fetcher:async()=>json(rows)}));
 await assert.rejects(modrinthCollect({...source(),modrinthProjectId:'Project1'},{fetcher:async()=>json(null,{},304)}),/uncached/);
});
test('declared oversized response is rejected and body cancelled, never truncated',async()=>{
 let cancelled=false;const body=new ReadableStream({cancel(){cancelled=true;}});const response=new Response(body,{headers:{'content-length':String(MAX_RESPONSE_BYTES+1)}});
 await assert.rejects(modrinthCollect({...source(),modrinthProjectId:'Project1'},{fetcher:async()=>response}),/16 MiB.*no partial/);assert.equal(cancelled,true);
});
test('stream exceeding budget without content-length is cancelled and entire check fails',async()=>{
 let cancelled=false;const body=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(MAX_RESPONSE_BYTES));controller.enqueue(new Uint8Array(1));},cancel(){cancelled=true;}});
 await assert.rejects(modrinthCollect({...source(),modrinthProjectId:'Project1'},{fetcher:async()=>new Response(body)}),/16 MiB.*no partial/);assert.equal(cancelled,true);
});
test('version fingerprint tracks compatibility changes but ignores array order',async()=>{
 const fetchVersion=async extra=>(await modrinthCollect({...source(),modrinthProjectId:'Project1'},{fetcher:async()=>json([version(extra)])})).items[0].fingerprint;
 assert.equal(await fetchVersion({loaders:['forge','fabric']}),await fetchVersion({loaders:['fabric','forge']}));assert.notEqual(await fetchVersion({game_versions:['1.19.2']}),await fetchVersion({game_versions:['1.20.1']}));
});
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {FollowService,sourceFor,decode}=require('../browser/follows.cjs');
function fixture(t,extra={}){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nox-modrinth-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const setup={file:path.join(dir,'following.json'),getIdentities:()=>['personal'],now:()=>1000,...extra};const service=new FollowService(setup);service.open();t.after(()=>service.dispose());return{service,file:setup.file,reopen:()=>{const next=new FollowService(setup);next.open();t.after(()=>next.dispose());return next;}};}
const addMod=s=>s.add('personal',{name:'Example',url:'https://modrinth.com/mod/example',compatibility:{loader:'forge',gameVersion:'1.20.1'}});
const versionCollector=(rows)=>async(source,options)=>modrinthCollect(source,{...options,fetcher:async address=>address.endsWith('/project/example')?json({id:'Project1'}):json(rows)});
test('service persists stable project identity and same-version match filters across restart',async t=>{
 const {service,reopen}=fixture(t,{collect:versionCollector([version(),version({id:'Version2',loaders:['fabric'],game_versions:['1.20.1']})])});const s=addMod(service);assert.equal(sourceFor(s.url).provider,'modrinth-versions');await service.refresh('personal',s.id);assert.equal(service.get('personal',s.id).modrinthProjectId,'Project1');assert.deepEqual(service.list('personal')[0].matchingVersionIds,[]);
 service.change('personal',s.id,{compatibility:{loader:'fabric',gameVersion:'1.20.1'}});assert.deepEqual(reopen().list('personal')[0].matchingVersionIds,['modrinth:Version2']);
});
test('removed version remains in history but is not a current compatibility match',async t=>{
 let rows=[version()];const {service}=fixture(t,{collect:async(s,o)=>versionCollector(rows)(s,o)});const s=addMod(service);service.change('personal',s.id,{compatibility:{loader:'forge',gameVersion:'1.19.2'}});await service.refresh('personal',s.id);assert.equal(service.list('personal')[0].matchingVersionIds.length,1);rows=[];await service.refresh('personal',s.id);
 assert.equal(service.get('personal',s.id).items.length,1);assert.equal(service.get('personal',s.id).items[0].presentInLastSnapshot,false);assert.deepEqual(service.list('personal')[0].matchingVersionIds,[]);
});
test('failed Modrinth refresh preserves previous versions and presence rather than publishing partial metadata',async t=>{
 let fail=false;const {service}=fixture(t,{collect:async(s,o)=>{if(fail)throw new Error('budget');return versionCollector([version()])(s,o);}});const s=addMod(service);await service.refresh('personal',s.id);const good=service.get('personal',s.id).items;fail=true;await service.refresh('personal',s.id);assert.deepEqual(service.get('personal',s.id).items,good);assert.match(service.get('personal',s.id).error,/budget/);
});
test('Modrinth provider cooldown persists without blocking unrelated GitHub sources',async t=>{
 const calls=[];const {service,reopen}=fixture(t,{collect:async source=>{calls.push(source.provider);if(source.provider==='modrinth-versions'){const error=new Error('rate limit');error.retryAt=5000000;throw error;}return{cache:{},items:[]};}});const mod=addMod(service),github=service.add('personal',{name:'GitHub',url:'https://github.com/example/project'});
 await service.refresh('personal',mod.id);const restored=reopen();await restored.refresh('personal',mod.id);assert.deepEqual(calls,['modrinth-versions']);await restored.refresh('personal',github.id);assert.deepEqual(calls,['modrinth-versions','github-releases']);
});
test('legacy manual Modrinth follows stay manual until explicit adapter enablement',t=>{
 const {service,file,reopen}=fixture(t);const s=addMod(service);const data=JSON.parse(fs.readFileSync(file,'utf8'));data.sources[0].provider='manual';delete data.sources[0].compatibility;fs.writeFileSync(file,JSON.stringify(data));assert.equal(decode(data).sources[0].provider,'manual');const old=reopen();assert.equal(old.get('personal',s.id).provider,'manual');old.change('personal',s.id,{enableAdapter:true});assert.equal(old.get('personal',s.id).provider,'modrinth-versions');assert.equal(old.get('personal',s.id).automatic,false);
});

test('direct Modrinth parser rejects credentials and stable identity requires text',()=>{
 const {projectSource,versionEndpoint}=require('../browser/modrinth-follow.cjs');
 assert.equal(projectSource('https://user:secret@modrinth.com/mod/sodium'),null);
 assert.throws(()=>versionEndpoint({url:'https://modrinth.com/mod/sodium',modrinthProjectId:12345678}),/identity/);
});
