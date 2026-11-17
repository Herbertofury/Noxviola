'use strict';
// Thin v1 consumer of Modding-Knowledge PR6, pinned 58fcf5d348cc4dbb684cb2d72f3c3bb89e29c4ff.
// Structural validation cannot verify a remote allegation, authorship or identity.
const FIELDS=['schema_version','id','creator_id','source_account','status','status_evidence','destination_account','identity_evidence','project_mappings','observed_unix','review_after_unix','lifecycle'];
function shape(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||Object.keys(value).some(key=>!keys.includes(key)))throw new Error('Unsupported transition record fields.');}
function address(value){if(typeof value!=='string')throw new Error('Canonical evidence URL required.');const u=new URL(value);if(u.protocol!=='https:'||!u.hostname||u.username||u.password||u.search||u.hash)throw new Error('Canonical HTTPS evidence URL without credentials required.');return u.href;}
function time(value){if(!Number.isSafeInteger(value)||value<0||value>8640000000000)throw new Error('Invalid transition timestamp.');}
function validate(r){
 shape(r,FIELDS);if(r.schema_version!==1)throw new Error('Unsupported transition schema.');for(const key of ['id','creator_id'])if(typeof r[key]!=='string'||!r[key].trim())throw new Error('Stable transition identity required.');
 time(r.observed_unix);time(r.review_after_unix);if(r.review_after_unix<=r.observed_unix)throw new Error('Review deadline must follow observation.');
 if(!['active','retracted','superseded'].includes(r.lifecycle)||!['unknown','unavailable','removed','suspended','banned','active'].includes(r.status))throw new Error('Unsupported lifecycle or platform status.');
 address(r.source_account);if(r.destination_account!==null)address(r.destination_account);
 for(const [field,kinds] of [['status_evidence',['provider_notice','creator_statement','retrieval_result']],['identity_evidence',['creator_crosslink','provider_verified_link']]]){
  if(!Array.isArray(r[field]))throw new Error('Evidence list required.');for(const e of r[field]){shape(e,['url','kind','observed_unix']);address(e.url);time(e.observed_unix);if(!kinds.includes(e.kind)||e.observed_unix>r.observed_unix)throw new Error('Invalid evidence authority or observation.');}
 }
 if(['banned','suspended','removed'].includes(r.status)&&!r.status_evidence.some(e=>['provider_notice','creator_statement'].includes(e.kind)))throw new Error('Retrieval failure cannot establish enforcement.');
 if(r.identity_evidence.length&&r.destination_account===null)throw new Error('Identity evidence requires destination.');
 if(!Array.isArray(r.project_mappings))throw new Error('Project mapping list required.');const seen=new Set();
 for(const m of r.project_mappings){shape(m,['source_project','destination_project','game','evidence_url','verified']);for(const k of ['source_project','destination_project','evidence_url'])address(m[k]);if(typeof m.verified!=='boolean'||typeof m.game!=='string'||!m.game.trim()||seen.has(address(m.source_project)))throw new Error('Ambiguous project mapping.');seen.add(address(m.source_project));}
 return r;
}
function related(r,source){return address(r.source_account)===address(source.url)||r.project_mappings.some(m=>address(m.source_project)===address(source.url));}
function notices(records=[],now){
 const latest=new Map();records.forEach((r,index)=>{validate(r);latest.set(r.id,{record:r,index});});
 const active=[...latest.values()].filter(({record:r})=>r.lifecycle==='active'&&r.observed_unix<=now&&now<r.review_after_unix);
 return records.map((r,index)=>{const current=latest.get(r.id).index===index,fresh=r.observed_unix<=now&&now<r.review_after_unix,conflict=current&&fresh&&r.lifecycle==='active'&&active.some(({record:other})=>other.id!==r.id&&address(other.source_account)===address(r.source_account)&&(other.creator_id!==r.creator_id||other.status!==r.status||(other.destination_account===null?null:address(other.destination_account))!==(r.destination_account===null?null:address(r.destination_account))||other.project_mappings.some(a=>r.project_mappings.some(b=>address(a.source_project)===address(b.source_project)&&address(a.destination_project)!==address(b.destination_project)))));return {record:r,index,current,fresh,conflict,state:!current?'historical':r.lifecycle!=='active'?r.lifecycle:!fresh?'review overdue':conflict?'conflicting reports':'evidence review required',verified:false,automaticTracking:false};});
}
module.exports={validate,related,notices,address};
