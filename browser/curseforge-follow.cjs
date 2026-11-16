'use strict';
// Staged adapter: NOT enabled by FollowService. Credentials are caller-owned,
// ephemeral and never returned, cached, logged or read from browser sessions.
const crypto=require('node:crypto');
const MAX_RESPONSE_BYTES=16*1024*1024;
const PAGE_SIZE=50,WINDOW=10000;
function projectURL(value){
 const u=new URL(value);
 return !u.username&&!u.password&&u.origin==='https://www.curseforge.com'&&/^\/[^/]+\/[^/]+\/[a-zA-Z0-9_-]+\/?$/.test(u.pathname)?u.origin+u.pathname.replace(/\/$/,''):null;
}
function numericID(id){if(!Number.isSafeInteger(id)||id<=0||id>2147483647)throw new Error('Invalid CurseForge project identity.');return id;}
function normalizeFile(row,projectId,address){
 numericID(projectId);const base=projectURL(address);if(!base)throw new Error('Invalid CurseForge project address.');
 if(!row||!Number.isSafeInteger(row.id)||row.id<=0||row.modId!==projectId||typeof row.fileName!=='string'||!row.fileName||typeof row.displayName!=='string'||!row.displayName||typeof row.fileDate!=='string'||!Number.isFinite(Date.parse(row.fileDate))||!Array.isArray(row.gameVersions)||row.gameVersions.some(v=>typeof v!=='string'||!v)||!Number.isInteger(row.releaseType)||typeof row.isAvailable!=='boolean')throw new Error('Incomplete CurseForge file metadata; no partial snapshot saved.');
 const item={id:`curseforge:${row.id}`,fileId:row.id,projectId,kind:'curseforge-file',title:row.displayName,fileName:row.fileName,publishedAt:row.fileDate,url:`${base}/files/${row.id}`,providerReleaseType:row.releaseType,providerReleaseLabel:({1:'Release',2:'Beta',3:'Alpha'})[row.releaseType]||'Unknown',declaredGameVersions:[...row.gameVersions],isAvailable:row.isAvailable};
 item.fingerprint=crypto.createHash('sha256').update(JSON.stringify({...item,declaredGameVersions:[...item.declaredGameVersions].sort()})).digest('hex');return item;
}
async function boundedJSON(response){
 if(Number(response.headers.get('content-length'))>MAX_RESPONSE_BYTES){await response.body?.cancel();throw new Error('CurseForge response exceeds 16 MiB budget; no partial snapshot saved.');}
 if(!response.body?.getReader)throw new Error('CurseForge response body unavailable.');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_RESPONSE_BYTES)throw new Error('CurseForge response exceeds 16 MiB budget; no partial snapshot saved.');chunks.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
 return JSON.parse(Buffer.concat(chunks,size).toString('utf8'));
}
async function collectFiles(source,{apiKey,fetcher=fetch,signal,now=Date.now}={}){
 const projectId=numericID(source.projectId),address=projectURL(source.url);
 if(!address)throw new Error('Invalid CurseForge project address.');
 if(typeof apiKey!=='string'||!apiKey.trim()||/[\r\n]/.test(apiKey))throw new Error('CurseForge requires an authorized API key. No automatic check was performed.');
 const items=[],seen=new Set();let index=0,total,pause=0;
 const request=async endpoint=>{
  if(signal?.aborted)throw new Error('CurseForge check cancelled.');
  if(pause>now()){const error=new Error('CurseForge requested a pause before collection completed; no partial snapshot saved.');error.retryAt=pause;throw error;}
  let response;try{response=await fetcher(endpoint,{headers:{Accept:'application/json','x-api-key':apiKey},credentials:'omit',redirect:'error',signal});}catch{throw new Error('CurseForge request failed; saved metadata retained.');}
  const retry=response.headers.get('retry-after'),at=retry===null?0:/^\d+$/.test(retry)?now()+Number(retry)*1000:Date.parse(retry);if(Number.isFinite(at)&&at>=0&&at<=8640000000000000)pause=Math.max(pause,at);
  if(!response.ok)throw new Error(`CurseForge returned HTTP ${response.status}; saved metadata retained.`);
  return response;
 };
 try{
 const metadata=await boundedJSON(await request(`https://api.curseforge.com/v1/mods/${projectId}`));
 if(metadata?.data?.id!==projectId||typeof metadata.data.links?.websiteUrl!=='string'||projectURL(metadata.data.links.websiteUrl)!==address)throw new Error('CurseForge project ID and address do not match; no snapshot saved.');
 do{
  if(signal?.aborted)throw new Error('CurseForge check cancelled.');
  const response=await request(`https://api.curseforge.com/v1/mods/${projectId}/files?index=${index}&pageSize=${PAGE_SIZE}`);
  const body=await boundedJSON(response),p=body?.pagination;
  if(!Array.isArray(body?.data)||!p||![p.index,p.pageSize,p.resultCount,p.totalCount].every(Number.isSafeInteger)||p.index!==index||p.pageSize<1||p.pageSize>PAGE_SIZE||p.resultCount!==body.data.length||p.resultCount>p.pageSize||p.totalCount<index+p.resultCount||p.totalCount<0)throw new Error('Invalid CurseForge pagination; no partial snapshot saved.');
  // A provider cap is NOT a complete history. Reject rather than hide missing rows.
  if(p.totalCount>=WINDOW)throw new Error('CurseForge reached its 10,000-result window; complete coverage is unresolved and no partial snapshot was saved.');
  if(total!==undefined&&p.totalCount!==total)throw new Error('CurseForge inventory changed during pagination; no partial snapshot saved.');total=p.totalCount;
  for(const row of body.data){const item=normalizeFile(row,projectId,address);if(seen.has(item.id))throw new Error('CurseForge repeated a file during pagination; no partial snapshot saved.');seen.add(item.id);items.push(item);}
  if(signal?.aborted)throw new Error('CurseForge check cancelled.');
  index+=p.resultCount;if(index<total&&!p.resultCount)throw new Error('CurseForge pagination made no progress; no partial snapshot saved.');
 }while(index<total);
 if(signal?.aborted)throw new Error('CurseForge check cancelled.');
 return {items,projectId,providerNotBefore:pause,coverage:'Current paginated file metadata only; not complete history, runtime compatibility or maturity verification.'};
 }catch(error){error.retryAt=Math.max(error.retryAt||0,pause);throw error;}
}
module.exports={projectURL,normalizeFile,collectFiles,MAX_RESPONSE_BYTES};
