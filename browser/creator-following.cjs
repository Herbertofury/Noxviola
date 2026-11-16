'use strict';

const crypto=require('node:crypto');
const discovery=require('./creator-discovery.cjs');
const {record,identity,text,timestamp,integer,clone}=require('./service-store.cjs');

function validateProject(project) {
  record(project);for(const field of ['key','provider','projectId','url','name'])text(project[field]);
  const parsed=discovery.projectAddress(project.url);
  if(!parsed||parsed.provider!==project.provider||parsed.key!==project.key||!project.name.trim())throw new Error('Invalid discovered project identity.');
  if(project.modrinthProjectId!==undefined&&project.modrinthProjectId!==project.projectId)throw new Error('Invalid discovered Modrinth ID.');
  for(const field of ['githubRepositoryId','githubOwnerId'])if(project[field]!==undefined&&(project.provider!=='github'||typeof project[field]!=='string'||!/^[1-9][0-9]*$/.test(project[field])))throw new Error('Invalid discovered GitHub identity.');
}
function validate(document) {
  const unique=(rows,key,label)=>{if(!Array.isArray(rows))throw new Error(`Invalid ${label}.`);const seen=new Set();for(const row of rows){record(row);identity(row.identity);const id=key(row);if(seen.has(id))throw new Error(`Duplicate ${label}.`);seen.add(id);}};
  if(document.creatorPreferences!==undefined){unique(document.creatorPreferences,row=>row.identity,'creator preferences');for(const row of document.creatorPreferences){if(typeof row.autoFollowDownloads!=='boolean')throw new Error('Invalid automatic creator preference.');integer(row.generation);}}
  if(document.creatorTombstones!==undefined){unique(document.creatorTombstones,row=>`${row.identity}:${row.key}`,'creator unfollows');for(const row of document.creatorTombstones){text(row.key);timestamp(row.at);}}
  if(document.creatorDiscoveries!==undefined){unique(document.creatorDiscoveries,row=>`${row.identity}:${row.id}`,'creator discovery records');for(const row of document.creatorDiscoveries){
    for(const field of ['id','sourceId','title','downloadUrl','projectUrl','message','requestToken'])text(row[field]);
    if(!['download','project'].includes(row.kind)||!['review','followed','suppressed','dismissed'].includes(row.status))throw new Error('Invalid creator discovery state.');
    timestamp(row.createdAt);timestamp(row.updatedAt);record(row.provenance);
    if(typeof row.provenance.pageUrl!=='string'||!Array.isArray(row.provenance.urlChain))throw new Error('Invalid discovery provenance.');
    for(const value of [row.downloadUrl,row.projectUrl,row.provenance.pageUrl,...row.provenance.urlChain])if(value&&discovery.publicAddress(value)!==value)throw new Error('Discovery provenance may not contain credentials or signed queries.');
    if(row.result!==undefined){record(row.result);validateProject(row.result.project);if(!Array.isArray(row.result.creators)||!row.result.creators.length||typeof row.result.requiresChoice!=='boolean')throw new Error('Invalid creator candidates.');row.result.creators.forEach(discovery.validateCreator);}
  }}
  for(const source of document.sources){
    if(source.creatorIdentity!==undefined){discovery.validateCreator(source.creatorIdentity);if(source.kind!=='creator'||!source.provider.startsWith(source.creatorIdentity.provider+'-'))throw new Error('Creator identity belongs on its provider’s creator follow.');}
    if(source.creatorKeys!==undefined&&(!Array.isArray(source.creatorKeys)||source.creatorKeys.some(key=>typeof key!=='string'||!key)||new Set(source.creatorKeys).size!==source.creatorKeys.length))throw new Error('Invalid project creator links.');
    if(source.followUndo!==undefined){record(source.followUndo);for(const field of ['paused','automatic','archived'])if(typeof source.followUndo[field]!=='boolean')throw new Error('Invalid follow undo state.');}
  }
}
function compactResult(result) {
  const project=Object.fromEntries(['key','provider','projectId','url','name','modrinthProjectId','game','githubRepositoryId','githubOwnerId'].filter(key=>result.project[key]!==undefined).map(key=>[key,result.project[key]]));
  validateProject(project);result.creators.forEach(discovery.validateCreator);
  return {project,creators:clone(result.creators),requiresChoice:result.requiresChoice===true};
}
function bindDownloads(downloads,follows,onError=()=>{}) {
  const completed=download=>{Promise.resolve().then(()=>follows.discoverDownload(download)).catch(error=>onError({identity:download.identity,message:error.message}));};
  downloads.on('completed',completed);return ()=>downloads.removeListener('completed',completed);
}
function methods({sourceFor}) {
  return {
    creatorSettings(owner) {this._identity(owner);return clone(this._document.creatorPreferences?.find(row=>row.identity===owner)||{identity:owner,autoFollowDownloads:true,generation:0});},
    setCreatorSettings(owner,automatic) {
      const prior=this.creatorSettings(owner);if(typeof automatic!=='boolean')throw new Error('Automatic creator following must be on or off.');
      if(prior.autoFollowDownloads===automatic)return prior;
      const next={identity:owner,autoFollowDownloads:automatic,generation:prior.generation+1};
      for(const work of this.discoveryRequests?.values()||[])if(work.identity===owner)work.controller.abort('preference');
      this._commit({...this._document,creatorPreferences:[...(this._document.creatorPreferences||[]).filter(row=>row.identity!==owner),next]},[{type:'creator-preference-changed'}]);return clone(next);
    },
    _discoveryRow(owner,id) {this._identity(owner);const row=this._document.creatorDiscoveries?.find(row=>row.identity===owner&&row.id===id);if(!row)throw new Error('Discovery is not saved in this identity.');return clone(row);},
    _saveDiscovery(row,extra={}) {
      this._commit({...this._document,...extra,creatorDiscoveries:[...(this._document.creatorDiscoveries||[]).filter(value=>value.identity!==row.identity||value.id!==row.id),row]},[{type:'creator-discovery-changed',identity:row.identity}]);return clone(row);
    },
    async discoverDownload(download,{explicit=false}={}) {
      this._identity(download.identity);
      if(download.state!=='completed'||download.terminal!==true)return {status:'ignored'};
      if(!explicit&&!this.creatorSettings(download.identity).autoFollowDownloads)return {status:'disabled'};
      const id=`download:${download.id}`,prior=this._document.creatorDiscoveries?.find(row=>row.id===id&&row.identity===download.identity);
      if(prior)return clone(prior);
      const now=this._time(),row={id,identity:download.identity,kind:'download',sourceId:download.id,title:download.filename||'Completed download',downloadUrl:discovery.publicAddress(download.url),projectUrl:'',provenance:clone(download.provenance||{pageUrl:'',urlChain:[]}),createdAt:now,updatedAt:now,status:'review',message:'Looking up the completed file’s public creator metadata…',requestToken:''};
      this._saveDiscovery(row);return this.retryDiscovery(row.identity,row.id);
    },
    async discoverProject(owner,id) {
      const source=this.get(owner,id);if(source.kind!=='project'||source.archived)throw new Error('Choose an active saved project.');
      const key=`project:${id}`,prior=this._document.creatorDiscoveries?.find(row=>row.identity===owner&&row.id===key);if(prior?.status==='followed'||prior?.status==='suppressed'||prior?.status==='dismissed')return clone(prior);
      if(!prior){const now=this._time();this._saveDiscovery({id:key,identity:owner,kind:'project',sourceId:id,title:source.name,downloadUrl:'',projectUrl:discovery.publicAddress(source.url),provenance:{pageUrl:'',urlChain:[]},createdAt:now,updatedAt:now,status:'review',message:'Looking up this exact project’s creator…',requestToken:''});}
      return this.retryDiscovery(owner,key);
    },
    async _requestDiscovery(owner,input) {
      const target=discovery.requestIdentity(input),field=target.provider==='modhold'?'modholdNotBefore':target.provider==='modrinth'?'modrinthNotBefore':'githubNotBefore';
      const key=JSON.stringify([owner,target.key,target.origin,target.fileId||'',target.origin==='download'?target.chain:[]]);
      this.discoveryRequests ||= new Map();if(this.discoveryRequests.has(key))return this.discoveryRequests.get(key).promise;
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort('timeout'),30000);timeout.unref?.();
      const work={identity:owner,controller,promise:null};this.discoveryRequests.set(key,work);
      work.promise=(async()=>{let release;
        try {const previous=this.networkTail;this.networkTail=new Promise(resolve=>{release=resolve;});await previous;
          if(controller.signal.aborted)throw new Error('Creator discovery cancelled.');if((this._document[field]||0)>this._time())throw Object.assign(new Error('Provider checks are paused; retry after its current cooldown.'),{retryAt:this._document[field]});
          const result=await this.discoverCreator(input,{signal:controller.signal,now:this.now});
          if(controller.signal.aborted)throw new Error(controller.signal.reason==='timeout'?'Creator discovery timed out.':'Creator discovery cancelled.');
          return {result:compactResult(result),field,notBefore:result.notBefore||0};
        }catch(error){error.cooldownField=field;throw error;}
        finally{release?.();clearTimeout(timeout);this.discoveryRequests.delete(key);}
      })();return work.promise;
    },
    async retryDiscovery(owner,id,{projectUrl}={}) {
      const row=this._discoveryRow(owner,id);this.discoveryPending ||= new Map();const key=`${owner}:${id}`;if(this.discoveryPending.has(key))return this.discoveryPending.get(key);
      if(row.status==='dismissed')throw new Error('Restore the dismissed discovery before retrying.');
      if(projectUrl!==undefined){const target=discovery.projectAddress(projectUrl);if(!target)throw new Error('Enter an exact supported project page.');row.projectUrl=target.url;row.kind='project';row.manualProject=true;}
      row.requestToken=crypto.randomUUID();row.updatedAt=this._time();row.status='review';row.message='Checking exact public project and creator identities…';this._saveDiscovery(row);
      const generation=this.creatorSettings(owner).generation;
      const pending=(async()=>{
        try{const {result,field,notBefore}=await this._requestDiscovery(owner,row);
          if(this._disposed)return;const current=this._discoveryRow(owner,id);if(current.requestToken!==row.requestToken||current.status==='dismissed')return current;
          current.result=result;current.updatedAt=this._time();
          if(this.creatorSettings(owner).generation!==generation||!this.creatorSettings(owner).autoFollowDownloads||result.requiresChoice){current.message=result.requiresChoice?'This project has several credited team members. Choose the creator you want to follow.':'Creator found. Automatic following is off or changed during the lookup; choose Follow creator to continue.';return this._saveDiscovery(current,{[field]:Math.max(this._document[field]||0,notBefore)});}
          return this._applyDiscovery(current,result.creators[0].key,{[field]:Math.max(this._document[field]||0,notBefore)});
        }catch(error){if(this._disposed)return;const current=this._discoveryRow(owner,id);if(current.requestToken!==row.requestToken||current.status==='dismissed')return current;current.message=error.message;current.updatedAt=this._time();const extra=error.cooldownField?{[error.cooldownField]:Math.max(this._document[error.cooldownField]||0,error.retryAt||0)}:{};return this._saveDiscovery(current,extra);}
        finally{this.discoveryPending.delete(key);if(!this._disposed)this._emit({type:'creator-discovery-ended',identity:owner});}
      })();this.discoveryPending.set(key,pending);this._emit({type:'creator-discovery-started',identity:owner});return pending;
    },
    _applyDiscovery(row,creatorKey,extra={}) {
      const owner=row.identity,creator=row.result?.creators.find(value=>value.key===creatorKey);if(!creator)throw new Error('Choose a creator from this saved project’s verified provider metadata.');
      const project=row.result.project,canonical=sourceFor(project.url),creatorSource=sourceFor(creator.profileUrl),sources=clone(this._document.sources),owned=sources.filter(source=>source.identity===owner);
      const byCreator=owned.find(source=>source.creatorIdentity?.key===creator.key),byAddress=owned.find(source=>source.url===creatorSource.url),existingCreator=byCreator||byAddress;
      const existingProject=owned.find(source=>source.kind==='project'&&((!row.manualProject&&row.kind==='project'&&source.id===row.sourceId)||source.url===canonical.url||(project.provider==='modrinth'&&source.modrinthProjectId===project.projectId)||discovery.projectAddress(source.url)?.key===project.key));
      const tombstones=new Set((this._document.creatorTombstones||[]).filter(value=>value.identity===owner).map(value=>value.key));
      if([creator.key,`source:${creatorSource.url}`,`project:${project.key}`,`source:${canonical.url}`].some(key=>tombstones.has(key))||existingCreator?.archived||existingProject?.archived){row.status='suppressed';row.message='A saved unfollow or archive prevents re-adding this creator/project. Restore that follow explicitly to change this choice.';return this._saveDiscovery(row,extra);}
      if(existingCreator?.creatorIdentity&&existingCreator.creatorIdentity.key!==creator.key){row.message='This profile now identifies a different provider account. Review the saved creator identity before following.';return this._saveDiscovery(row,extra);}
      const create=(parsed,name,kind)=>({id:crypto.randomUUID(),identity:owner,url:parsed.url,provider:parsed.provider,kind,name,paused:false,automatic:parsed.provider!=='manual',archived:false,createdAt:this._time(),lastAttempt:0,lastSuccess:0,nextCheck:0,error:'',items:[],cache:{},followOrigin:row.kind==='download'?'completed-download':'project-discovery'});
      const author=existingCreator||create(creatorSource,creator.name,'creator');author.creatorIdentity=clone(creator);
      if(creator.provider==='modrinth')author.modrinthAuthorId=creator.accountId;
      const mod=existingProject||create(canonical,project.name,'project');mod.creatorKeys=[...new Set([...(mod.creatorKeys||[]),creator.key])];
      if(project.modrinthProjectId)mod.modrinthProjectId=project.modrinthProjectId;
      if(project.provider==='github'){
        for(const field of ['githubRepositoryId','githubOwnerId']){if(mod[field]&&mod[field]!==project[field]){row.message='The repository or owner now has a different stable GitHub identity. Review the saved source; its original binding was retained.';return this._saveDiscovery(row,extra);}mod[field]=project[field];}
      }
      if(project.provider==='modhold'){
        if(mod.modholdAuthor&&mod.modholdAuthor.toLowerCase()!==creator.handle.toLowerCase()){row.message='The project’s pinned author differs from the current public metadata. Review the original binding.';return this._saveDiscovery(row,extra);}
        mod.modholdAuthor=creator.handle;
      }
      if(!existingCreator)sources.push(author);if(!existingProject)sources.push(mod);
      row.status='followed';row.creatorSourceId=author.id;row.projectSourceId=mod.id;row.message=`Following ${creator.name} and ${project.name} locally. Existing pause and read choices were retained.`;row.updatedAt=this._time();
      return this._saveDiscovery(row,{...extra,sources});
    },
    chooseDiscovery(owner,id,creatorKey){const row=this._discoveryRow(owner,id);if(row.status==='dismissed')throw new Error('Restore this discovery before choosing a creator.');row.requestToken=crypto.randomUUID();return this._applyDiscovery(row,creatorKey);},
    dismissDiscovery(owner,id,dismiss=true){const row=this._discoveryRow(owner,id);if(typeof dismiss!=='boolean')throw new Error('Invalid review action.');row.status=dismiss?'dismissed':'review';row.requestToken=crypto.randomUUID();row.updatedAt=this._time();row.message=dismiss?'Dismissed. This download will not automatically add a follow.':'Restored for review. Retry discovery or choose a confirmed creator.';return this._saveDiscovery(row);},
    markFollowItem(owner,id,itemId,read){const source=this.get(owner,id);if(typeof read!=='boolean'||!source.items.some(item=>item.id===itemId))throw new Error('Saved update not found in this source.');source.items=source.items.map(item=>item.id===itemId?{...item,read}:item);this._replace(source);return source;} ,
    followCatalogProject(owner,id,itemId){
      const author=this.get(owner,id),item=author.items.find(row=>row.id===itemId&&row.presentInLastSnapshot!==false);
      if(author.kind!=='creator'||author.archived||!item||({ 'modhold-author':'modhold-project','modrinth-author':'modrinth-project','github-projects':'repository' }[author.provider])!==item.kind)throw new Error('Choose a current project from this saved creator catalog.');
      const project=discovery.projectAddress(item.url),parsed=sourceFor(item.url);if(!project||parsed.kind!=='project'||parsed.provider==='manual')throw new Error('This catalog project has no supported update adapter.');
      const existing=this._document.sources.find(row=>row.identity===owner&&row.kind==='project'&&(row.url===parsed.url||discovery.projectAddress(row.url)?.key===project.key||(project.provider==='modrinth'&&row.modrinthProjectId===project.projectId)));
      const keys=[`source:${parsed.url}`,`project:${project.key}`];if(existing?.archived||(this._document.creatorTombstones||[]).some(row=>row.identity===owner&&keys.includes(row.key)))throw new Error('This project was unfollowed or archived. Restore the saved follow explicitly.');
      const next=existing?clone(existing):{id:crypto.randomUUID(),identity:owner,url:parsed.url,provider:parsed.provider,kind:'project',name:item.title,paused:false,automatic:true,archived:false,createdAt:this._time(),lastAttempt:0,lastSuccess:0,nextCheck:0,error:'',items:[],cache:{},followOrigin:'creator-catalog'};
      next.creatorKeys=[...new Set([...(next.creatorKeys||[]),author.creatorIdentity?.key||`source:${author.url}`])];
      if(project.provider==='modrinth')next.modrinthProjectId=project.projectId;
      if(project.provider==='github'){
        if(next.githubRepositoryId&&next.githubRepositoryId!==item.id)throw new Error('The catalog now identifies a different repository. Review the original source.');next.githubRepositoryId=item.id;
        if(author.creatorIdentity?.provider==='github'){if(next.githubOwnerId&&next.githubOwnerId!==author.creatorIdentity.accountId)throw new Error('The repository owner differs from the saved identity.');next.githubOwnerId=author.creatorIdentity.accountId;}
      }
      if(project.provider==='modhold'){if(next.modholdAuthor&&next.modholdAuthor.toLowerCase()!==item.authorHandle.toLowerCase())throw new Error('Catalog author differs from the project’s saved identity.');next.modholdAuthor=item.authorHandle;}
      this._commit({...this._document,sources:existing?this._document.sources.map(row=>row.id===next.id?next:row):[...this._document.sources,next]},[{type:'catalog-project-followed',identity:owner}]);return clone(next);
    },
    unfollow(owner,id) {
      const source=this.get(owner,id);source.followUndo ||= {paused:source.paused,automatic:source.automatic,archived:!!source.archived};
      const keys=[`source:${source.url}`];if(source.creatorIdentity)keys.push(source.creatorIdentity.key);const project=source.kind==='project'&&discovery.projectAddress(source.url);if(project)keys.push(`project:${project.key}`);
      const rows=(this._document.creatorTombstones||[]).filter(row=>row.identity!==owner||!keys.includes(row.key));for(const key of keys)rows.push({identity:owner,key,at:this._time()});
      this.pending.get(id)?.abort('unfollow');for(const pending of this.creatorPending.values())if(pending.sourceId===id)pending.controller.abort('unfollow');
      Object.assign(source,{paused:true,automatic:false,archived:true});
      this._commit({...this._document,creatorTombstones:rows,sources:this._document.sources.map(row=>row.id===id?source:row)},[{type:'creator-unfollowed',identity:owner}]);return source;
    },
    restoreFollow(owner,id) {
      const source=this.get(owner,id),keys=[`source:${source.url}`];if(source.creatorIdentity)keys.push(source.creatorIdentity.key);const project=source.kind==='project'&&discovery.projectAddress(source.url);if(project)keys.push(`project:${project.key}`);
      if(source.migration?.state==='tracking'){const hold=this.migrationHold(owner,source.migration.migrationId);if(hold)throw new Error(hold);}
      Object.assign(source,source.followUndo||{archived:false,paused:true,automatic:source.automatic});delete source.followUndo;
      this._commit({...this._document,creatorTombstones:(this._document.creatorTombstones||[]).filter(row=>row.identity!==owner||!keys.includes(row.key)),sources:this._document.sources.map(row=>row.id===id?source:row)},[{type:'creator-follow-restored',identity:owner}]);return source;
    },
    async backfillCreators(owner,downloads=[]) {
      this._identity(owner);this.creatorBackfills ||= new Map();if(this.creatorBackfills.has(owner))throw new Error('Creator backfill is already running in this identity.');
      const projects=this._document.sources.filter(source=>source.identity===owner&&source.kind==='project'&&!source.archived),completed=downloads.filter(row=>row.identity===owner&&row.state==='completed'&&row.terminal===true),progress={done:0,total:projects.length+completed.length};this.creatorBackfills.set(owner,progress);this._emit({type:'creator-backfill-started'});
      try{for(const row of completed){if(this._disposed)break;await this.discoverDownload(row,{explicit:true});progress.done++;this._emit({type:'creator-backfill-progress'});}for(const source of projects){if(this._disposed)break;await this.discoverProject(owner,source.id);progress.done++;this._emit({type:'creator-backfill-progress'});}return clone(progress);}
      finally{this.creatorBackfills.delete(owner);if(!this._disposed)this._emit({type:'creator-backfill-ended'});}
    },
    creatorHub(owner,sources=this.list(owner)) {
      this._identity(owner);const sourceIndex=new Map(sources.map(source=>[source.id,source])),projectIndex=new Map();for(const source of sources)for(const key of source.creatorKeys||[]){if(!projectIndex.has(key))projectIndex.set(key,[]);projectIndex.get(key).push(source);}
      const creators=sources.filter(source=>source.kind==='creator').map(source=>{const key=source.creatorIdentity?.key||`source:${source.url}`,projects=projectIndex.get(key)||[],active=[source,...projects].filter(row=>!row.archived);return {key,sourceId:source.id,projectIds:projects.map(row=>row.id),unread:active.reduce((n,row)=>n+row.items.filter(item=>!item.read).length,0),lastActivity:Math.max(0,...active.map(row=>row.lastSuccess)),projectCount:projects.filter(row=>!row.archived).length};});
      const reviews=(this._document.creatorDiscoveries||[]).filter(row=>row.identity===owner).map(row=>({...clone(row),busy:this.discoveryPending?.has(`${owner}:${row.id}`)||false}));
      return {preferences:this.creatorSettings(owner),creators,discoveries:reviews,backfill:clone(this.creatorBackfills?.get(owner)||null),stats:{creators:creators.filter(row=>!sourceIndex.get(row.sourceId)?.archived).length,projects:sources.filter(row=>row.kind==='project'&&!row.archived).length,unread:sources.filter(row=>!row.archived).reduce((n,row)=>n+row.items.filter(item=>!item.read).length,0),review:reviews.filter(row=>row.status==='review').length}};
    },
    disposeCreatorDiscovery(){for(const work of this.discoveryRequests?.values()||[])work.controller.abort('closed');},
  };
}
module.exports={validate,methods,bindDownloads};
