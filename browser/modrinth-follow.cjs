'use strict';
const crypto=require('node:crypto');
const MAX_RESPONSE_BYTES=16*1024*1024;
function projectSource(address){
 const u=new URL(address),parts=u.pathname.split('/').filter(Boolean);
 if(u.username||u.password||u.origin!=='https://modrinth.com'||parts.length!==2||!['mod','modpack','resourcepack','shader','datapack','plugin'].includes(parts[0])||!/^[a-zA-Z0-9_-]+$/.test(parts[1]))return null;
 return {url:`https://modrinth.com/${parts[0]}/${parts[1]}`,kind:'project',provider:'modrinth-versions',endpoint:`https://api.modrinth.com/v2/project/${parts[1]}/version?include_changelog=false`};
}
function compatibility(value={loader:'',gameVersion:''}){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['loader','gameVersion'].includes(k)))throw new Error('Invalid compatibility filters.');
 for(const key of ['loader','gameVersion'])if(typeof value[key]!=='string'||value[key].length>100||/[\u0000-\u001f]/.test(value[key]))throw new Error('Compatibility filters must be short text.');
 return {loader:value.loader.trim().toLowerCase(),gameVersion:value.gameVersion.trim()};
}
function matchesVersion(item,filters){
 const f=compatibility(filters);return item.kind==='modrinth-version'&&item.presentInLastSnapshot!==false&&(!f.loader||item.loaders.includes(f.loader))&&(!f.gameVersion||item.gameVersions.includes(f.gameVersion));
}
function versionFields(item){
 for(const field of ['loaders','gameVersions'])if(!Array.isArray(item[field])||item[field].some(v=>typeof v!=='string'||!v))throw new Error('Version compatibility metadata is unavailable.');
}
function versionEndpoint(source){
 const parsed=projectSource(source.url);if(!parsed)throw new Error('Unsupported Modrinth project URL.');
 if(source.modrinthProjectId!==undefined&&(typeof source.modrinthProjectId!=='string'||!/^[a-zA-Z0-9]{8}$/.test(source.modrinthProjectId)))throw new Error('Invalid Modrinth project identity.');
 return source.modrinthProjectId?`https://api.modrinth.com/v2/project/${source.modrinthProjectId}/version?include_changelog=false`:parsed.endpoint;
}
function timing(response,now){
 const seconds=name=>{const s=response.headers.get(name);return s!==null&&/^\d+$/.test(s)?Number(s):0;};
 const clamp=n=>Number.isFinite(n)&&n>=0&&n<=8640000000000000?n:0;
 const retry=response.headers.get('retry-after');
 const retryAt=retry===null?0:/^\d+$/.test(retry)?clamp(now+Number(retry)*1000):clamp(Date.parse(retry));
 // Modrinth reset is seconds FROM NOW, unlike GitHub's epoch timestamp.
 const reset=response.headers.get('x-ratelimit-remaining')==='0'?clamp(now+Math.max(1,seconds('x-ratelimit-reset'))*1000):0;
 return Math.max(retryAt,reset);
}
async function boundedJSON(response){
 const length=Number(response.headers.get('content-length'));if(Number.isFinite(length)&&length>MAX_RESPONSE_BYTES){await response.body?.cancel();throw new Error('Modrinth response exceeds the 16 MiB safety budget; no partial snapshot was saved.');}
 if(!response.body||typeof response.body.getReader!=='function')throw new Error('Modrinth response body is unavailable.');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_RESPONSE_BYTES)throw new Error('Modrinth response exceeds the 16 MiB safety budget; no partial snapshot was saved.');chunks.push(value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
 return JSON.parse(Buffer.concat(chunks,size).toString('utf8'));
}
async function modrinthCollect(source,{fetcher=fetch,signal,now=Date.now}={}){
 const parsed=projectSource(source.url);if(!parsed)throw new Error('Unsupported Modrinth source.');let pause=0;
 const request=async(address,etag)=>{
  if(pause>now()){const e=new Error('Modrinth requested a pause before collection completed.');e.retryAt=pause;throw e;}
  const headers={Accept:'application/json','User-Agent':'Herbertofury/Noxviola/0.1.0 (https://github.com/Herbertofury/Noxviola)'};if(etag)headers['If-None-Match']=etag;
  const response=await fetcher(address,{headers,credentials:'omit',redirect:'error',signal});pause=Math.max(pause,timing(response,now()));
  if(!response.ok&&response.status!==304){const e=new Error(`Modrinth returned HTTP ${response.status}; last-good versions retained.`);e.retryAt=Math.max(pause,[403,429].includes(response.status)?now()+60000:0);throw e;}return response;
 };
 try{
  let projectId=source.modrinthProjectId;
  if(!projectId){const address=parsed.endpoint.replace('/version?include_changelog=false','');const data=await boundedJSON(await request(address));if(!data||typeof data.id!=='string'||!/^[a-zA-Z0-9]{8}$/.test(data.id))throw new Error('Modrinth did not identify the project.');projectId=data.id;}
  const endpoint=versionEndpoint({...source,modrinthProjectId:projectId}),prior=source.cache[endpoint];const response=await request(endpoint,prior?.etag);let page;
  if(response.status===304){if(!prior)throw new Error('Modrinth returned an uncached response.');page=structuredClone(prior);}
  else{
   const rows=await boundedJSON(response);if(!Array.isArray(rows))throw new Error('Modrinth did not return a version list.');
   const items=rows.map(row=>{
    if(!row||typeof row.id!=='string'||!/^[a-zA-Z0-9]{8}$/.test(row.id)||row.project_id!==projectId||typeof row.name!=='string'||typeof row.version_number!=='string'||typeof row.date_published!=='string')throw new Error('Modrinth returned invalid version identity or metadata.');
    const item={id:`modrinth:${row.id}`,kind:'modrinth-version',title:row.name,versionNumber:row.version_number,url:`${parsed.url}/version/${row.id}`,publishedAt:row.date_published,loaders:row.loaders,gameVersions:row.game_versions,releaseType:row.version_type||'unknown'};versionFields(item);
    item.fingerprint=crypto.createHash('sha256').update(JSON.stringify([item.title,item.versionNumber,item.publishedAt,[...item.loaders].sort(),[...item.gameVersions].sort(),item.releaseType])).digest('hex');return item;
   });if(new Set(items.map(i=>i.id)).size!==items.length)throw new Error('Modrinth returned duplicate versions; no partial snapshot saved.');page={etag:response.headers.get('etag')||null,next:null,items};
  }
  return {items:page.items,cache:{[endpoint]:page},modrinthProjectId:projectId,providerNotBefore:pause,notBefore:0};
 }catch(error){error.retryAt=Math.max(error.retryAt||0,pause);throw error;}
}
module.exports={projectSource,compatibility,matchesVersion,versionFields,versionEndpoint,modrinthCollect,timing,MAX_RESPONSE_BYTES};
