'use strict';
// Browser-owned, credential-free collection. No Athena service or website cookies.
const crypto = require('node:crypto');
const {ServiceStore, clone, record, identity, text, timestamp, url} = require('./service-store.cjs');
const modrinth=require('./modrinth-follow.cjs');
const curseforge=require('./curseforge-follow.cjs');
const INTERVAL = 60 * 60 * 1000;
function sourceFor(value) {
  const address = new URL(url(value));
  if (address.protocol !== 'https:') throw new Error('Follow sources require HTTPS.');
  const parts = address.pathname.split('/').filter(Boolean);
  if (address.origin === 'https://github.com' && parts.length >= 1 && parts.length <= 2 && parts.every(p => /^[a-zA-Z0-9_.-]+$/.test(p))) {
    const owner = parts[0].toLowerCase(), repo = parts[1]?.replace(/\.git$/, '').toLowerCase();
    return {url:`https://github.com/${owner}${repo?`/${repo}`:''}`,kind:repo?'project':'creator',provider:repo?'github-releases':'github-projects',endpoint:repo?`https://api.github.com/repos/${owner}/${repo}/releases?per_page=100`:`https://api.github.com/users/${owner}/repos?per_page=100&type=owner&sort=updated`};
  }
  return modrinth.projectSource(address.href)||{url:address.href,kind:'project',provider:'manual',endpoint:null};
}
function endpointsFor(source){if(source.provider==='manual')return [];if(source.provider==='modrinth-versions')return [modrinth.versionEndpoint(source)];const first=sourceFor(source.url).endpoint;return !first?[]:source.provider==='github-releases'?[first,first.replace('/releases?', '/tags?')]:[first];}
const REVISION_FIELDS=['title','url','publishedAt','fingerprint','kind','commit','versionNumber','loaders','gameVersions','releaseType'];
function revisionMetadata(item){return Object.fromEntries(REVISION_FIELDS.filter(key=>item[key]!==undefined).map(key=>[key,clone(item[key])]));}
function validateRevision(revision){
 record(revision);timestamp(revision.observedAt);timestamp(revision.supersededAt);record(revision.metadata);
 if(Object.keys(revision.metadata).some(key=>!REVISION_FIELDS.includes(key)))throw new Error('Unsupported follow revision metadata.');
 for(const key of ['title','publishedAt','fingerprint'])text(revision.metadata[key]);url(revision.metadata.url);
 for(const key of REVISION_FIELDS.filter(key=>!['loaders','gameVersions'].includes(key)))if(revision.metadata[key]!==undefined)text(revision.metadata[key]);
 for(const key of ['loaders','gameVersions'])if(revision.metadata[key]!==undefined&&(!Array.isArray(revision.metadata[key])||revision.metadata[key].some(value=>typeof value!=='string')))throw new Error('Invalid follow revision declarations.');
}
const empty = () => ({version:1,sources:[]});
function decode(value) {
  record(value); if(value.version!==1 || !Array.isArray(value.sources))throw new Error('Unsupported follow document; original data preserved.');
  for(const field of ['githubNotBefore','modrinthNotBefore'])if(value[field]!==undefined)timestamp(value[field]);
  const seen=new Set(), sourceIds=new Set();
  for(const s of value.sources){
    record(s); identity(s.identity); text(s.id); if(sourceIds.has(s.id))throw new Error('Duplicate follow source ID.');sourceIds.add(s.id); text(s.name); const expected=s.provider==='manual'?{url:url(s.url),provider:'manual',endpoint:null}:sourceFor(s.url);if(new URL(s.url).protocol!=='https:')throw new Error('Follow sources require HTTPS.');
    if(!s.id||!s.name.trim()||!['creator','project'].includes(s.kind)||s.provider!==expected.provider||s.url!==expected.url)throw new Error('Invalid follow source.');
    const key=`${s.identity}:${s.url}`;if(seen.has(key))throw new Error('Duplicate follow source.');seen.add(key);
    if(typeof s.paused!=='boolean'||typeof s.automatic!=='boolean'||!Array.isArray(s.items))throw new Error('Invalid follow settings.');
    if(s.provider==='manual'&&s.automatic)throw new Error('This source has no automatic adapter.');
    for(const field of ['createdAt','lastAttempt','lastSuccess','nextCheck'])timestamp(s[field]);
    if(s.notBefore!==undefined)timestamp(s.notBefore);if(s.provider==='modrinth-versions'){modrinth.versionEndpoint(s);if(s.compatibility!==undefined)modrinth.compatibility(s.compatibility);}
    text(s.error);record(s.cache);const ids=new Set();
    for(const [address,page] of Object.entries(s.cache)){
      if(!expected.endpoint)throw new Error('Manual source cannot contain collection cache.');const first=endpointsFor(s).find(endpoint=>new URL(endpoint).pathname===new URL(address).pathname);if(!first)throw new Error('Unexpected cached endpoint.');endpointOK(address,first);record(page);
      if(page.etag!==null)text(page.etag);if(page.next!==null)endpointOK(page.next,first);
      if(!Array.isArray(page.items))throw new Error('Invalid follow cache.');
      for(const item of page.items){record(item);text(item.id);text(item.title);text(item.publishedAt);text(item.fingerprint);const target=new URL(url(item.url));if(target.protocol!=='https:'||target.hostname!==(s.provider==='modrinth-versions'?'modrinth.com':'github.com'))throw new Error('Invalid cached update address.');if(s.provider==='modrinth-versions')modrinth.versionFields(item);}
    }
    for(const item of s.items){record(item);if(item.revisions!==undefined){if(!Array.isArray(item.revisions))throw new Error('Invalid follow revision history.');item.revisions.forEach(validateRevision);}if(s.provider==='modrinth-versions')modrinth.versionFields(item);if(item.presentInLastSnapshot!==undefined&&typeof item.presentInLastSnapshot!=='boolean')throw new Error('Invalid snapshot presence.');if(item.lastSeenAt!==undefined)timestamp(item.lastSeenAt);text(item.id);text(item.title);url(item.url);timestamp(item.observedAt);text(item.publishedAt);text(item.fingerprint);if(typeof item.read!=='boolean'||ids.has(item.id))throw new Error('Invalid update item.');ids.add(item.id);}
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
  try { for(const first of endpoints){
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
  constructor(options={}) {super({...options,name:'Following',decode,empty});this.collect=options.collect||((source,options)=>source.provider==='modrinth-versions'?modrinth.modrinthCollect(source,options):githubCollect(source,options));this.pending=new Map();this.networkTail=Promise.resolve();}
  list(owner) {this._identity(owner);return clone(this._document.sources.filter(s=>s.identity===owner).map(s=>{const {cache,...view}=s;return {...view,adapterAvailable:s.provider==='manual'&&sourceFor(s.url).provider==='modrinth-versions',busy:this.pending.has(s.id),providerNotBefore:Math.max(s.notBefore||0,this._document[this._cooldownField(s)]||0),...(s.provider==='modrinth-versions'?{matchingVersionIds:s.items.filter(item=>modrinth.matchesVersion(item,s.compatibility)).map(item=>item.id)}:{}),coverage:s.provider==='modrinth-versions'?'Public version metadata only. Loader and game-version declarations must match the same version; this does not verify dependencies, environment or runtime compatibility. Changelogs/assets are not downloaded.':s.provider==='manual'?(curseforge.projectURL(s.url)?'CurseForge reference only. Automatic file tracking requires an authorized API key and a reviewed credential integration; neither is configured. Open the source to check. File names and provider release labels are separate, not maturity guarantees.':'Manual reference; not automatically checked.'):s.provider==='github-releases'?'Public releases and current tags, not a complete change history. Changes created and deleted between checks may be missed.':'Current public owned repositories, not an events stream or every creator publication. Intermediate changes may be missed.',freshness:s.provider==='manual'?'manual':s.error?'failed':!s.lastSuccess?'unchecked':this._time()>=s.nextCheck?'overdue':'checked'};}));}
  get(owner,id){this._identity(owner);const source=this._document.sources.find(s=>s.identity===owner&&s.id===id);if(!source)throw new Error('Follow source not found in this identity.');return clone(source);}
  add(owner,input){
    this._identity(owner);record(input);const parsed=sourceFor(input.url);text(input.name);if(!input.name.trim())throw new Error('Name this creator or project.');
    if(this._document.sources.some(s=>s.identity===owner&&s.url===parsed.url))throw new Error('Already following this source.');
    const source={id:crypto.randomUUID(),identity:owner,url:parsed.url,provider:parsed.provider,kind:['creator','project'].includes(input.kind)?input.kind:parsed.kind,name:input.name.trim(),...(parsed.provider==='modrinth-versions'?{compatibility:modrinth.compatibility(input.compatibility)}:{}),paused:false,automatic:input.automatic===true&&parsed.provider!=='manual',createdAt:this._time(),lastAttempt:0,lastSuccess:0,nextCheck:0,error:'',items:[],cache:{}};
    this._commit({...this._document,sources:[...this._document.sources,source]},[{type:'follow-added'}]);return source;
  }
  change(owner,id,patch){
    const source=this.get(owner,id);record(patch);if(Object.keys(patch).some(k=>!['paused','automatic','read','compatibility','enableAdapter'].includes(k)))throw new Error('Unsupported follow change.');
    for(const key of Object.keys(patch))if(key!=='compatibility'&&typeof patch[key]!=='boolean')throw new Error('Follow setting must be boolean.');
    if(patch.enableAdapter){const adapter=sourceFor(source.url);if(source.provider!=='manual'||adapter.provider!=='modrinth-versions')throw new Error('No new adapter available for this source.');source.provider=adapter.provider;source.url=adapter.url;source.compatibility=modrinth.compatibility();}
    if(patch.compatibility!==undefined){if(source.provider!=='modrinth-versions')throw new Error('Compatibility filters require Modrinth versions.');source.compatibility=modrinth.compatibility(patch.compatibility);}
    if(source.provider==='manual'&&patch.automatic)throw new Error('No automatic adapter for this source.');
    this.pending.get(id)?.abort('settings');
    const {read,compatibility,enableAdapter,...settings}=patch;Object.assign(source,settings);if(read!==undefined)source.items=source.items.map(i=>({...i,read}));
    this._replace(source);return source;
  }
  _cooldownField(source){return source.provider==='modrinth-versions'?'modrinthNotBefore':'githubNotBefore';}
  _replace(source,notBefore=this._document[this._cooldownField(source)]||0){this._commit({...this._document,[this._cooldownField(source)]:notBefore,sources:this._document.sources.map(s=>s.id===source.id?source:s)},[{type:'follow-updated'}]);}
  async _collectQueued(source,signal,acquired){
    const previous=this.networkTail;let release;this.networkTail=new Promise(resolve=>release=resolve);
    await previous;acquired(release);
    {if(signal.aborted)throw new Error('Check cancelled.');const sourceNotBefore=this.get(source.identity,source.id).notBefore||0,globalNotBefore=this._document[this._cooldownField(source)]||0,notBefore=Math.max(sourceNotBefore,globalNotBefore);if(notBefore>this._time()){const error=new Error(`Provider polling pause until ${new Date(notBefore).toISOString()}.`);error.retryAt=globalNotBefore;error.sourceNotBefore=sourceNotBefore;throw error;}return await this.collect(source,{signal,now:this.now});}
  }
  async refresh(owner,id){
    const source=this.get(owner,id);if(source.paused)throw new Error('Resume this follow before checking.');if(this.pending.has(id))return;
    if(source.provider==='manual')throw new Error('Manual source: open it to check. No automatic adapter is installed.');
    const controller=new AbortController();this.pending.set(id,controller);this._emit({type:'refresh-start'});
    let releaseNetwork;
    const timeout=setTimeout(()=>controller.abort('timeout'),60000);timeout.unref?.();
    try {
      const result=await this._collectQueued(source,controller.signal,release=>{releaseNetwork=release;});if(controller.signal.reason==='timeout')throw new Error('Source check timed out.');if(controller.signal.aborted||this._disposed)return;
      const current=this.get(owner,id),now=this._time(),items=new Map(current.items.map(i=>[i.id,{...i,presentInLastSnapshot:false}]));
      for(const row of result.items){const old=items.get(row.id),revisions=old?.revisions||[];const changed=old&&old.fingerprint!==row.fingerprint;items.set(row.id,{...row,revisions:changed?[...revisions,{observedAt:old.observedAt,supersededAt:now,metadata:revisionMetadata(old)}]:revisions,presentInLastSnapshot:true,lastSeenAt:now,observedAt:old?.fingerprint===row.fingerprint?old.observedAt:now,read:old?.fingerprint===row.fingerprint?old.read:false});}
      this._replace({...current,items:[...items.values()],cache:result.cache,...(result.modrinthProjectId?{modrinthProjectId:result.modrinthProjectId}:{}),lastAttempt:now,lastSuccess:now,notBefore:result.notBefore||0,nextCheck:Math.max(now+INTERVAL,result.notBefore||0,result.providerNotBefore||result.githubNotBefore||0),error:''},Math.max(this._document[this._cooldownField(current)]||0,result.providerNotBefore||result.githubNotBefore||0));
    }catch(error){if(!this._disposed&&(!controller.signal.aborted||controller.signal.reason==='timeout')){const current=this.get(owner,id),now=this._time();this._replace({...current,lastAttempt:now,notBefore:Math.max(current.notBefore||0,error.sourceNotBefore||0),nextCheck:Math.max(now+INTERVAL,error.retryAt||0,error.sourceNotBefore||0),error:controller.signal.reason==='timeout'?'Source check timed out; saved updates retained.':error.message},Math.max(this._document[this._cooldownField(current)]||0,error.retryAt||0));}else if(!this._disposed&&this.pending.get(id)===controller){/* Cancelled settings changes preserve the last good checkpoint. */}}
    finally{releaseNetwork?.();clearTimeout(timeout);this.pending.delete(id);if(!this._disposed)this._emit({type:'refresh-end'});}
  }
  async tick(){this._ready();if(this.ticking)return;this.ticking=true;try{for(const id of this._document.sources.map(s=>s.id)){const s=this._document.sources.find(row=>row.id===id);if(s&&s.automatic&&!s.paused&&s.nextCheck<=this._time()&&(this._document[this._cooldownField(s)]||0)<=this._time())await this.refresh(s.identity,s.id);}}finally{this.ticking=false;}}
  dispose(){for(const controller of this.pending.values())controller.abort();super.dispose();}
}
module.exports={FollowService,decode,sourceFor,githubCollect,INTERVAL,serverTiming};
