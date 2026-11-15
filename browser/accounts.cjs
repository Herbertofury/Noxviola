'use strict';
// Account inventory only. No passwords, tokens, cookies, TOTP or recovery secrets.
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const FIELDS=new Set(['id','label','handle','origin','identity','created','inPasswordManager','archived']);
function text(value,name){if(typeof value!=='string'||!value.trim())throw new Error(`${name} is required`);return value.trim();}
function normalize(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid account record');
 if(Object.keys(value).some(key=>!FIELDS.has(key)))throw new Error('Only account metadata fields are accepted; never supply credentials');
 const url=new URL(text(value.origin,'Site origin'));
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('Use the site origin only, without credentials, paths, query or fragments');
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('Use HTTPS (HTTP allowed only for local development)');
 const identity=text(value.identity,'Identity');if(!/^[a-zA-Z0-9_-]+$/.test(identity))throw new Error('Invalid identity');
 return{id:typeof value.id==='string'&&value.id?value.id:crypto.randomUUID(),label:text(value.label,'Label'),handle:typeof value.handle==='string'?value.handle.trim():'',origin:url.origin,identity,created:value.created===true,inPasswordManager:value.inPasswordManager===true,archived:value.archived===true};
}
function upsert(records,input,profiles){const item=normalize(input);if(!profiles.some(p=>p.id===item.identity))throw new Error('Select an existing browser identity');const index=records.findIndex(x=>x.id===item.id);if(index<0)return [...records,item];return records.map((x,i)=>i===index?item:x);}
function route(record,profiles){const item=normalize(record);if(item.archived)throw new Error('Restore the account record before opening it');if(!profiles.some(p=>p.id===item.identity))throw new Error('Account identity is unavailable; edit the association first');return {url:item.origin,identity:item.identity};}
const storage = require('./storage.cjs');
function decode(doc) {
 if(doc.version!==1)throw storage.fail('Unsupported account inventory version','UNSUPPORTED_VERSION');
 if(!Array.isArray(doc.accounts))throw new Error('Invalid account inventory');
 const rows=doc.accounts.map(normalize);if(new Set(rows.map(x=>x.id)).size!==rows.length)throw new Error('Duplicate account IDs');
 return {...doc,accounts:rows};
}
function inspect(file){return storage.inspect(file,decode,()=>({version:1,accounts:[]}));}
function load(file){const result=inspect(file);if(result.status==='recovery')throw new Error('Account inventory needs explicit recovery');return result.value.accounts;}
function save(file,records,expected){const opened=inspect(file);if(opened.status==='recovery')throw new Error('Restore the account inventory before saving');if(expected&&!require('node:util').isDeepStrictEqual(expected,opened.value.accounts))throw new Error('Account inventory changed outside this window; reopen it before saving');storage.write(file,{...opened.value,accounts:records.map(normalize)},decode);}
function recover(file,preview){return storage.recover(file,preview,decode);}
module.exports={normalize,upsert,route,load,save,inspect,recover};
