'use strict';
// Observed public ModHold API contract; no browser cookies, tokens or downloads.
const crypto=require('node:crypto');
const MAX_RESPONSE_BYTES=16*1024*1024;
function projectSource(value){
 const u=new URL(value),match=u.pathname.match(/^\/g\/([a-z0-9-]+)\/mods\/([1-9][0-9]*)(?:\/([a-z0-9-]+))?\/?$/);
 if(u.origin!=='https://modholdmods.com'||u.username||u.password||!match||!Number.isSafeInteger(Number(match[2])))return null;
 return {url:u.origin+u.pathname.replace(/\/$/,''),kind:'project',provider:'modhold-files',endpoint:`https://modholdmods.com/api/v1/mods/${match[2]}`,game:match[1],projectId:match[2]};
}
function projectKey(value){const source=projectSource(value);return source?`modhold:${source.game}:${source.projectId}`:null;}
function short(value,label,{empty=false}={}){if(typeof value!=='string'||(!empty&&!value.trim())||value.length>4096||/[\u0000-\u001f\u007f]/.test(value))throw new Error(`Invalid ModHold ${label}; saved metadata retained.`);return value;}
function handle(value){if(typeof value!=='string'||!/^[A-Za-z0-9_.-]{1,100}$/.test(value))throw new Error('ModHold author identity is unavailable.');return value;}
function fields(item,source){
 if(item.projectId===undefined){if(!['modhold-project','modhold-file'].includes(item.kind)||projectKey(item.url)!==projectKey(source.url))throw new Error('Legacy ModHold update belongs to a different project.');return;}
 if(!['modhold-project','modhold-file'].includes(item.kind)||item.projectId!==projectSource(source.url)?.projectId||item.game!==projectSource(source.url)?.game||projectKey(item.url)!==projectKey(source.url))throw new Error('ModHold update belongs to a different project.');
 for(const field of ['versionNumber','author'])short(item[field],field);handle(item.author);
 if(source.modholdAuthor&&source.modholdAuthor!==item.author)throw new Error('ModHold author identity changed; review the source before continuing.');
 if(item.kind==='modhold-file'){
  if(!/^[1-9][0-9]*$/.test(item.fileId)||item.id!==`modhold-file:${item.fileId}`||!Number.isSafeInteger(Number(item.fileId)))throw new Error('Invalid ModHold file identity.');
  for(const field of ['fileName','fileKind'])short(item[field],field);
  if(!/^[0-9a-f]{64}$/i.test(item.sha256)||!Number.isSafeInteger(item.sizeBytes)||item.sizeBytes<0)throw new Error('ModHold file integrity metadata is unavailable.');
 }else if(item.id!==`modhold-project:${item.projectId}`)throw new Error('Invalid ModHold project identity.');
}
function normalize(body,source){
 const parsed=projectSource(source.url);if(!parsed||!body||body.id!==Number(parsed.projectId)||body.game!==parsed.game||typeof body.page!=='string'||projectKey(body.page)!==projectKey(source.url)||!Array.isArray(body.files))throw new Error('ModHold returned a different project or incomplete file list; saved metadata retained.');
 const author=handle(body.author?.handle);if(source.modholdAuthor&&source.modholdAuthor!==author)throw new Error('ModHold author identity changed; review the source before continuing.');
 const name=short(body.name,'title'),version=short(body.version,'version'),updated=short(body.updated,'update date'),page=`https://modholdmods.com/g/${parsed.game}/mods/${parsed.projectId}`;
 if(!/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)?$/.test(updated))throw new Error('ModHold returned an unrecognized update date.');
 const item=(values)=>{const value={projectId:parsed.projectId,game:parsed.game,author,url:page,...values};const legacy=value.kind==='modhold-project'?{id:value.id,kind:value.kind,title:value.title,url:value.url,publishedAt:value.publishedAt,versionNumber:value.versionNumber,authorHandle:value.authorHandle,access:value.access}:{id:value.id,kind:value.kind,title:value.title,url:value.url,publishedAt:value.publishedAt,versionNumber:value.versionNumber,fileKind:value.fileKind,sizeBytes:value.sizeBytes,sha256:value.sha256};value.fingerprint=crypto.createHash('sha256').update(JSON.stringify(legacy)).digest('hex');fields(value,source);return value;};
 const items=[item({id:`modhold-project:${parsed.projectId}`,kind:'modhold-project',title:name,versionNumber:version,publishedAt:updated,authorHandle:author,access:typeof body.access==='string'?body.access:'unknown'})];
 const seen=new Set();
 for(const file of body.files){
  if(!file||!Number.isSafeInteger(file.id)||file.id<=0||seen.has(file.id)||!Number.isSafeInteger(file.size)||file.size<0)throw new Error('ModHold returned invalid or duplicate file metadata; no partial snapshot saved.');seen.add(file.id);
  items.push(item({id:`modhold-file:${file.id}`,kind:'modhold-file',fileId:String(file.id),title:short(file.name,'file name'),fileName:short(file.name,'file name'),fileKind:short(file.kind,'file kind'),versionNumber:short(file.version,'file version'),sha256:short(file.sha256,'file hash').toLowerCase(),sizeBytes:file.size,publishedAt:''}));
 }
 return {items,author};
}
async function boundedJSON(response){
 if(Number(response.headers.get('content-length'))>MAX_RESPONSE_BYTES){await response.body?.cancel();throw new Error('ModHold response exceeds 16 MiB; no partial snapshot saved.');}
 if(!response.body?.getReader)throw new Error('ModHold response body is unavailable.');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_RESPONSE_BYTES)throw new Error('ModHold response exceeds 16 MiB; no partial snapshot saved.');chunks.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
 return JSON.parse(Buffer.concat(chunks,size).toString('utf8'));
}
function retryAt(response,now){const value=response.headers.get('retry-after');const time=value===null?0:/^\d+$/.test(value)?now+Number(value)*1000:Date.parse(value);return Number.isFinite(time)&&time>=0&&time<=8640000000000000?time:0;}
async function collect(source,{fetcher=fetch,signal,now=Date.now}={}){
 if(signal?.aborted)throw new Error('ModHold check cancelled.');
 const parsed=projectSource(source.url);if(!parsed)throw new Error('Unsupported ModHold project address.');if(source.modholdAuthor)handle(source.modholdAuthor);
 const prior=source.cache?.[parsed.endpoint],headers={Accept:'application/json','User-Agent':'Noxviola/0.1.0 (+https://github.com/Herbertofury/Noxviola)'};if(prior?.etag)headers['If-None-Match']=prior.etag;
 let pause=0;
 try{
  const response=await fetcher(parsed.endpoint,{headers,credentials:'omit',redirect:'error',signal});pause=retryAt(response,now());
  if(!response.ok&&response.status!==304){const error=new Error(`ModHold returned HTTP ${response.status}; this does not establish an author ban or deletion. Saved updates retained.`);error.retryAt=Math.max(pause,[403,429].includes(response.status)?now()+60000:0);throw error;}
  let page,author;
  if(response.status===304){if(!prior||!source.modholdAuthor)throw new Error('ModHold returned an uncached response.');page=structuredClone(prior);author=source.modholdAuthor;for(const entry of page.items)fields(entry,source);}
  else{const normalized=normalize(await boundedJSON(response),source);author=normalized.author;page={etag:response.headers.get('etag')||null,next:null,items:normalized.items};}
  if(signal?.aborted)throw new Error('ModHold check cancelled.');
  return {items:page.items,cache:{[parsed.endpoint]:page},modholdAuthor:author,providerNotBefore:pause,notBefore:0};
 }catch(error){error.retryAt=Math.max(error.retryAt||0,pause);throw error;}
}
module.exports={projectSource,projectKey,handle,fields,normalize,collect,MAX_RESPONSE_BYTES};
