'use strict';
const crypto=require('node:crypto');
const net=require('node:net');
const bundled=require('../shared/creator-continuity.v1.json');
const modhold=require('./modhold-project.cjs');
const transitions=require('./follow-transitions.cjs');
const {isDeepStrictEqual}=require('node:util');
const MAX_REGISTRY_BYTES=4*1024*1024;
function object(value){if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Creator registry must contain objects.');return value;}
function text(value,label){if(typeof value!=='string'||!value.trim()||value.length>4096||/[\u0000-\u001f\u007f]/.test(value))throw new Error(`Invalid creator registry ${label}.`);return value;}
function publicURL(value){text(value,'address');const u=new URL(value),host=u.hostname.replace(/^\[|\]$/g,'');if(u.protocol!=='https:'||u.username||u.password||net.isIP(host)||host==='localhost'||!host.includes('.')||host.endsWith('.localhost')||host.endsWith('.local')||u.port)throw new Error('Creator evidence needs a public HTTPS address without credentials.');return u.href;}
function date(value){text(value,'observation time');if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value)||!Number.isFinite(Date.parse(value)))throw new Error('Creator evidence needs an explicit UTC observation date.');return value;}
function sourceKey(value){const u=new URL(value);if(['https://www.nexusmods.com','https://nexusmods.com'].includes(u.origin)){const p=u.pathname.replace(/\/$/,'');if(/^\/profile\/[a-zA-Z0-9_.-]+$/.test(p))return 'nexus-profile:'+p.split('/')[2].toLowerCase();if(/^\/[a-z0-9]+\/mods\/[1-9][0-9]*$/.test(p))return 'nexus-mod:'+p.slice(1);}if(u.origin==='https://modholdmods.com'&&/^\/u\/[a-zA-Z0-9_.-]+\/?$/.test(u.pathname))return 'modhold-profile:'+u.pathname.split('/')[2].toLowerCase();return modhold.projectKey(value)||value;}
function project(value){object(value);for(const key of ['provider','game','projectId'])text(value[key],key);publicURL(value.url);if(value.provider==='modhold'){const p=modhold.projectSource(value.url);if(!p||p.game!==value.game||p.projectId!==value.projectId)throw new Error('ModHold registry identity does not match its address.');}if(value.provider==='nexus'&&sourceKey(value.url)!==`nexus-mod:${value.game}/mods/${value.projectId}`)throw new Error('Nexus registry identity does not match its address.');}
function validate(value){
 object(value);if(value.schemaVersion!==1||value.kind!=='creator-continuity-registry'||!Array.isArray(value.authors)||!Array.isArray(value.migrations))throw new Error('Unsupported Creator Continuity registry.');text(value.revision,'revision');date(value.updatedAt);const ids=new Set(),migrations=new Set();
 for(const author of value.authors){object(author);text(author.id,'author ID');text(author.name,'author name');if(ids.has(author.id))throw new Error('Duplicate registry author.');ids.add(author.id);object(author.source);publicURL(author.source.profileUrl);text(author.source.provider,'provider');text(author.source.handle,'handle');if(author.source.accountId!==undefined&&(typeof author.source.accountId!=='string'||!/^[1-9][0-9]*$/.test(author.source.accountId)))throw new Error('Invalid registry account ID.');object(author.status);if(!['active','banned','removed','moved','unknown'].includes(author.status.state))throw new Error('Unsupported author status.');date(author.status.observedAt);publicURL(author.status.evidenceUrl);text(author.status.evidenceKind,'evidence kind');text(author.status.summary,'summary');if(!Array.isArray(author.destinations))throw new Error('Missing author destinations.');for(const destination of author.destinations){object(destination);text(destination.provider,'provider');text(destination.handle,'handle');publicURL(destination.profileUrl);object(destination.identityEvidence);text(destination.identityEvidence.kind,'identity evidence kind');publicURL(destination.identityEvidence.url);publicURL(destination.identityEvidence.targetUrl);date(destination.identityEvidence.observedAt);if(sourceKey(destination.identityEvidence.targetUrl)!==sourceKey(author.source.profileUrl))throw new Error('Author identity evidence does not refer to the original profile.');}}
 for(const migration of value.migrations){object(migration);text(migration.id,'migration ID');if(migrations.has(migration.id)||!ids.has(migration.authorId))throw new Error('Duplicate migration or unknown author.');migrations.add(migration.id);text(migration.title,'mod title');project(migration.from);project(migration.to);if(typeof migration.reviewRequired!=='boolean')throw new Error('Migration review policy missing.');text(migration.evidenceKind,'migration evidence kind');date(migration.observedAt);text(migration.note,'migration note');if(!Array.isArray(migration.evidenceUrls)||!migration.evidenceUrls.length)throw new Error('Migration evidence required.');migration.evidenceUrls.forEach(publicURL);const author=value.authors.find(row=>row.id===migration.authorId);if(!author.destinations.some(row=>row.provider===migration.to.provider&&new URL(row.profileUrl).origin===new URL(migration.to.url).origin))throw new Error('Migration destination does not belong to a linked author site.');}
 return structuredClone(value);
}
function parse(input){if(typeof input!=='string'||Buffer.byteLength(input)>MAX_REGISTRY_BYTES)throw new Error('Creator registry must be at most 4 MiB; no partial import saved.');return validate(JSON.parse(input));}
function token(migration,author){return crypto.createHash('sha256').update(JSON.stringify([migration,author])).digest('hex');}
validate(bundled);
function index(overlay){
 const registry=overlay?validate(overlay):null,authors=new Map(),migrations=new Map();
 for(const [doc,provenance]of [[bundled,'bundled'],...(registry?[[registry,'user-imported']]:[])]){
  for(const row of doc.authors){if(provenance==='user-imported')for(const [id,migration]of migrations)if(migration.authorId===row.id)migrations.delete(id);authors.set(row.id,{...row,registryRevision:doc.revision,provenance});}
  for(const row of doc.migrations)migrations.set(row.id,{...row,registryRevision:doc.revision,provenance,reviewRequired:true});
 }
 const byAuthor=new Map(),bySource=new Map();
 for(const migration of migrations.values()){if(!byAuthor.has(migration.authorId))byAuthor.set(migration.authorId,[]);byAuthor.get(migration.authorId).push(migration);}
 const add=(key,author,rows)=>{if(!bySource.has(key))bySource.set(key,new Map());const record=bySource.get(key).get(author.id)||{author,migrations:new Map()};rows.forEach(row=>record.migrations.set(row.id,row));bySource.get(key).set(author.id,record);};
 for(const author of authors.values())add(sourceKey(author.source.profileUrl),author,byAuthor.get(author.id)||[]);
 for(const migration of migrations.values())add(sourceKey(migration.from.url),authors.get(migration.authorId),[migration]);
 return {authors,migrations,bySource};
}
function notices(source,registry,now){return [...(registry.bySource.get(sourceKey(source.url))?.values()||[])].map(row=>({author:row.author,observedAt:row.author.status.observedAt,stale:now-Date.parse(row.author.status.observedAt)>7*86400000,migrations:[...row.migrations.values()].map(migration=>({...migration,token:token(migration,row.author)}))}));}
function trackingHold(migration,author,records,now){
 const related=records.filter(row=>sourceKey(row.source_account)===sourceKey(author.source.profileUrl)||row.project_mappings.some(mapping=>sourceKey(mapping.source_project)===sourceKey(migration.from.url))).sort((a,b)=>a.observed_unix-b.observed_unix);
 if(!related.length)return null;
 const latest=new Map();for(const record of related){const old=latest.get(record.id);latest.set(record.id,{record,conflict:old?.record.observed_unix===record.observed_unix&&(old.conflict||!isDeepStrictEqual(old.record,record))});}if([...latest.values()].some(row=>row.conflict))return 'Canonical reports disagree at the same observation time. Resolve the conflicting copies before enabling migration tracking.';
 const current=transitions.notices(related,Math.floor(now/1000)).filter(row=>row.current);
 for(const notice of current){const r=notice.record;
  if(r.lifecycle!=='active'||!notice.fresh||notice.conflict)return `Canonical evidence review required: ${notice.state}. Resolve the shared report before starting or resuming migration tracking.`;
  if(!['banned','removed','suspended'].includes(r.status))return `Canonical evidence now reports ${r.status}; review the local migration candidate before enabling tracking.`;
  const destination=author.destinations.find(row=>row.provider===migration.to.provider);
  if(!r.destination_account||!destination||sourceKey(r.destination_account)!==sourceKey(destination.profileUrl))return 'Canonical destination identity differs or is unresolved. Review the shared evidence before enabling migration tracking.';
  const mapping=r.project_mappings.find(row=>sourceKey(row.source_project)===sourceKey(migration.from.url));
  if(!mapping||!mapping.verified||sourceKey(mapping.destination_project)!==sourceKey(migration.to.url)||mapping.game!==migration.to.game)return 'Canonical per-mod mapping is missing, unverified or different. Resolve the shared record before enabling migration tracking.';
 }
 return null;
}
function validateDecision(value,source){object(value);for(const key of ['migrationId','token','originalUrl','originalSourceId','authorId','authorHandle','registryRevision'])text(value[key],key);publicURL(value.originalUrl);if(!/^[0-9a-f]{64}$/.test(value.token)||!['tracking','revoked'].includes(value.state)||typeof value.createdDestination!=='boolean'||!Number.isFinite(value.acceptedAt)||value.acceptedAt<0)throw new Error('Invalid saved migration decision.');if(value.revokedAt!==undefined&&(!Number.isFinite(value.revokedAt)||value.revokedAt<0))throw new Error('Invalid migration revocation.');object(value.previous);for(const key of ['paused','automatic','archived'])if(typeof value.previous[key]!=='boolean')throw new Error('Invalid previous follow settings.');if(!Array.isArray(value.evidenceUrls)||!value.evidenceUrls.length)throw new Error('Missing saved migration evidence.');value.evidenceUrls.forEach(publicURL);if(source.provider==='modhold-project'&&source.modholdAuthor!==value.authorHandle)throw new Error('Migration and destination author identities differ.');}
module.exports={validate,parse,index,notices,token,sourceKey,validateDecision,publicURL,trackingHold,MAX_REGISTRY_BYTES};
