'use strict';

// Public provider identity only. Download names and display names never select
// an account. No download URL, cookie, token or local file is sent to a provider.
const crypto = require('node:crypto');
const net = require('node:net');
const modhold = require('./modhold-project.cjs');
const modrinth = require('./modrinth-follow.cjs');
const MAX_BYTES = 16 * 1024 * 1024;
const BASE62 = /^[a-zA-Z0-9]{8}$/;
const USER_AGENT = 'Herbertofury/Noxviola/0.1.0 (https://github.com/Herbertofury/Noxviola)';

function publicAddress(value) {
  try {
    const u = new URL(value), host = u.hostname.replace(/^\[|\]$/g, '');
    if (u.protocol !== 'https:' || u.username || u.password || u.port || net.isIP(host) || !host.includes('.') || host.endsWith('.local') || host.endsWith('.localhost')) return '';
    // Provenance never persists signed query strings or fragments.
    return u.origin + u.pathname;
  } catch { return ''; }
}
function provenance(item, contents, frame) {
  let pageUrl = '', chain = [];
  try { pageUrl = publicAddress(frame?.url || contents?.getURL?.()); } catch { /* No trustworthy initiating page. */ }
  try { chain = item.getURLChain?.() || [item.getURL()]; } catch { /* Download still works without discovery. */ }
  return {pageUrl, urlChain: [...new Set((Array.isArray(chain) ? chain : []).map(publicAddress).filter(Boolean))]};
}
function projectAddress(value) {
  const clean = publicAddress(value); if (!clean) return null;
  const u = new URL(clean), mh = modhold.projectSource(clean);
  if (mh) return {provider:'modhold', key:modhold.projectKey(clean), url:`https://modholdmods.com/g/${mh.game}/mods/${mh.projectId}`, projectId:mh.projectId, game:mh.game};
  const mr = u.origin === 'https://modrinth.com' && u.pathname.match(/^\/(mod|modpack|resourcepack|shader|datapack|plugin)\/([a-zA-Z0-9_-]+)(?:\/(?:versions|version(?:\/[^/]+)?))?\/?$/);
  if (mr) return {provider:'modrinth', key:`modrinth-project:${mr[2]}`, url:`https://modrinth.com/${mr[1]}/${mr[2]}`, projectId:mr[2], projectType:mr[1]};
  const gh = u.origin === 'https://github.com' && u.pathname.match(/^\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\/(?:releases(?:\/[^/]+)*|archive\/[^/]+(?:\/[^/]+)*))?\/?$/);
  if (gh) return {provider:'github', key:`github-project:${gh[1].toLowerCase()}/${gh[2].toLowerCase()}`, url:`https://github.com/${gh[1].toLowerCase()}/${gh[2].toLowerCase()}`, projectId:`${gh[1]}/${gh[2]}`};
  return null;
}
function requestIdentity(input) {
  const chain = [...new Set([...(input.provenance?.urlChain || []), input.downloadUrl].map(publicAddress).filter(Boolean))];
  const page = projectAddress(input.projectUrl || input.provenance?.pageUrl);
  const originalPage=publicAddress(input.projectUrl||input.provenance?.pageUrl),nexusPage=originalPage&&/^https:\/\/(?:www\.)?nexusmods\.com\/[a-z0-9]+\/mods\/[1-9][0-9]*\/?$/.test(originalPage);
  if (input.kind === 'project') {
    if(nexusPage)throw new Error('The exact Nexus project is saved, but its uploader identity is not verified by an available credential-free metadata adapter. Open the original project and follow its confirmed profile manually.');
    if (!page) throw new Error('Use an exact ModHold, Modrinth or GitHub project page. Other sites need a manually followed profile.');
    return {...page, chain, origin:'project'};
  }
  const cdn = chain.map(address => ({address, match:new URL(address).origin === 'https://cdn.modrinth.com' && new URL(address).pathname.match(/^\/data\/([a-zA-Z0-9]{8})\/versions\/[^/]+\/.+$/)})).filter(row => row.match);
  if (cdn.length) {
    const ids = new Set(cdn.map(row => row.match[1]));
    if (ids.size !== 1) throw new Error('The download chain refers to more than one Modrinth project. Review its source.');
    return {provider:'modrinth',key:`modrinth-project:${cdn[0].match[1]}`,projectId:cdn[0].match[1],chain,origin:'download',page};
  }
  const gh = chain.map(address => {
    const u = new URL(address);
    if (u.origin === 'https://github.com' && /^\/[^/]+\/[^/]+\/(?:releases\/download|archive)\//.test(u.pathname)) return projectAddress(address);
    if (u.origin === 'https://codeload.github.com') { const m=u.pathname.match(/^\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)\/(?:zip|tar\.gz)\//); if(m)return projectAddress(`https://github.com/${m[1]}/${m[2]}`); }
    return null;
  }).filter(Boolean);
  if (gh.length) { if(new Set(gh.map(row=>row.key)).size!==1)throw new Error('The download has conflicting repository identities.');return {...gh[0],chain,origin:'download'}; }
  if (page?.provider === 'modhold') {
    const fileIds = chain.map(address => {const u=new URL(address);return u.origin==='https://modholdmods.com'&&u.pathname.match(/^\/(?:download\/|api\/v1\/files\/)([1-9][0-9]*)(?:\/download)?\/?$/)?.[1];}).filter(Boolean);
    if (new Set(fileIds).size !== 1) throw new Error('The initiating ModHold page is known, but this download has no unique provider file ID. Review the project before following its author.');
    return {...page,chain,origin:'download',fileId:fileIds[0]};
  }
  if(nexusPage)throw new Error('The exact Nexus project is saved, but its uploader identity is not verified by an available credential-free metadata adapter. Open the original project and follow its confirmed profile manually.');
  throw new Error('The completed download has no supported exact project/file provenance. Add its project page to discover a creator; the filename is not an identity.');
}
function creator({provider,accountId,handle,name,profileUrl,evidenceUrl,relation,observedAt}) {
  const value={key:`${provider}:${accountId}`,provider,accountId,handle,name:name||handle,profileUrl,evidenceUrl,relation,observedAt};validateCreator(value);return value;
}
function validateCreator(value) {
  if(!value||typeof value!=='object'||!['modhold','modrinth','github'].includes(value.provider)||typeof value.accountId!=='string'||typeof value.handle!=='string'||!value.handle||typeof value.name!=='string'||!value.name.trim()||typeof value.relation!=='string'||!value.relation||value.key!==`${value.provider}:${value.accountId}`||!Number.isFinite(value.observedAt)||value.observedAt<0)throw new Error('Invalid discovered creator identity.');
  if(value.provider==='modhold'&&(!/^[a-z0-9_.-]{1,100}$/.test(value.accountId)||value.accountId!==value.handle.toLowerCase()||value.profileUrl!==`https://modholdmods.com/u/${value.accountId}`))throw new Error('ModHold profile identity does not match its handle.');
  if(value.provider==='modrinth'&&(!BASE62.test(value.accountId)||value.profileUrl!==`https://modrinth.com/user/${value.accountId}`))throw new Error('Modrinth creator requires its stable account ID.');
  if(value.provider==='github'&&(!/^[1-9][0-9]*$/.test(value.accountId)||value.profileUrl!==`https://github.com/${value.handle.toLowerCase()}`))throw new Error('GitHub creator identity is incomplete.');
  if(publicAddress(value.evidenceUrl)!==value.evidenceUrl||publicAddress(value.profileUrl)!==value.profileUrl)throw new Error('Creator evidence must be a public canonical address.');
  return value;
}
async function json(response) {
  if(Number(response.headers.get('content-length'))>MAX_BYTES){await response.body?.cancel();throw new Error('Creator metadata exceeds 16 MiB; no partial identities saved.');}
  if(!response.body?.getReader)throw new Error('Creator metadata body is unavailable.');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try {while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES)throw new Error('Creator metadata exceeds 16 MiB; no partial identities saved.');chunks.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
  return JSON.parse(Buffer.concat(chunks,size).toString('utf8'));
}
function client({fetcher=fetch,signal,now=Date.now}={}) {
  let notBefore=0;
  return {get notBefore(){return notBefore;},async get(address) {
    if(signal?.aborted)throw new Error('Creator discovery cancelled.');if(notBefore>now())throw Object.assign(new Error('The provider requested a pause before creator discovery can continue.'),{retryAt:notBefore});
    const response=await fetcher(address,{headers:{Accept:'application/json','User-Agent':USER_AGENT},credentials:'omit',redirect:'error',signal});
    notBefore=Math.max(notBefore,modrinth.timing(response,now()));
    if(!response.ok)throw Object.assign(new Error(`Creator metadata returned HTTP ${response.status}; no creator was inferred.`),{retryAt:Math.max(notBefore,[403,429].includes(response.status)?now()+60000:0)});
    if(response.url&&response.url!==address)throw new Error('Creator metadata changed endpoints. Review the source.');
    const value=await json(response);if(signal?.aborted)throw new Error('Creator discovery cancelled.');return value;
  }};
}
async function discover(input,options={}) {
  const target=requestIdentity(input),api=client(options),now=(options.now||Date.now)();
  try {
    if(target.provider==='modhold') {
      const evidenceUrl=`https://modholdmods.com/api/v1/mods/${target.projectId}`,data=await api.get(evidenceUrl),normalized=modhold.normalize(data,{url:target.url});
      if(target.fileId&&!data.files.some(file=>String(file.id)===target.fileId))throw new Error('The completed file is not listed on this exact ModHold project. Review the source.');
      return {project:{...target,name:data.name},creators:[creator({provider:'modhold',accountId:normalized.author.toLowerCase(),handle:normalized.author,name:data.author?.name,profileUrl:`https://modholdmods.com/u/${normalized.author.toLowerCase()}`,evidenceUrl,relation:'Published project author',observedAt:now})],requiresChoice:false,notBefore:api.notBefore};
    }
    if(target.provider==='github') {
      const evidenceUrl=`https://api.github.com/repos/${target.projectId}`,data=await api.get(evidenceUrl);
      if(typeof data.full_name!=='string'||data.full_name.toLowerCase()!==target.projectId.toLowerCase()||!Number.isSafeInteger(data.id)||!Number.isSafeInteger(data.owner?.id)||data.owner.id<=0||typeof data.owner.login!=='string'||data.owner.login.toLowerCase()!==target.projectId.split('/')[0].toLowerCase()||data.owner.html_url?.toLowerCase()!==`https://github.com/${data.owner.login.toLowerCase()}`)throw new Error('GitHub did not confirm the exact repository owner.');
      return {project:{...target,name:data.full_name,githubRepositoryId:String(data.id),githubOwnerId:String(data.owner.id)},creators:[creator({provider:'github',accountId:String(data.owner.id),handle:data.owner.login,name:data.owner.login,profileUrl:data.owner.html_url.toLowerCase(),evidenceUrl,relation:'Repository owner',observedAt:now})],requiresChoice:false,notBefore:api.notBefore};
    }
    const data=await api.get(`https://api.modrinth.com/v2/project/${target.projectId}`);
    if(!BASE62.test(data?.id)||!BASE62.test(data.team)||typeof data.slug!=='string'||typeof data.title!=='string'||!data.title.trim()||!['mod','modpack','resourcepack','shader','datapack','plugin'].includes(data.project_type)||(data.id!==target.projectId&&data.slug.toLowerCase()!==target.projectId.toLowerCase()))throw new Error('Modrinth did not confirm the exact project identity.');
    if(target.page&&target.page.projectId!==data.id&&target.page.projectId.toLowerCase()!==data.slug.toLowerCase())throw new Error('The download and initiating page refer to different Modrinth projects.');
    const project={provider:'modrinth',key:`modrinth-project:${data.id}`,projectId:data.id,url:`https://modrinth.com/${data.project_type}/${data.id}`,name:data.title,modrinthProjectId:data.id};
    let members,evidenceUrl,relation;
    if(target.origin==='download') {
      evidenceUrl=`https://api.modrinth.com/v2/project/${data.id}/version?include_changelog=false`;
      const versions=await api.get(evidenceUrl);
      if(!Array.isArray(versions))throw new Error('Modrinth version inventory is unavailable.');
      const matches=versions.filter(row=>row.project_id===data.id&&Array.isArray(row.files)&&row.files.some(file=>target.chain.includes(publicAddress(file.url))));
      if(matches.length!==1||!BASE62.test(matches[0].author_id))throw new Error('No unique Modrinth version confirms this exact downloaded file.');
      const user=await api.get(`https://api.modrinth.com/v2/user/${matches[0].author_id}`);
      if(user.id!==matches[0].author_id)throw new Error('Modrinth publisher identity changed during discovery.');
      members=[{user}];relation='Publisher of the downloaded version';evidenceUrl=`https://api.modrinth.com/v2/version/${matches[0].id}`;
    } else {
      evidenceUrl=`https://api.modrinth.com/v2/project/${data.id}/members`;const rows=await api.get(evidenceUrl);
      if(!Array.isArray(rows)||rows.some(row=>row.team_id!==data.team))throw new Error('Modrinth returned a different project team.');
      members=rows.filter(row=>row.accepted===true);relation='Public project team member';
      if(!members.length)throw new Error('The public project team has no confirmed members. Review the source.');
    }
    const creators=members.map(row=>{const user=row.user;if(!BASE62.test(user?.id)||typeof user.username!=='string'||!/^[a-zA-Z0-9_-]+$/.test(user.username))throw new Error('Modrinth returned incomplete creator identity.');return creator({provider:'modrinth',accountId:user.id,handle:user.username,name:user.name||user.username,profileUrl:`https://modrinth.com/user/${user.id}`,evidenceUrl:publicAddress(evidenceUrl),relation,observedAt:now});});
    if(new Set(creators.map(row=>row.key)).size!==creators.length)throw new Error('Modrinth repeated an account identity.');
    return {project,creators,requiresChoice:creators.length!==1,notBefore:api.notBefore};
  } catch(error) {error.retryAt=Math.max(error.retryAt||0,api.notBefore);throw error;}
}

function authorSource(value) {
  const u=new URL(value),m=u.origin==='https://modrinth.com'&&u.pathname.match(/^\/user\/([a-zA-Z0-9_-]+)\/?$/);
  return m&&!u.username&&!u.password?{url:`https://modrinth.com/user/${m[1]}`,provider:'modrinth-author',kind:'creator',endpoint:`https://api.modrinth.com/v2/user/${m[1]}/projects`}:null;
}
async function collectAuthor(source,options={}) {
  const parsed=authorSource(source.url);if(!parsed)throw new Error('Unsupported Modrinth author.');
  const api=client(options);let accountId=source.modrinthAuthorId||source.creatorIdentity?.accountId;
  try {
    if(!accountId){const user=await api.get(parsed.endpoint.replace('/projects',''));if(!BASE62.test(user.id))throw new Error('Modrinth account identity unavailable.');accountId=user.id;}
    if(!BASE62.test(accountId))throw new Error('Invalid Modrinth account identity.');
    const endpoint=`https://api.modrinth.com/v2/user/${accountId}/projects`,rows=await api.get(endpoint);
    if(!Array.isArray(rows))throw new Error('Modrinth did not return an author catalog.');
    const items=rows.map(row=>{if(!BASE62.test(row?.id)||typeof row.title!=='string'||typeof row.updated!=='string'||!['mod','modpack','resourcepack','shader','datapack','plugin'].includes(row.project_type))throw new Error('Modrinth returned incomplete catalog metadata.');const item={id:`modrinth-project:${row.id}`,kind:'modrinth-project',title:row.title,url:`https://modrinth.com/${row.project_type}/${row.id}`,publishedAt:row.updated,projectId:row.id};item.fingerprint=crypto.createHash('sha256').update(JSON.stringify(item)).digest('hex');return item;});
    if(new Set(items.map(item=>item.id)).size!==items.length)throw new Error('Modrinth repeated a catalog project.');
    return {items,cache:{[endpoint]:{etag:null,next:null,items}},modrinthAuthorId:accountId,providerNotBefore:api.notBefore,notBefore:0};
  }catch(error){error.retryAt=Math.max(error.retryAt||0,api.notBefore);throw error;}
}
module.exports={publicAddress,provenance,projectAddress,requestIdentity,discover,validateCreator,authorSource,collectAuthor};
