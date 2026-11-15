'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function address(value) {
  const input = String(value || '').trim();
  if (!input) return 'https://www.google.com/';
  if (/^https?:\/\//i.test(input)) { try { return new URL(input).href; } catch { return null; } }
  if (/^[a-z][a-z\d+.-]*:/i.test(input)) return null;
  if (/^[^\s/]+\.[^\s/]+/.test(input)||/^localhost(?::\d+)?(?:\/|$)/.test(input)) {
    try { return new URL(`https://${input}`).href; } catch { return null; }
  }
  return `https://www.google.com/search?q=${encodeURIComponent(input)}`;
}
function httpUrl(value) { try { const u=new URL(value); return ['https:','http:'].includes(u.protocol) ? u.href : null; } catch { return null; } }
function cleanState(raw) {
  const seen=new Set();
  const tabs=(Array.isArray(raw?.tabs)?raw.tabs:[]).flatMap(row=>{
    const url=httpUrl(row?.url); if(!url)return [];
    let id=typeof row.id==='string'&&!seen.has(row.id)?row.id:crypto.randomUUID(); seen.add(id);
    return [{id,url,title:typeof row.title==='string'?row.title:url,identity:typeof row.identity==='string'&&/^[a-zA-Z0-9_-]+$/.test(row.identity)?row.identity:'personal'}];
  });
  const profiles=(Array.isArray(raw?.profiles)?raw.profiles:[]).filter(p=>p&&typeof p.id==='string'&&/^[a-zA-Z0-9_-]+$/.test(p.id)&&typeof p.name==='string');
  for(const t of tabs)if(!profiles.some(p=>p.id===t.identity))profiles.push({id:t.identity,name:t.identity});
  if(!profiles.some(p=>p.id==='personal'))profiles.unshift({id:'personal',name:'Personal'});
  return {version:1,profiles,tabs,activeId:tabs.some(t=>t.id===raw?.activeId)?raw.activeId:tabs[0]?.id||null};
}
function readState(file) {
  for(const candidate of [file,`${file}.previous`]) {try{return cleanState(JSON.parse(fs.readFileSync(candidate,'utf8')));}catch{}}
  return cleanState({});
}
function saveState(file,state) {
  const data=JSON.stringify(cleanState(state),null,2), temp=`${file}.${crypto.randomUUID()}.tmp`;
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const fd=fs.openSync(temp,'wx',0o600);
  try{fs.writeFileSync(fd,data);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  // Preserve the last parseable checkpoint before atomic replacement.
  if(fs.existsSync(file)){try{JSON.parse(fs.readFileSync(file,'utf8'));fs.copyFileSync(file,`${file}.previous`);}catch{}}
  fs.renameSync(temp,file);
}
module.exports={address,httpUrl,cleanState,readState,saveState};
