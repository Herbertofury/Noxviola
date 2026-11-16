'use strict';
const crypto=require('node:crypto');
const projectAdapter=require('./modhold-project.cjs');
const ORIGIN='https://modholdmods.com',MAX_BYTES=16*1024*1024;
function sourceFor(value){
 const u=new URL(value);if(u.username||u.password||u.protocol!=='https:'||!['modholdmods.com','www.modholdmods.com'].includes(u.host))return null;
 const author=u.pathname.match(/^\/u\/([a-zA-Z0-9_.-]+)\/?$/),project=u.pathname.match(/^\/g\/([a-zA-Z0-9_-]+)\/mods\/([1-9][0-9]*)(?:\/[a-zA-Z0-9_-]+)?\/?$/);
 if(author)return {url:`${ORIGIN}/u/${author[1].toLowerCase()}`,kind:'creator',provider:'modhold-author',endpoint:`${ORIGIN}/api/v1/mods?page=1`};
 if(project&&Number.isSafeInteger(Number(project[2])))return {url:`${ORIGIN}/g/${project[1]}/mods/${project[2]}`,kind:'project',provider:'modhold-project',endpoint:`${ORIGIN}/api/v1/mods/${project[2]}`};return null;
}
function fingerprint(item){return crypto.createHash('sha256').update(JSON.stringify(item)).digest('hex');}
function project(row){
 const target=typeof row?.page==='string'?sourceFor(row.page):null;
 if(!Number.isSafeInteger(row?.id)||row.id<=0||!target||target.provider!=='modhold-project'||!target.endpoint.endsWith(`/${row.id}`)||typeof row.name!=='string'||!row.name||typeof row.version!=='string'||typeof row.updated!=='string'||typeof row.author?.handle!=='string'||!row.author.handle)throw new Error('ModHold returned invalid project metadata.');
 const item={id:`modhold-project:${row.id}`,kind:'modhold-project',title:row.name,url:target.url,publishedAt:row.updated,versionNumber:row.version,authorHandle:row.author.handle,access:typeof row.access==='string'?row.access:'unknown'};item.fingerprint=fingerprint(item);return item;
}
function files(rows,address){
 if(!Array.isArray(rows))throw new Error('ModHold file inventory is unavailable.');return rows.map(row=>{
  if(!Number.isSafeInteger(row?.id)||row.id<=0||typeof row.name!=='string'||!row.name||typeof row.version!=='string'||typeof row.kind!=='string'||!Number.isSafeInteger(row.size)||row.size<0||typeof row.sha256!=='string'||!/^[a-f0-9]{64}$/i.test(row.sha256))throw new Error('ModHold returned incomplete file metadata.');
  const item={id:`modhold-file:${row.id}`,kind:'modhold-file',title:row.name,url:address,publishedAt:'',versionNumber:row.version,fileKind:row.kind,sizeBytes:row.size,sha256:row.sha256.toLowerCase()};item.fingerprint=fingerprint(item);return item;
 });
}
async function bodyJSON(response){
 if(Number(response.headers.get('content-length'))>MAX_BYTES){await response.body?.cancel();throw new Error('ModHold response exceeds 16 MiB budget; no partial snapshot saved.');}
 if(!response.body?.getReader)throw new Error('ModHold response body unavailable.');const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES)throw new Error('ModHold response exceeds 16 MiB budget; no partial snapshot saved.');chunks.push(value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
 try{return JSON.parse(Buffer.concat(chunks,size).toString('utf8'));}catch{throw new Error('ModHold returned invalid JSON.');}
}
// Fetch once, project many author views only after the full catalog validates.
async function collectCatalog({fetcher=fetch,signal,now=Date.now}={}){
 const cache={},items=[],seen=new Set();let pause=0,total,perPage,pageNumber=1,observed=0;
 try{do{
  if(signal?.aborted)throw new Error('ModHold check cancelled.');if(pause>now())throw new Error('ModHold requested a pause before the snapshot completed.');
  const endpoint=`${ORIGIN}/api/v1/mods?page=${pageNumber}`,headers={Accept:'application/json','User-Agent':'Noxviola-Following/0.1 (https://github.com/Herbertofury/Noxviola)'};
  const response=await fetcher(endpoint,{headers,credentials:'omit',redirect:'error',signal});const retry=response.headers.get('retry-after'),retryAt=retry===null?0:/^\d+$/.test(retry)?now()+Number(retry)*1000:Date.parse(retry);if(Number.isFinite(retryAt)&&retryAt>=0&&retryAt<=8640000000000000)pause=Math.max(pause,retryAt);
  if(!response.ok){if(response.status===429)pause=Math.max(pause,now()+60000);throw new Error(`ModHold returned HTTP ${response.status}; access is unresolved, not evidence of a ban or removal.`);}
  const data=await bodyJSON(response);
  if(!Array.isArray(data?.mods)||!Number.isSafeInteger(data.total)||data.total<0||data.page!==pageNumber||!Number.isSafeInteger(data.per_page)||data.per_page<1||data.per_page>50||data.mods.length>data.per_page||(total!==undefined&&total!==data.total)||(perPage!==undefined&&perPage!==data.per_page))throw new Error('ModHold catalog pagination changed or is invalid; no partial snapshot saved.');total=data.total;perPage=data.per_page;
  const pageItems=data.mods.map(project);for(const item of pageItems){if(seen.has(item.id))throw new Error('ModHold repeated a project during pagination; no partial snapshot saved.');seen.add(item.id);}observed+=pageItems.length;
  if(observed>total||(!pageItems.length&&observed<total)||(observed<total&&pageItems.length!==perPage))throw new Error('ModHold catalog is incomplete; no partial snapshot saved.');
  if(signal?.aborted)throw new Error('ModHold check cancelled.');cache[endpoint]={etag:null,next:null,items:pageItems};items.push(...pageItems);pageNumber++;
 }while(observed<total);
 return {items,cache,providerNotBefore:pause,notBefore:0,catalogObservedAt:now()};
 }catch(error){error.retryAt=Math.max(error.retryAt||0,pause);throw error;}
}
function forAuthor(snapshot,source){
 const parsed=sourceFor(source.url);if(parsed?.provider!=='modhold-author')throw new Error('Expected a ModHold author profile.');
 const handle=new URL(parsed.url).pathname.split('/').pop(),matches=item=>item.authorHandle.toLowerCase()===handle;
 return {...snapshot,items:snapshot.items.filter(matches),cache:Object.fromEntries(Object.entries(snapshot.cache).map(([address,page])=>[address,{...page,items:page.items.filter(matches)}]))};
}
async function collect(source,options={}){
 const parsed=sourceFor(source.url);if(!parsed)throw new Error('Unsupported ModHold source.');
 return parsed.provider==='modhold-project'?projectAdapter.collect(source,options):forAuthor(await collectCatalog(options),source);
}
module.exports={sourceFor,collect,collectCatalog,forAuthor,project,files,MAX_BYTES};
