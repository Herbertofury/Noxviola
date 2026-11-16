'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {EventEmitter}=require('node:events');
const {FollowService}=require('../browser/follows.cjs');
const {DownloadManager}=require('../browser/downloads.cjs');
const {bindDownloads}=require('../browser/creator-following.cjs');
const discovery=require('../browser/creator-discovery.cjs');
const modhold=require('../browser/modhold-project.cjs');
const body=require('./fixtures/modhold/mod-11.json'),other=require('./fixtures/modhold/mod-4.json');
const registry=require('../shared/creator-continuity.v1.json');
const NOW=Date.parse('2026-11-16T20:00:00Z'),tick=()=>new Promise(setImmediate),response=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
function fixture(t,{fetcher=async()=>response(body),...options}={}) {
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'nox-creator-hub-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const config={file:path.join(directory,'follows.json'),getIdentities:()=>['personal','work'],now:()=>NOW,discoverCreator:(input,opts)=>discovery.discover(input,{...opts,fetcher}),collect:(source,opts)=>modhold.collect(source,{...opts,fetcher}),...options};
 const service=new FollowService(config);service.open();t.after(()=>service.dispose());return {service,directory,reopen(){const next=new FollowService(config);next.open();t.after(()=>next.dispose());return next;}};
}
function download(id='one',identity='personal',mod=body) {return {id,identity,filename:'Ambiguous archive.zip',state:'completed',terminal:true,url:'https://files.example.com/signed-file?token=private',provenance:{pageUrl:mod.page,urlChain:[`https://modholdmods.com/download/${mod.files[0].id}`]}};}
class Item extends EventEmitter {
 constructor(mod=body){super();this.mod=mod;this.state='progressing';this.path='';}
 getFilename(){return 'Ambiguous archive.zip';}getURL(){return 'https://files.example.com/download?token=secret';}
 getURLChain(){return [`https://modholdmods.com/download/${this.mod.files[0].id}?key=private`,this.getURL()];}
 getTotalBytes(){return 100;}getReceivedBytes(){return 100;}getSavePath(){return this.path;}getState(){return this.state;}
 isPaused(){return false;}canResume(){return false;}setSaveDialogOptions(){}cancel(){this.emit('done',{},'cancelled');}
}
async function settled(service){for(let i=0;i<20;i++){await tick();const pending=[...(service.discoveryPending?.values()||[])];if(pending.length)await Promise.all(pending);if(!service.discoveryPending?.size)return;}throw new Error('Discovery did not settle.');}

test('real will-download → native completed bridge discovers exact creator in initiating identity after tab switches',async t=>{
 const {service,directory,reopen}=fixture(t),manager=new DownloadManager({directory,reveal:()=>{},file:path.join(directory,'downloads.json'),getIdentities:()=>['personal','work'],now:()=>NOW}),session=new EventEmitter();manager.open();manager.attach(session,'personal');t.after(()=>manager.dispose());t.after(bindDownloads(manager,service,error=>assert.fail(error.message)));
 let currentPage=body.page;const item=new Item();session.emit('will-download',{},item,{getURL:()=>currentPage});currentPage='https://unrelated.example/';
 item.state='completed';item.path='/synthetic/archive.zip';item.emit('updated',{},'progressing');await tick();assert.equal(service.list('personal').length,0,'a getter or progress event cannot establish completion');
 item.emit('done',{},'completed');item.emit('done',{},'completed');await settled(service);
 const sources=reopen().list('personal');assert.equal(sources.length,2);assert.equal(service.list('work').length,0);assert.equal(sources.find(row=>row.kind==='creator').creatorIdentity.key,'modhold:sethsaidthat');assert.equal(sources.find(row=>row.kind==='project').modholdAuthor,'SethSaidThat');
 const saved=manager.list()[0];assert.equal(saved.provenance.pageUrl,body.page);assert.ok(saved.provenance.urlChain.every(url=>!url.includes('?')));assert.equal(service.creatorHub('personal').discoveries.length,1);assert.equal(service.creatorHub('personal').preferences.autoFollowDownloads,true);
 assert.equal(fs.readFileSync(path.join(directory,'follows.json'),'utf8').includes('token=private'),false);
});
test('cancelled, interrupted and failed chooser downloads do not discover creators',async t=>{
 let calls=0;const {service,directory}=fixture(t,{fetcher:async()=>{calls++;return response(body);}}),manager=new DownloadManager({directory,reveal:()=>{}}),session=new EventEmitter();manager.attach(session,'personal');t.after(()=>manager.dispose());t.after(bindDownloads(manager,service));
 for(const state of ['cancelled','interrupted']){const item=new Item();session.emit('will-download',{},item,{getURL:()=>body.page});item.emit('done',{},state);}
 const failed=new Item();failed.setSaveDialogOptions=()=>{throw new Error('chooser failed');};session.emit('will-download',{},failed,{getURL:()=>body.page});await settled(service);assert.equal(calls,0);assert.equal(service.creatorHub('personal').discoveries.length,0);
});
test('opt-out is identity-local, durable and prevents all new download metadata requests',async t=>{
 let calls=0;const {service,reopen}=fixture(t,{fetcher:async()=>{calls++;return response(body);}});service.setCreatorSettings('personal',false);assert.equal((await service.discoverDownload(download())).status,'disabled');assert.equal(calls,0);assert.equal(reopen().creatorSettings('personal').autoFollowDownloads,false);await service.discoverDownload(download('work','work'));assert.equal(calls,1);assert.equal(service.list('personal').length,0);assert.equal(service.list('work').length,2);
});
test('duplicate completed downloads coalesce metadata work and keep one stable creator/project with all provenance entries',async t=>{
 let calls=0,release;const {service}=fixture(t,{fetcher:()=>{calls++;return new Promise(resolve=>release=()=>resolve(response(body)));}});
 const a=service.discoverDownload(download('a')),b=service.discoverDownload(download('b'));await tick();assert.equal(calls,1);release();await Promise.all([a,b]);assert.equal(service.list('personal').length,2);assert.equal(service.creatorHub('personal').discoveries.length,2);await service.discoverDownload(download('a'));assert.equal(calls,1);
});
test('several exact projects by one provider profile share a creator without losing project history',async t=>{
 const {service,reopen}=fixture(t,{fetcher:async address=>response(address.endsWith('/4')?other:body)});await service.discoverDownload(download('a'));const project=service.list('personal').find(row=>row.kind==='project');await service.refresh('personal',project.id);service.change('personal',project.id,{read:true,paused:true});await service.discoverDownload(download('b','personal',other));await service.discoverDownload(download('c'));const rows=reopen().list('personal');assert.equal(rows.length,3);assert.equal(rows.filter(row=>row.kind==='creator').length,1);assert.equal(rows.find(row=>row.id===project.id).paused,true);assert.ok(rows.find(row=>row.id===project.id).items.every(item=>item.read));assert.equal(service.creatorHub('personal').creators[0].projectCount,2);
});
test('explicit creator unfollow creates a durable tombstone, repeat downloads respect it, undo restores saved settings',async t=>{
 const {service,reopen}=fixture(t);await service.discoverDownload(download());const creator=service.list('personal').find(row=>row.kind==='creator');service.change('personal',creator.id,{automatic:false});service.unfollow('personal',creator.id);const repeated=await service.discoverDownload(download('two'));assert.equal(repeated.status,'suppressed');assert.equal(reopen().get('personal',creator.id).archived,true);service.restoreFollow('personal',creator.id);assert.equal(service.get('personal',creator.id).archived,false);assert.equal(service.get('personal',creator.id).automatic,false);assert.equal((await service.discoverDownload(download('three'))).status,'followed');assert.equal(service.list('personal').length,2);
});
test('unfollow and preference changes during unresolved requests cannot be overwritten by late results',async t=>{
 let delayed=false,release;const {service}=fixture(t,{fetcher:()=>delayed?new Promise(resolve=>release=()=>resolve(response(body))):Promise.resolve(response(body))});await service.discoverDownload(download());const creator=service.list('personal').find(row=>row.kind==='creator');delayed=true;
 const pending=service.discoverDownload(download('late'));await tick();service.unfollow('personal',creator.id);release();assert.equal((await pending).status,'suppressed');assert.equal(service.get('personal',creator.id).archived,true);
 service.restoreFollow('personal',creator.id);const more=service.discoverDownload(download('off'));await tick();service.setCreatorSettings('personal',false);release();await more;assert.match(service.creatorHub('personal').discoveries.find(row=>row.id==='download:off').message,/cancelled|changed|off/);assert.equal(service.list('personal').length,2);
});
test('dismissal during discovery prevents a late follow and can be explicitly undone',async t=>{
 let release;const {service}=fixture(t,{fetcher:()=>new Promise(resolve=>release=()=>resolve(response(body)))});const pending=service.discoverDownload(download());await tick();service.dismissDiscovery('personal','download:one');release();await pending;assert.equal(service.list('personal').length,0);assert.equal(service.creatorHub('personal').discoveries[0].status,'dismissed');await assert.rejects(service.retryDiscovery('work','download:one'),/identity/);service.dismissDiscovery('personal','download:one',false);assert.equal(service.creatorHub('personal').discoveries[0].status,'review');
});
test('unrelated files, filename matches and unavailable metadata create useful review rows without guessed creators',async t=>{
 const {service}=fixture(t);const unknown=download();unknown.provenance={pageUrl:'https://unrelated.example/author/SethSaidThat',urlChain:['https://unrelated.example/SethSaidThat.zip']};assert.equal((await service.discoverDownload(unknown)).status,'review');assert.equal(service.list('personal').length,0);const wrong=download('wrong');wrong.provenance.urlChain=['https://modholdmods.com/download/999999'];assert.match((await service.discoverDownload(wrong)).message,/not listed/);assert.equal(service.list('personal').length,0);
});
test('rate failures remain reviewable and provider cooldown stops subsequent queued discovery',async t=>{
 let calls=0;const {service,reopen}=fixture(t,{fetcher:async()=>{calls++;return new Response('',{status:429,headers:{'retry-after':'120'}});}});const first=await service.discoverDownload(download());assert.match(first.message,/429/);const next=await service.discoverDownload(download('other','personal',other));assert.match(next.message,/paused/);assert.equal(calls,1);assert.equal(reopen().list('personal').length,0);
});
test('explicit backfill discovers saved projects and successful history only while retaining opt-out review',async t=>{
 const {service}=fixture(t);service.setCreatorSettings('personal',false);const project=service.add('personal',{name:'Saved mod',url:body.page,automatic:false});const result=await service.backfillCreators('personal',[download(),{...download('failed'),state:'cancelled'},{...download('work','work')}]);assert.deepEqual(result,{done:2,total:2});assert.equal(service.list('personal').length,1);const rows=service.creatorHub('personal').discoveries;assert.equal(rows.length,2);assert.ok(rows.every(row=>row.status==='review'&&row.result));service.chooseDiscovery('personal',`project:${project.id}`,'modhold:sethsaidthat');assert.equal(service.list('personal').length,2);assert.equal(service.get('personal',project.id).automatic,false);
});

const mrProject={id:'AAAA0001',team:'TEAM0001',slug:'fixture-mod',project_type:'mod',title:'Fixture Mod'},mrFile='https://cdn.modrinth.com/data/AAAA0001/versions/VVVV0001/fixture.jar';
function mrFetcher(address){if(address.endsWith('/version?include_changelog=false'))return response([{id:'VVVV0001',project_id:'AAAA0001',author_id:'USER0001',files:[{url:mrFile}]}]);if(address.endsWith('/members'))return response([{team_id:'TEAM0001',accepted:true,role:'Maintainer',user:{id:'USER0001',username:'first'}},{team_id:'TEAM0001',accepted:true,role:'Maintainer',user:{id:'USER0002',username:'second'}}]);if(address.includes('/user/'))return response({id:'USER0001',username:'first'});return response(mrProject);}
test('exact Modrinth downloaded file selects its stable version publisher, not a guessed project owner',async()=>{
 const result=await discovery.discover({kind:'download',downloadUrl:mrFile,provenance:{pageUrl:'https://modrinth.com/mod/fixture-mod',urlChain:[mrFile]}},{fetcher:async address=>mrFetcher(address),now:()=>NOW});assert.equal(result.project.projectId,'AAAA0001');assert.equal(result.creators[0].key,'modrinth:USER0001');assert.equal(result.creators[0].profileUrl,'https://modrinth.com/user/USER0001');assert.match(result.creators[0].relation,/Publisher/);assert.equal(result.requiresChoice,false);
});
test('project teams require a choice and duplicate names never merge different stable accounts',async t=>{
 const {service}=fixture(t,{fetcher:async address=>mrFetcher(address)}),project=service.add('personal',{name:'Team mod',url:'https://modrinth.com/mod/fixture-mod'});const row=await service.discoverProject('personal',project.id);assert.equal(row.result.requiresChoice,true);assert.equal(service.list('personal').length,1);service.chooseDiscovery('personal',row.id,'modrinth:USER0001');service.chooseDiscovery('personal',row.id,'modrinth:USER0002');assert.equal(service.list('personal').length,3);assert.equal(service.get('personal',project.id).creatorKeys.length,2);assert.equal(service.list('personal').filter(row=>row.kind==='creator').every(row=>row.provider==='modrinth-author'),true);
});
test('Modrinth author catalog pins stable account ID and retains all credited project observations',async()=>{
 const source={url:'https://modrinth.com/user/USER0001',modrinthAuthorId:'USER0001'};const result=await discovery.collectAuthor(source,{fetcher:async address=>{assert.equal(address,'https://api.modrinth.com/v2/user/USER0001/projects');return response([{...mrProject,updated:'2026-11-16T12:00:00Z'}]);}});assert.equal(result.items[0].id,'modrinth-project:AAAA0001');assert.equal(result.modrinthAuthorId,'USER0001');
});
test('conflicting Modrinth initiating page, wrong files, wrong team and duplicate publishers fail closed',async()=>{
 const input={kind:'download',downloadUrl:mrFile,provenance:{pageUrl:'https://modrinth.com/mod/different',urlChain:[mrFile]}};await assert.rejects(discovery.discover(input,{fetcher:async address=>mrFetcher(address)}),/different/);
 input.provenance.pageUrl='';await assert.rejects(discovery.discover(input,{fetcher:async address=>address.includes('/version?')?response([]):mrFetcher(address)}),/unique/);
 await assert.rejects(discovery.discover({kind:'project',projectUrl:'https://modrinth.com/mod/fixture-mod'},{fetcher:async address=>address.endsWith('/members')?response([{team_id:'OTHER001',accepted:true,user:{id:'USER0001',username:'same'}}]):mrFetcher(address)}),/different project team/);
});
test('GitHub release provenance resolves the public stable repository owner without site follow writes',async()=>{
 const calls=[];const result=await discovery.discover({kind:'download',downloadUrl:'https://github.com/Creator/Mod/releases/download/v1/mod.zip',provenance:{pageUrl:'',urlChain:[]}},{fetcher:async(address,options)=>{calls.push(address);assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.method,undefined);return response({id:12,full_name:'Creator/Mod',owner:{id:37,login:'Creator',html_url:'https://github.com/Creator'}});},now:()=>NOW});assert.deepEqual(calls,['https://api.github.com/repos/Creator/Mod']);assert.equal(result.creators[0].key,'github:37');
});
test('source safety strips queries and cannot make provider requests to arbitrary hosts',()=>{
 assert.equal(discovery.publicAddress('https://example.com/path?secret=1#token'),'https://example.com/path');for(const address of ['https://a:b@example.com/mod','https://127.0.0.1/a','https://test.local/a','file:///secret'])assert.equal(discovery.publicAddress(address),'');assert.throws(()=>discovery.requestIdentity({kind:'project',projectUrl:'https://modrinth.com.evil.example/mod/x'}),/exact/);
});
test('dispose during metadata work never adds a late creator or overwrites durable state',async t=>{
 let release;const {service,reopen}=fixture(t,{fetcher:()=>new Promise(resolve=>release=()=>resolve(response(body)))});const pending=service.discoverDownload(download());await tick();service.dispose();release();await pending;assert.equal(reopen().list('personal').length,0);
});

function sharedReport({status='banned',lifecycle='active',verified=true,review=NOW/1000+600}={}){const author=registry.authors[0],mapping=registry.migrations[0];return {schema_version:1,id:'canonical:fixture',creator_id:author.id,source_account:author.source.profileUrl,status,status_evidence:[{url:author.source.profileUrl,kind:'provider_notice',observed_unix:NOW/1000-60}],destination_account:author.destinations[0].profileUrl,identity_evidence:[{url:author.destinations[0].profileUrl,kind:'creator_crosslink',observed_unix:NOW/1000-60}],project_mappings:[{source_project:mapping.from.url,destination_project:mapping.to.url,game:mapping.to.game,evidence_url:mapping.to.url,verified}],observed_unix:NOW/1000-60,review_after_unix:review,lifecycle};}
test('canonical retraction, expiry, status correction and unverified mapping hold new migration decisions and are surfaced',t=>{
 for(const input of [{lifecycle:'retracted'},{lifecycle:'superseded'},{status:'active'},{verified:false},{review:NOW/1000-1}]){const {service}=fixture(t),source=service.add('personal',{name:'Original',url:registry.migrations[0].from.url});const before=service.list('personal')[0].continuityNotices[0].migrations[0];service.change('personal',source.id,{transition:sharedReport(input)});const row=service.list('personal')[0].continuityNotices[0].migrations[0];assert.ok(row.hold);assert.throws(()=>service.acceptMigration('personal',source.id,{migrationId:before.id,token:before.token,reviewed:true}),/Canonical|canonical/);assert.equal(service.list('personal').length,1);}
});
test('canonical evidence on the author profile also holds mod migration, including resume after a correction',t=>{
 const {service}=fixture(t),source=service.add('personal',{name:'Original',url:registry.migrations[0].from.url}),profile=service.add('personal',{name:'Author',kind:'creator',url:registry.authors[0].source.profileUrl});service.change('personal',profile.id,{transition:sharedReport()});const candidate=service.list('personal').find(row=>row.id===source.id).continuityNotices[0].migrations[0];assert.equal(candidate.hold,null);const destination=service.acceptMigration('personal',source.id,{migrationId:candidate.id,token:candidate.token,reviewed:true});service.change('personal',destination.id,{paused:true});service.change('personal',profile.id,{transition:{...sharedReport({lifecycle:'retracted'}),observed_unix:NOW/1000-1}});assert.throws(()=>service.change('personal',destination.id,{paused:false}),/Canonical/);assert.equal(service.get('personal',destination.id).paused,true);service.undoMigration('personal',destination.id);assert.equal(service.get('personal',destination.id).migration.state,'revoked');
});

test('Nexus provenance stays an explicit unresolved uploader review with its original project link',async t=>{
 let calls=0;const {service}=fixture(t,{fetcher:async()=>{calls++;return response(body);}}),row=download();row.provenance={pageUrl:registry.migrations[0].from.url,urlChain:['https://premium-files.nexus-cdn.com/file.zip']};const result=await service.discoverDownload(row);assert.equal(result.status,'review');assert.match(result.message,/Nexus.*uploader identity is not verified/);assert.equal(result.provenance.pageUrl,registry.migrations[0].from.url);assert.equal(calls,0);assert.equal(service.list('personal').length,0);
});

function catalogRow(id,handle){return {id,name:`Project ${id}`,version:'1.0',updated:'2026-11-16 12:00:00',author:{handle},page:`https://modholdmods.com/g/skyrim-se/mods/${id}`,access:'free'};}
function catalogFetcher(rows,counts,{size=2,failPage=0}={}){return async address=>{counts.calls++;const page=Number(new URL(address).searchParams.get('page'));if(page===failPage)return new Response('',{status:500});const value={mods:rows.slice((page-1)*size,page*size),page,per_page:size,total:rows.length};counts.bytes+=JSON.stringify(value).length;return response(value);};}
test('automatic ModHold authors share one complete catalog per identity/window; fresh checks and true retrieval dates remain explicit',async t=>{
 const adapter=require('../browser/modhold-follow.cjs'),rows=[catalogRow(1,'one'),catalogRow(2,'two'),catalogRow(3,'one')],counts={calls:0,bytes:0};let now=NOW;
 const {service,reopen}=fixture(t,{collect:undefined,now:()=>now,collectModholdCatalog:opts=>adapter.collectCatalog({...opts,fetcher:catalogFetcher(rows,counts)})});
 const a=service.add('personal',{name:'One',url:'https://modholdmods.com/u/one',kind:'creator',automatic:true}),b=service.add('personal',{name:'Two',url:'https://modholdmods.com/u/two',kind:'creator',automatic:true});await service.tick();assert.equal(counts.calls,2);assert.equal(service.get('personal',a.id).items.length,2);assert.equal(service.get('personal',b.id).items.length,1);
 now+=300000;await service.refresh('personal',b.id);let saved=reopen().get('personal',b.id);assert.equal(counts.calls,2);assert.equal(saved.catalogObservedAt,NOW);assert.equal(saved.nextCheck,NOW+3600000);
 await service.refresh('personal',b.id,{freshCatalog:true});assert.equal(counts.calls,4);assert.equal(service.get('personal',b.id).catalogObservedAt,now);
 const work=service.add('work',{name:'One in work',url:'https://modholdmods.com/u/one',kind:'creator',automatic:true});await service.refresh('work',work.id);assert.equal(counts.calls,6,'identities do not share mutable snapshots');
});
test('partial ModHold catalog scans never populate the shared snapshot or erase last-good creator observations',async t=>{
 const adapter=require('../browser/modhold-follow.cjs'),rows=[catalogRow(1,'one'),catalogRow(2,'two'),catalogRow(3,'one')],counts={calls:0,bytes:0};let failPage=2;
 const {service}=fixture(t,{collect:undefined,collectModholdCatalog:opts=>adapter.collectCatalog({...opts,fetcher:catalogFetcher(rows,counts,{failPage})})}),source=service.add('personal',{name:'One',url:'https://modholdmods.com/u/one',kind:'creator'});
 await service.refresh('personal',source.id);assert.equal(service.modholdCatalogSnapshots.size,0);assert.equal(service.get('personal',source.id).items.length,0);failPage=0;await service.refresh('personal',source.id);service.change('personal',source.id,{read:true});const good=service.get('personal',source.id);failPage=2;await service.refresh('personal',source.id,{freshCatalog:true});const failed=service.get('personal',source.id);assert.deepEqual(failed.items,good.items);assert.equal(failed.catalogObservedAt,good.catalogObservedAt);assert.match(failed.error,/500/);
});
test('cancelled catalog scan cannot seed other authors with a partial or cancelled snapshot',async t=>{
 const adapter=require('../browser/modhold-follow.cjs'),rows=[catalogRow(1,'one'),catalogRow(2,'two')];let release;
 const {service}=fixture(t,{collect:undefined,collectModholdCatalog:opts=>adapter.collectCatalog({...opts,fetcher:async()=>new Promise(resolve=>release=()=>resolve(response({mods:rows,page:1,per_page:50,total:2})))})}),source=service.add('personal',{name:'One',url:'https://modholdmods.com/u/one',kind:'creator'});
 const pending=service.refresh('personal',source.id);await tick();service.change('personal',source.id,{paused:true});release();await pending;assert.equal(service.modholdCatalogSnapshots.size,0);assert.equal(service.get('personal',source.id).items.length,0);
});
test('catalog discoveries can become exact linked project follows; unfollows and per-item read history remain respected',async t=>{
 const adapter=require('../browser/modhold-follow.cjs'),counts={calls:0,bytes:0};const {service,reopen}=fixture(t,{collect:undefined,collectModholdCatalog:opts=>adapter.collectCatalog({...opts,fetcher:catalogFetcher([catalogRow(1,'one'),catalogRow(2,'one')],counts)})}),author=service.add('personal',{name:'One',url:'https://modholdmods.com/u/one',kind:'creator'});await service.refresh('personal',author.id);
 const project=service.followCatalogProject('personal',author.id,'modhold-project:1');assert.equal(project.automatic,true);assert.deepEqual(project.creatorKeys,[`source:${author.url}`]);assert.equal(service.followCatalogProject('personal',author.id,'modhold-project:1').id,project.id);assert.equal(service.creatorHub('personal').creators[0].projectCount,1);
 service.markFollowItem('personal',author.id,'modhold-project:1',true);const saved=reopen().get('personal',author.id);assert.equal(saved.items[0].read,true);assert.equal(saved.items[1].read,false);assert.throws(()=>service.markFollowItem('work',author.id,'modhold-project:1',true),/identity/);
 service.unfollow('personal',project.id);assert.throws(()=>service.followCatalogProject('personal',author.id,'modhold-project:1'),/Restore/);
});
test('equivalent complete 150-project/12-author workloads reduce synthetic catalog requests 36→3 with identical saved observations',async t=>{
 const adapter=require('../browser/modhold-follow.cjs'),rows=Array.from({length:150},(_,i)=>catalogRow(i+1,`author${i%12}`)),baseline={calls:0,bytes:0},shared={calls:0,bytes:0};
 const old=fixture(t,{collect:(source,opts)=>adapter.collect(source,{...opts,fetcher:catalogFetcher(rows,baseline,{size:50})})}).service;
 const next=fixture(t,{collect:undefined,collectModholdCatalog:opts=>adapter.collectCatalog({...opts,fetcher:catalogFetcher(rows,shared,{size:50})})}).service;
 for(const service of [old,next]){for(let i=0;i<12;i++)service.add('personal',{name:`Author ${i}`,url:`https://modholdmods.com/u/author${i}`,kind:'creator',automatic:true});await service.tick();}
 assert.equal(baseline.calls,36);assert.equal(shared.calls,3);assert.equal(baseline.bytes,shared.bytes*12);assert.deepEqual(next.list('personal').map(source=>source.items),old.list('personal').map(source=>source.items));assert.equal(next.list('personal').reduce((sum,source)=>sum+source.items.length,0),150);
});

test('canonical equal-time conflicting copies cannot be resolved by source ordering; provider profile case is normalized',t=>{
 const {service}=fixture(t),source=service.add('personal',{name:'Original',url:registry.migrations[0].from.url}),profile=service.add('personal',{name:'Author',kind:'creator',url:registry.authors[0].source.profileUrl});const valid=sharedReport();valid.destination_account=valid.destination_account.toLowerCase();service.change('personal',source.id,{transition:valid});assert.equal(service.migrationHold('personal',registry.migrations[0].id),null);service.change('personal',profile.id,{transition:{...valid,status:'active'}});assert.match(service.migrationHold('personal',registry.migrations[0].id),/same observation time/);
});

test('discovered GitHub account/repository numeric pins reject reassigned handles, changed owners and replacement repositories',async t=>{
 const {githubCollect}=require('../browser/follows.cjs');let account=37,repository=12,repoOwner=37,rowOwner=37;const calls=[];
 const fetcher=async address=>{calls.push(address);const pathname=new URL(address).pathname.toLowerCase();if(pathname==='/users/creator')return response({id:account,login:'Creator'});if(pathname==='/users/creator/repos')return response([{id:12,html_url:'https://github.com/creator/mod',full_name:'Creator/Mod',pushed_at:'2026-11-16',default_branch:'main',owner:{id:rowOwner}}]);if(pathname.endsWith('/releases'))return response([{id:1,html_url:'https://github.com/creator/mod/releases/tag/v1',name:'Release',published_at:'2026-11-16'}]);if(pathname.endsWith('/tags'))return response([]);return response({id:repository,full_name:'Creator/Mod',owner:{id:repoOwner,login:'Creator',html_url:'https://github.com/Creator'}});};
 const {service,reopen}=fixture(t,{fetcher,collect:(source,opts)=>githubCollect(source,{...opts,fetcher})}),project=service.add('personal',{name:'Mod',url:'https://github.com/Creator/Mod'});await service.discoverProject('personal',project.id);const author=service.list('personal').find(row=>row.kind==='creator');assert.equal(author.creatorIdentity.accountId,'37');assert.equal(service.get('personal',project.id).githubRepositoryId,'12');assert.equal(service.get('personal',project.id).githubOwnerId,'37');
 await service.refresh('personal',author.id);service.markFollowItem('personal',author.id,'12',true);const before=service.get('personal',author.id).items;account=99;const count=calls.length;await service.refresh('personal',author.id);assert.equal(calls.length,count+1);assert.match(service.get('personal',author.id).error,/identity changed/);assert.deepEqual(reopen().get('personal',author.id).items,before);
 account=37;rowOwner=99;await service.refresh('personal',author.id);assert.match(service.get('personal',author.id).error,/different account/);assert.deepEqual(service.get('personal',author.id).items,before);
 rowOwner=37;await service.refresh('personal',project.id);const versions=service.get('personal',project.id).items;repository=13;await service.refresh('personal',project.id);assert.match(service.get('personal',project.id).error,/identity changed/);assert.deepEqual(service.get('personal',project.id).items,versions);
 repository=12;repoOwner=99;await service.refresh('personal',project.id);assert.match(service.get('personal',project.id).error,/identity changed/);assert.equal(service.get('personal',project.id).githubOwnerId,'37');
});
test('same creator display name on different providers never creates a cross-site identity merge',async t=>{
 const fetcher=async address=>address.startsWith('https://api.github.com/')?response({id:12,full_name:'SethSaidThat/Mod',owner:{id:37,login:'SethSaidThat',html_url:'https://github.com/SethSaidThat'}}):response(body);const {service}=fixture(t,{fetcher});await service.discoverDownload(download());const project=service.add('personal',{name:'Other mod',url:'https://github.com/SethSaidThat/Mod'});await service.discoverProject('personal',project.id);const authors=service.list('personal').filter(row=>row.kind==='creator');assert.equal(authors.length,2);assert.deepEqual(new Set(authors.map(row=>row.creatorIdentity.key)),new Set(['modhold:sethsaidthat','github:37']));
});
