'use strict';
// Browser-owned, credential-free collection. No Athena service or website cookies.
const crypto = require('node:crypto');
const {ServiceStore, clone, record, identity, text, timestamp, url} = require('./service-store.cjs');
const modrinth=require('./modrinth-follow.cjs');
const curseforge=require('./curseforge-follow.cjs');
const modhold=require('./modhold-follow.cjs');
const modholdProject=require('./modhold-project.cjs');
const transitions=require('./follow-transitions.cjs');
const continuity=require('./creator-continuity.cjs');
const nexusStatus=require('./nexus-author-status.cjs');
const discovery=require('./creator-discovery.cjs');
const creatorFollowing=require('./creator-following.cjs');
const INTERVAL = 60 * 60 * 1000;
function sourceFor(value) {
  const address = new URL(url(value));
  if (address.protocol !== 'https:') throw new Error('Follow sources require HTTPS.');
  const parts = address.pathname.split('/').filter(Boolean);
  if (address.origin === 'https://github.com' && parts.length >= 1 && parts.length <= 2 && parts.every(p => /^[a-zA-Z0-9_.-]+$/.test(p))) {
    const owner = parts[0].toLowerCase(), repo = parts[1]?.replace(/\.git$/, '').toLowerCase();
    return {url:`https://github.com/${owner}${repo?`/${repo}`:''}`,kind:repo?'project':'creator',provider:repo?'github-releases':'github-projects',endpoint:repo?`https://api.github.com/repos/${owner}/${repo}/releases?per_page=100`:`https://api.github.com/users/${owner}/repos?per_page=100&type=owner&sort=updated`};
  }
  return modrinth.projectSource(address.href)||discovery.authorSource(address.href)||modhold.sourceFor(address.href)||{url:address.href,kind:'project',provider:'manual',endpoint:null};
}
function endpointsFor(source){if(source.provider==='manual')return [];if(source.provider==='modrinth-author')return [`https://api.modrinth.com/v2/user/${source.modrinthAuthorId||new URL(source.url).pathname.split('/').pop()}/projects`];if(source.provider==='modrinth-versions')return [modrinth.versionEndpoint(source)];if(source.provider==='modhold-project')return [modholdProject.projectSource(source.url).endpoint];const first=sourceFor(source.url).endpoint;return !first?[]:source.provider==='github-releases'?[first,first.replace('/releases?', '/tags?')]:[first];}
const REVISION_FIELDS=['title','url','publishedAt','fingerprint','kind','commit','versionNumber','loaders','gameVersions','releaseType','projectId','game','author','fileId','fileName','fileKind','sha256','sizeBytes','authorHandle','access'];
function revisionMetadata(item){return Object.fromEntries(REVISION_FIELDS.filter(key=>item[key]!==undefined).map(key=>[key,clone(item[key])]));}
function validateRevision(revision){
 record(revision);timestamp(revision.observedAt);timestamp(revision.supersededAt);record(revision.metadata);
 if(Object.keys(revision.metadata).some(key=>!REVISION_FIELDS.includes(key)))throw new Error('Unsupported follow revision metadata.');
 for(const key of ['title','publishedAt','fingerprint'])text(revision.metadata[key]);url(revision.metadata.url);
 for(const key of REVISION_FIELDS.filter(key=>!['loaders','gameVersions','sizeBytes'].includes(key)))if(revision.metadata[key]!==undefined)text(revision.metadata[key]);
 if(revision.metadata.sizeBytes!==undefined&&(!Number.isSafeInteger(revision.metadata.sizeBytes)||revision.metadata.sizeBytes<0))throw new Error('Invalid revision file size.');
 for(const key of ['loaders','gameVersions'])if(revision.metadata[key]!==undefined&&(!Array.isArray(revision.metadata[key])||revision.metadata[key].some(value=>typeof value!=='string')))throw new Error('Invalid follow revision declarations.');
}
const empty = () => ({version:1,sources:[]});
function decode(value) {
  record(value); if(value.version!==1 || !Array.isArray(value.sources))throw new Error('Unsupported follow document; original data preserved.');
  creatorFollowing.validate(value);
  for(const field of ['githubNotBefore','modrinthNotBefore','modholdNotBefore','nexusNotBefore'])if(value[field]!==undefined)timestamp(value[field]);
  const registryOwners=new Set();
  if(value.creatorRegistries!==undefined){if(!Array.isArray(value.creatorRegistries))throw new Error('Invalid imported creator registries.');for(const entry of value.creatorRegistries){record(entry);identity(entry.identity);if(registryOwners.has(entry.identity))throw new Error('Duplicate creator registry identity.');registryOwners.add(entry.identity);continuity.validate(entry.registry);}}
  const statusKeys=new Set();if(value.creatorStatus!==undefined){if(!Array.isArray(value.creatorStatus))throw new Error('Invalid creator status observations.');for(const entry of value.creatorStatus){record(entry);identity(entry.identity);text(entry.authorId);const key=entry.identity+':'+entry.authorId;if(statusKeys.has(key))throw new Error('Duplicate creator status observation.');statusKeys.add(key);for(const field of ['lastAttempt','lastSuccess','nextCheck','observedAt'])timestamp(entry[field]);text(entry.error);if(!['unknown','available','banned'].includes(entry.state))throw new Error('Invalid creator observation state.');continuity.publicURL(entry.evidenceUrl);if(entry.providerAuthorId!==undefined&&(!/^[1-9][0-9]*$/.test(entry.providerAuthorId)||typeof entry.providerAuthorId!=='string'))throw new Error('Invalid stable Nexus author ID.');if(entry.summary!==undefined)text(entry.summary);if(entry.history!==undefined){if(!Array.isArray(entry.history))throw new Error('Invalid author status history.');for(const old of entry.history){record(old);if(!['available','banned'].includes(old.state))throw new Error('Invalid historical author status.');timestamp(old.observedAt);continuity.publicURL(old.evidenceUrl);text(old.summary);if(!/^[1-9][0-9]*$/.test(old.providerAuthorId))throw new Error('Invalid historical author identity.');}}}}
  const seen=new Set(), sourceIds=new Set();
  for(const s of value.sources){
    record(s); identity(s.identity); text(s.id); if(sourceIds.has(s.id))throw new Error('Duplicate follow source ID.');sourceIds.add(s.id); text(s.name); const expected=s.provider==='manual'?{url:url(s.url),provider:'manual',endpoint:null}:sourceFor(s.url);if(new URL(s.url).protocol!=='https:')throw new Error('Follow sources require HTTPS.');
    if(!s.id||!s.name.trim()||!['creator','project'].includes(s.kind)||s.provider!==expected.provider||s.url!==expected.url)throw new Error('Invalid follow source.');
    const key=`${s.identity}:${modholdProject.projectKey(s.url)||s.url}`;if(seen.has(key))throw new Error('Duplicate follow source.');seen.add(key);
    if((s.creatorAutomatic!==undefined&&typeof s.creatorAutomatic!=='boolean')||(s.archived!==undefined&&typeof s.archived!=='boolean')||typeof s.paused!=='boolean'||typeof s.automatic!=='boolean'||!Array.isArray(s.items))throw new Error('Invalid follow settings.');
    if(s.archived&&!s.paused)throw new Error('Archived follows must remain paused.');
    if(s.provider==='modhold-project'&&s.modholdAuthor!==undefined)modholdProject.handle(s.modholdAuthor);
    if(s.modrinthAuthorId!==undefined&&(s.provider!=='modrinth-author'||typeof s.modrinthAuthorId!=='string'||!/^[a-zA-Z0-9]{8}$/.test(s.modrinthAuthorId)))throw new Error('Invalid Modrinth author identity.');
    for(const field of ['githubRepositoryId','githubOwnerId'])if(s[field]!==undefined&&(s.provider!=='github-releases'||typeof s[field]!=='string'||!/^[1-9][0-9]*$/.test(s[field])))throw new Error('Invalid pinned GitHub project identity.');
    if(s.migration!==undefined)continuity.validateDecision(s.migration,s);
    if(s.provider==='manual'&&s.automatic)throw new Error('This source has no automatic adapter.');
    for(const field of ['createdAt','lastAttempt','lastSuccess','nextCheck'])timestamp(s[field]);
    if(s.catalogObservedAt!==undefined)timestamp(s.catalogObservedAt);if(s.notBefore!==undefined)timestamp(s.notBefore);if(s.provider==='modrinth-versions'){modrinth.versionEndpoint(s);if(s.compatibility!==undefined)modrinth.compatibility(s.compatibility);}
    if(s.transitions!==undefined){if(!Array.isArray(s.transitions))throw new Error('Invalid transition history.');for(const r of s.transitions){transitions.validate(r);if(!transitions.related(r,s))throw new Error('Unrelated transition source.');}}
    text(s.error);record(s.cache);const ids=new Set();
    for(const [address,page] of Object.entries(s.cache)){
      if(!expected.endpoint)throw new Error('Manual source cannot contain collection cache.');const first=endpointsFor(s).find(endpoint=>new URL(endpoint).pathname===new URL(address).pathname);if(!first)throw new Error('Unexpected cached endpoint.');endpointOK(address,first);record(page);
      if(page.etag!==null)text(page.etag);if(page.next!==null)endpointOK(page.next,first);
      if(!Array.isArray(page.items))throw new Error('Invalid follow cache.');
      for(const item of page.items){record(item);text(item.id);text(item.title);text(item.publishedAt);text(item.fingerprint);const target=new URL(url(item.url));if(target.protocol!=='https:'||target.hostname!==(s.provider.startsWith('modrinth-')?'modrinth.com':s.provider.startsWith('modhold-')?'modholdmods.com':'github.com'))throw new Error('Invalid cached update address.');if(s.provider==='modrinth-versions')modrinth.versionFields(item);if(s.provider==='modhold-project')modholdProject.fields(item,s);}
    }
    for(const item of s.items){record(item);if(item.revisions!==undefined){if(!Array.isArray(item.revisions))throw new Error('Invalid follow revision history.');item.revisions.forEach(validateRevision);}if(s.provider==='modrinth-versions')modrinth.versionFields(item);if(s.provider==='modhold-project')modholdProject.fields(item,s);if(item.presentInLastSnapshot!==undefined&&typeof item.presentInLastSnapshot!=='boolean')throw new Error('Invalid snapshot presence.');if(item.lastSeenAt!==undefined)timestamp(item.lastSeenAt);text(item.id);text(item.title);url(item.url);timestamp(item.observedAt);text(item.publishedAt);text(item.fingerprint);if(typeof item.read!=='boolean'||ids.has(item.id))throw new Error('Invalid update item.');ids.add(item.id);}
  }
  return clone(value);
}
function endpointOK(value, first) {
  const u=new URL(value), initial=new URL(first);
  if(u.origin!==initial.origin||u.pathname!==initial.pathname||u.username||u.password)throw new Error('Unexpected pagination destination.');
  return u.href;
}
function serverTiming(response,now){
  const seconds=name=>{const raw=response.headers.get(name);return raw!==null&&/^\d+$/.test(raw)?Number(raw):0;};
  const safe=value=>Number.isFinite(value)&&value>=0&&value<=8640000000000000?value:0;
  const pollSeconds=seconds('x-poll-interval');const notBefore=pollSeconds?safe(now+pollSeconds*1000):0;
  const retry=response.headers.get('retry-after');
  const retryAt=retry===null?0:/^\d+$/.test(retry)?safe(now+Number(retry)*1000):safe(Date.parse(retry));
  const resetAt=response.headers.get('x-ratelimit-remaining')==='0'?safe(seconds('x-ratelimit-reset')*1000+1000):0;
  return {notBefore,githubNotBefore:Math.max(retryAt,resetAt)};
}
async function githubCollect(source, {fetcher=fetch,signal,now=Date.now}={}) {
  const endpoints=endpointsFor(source);
  if(!endpoints.length)throw new Error('Manual source: open it to check. No automatic adapter is installed.');
  const cache={},items=[];let notBefore=0,githubNotBefore=0;
  try {
    if((source.provider==='github-projects'&&source.creatorIdentity?.provider==='github')||source.githubRepositoryId||source.githubOwnerId){
      const address=source.provider==='github-projects'?`https://api.github.com/users/${new URL(source.url).pathname.split('/')[1]}`:`https://api.github.com/repos${new URL(source.url).pathname}`;
      if(signal?.aborted)throw new Error('GitHub identity check cancelled.');
      const response=await fetcher(address,{headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Noxviola-Follows'},credentials:'omit',redirect:'error',signal});
      const timing=serverTiming(response,now());githubNotBefore=Math.max(githubNotBefore,timing.githubNotBefore);notBefore=Math.max(notBefore,timing.notBefore);
      if(!response.ok)throw Object.assign(new Error(`GitHub identity check returned HTTP ${response.status}; saved account and project bindings retained.`),{retryAt:Math.max(githubNotBefore,[403,429].includes(response.status)?now()+INTERVAL:0)});
      const data=await response.json();
      if(source.provider==='github-projects'?String(data.id)!==source.creatorIdentity.accountId:(source.githubRepositoryId&&String(data.id)!==source.githubRepositoryId)||(source.githubOwnerId&&String(data.owner?.id)!==source.githubOwnerId))throw new Error('GitHub account or repository identity changed at this address. Review its original binding before collecting new updates.');
      if(signal?.aborted)throw new Error('GitHub identity check cancelled.');
    }
    for(const first of endpoints){
    let next=first;const visited=new Set();const tags=new URL(first).pathname.endsWith('/tags');
    while(next){
      next=endpointOK(next,first);if(visited.has(next))throw new Error('Source repeated a pagination cursor; last good results retained.');visited.add(next);
      if(githubNotBefore>now()){const error=new Error('Provider requested a pause before collection completed; last-good data retained.');error.retryAt=githubNotBefore;throw error;}
      const prior=source.cache[next];const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Noxviola-Follows'};
      if(prior?.etag)headers['If-None-Match']=prior.etag;
      const response=await fetcher(next,{headers,redirect:'error',credentials:'omit',signal});
      const timing=serverTiming(response,now());notBefore=Math.max(notBefore,timing.notBefore);githubNotBefore=Math.max(githubNotBefore,timing.githubNotBefore);
      let page;
      if(response.status===304){if(!prior)throw new Error('Source returned an uncached page.');page=clone(prior);}
      else {
        if(!response.ok){const error=new Error(response.status===403||response.status===429?'Source access or rate limit blocked this check. Saved updates are retained.':`Source returned HTTP ${response.status}; saved updates are retained.`);error.retryAt=Math.max(githubNotBefore,[403,429].includes(response.status)?now()+INTERVAL:0);throw error;}
        const rows=await response.json();if(!Array.isArray(rows))throw new Error('Source did not return an update list.');
        const link=response.headers.get('link')||''; const nextLink=link.split(',').map(p=>p.match(/<([^>]+)>;\s*rel="next"/)).find(Boolean)?.[1]||null;
        page={etag:response.headers.get('etag')||null,next:nextLink,items:rows.map(row=>{
          if(tags){
            if(typeof row.name!=='string'||!row.name||!row.commit||typeof row.commit.sha!=='string'||!/^[a-f0-9]{40,64}$/i.test(row.commit.sha))throw new Error('Source returned an invalid tag.');
            return {id:`tag:${row.name}`,title:`Tag ${row.name}`,url:`${source.url}/tree/${encodeURIComponent(row.name)}`,publishedAt:'',kind:'tag',commit:row.commit.sha,fingerprint:crypto.createHash('sha256').update(JSON.stringify([row.name,row.commit.sha])).digest('hex')};
          }
          if(!Number.isSafeInteger(row.id)||typeof row.html_url!=='string')throw new Error('Source returned an invalid update.');
          if(source.provider==='github-projects'&&source.creatorIdentity?.provider==='github'&&String(row.owner?.id)!==source.creatorIdentity.accountId)throw new Error('GitHub returned a repository owned by a different account; no partial creator snapshot saved.');
          const target=new URL(row.html_url);if(target.protocol!=='https:'||target.hostname!=='github.com'||target.username||target.password)throw new Error('Source returned an unexpected update address.');
          const release=source.provider==='github-releases';const title=release?(row.name||row.tag_name):row.full_name;
          const publishedAt=(release?(row.published_at||row.created_at):(row.pushed_at||row.updated_at))||'';
          if(typeof title!=='string'||!title.trim()||typeof publishedAt!=='string')throw new Error('Source returned incomplete update metadata.');
          return {id:String(row.id),title,url:target.href,publishedAt,kind:release?'release':'repository',fingerprint:crypto.createHash('sha256').update(JSON.stringify([title,target.href,publishedAt,release?row.body:row.description,release?row.tag_name:row.default_branch])).digest('hex')};
        })};
      }
      cache[next]=page;items.push(...page.items);next=page.next;
    }
  }
  if(new Set(items.map(i=>i.id)).size!==items.length)throw new Error('Source changed during pagination; retry for a consistent result.');
  return {cache,items,notBefore,githubNotBefore};
  }catch(error){error.sourceNotBefore=Math.max(error.sourceNotBefore||0,notBefore);error.retryAt=Math.max(error.retryAt||0,githubNotBefore);throw error;}
}
class FollowService extends ServiceStore {
  constructor(options={}) {super({...options,name:'Following',decode,empty});this.collect=options.collect||((source,options)=>source.provider==='modrinth-versions'?modrinth.modrinthCollect(source,options):source.provider==='modrinth-author'?discovery.collectAuthor(source,options):source.provider==='modhold-author'?this._collectModholdAuthor(source,options):source.provider==='modhold-project'?modhold.collect(source,options):githubCollect(source,options));this.pending=new Map();this.creatorPending=new Map();this.collectCreatorStatus=options.collectCreatorStatus||nexusStatus.collect;this.discoverCreator=options.discoverCreator||discovery.discover;this.collectModholdCatalog=options.collectModholdCatalog||modhold.collectCatalog;this.networkTail=Promise.resolve();}
  async _collectModholdAuthor(source,options){
    this.modholdCatalogSnapshots ||= new Map();let snapshot=this.modholdCatalogSnapshots.get(source.identity);
    if(options.freshCatalog||!snapshot||snapshot.catalogObservedAt+INTERVAL<=this._time()){
      snapshot=await this.collectModholdCatalog(options);if(options.signal?.aborted)throw new Error('ModHold catalog check cancelled.');this.modholdCatalogSnapshots.set(source.identity,snapshot);
    }
    return modhold.forAuthor(snapshot,source);
  }
  list(owner) {
    this._identity(owner);const registry=this._registry(owner),sources=this._document.sources.filter(s=>s.identity===owner),tracking=new Map(sources.filter(s=>s.migration?.state==='tracking').map(s=>[s.migration.migrationId,s])),canonicalRecords=sources.flatMap(source=>source.transitions||[]);
    return clone(sources.map(s=>{const {cache,transitions:storedTransitions,...view}=s;const continuityNotices=continuity.notices(s,registry,this._time()).map(notice=>({...notice,latestStatus:this._creatorObservation(owner,notice.author),statusSupported:this._statusSupported(notice.author),statusBusy:this.creatorPending.has(`${owner}:${notice.author.id}`),migrations:notice.migrations.map(row=>({...row,hold:continuity.trackingHold(row,notice.author,canonicalRecords,this._time()),trackingSourceId:tracking.get(row.id)?.id||null,trackingPaused:!!tracking.get(row.id)?.paused}))}));return {...view,transitionNotices:transitions.notices(storedTransitions,Math.floor(this._time()/1000)),continuityNotices,adapterAvailable:s.provider==='manual'&&['modrinth-versions','modrinth-author','modhold-project','modhold-author'].includes(sourceFor(s.url).provider),busy:this.pending.has(s.id),providerNotBefore:Math.max(s.notBefore||0,this._document[this._cooldownField(s)]||0),...(s.provider==='modrinth-versions'?{matchingVersionIds:s.items.filter(item=>modrinth.matchesVersion(item,s.compatibility)).map(item=>item.id)}:{}),coverage:s.provider==='modrinth-author'?'Public projects credited to this stable Modrinth account. Individual downloaded project versions are tracked separately. Team membership and version publishing are displayed as provider roles.':s.provider==='modhold-author'?'Public catalog projects matching this ModHold handle; not all author posts, files or cross-site identities. Missing data does not verify a ban, relocation or its cause.':s.provider==='modhold-project'?'Public ModHold page and current file metadata, observed periodically. File versions and SHA-256 values are retained without downloading files. Provider dates retain their reported timezone. Updates do not establish install compatibility. Missing data does not verify a ban, relocation or its cause.':s.provider==='modrinth-versions'?'Public version metadata only. Loader and game-version declarations must match the same version; this does not verify dependencies, environment or runtime compatibility. Changelogs/assets are not downloaded.':s.provider==='manual'?(curseforge.projectURL(s.url)?'CurseForge reference only. Automatic file tracking requires an authorized API key and a reviewed credential integration; neither is configured. Open the source to check. File names and provider release labels are separate, not maturity guarantees.':'Manual reference; not automatically checked.'):s.provider==='github-releases'?'Public releases and current tags, not a complete change history. Changes created and deleted between checks may be missed.':'Current public owned repositories, not an events stream or every creator publication. Intermediate changes may be missed.',freshness:s.provider==='manual'?'manual':s.error?'failed':!s.lastSuccess?'unchecked':this._time()>=s.nextCheck?'overdue':'checked'};}));
  }
  _registry(owner){const overlay=this._document.creatorRegistries?.find(row=>row.identity===owner)?.registry;this._registryCache ||= new Map();let cached=this._registryCache.get(owner);if(!cached||cached.overlay!==overlay){cached={overlay,index:continuity.index(overlay)};this._registryCache.set(owner,cached);}return cached.index;}
  _creatorObservation(owner,author){const record=this._document.creatorStatus?.find(row=>row.identity===owner&&row.authorId===author.id);return record?.evidenceUrl.toLowerCase()===author.source.profileUrl.toLowerCase()&&(!author.source.accountId||!record.providerAuthorId||author.source.accountId===record.providerAuthorId)?clone(record):null;}
  _statusSupported(author){try{nexusStatus.profileURL(author);return true;}catch{return false;}}
  async refreshCreatorStatus(owner,id,authorId){
    const source=this.get(owner,id);if(source.paused||source.archived)throw new Error('Resume this source before checking its author.');const registry=this._registry(owner),notice=continuity.notices(source,registry,this._time()).find(row=>row.author.id===authorId);if(!notice||!this._statusSupported(notice.author))throw new Error('No supported author evidence belongs to this source.');
    const author=notice.author,key=`${owner}:${authorId}`,identityToken=JSON.stringify(author),now=this._time(),prior=this._creatorObservation(owner,author),pause=this._document.nexusNotBefore||0;
    if(pause>now)throw new Error(`Author status check paused until ${new Date(pause).toISOString()}.`);if(this.creatorPending.has(key))return;
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort('timeout'),30000);timeout.unref?.();this.creatorPending.set(key,{controller,sourceId:id,identity:owner});this._emit({type:'creator-status-start'});
    let releaseNetwork;try{const previous=this.networkTail;this.networkTail=new Promise(resolve=>{releaseNetwork=resolve;});await previous;if(controller.signal.aborted)throw new Error('Check cancelled.');if((this._document.nexusNotBefore||0)>this._time())throw new Error('Nexus requested a pause before this queued check.');const result=await this.collectCreatorStatus(author,{signal:controller.signal,now:this.now,prior});if(controller.signal.reason==='timeout')throw new Error('Author status check timed out.');if(controller.signal.aborted||this._disposed)return;if(JSON.stringify(this._registry(owner).authors.get(authorId))!==identityToken)throw new Error('Author evidence changed during the check; review the latest source.');const current=this.get(owner,id);if(current.paused||current.archived)return;const observedAt=this._time();const history=prior?.history||[],changed=prior?.lastSuccess&&prior.state!==result.state;const entry={...result,history:changed?[...history,{state:prior.state,observedAt:prior.observedAt,evidenceUrl:prior.evidenceUrl,providerAuthorId:prior.providerAuthorId,summary:prior.summary}]:history,identity:owner,authorId,error:'',lastAttempt:observedAt,lastSuccess:observedAt,nextCheck:Math.max(observedAt+INTERVAL,result.notBefore||0)};this._commit({...this._document,nexusNotBefore:Math.max(this._document.nexusNotBefore||0,result.notBefore||0),creatorStatus:[...(this._document.creatorStatus||[]).filter(row=>row.identity!==owner||row.authorId!==authorId),entry]},[{type:'creator-status-observed',identity:owner,authorName:author.name,newBan:result.state==='banned'&&prior?.state!=='banned'}]);}
    catch(error){if(!this._disposed&&(!controller.signal.aborted||controller.signal.reason==='timeout')){const attempted=this._time(),entry={...(prior||{state:'unknown',observedAt:0,lastSuccess:0,evidenceUrl:author.source.profileUrl}),identity:owner,authorId,lastAttempt:attempted,nextCheck:Math.max(attempted+INTERVAL,error.retryAt||0),error:controller.signal.reason==='timeout'?'Author status check timed out; previous evidence retained.':error.message};this._commit({...this._document,nexusNotBefore:Math.max(this._document.nexusNotBefore||0,error.retryAt||0),creatorStatus:[...(this._document.creatorStatus||[]).filter(row=>row.identity!==owner||row.authorId!==authorId),entry]},[{type:'creator-status-failed'}]);}}
    finally{releaseNetwork?.();clearTimeout(timeout);this.creatorPending.delete(key);if(!this._disposed)this._emit({type:'creator-status-end'});}
  }
  registryInfo(owner){this._identity(owner);const entry=this._document.creatorRegistries?.find(row=>row.identity===owner);return entry?{revision:entry.registry.revision,authors:entry.registry.authors.length,migrations:entry.registry.migrations.length}:null;}
  importRegistry(owner,input){this._identity(owner);const registry=continuity.parse(input);for(const pending of this.creatorPending.values())if(pending.identity===owner)pending.controller.abort('registry');this._commit({...this._document,creatorRegistries:[...(this._document.creatorRegistries||[]).filter(row=>row.identity!==owner),{identity:owner,registry}]},[{type:'creator-registry-imported'}]);return this.registryInfo(owner);}
  migrationHold(owner,id){this._identity(owner);const registry=this._registry(owner),candidate=registry.migrations.get(id);if(!candidate)return 'Migration evidence is no longer available; review the saved decision.';return continuity.trackingHold(candidate,registry.authors.get(candidate.authorId),this._document.sources.filter(source=>source.identity===owner).flatMap(source=>source.transitions||[]),this._time());}
  acceptMigration(owner,id,input){
    this._identity(owner);record(input);if(input.reviewed!==true)throw new Error('Review the exact mod, author, game, variant and requirements before following the new source.');
    const source=this.get(owner,id),registry=this._registry(owner),candidate=registry.migrations.get(input.migrationId),author=candidate&&registry.authors.get(candidate.authorId);
    if(!candidate||input.token!==continuity.token(candidate,author)||!continuity.notices(source,registry,this._time()).some(row=>row.migrations.some(m=>m.id===candidate.id)))throw new Error('The migration evidence changed or does not match this source. Review the current card.');
    const hold=this.migrationHold(owner,candidate.id);if(hold)throw new Error(hold);
    const parsed=sourceFor(candidate.to.url);if(parsed.provider==='manual')throw new Error('This destination has no automatic update adapter. Open its source for manual review.');
    const destinationAuthor=author.destinations.find(row=>row.provider===candidate.to.provider&&new URL(row.profileUrl).origin===new URL(candidate.to.url).origin);
    const prior=this._document.sources.find(row=>row.identity===owner&&(modholdProject.projectKey(row.url)||row.url)===(modholdProject.projectKey(parsed.url)||parsed.url));
    const active=this._document.sources.find(row=>row.identity===owner&&row.migration?.state==='tracking'&&row.migration.migrationId===candidate.id);if(active&&active.id!==prior?.id)throw new Error('The destination changed since tracking started. Undo the previous migration before following the new destination.');
    if(prior?.migration?.state==='tracking'){if(prior.migration.migrationId!==candidate.id)throw new Error('This destination has another active migration. Undo that decision before changing its original source.');return clone(prior);}
    if(prior?.modholdAuthor&&prior.modholdAuthor!==destinationAuthor.handle)throw new Error('The saved destination has a different author identity. Review the source.');
    const now=this._time(),next=prior?clone(prior):{id:crypto.randomUUID(),identity:owner,url:parsed.url,provider:parsed.provider,kind:'project',name:candidate.title,createdAt:now,lastAttempt:0,lastSuccess:0,nextCheck:0,error:'',items:[],cache:{}};
    const previous={paused:!!next.paused,automatic:!!next.automatic,archived:!!next.archived};
    next.migration={migrationId:candidate.id,token:input.token,originalUrl:candidate.from.url,originalSourceId:source.id,authorId:author.id,authorHandle:destinationAuthor.handle,registryRevision:candidate.registryRevision,evidenceUrls:[...candidate.evidenceUrls],acceptedAt:now,state:'tracking',createdDestination:!prior||prior.migration?.createdDestination===true,previous};
    if(parsed.provider==='modhold-project')next.modholdAuthor=destinationAuthor.handle;
    Object.assign(next,{automatic:true,paused:false,archived:false});
    this.pending.get(next.id)?.abort('migration');
    this._commit({...this._document,sources:prior?this._document.sources.map(row=>row.id===next.id?next:row):[...this._document.sources,next]},[{type:'migration-accepted'}]);return clone(next);
  }
  undoMigration(owner,id){const source=this.get(owner,id);if(source.migration?.state!=='tracking')throw new Error('No active migration decision on this source.');this.pending.get(id)?.abort('migration');const decision=source.migration;Object.assign(source,decision.createdDestination?{archived:true,paused:true,automatic:false}:decision.previous);source.migration={...decision,state:'revoked',revokedAt:this._time()};this._replace(source);return source;}
  evidenceAddress(owner,id,address){const source=this.get(owner,id),allowed=new Set(source.migration?.evidenceUrls||[]);if(source.migration)allowed.add(source.migration.originalUrl);for(const notice of continuity.notices(source,this._registry(owner),this._time())){allowed.add(notice.author.source.profileUrl);allowed.add(notice.author.status.evidenceUrl);for(const dest of notice.author.destinations){allowed.add(dest.profileUrl);allowed.add(dest.identityEvidence.url);allowed.add(dest.identityEvidence.targetUrl);}for(const migration of notice.migrations){allowed.add(migration.from.url);allowed.add(migration.to.url);migration.evidenceUrls.forEach(url=>allowed.add(url));}}if(!allowed.has(address))throw new Error('This address is not part of the displayed source evidence.');return {identity:owner,url:continuity.publicURL(address)};}
  get(owner,id){this._identity(owner);const source=this._document.sources.find(s=>s.identity===owner&&s.id===id);if(!source)throw new Error('Follow source not found in this identity.');return clone(source);}
  add(owner,input){
    this._identity(owner);record(input);const parsed=sourceFor(input.url);text(input.name);if(!input.name.trim())throw new Error('Name this creator or project.');
    if(this._document.sources.some(s=>s.identity===owner&&(modholdProject.projectKey(s.url)||s.url)===(modholdProject.projectKey(parsed.url)||parsed.url)))throw new Error('Already following this source.');
    const source={id:crypto.randomUUID(),identity:owner,url:parsed.url,provider:parsed.provider,kind:['creator','project'].includes(input.kind)?input.kind:parsed.kind,name:input.name.trim(),...(parsed.provider==='modrinth-versions'?{compatibility:modrinth.compatibility(input.compatibility)}:{}),paused:false,automatic:input.automatic===true&&parsed.provider!=='manual',createdAt:this._time(),lastAttempt:0,lastSuccess:0,nextCheck:0,error:'',items:[],cache:{}};
    this._commit({...this._document,sources:[...this._document.sources,source]},[{type:'follow-added'}]);return source;
  }
  change(owner,id,patch){
    const source=this.get(owner,id);record(patch);if(Object.keys(patch).some(k=>!['paused','automatic','read','compatibility','enableAdapter','archived','creatorAutomatic','transition'].includes(k)))throw new Error('Unsupported follow change.');
    for(const key of Object.keys(patch))if(!['compatibility','transition'].includes(key)&&typeof patch[key]!=='boolean')throw new Error('Follow setting must be boolean.');
    if(patch.transition!==undefined){const r=transitions.validate(patch.transition);if(!transitions.related(r,source))throw new Error('Transition does not describe this saved source.');if(r.observed_unix>Math.floor(this._time()/1000))throw new Error('Transition observation is in the future.');const prior=(source.transitions||[]).filter(x=>x.id===r.id).at(-1);if(prior&&(prior.creator_id!==r.creator_id||transitions.address(prior.source_account)!==transitions.address(r.source_account)))throw new Error('Transition identity changed under the same record ID.');if(prior&&r.observed_unix<prior.observed_unix)throw new Error('Older transition cannot replace a newer observation.');if(!prior||JSON.stringify(prior)!==JSON.stringify(r))source.transitions=[...(source.transitions||[]),clone(r)];}
    if(source.migration?.state==='tracking'&&(patch.paused===false||patch.automatic===true||patch.archived===false)){const hold=this.migrationHold(owner,source.migration.migrationId);if(hold)throw new Error(hold);}
    if(patch.enableAdapter){const adapter=sourceFor(source.url);if(source.provider!=='manual'||!['modrinth-versions','modrinth-author','modhold-project','modhold-author'].includes(adapter.provider))throw new Error('No new adapter available for this source.');source.provider=adapter.provider;source.url=adapter.url;if(adapter.provider==='modrinth-versions')source.compatibility=modrinth.compatibility();source.kind=adapter.kind;}
    if(patch.compatibility!==undefined){if(source.provider!=='modrinth-versions')throw new Error('Compatibility filters require Modrinth versions.');source.compatibility=modrinth.compatibility(patch.compatibility);}
    if(source.provider==='manual'&&patch.automatic)throw new Error('No automatic adapter for this source.');
    if(patch.creatorAutomatic&&!continuity.notices(source,this._registry(owner),this._time()).some(n=>this._statusSupported(n.author)))throw new Error('No live author-status adapter is available for this source.');
    for(const pending of this.creatorPending.values())if(pending.sourceId===id)pending.controller.abort('settings');
    this.pending.get(id)?.abort('settings');
    const {read,compatibility,enableAdapter,transition,...settings}=patch;Object.assign(source,settings);if(patch.archived)source.paused=true;if(source.archived&&patch.paused===false)throw new Error('Restore this archived source before resuming it.');if(read!==undefined)source.items=source.items.map(i=>({...i,read}));
    this._replace(source);return source;
  }
  _cooldownField(source){return source.provider.startsWith('modrinth-')?'modrinthNotBefore':source.provider.startsWith('modhold-')?'modholdNotBefore':'githubNotBefore';}
  _replace(source,notBefore=this._document[this._cooldownField(source)]||0){this._commit({...this._document,[this._cooldownField(source)]:notBefore,sources:this._document.sources.map(s=>s.id===source.id?source:s)},[{type:'follow-updated'}]);}
  async _collectQueued(source,signal,acquired,options={}){
    const previous=this.networkTail;let release;this.networkTail=new Promise(resolve=>release=resolve);
    await previous;acquired(release);
    {if(signal.aborted)throw new Error('Check cancelled.');const sourceNotBefore=this.get(source.identity,source.id).notBefore||0,globalNotBefore=this._document[this._cooldownField(source)]||0,notBefore=Math.max(sourceNotBefore,globalNotBefore);if(notBefore>this._time()){const error=new Error(`Provider polling pause until ${new Date(notBefore).toISOString()}.`);error.retryAt=globalNotBefore;error.sourceNotBefore=sourceNotBefore;throw error;}return await this.collect(source,{...options,signal,now:this.now});}
  }
  async refresh(owner,id,options={}){
    const source=this.get(owner,id);if(source.paused)throw new Error('Resume this follow before checking.');if(this.pending.has(id))return;
    if(source.provider==='manual')throw new Error('Manual source: open it to check. No automatic adapter is installed.');
    const controller=new AbortController();this.pending.set(id,controller);this._emit({type:'refresh-start'});
    let releaseNetwork;
    const timeout=setTimeout(()=>controller.abort('timeout'),60000);timeout.unref?.();
    try {
      const result=await this._collectQueued(source,controller.signal,release=>{releaseNetwork=release;},options);if(controller.signal.reason==='timeout')throw new Error('Source check timed out.');if(controller.signal.aborted||this._disposed)return;
      const current=this.get(owner,id),now=this._time(),items=new Map(current.items.map(i=>[i.id,{...i,presentInLastSnapshot:false}]));
      for(const row of result.items){const old=items.get(row.id),revisions=old?.revisions||[];const changed=old&&old.fingerprint!==row.fingerprint;items.set(row.id,{...row,revisions:changed?[...revisions,{observedAt:old.observedAt,supersededAt:now,metadata:revisionMetadata(old)}]:revisions,presentInLastSnapshot:true,lastSeenAt:now,observedAt:old?.fingerprint===row.fingerprint?old.observedAt:now,read:old?.fingerprint===row.fingerprint?old.read:false});}
      this._replace({...current,items:[...items.values()],cache:result.cache,...(result.modrinthProjectId?{modrinthProjectId:result.modrinthProjectId}:{}),...(result.modholdAuthor?{modholdAuthor:result.modholdAuthor}:{}),...(result.modrinthAuthorId?{modrinthAuthorId:result.modrinthAuthorId}:{}),...(result.catalogObservedAt!==undefined?{catalogObservedAt:result.catalogObservedAt}:{}),lastAttempt:now,lastSuccess:now,notBefore:result.notBefore||0,nextCheck:Math.max((result.catalogObservedAt??now)+INTERVAL,result.notBefore||0,result.providerNotBefore||result.githubNotBefore||0),error:''},Math.max(this._document[this._cooldownField(current)]||0,result.providerNotBefore||result.githubNotBefore||0));
    }catch(error){if(!this._disposed&&(!controller.signal.aborted||controller.signal.reason==='timeout')){const current=this.get(owner,id),now=this._time();this._replace({...current,lastAttempt:now,notBefore:Math.max(current.notBefore||0,error.sourceNotBefore||0),nextCheck:Math.max(now+INTERVAL,error.retryAt||0,error.sourceNotBefore||0),error:controller.signal.reason==='timeout'?'Source check timed out; saved updates retained.':error.message},Math.max(this._document[this._cooldownField(current)]||0,error.retryAt||0));}else if(!this._disposed&&this.pending.get(id)===controller){/* Cancelled settings changes preserve the last good checkpoint. */}}
    finally{releaseNetwork?.();clearTimeout(timeout);this.pending.delete(id);if(!this._disposed)this._emit({type:'refresh-end'});}
  }
  async tick(){this._ready();if(this.ticking)return;this.ticking=true;try{
    for(const id of this._document.sources.map(s=>s.id)){
      let source=this._document.sources.find(row=>row.id===id);
      if(source&&source.automatic&&!source.paused&&source.nextCheck<=this._time()&&(this._document[this._cooldownField(source)]||0)<=this._time())await this.refresh(source.identity,source.id);
      source=this._document.sources.find(row=>row.id===id);
      if(source&&source.creatorAutomatic&&!source.paused&&!source.archived)for(const notice of continuity.notices(source,this._registry(source.identity),this._time())){
        if(this._statusSupported(notice.author)&&(this._creatorObservation(source.identity,notice.author)?.nextCheck||0)<=this._time()&&(this._document.nexusNotBefore||0)<=this._time())await this.refreshCreatorStatus(source.identity,source.id,notice.author.id);
      }
    }
  }finally{this.ticking=false;}}
  dispose(){this.disposeCreatorDiscovery();this.modholdCatalogSnapshots?.clear();for(const pending of this.creatorPending.values())pending.controller.abort();for(const controller of this.pending.values())controller.abort();super.dispose();}
}
Object.assign(FollowService.prototype,creatorFollowing.methods({sourceFor}));
module.exports={FollowService,decode,sourceFor,githubCollect,INTERVAL,serverTiming};
