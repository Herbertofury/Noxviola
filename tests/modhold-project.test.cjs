'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const adapter=require('../browser/modhold-project.cjs');
const original=require('./fixtures/modhold/mod-11.json');
const clone=()=>structuredClone(original);
const source=(extra={})=>({...adapter.projectSource(original.page),cache:{},...extra});
const response=(body,headers={},status=200)=>new Response(status===304?null:JSON.stringify(body),{status,headers});
test('ModHold route uses exact public origin, game and stable numeric ID, stripping only query/fragment',()=>{
 const parsed=adapter.projectSource(original.page+'?tab=files#files');assert.equal(parsed.url,original.page);assert.equal(parsed.endpoint,'https://modholdmods.com/api/v1/mods/11');assert.equal(adapter.projectKey(original.page),adapter.projectKey(original.page.replace(/[^/]+$/,'renamed')));
 for(const url of ['http://modholdmods.com/g/skyrim-se/mods/11/a','https://evil.test/g/skyrim-se/mods/11/a','https://user:pass@modholdmods.com/g/skyrim-se/mods/11/a','https://modholdmods.com:8080/g/skyrim-se/mods/11/a','https://modholdmods.com/g/skyrim-se/mods/9007199254740992/a','https://modholdmods.com/g/skyrim-se/mods/11/a/extra','https://modholdmods.com/g/skyrim-se/mods/0/a'])assert.equal(adapter.projectSource(url),null);
});
test('actual observed ModHold responses identify complete file snapshots and exact hashes',()=>{
 for(const id of [11,4,6]){const body=require(`./fixtures/modhold/mod-${id}.json`),result=adapter.normalize(body,{url:body.page});assert.equal(result.author,'SethSaidThat');assert.equal(result.items.length,body.files.length+1);assert.equal(result.items[0].versionNumber,body.version);for(const file of body.files){const item=result.items.find(row=>row.fileId===String(file.id));assert.equal(item.sha256,file.sha256);assert.equal(item.versionNumber,file.version);assert.equal(item.fileName,file.name);assert.equal(item.publishedAt,'');}}
});
test('collector requests public metadata without sessions, downloads or redirects and honors ETag',async()=>{
 let calls=0;const first=await adapter.collect(source(),{fetcher:async(url,options)=>{calls++;assert.equal(url,'https://modholdmods.com/api/v1/mods/11');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers.Cookie,undefined);assert.equal(options.headers.Accept,'application/json');return response(clone(),{etag:'"initial"'});}});
 assert.equal(calls,1);assert.equal(first.modholdAuthor,'SethSaidThat');
 const cached=await adapter.collect(source({cache:first.cache,modholdAuthor:first.modholdAuthor}),{fetcher:async(_url,options)=>{assert.equal(options.headers['If-None-Match'],'"initial"');return response(null,{},304);}});assert.deepEqual(cached.items,first.items);
});
test('wrong mod/game/author, duplicate files, missing integrity and off-site pages fail the entire snapshot',()=>{
 for(const edit of [d=>d.id=12,d=>d.game='fallout-4',d=>d.author.handle='Impersonator',d=>d.files.push(d.files[0]),d=>delete d.files[0].sha256,d=>d.files[0].id=Number.MAX_SAFE_INTEGER+1,d=>d.files[0].size=-1,d=>d.page='https://evil.test/g/skyrim-se/mods/11/a',d=>d.page=d.page.replace('/11/','/12/'),d=>d.files=null,d=>d.updated='sometime']){const body=clone();edit(body);assert.throws(()=>adapter.normalize(body,source({modholdAuthor:'SethSaidThat'})));}
});
test('popularity and scan time changes do not manufacture updates; version/hash changes do',()=>{
 const before=adapter.normalize(clone(),source()).items,body=clone();body.numbers={downloads:99999};body.files[0].downloads=987654;body.files[0].scanned='2026-11-17 08:00:00';
 assert.deepEqual(adapter.normalize(body,source()).items,before);body.files[0].version='0.2.0';assert.notEqual(adapter.normalize(body,source()).items[1].fingerprint,before[1].fingerprint);body.files[0].version=original.files[0].version;body.files[0].sha256='f'.repeat(64);assert.notEqual(adapter.normalize(body,source()).items[1].fingerprint,before[1].fingerprint);
});
test('HTTP failures explicitly remain unknown, preserve cooldown and never become ban observations',async()=>{
 for(const status of [401,403,404,410,429,500])await assert.rejects(adapter.collect(source(),{now:()=>1000,fetcher:async()=>response({}, {'retry-after':'120'},status)}),error=>error.message.includes('does not establish an author ban')&&error.retryAt===121000);
 await assert.rejects(adapter.collect(source(),{fetcher:async()=>response(null,{},304)}),/uncached/);
});
test('oversized streamed response is rejected whole and cancelled',async()=>{
 let cancelled=false;const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(adapter.MAX_RESPONSE_BYTES+1));},cancel(){cancelled=true;}});
 await assert.rejects(adapter.collect(source(),{fetcher:async()=>new Response(stream)}),/no partial snapshot/);assert.equal(cancelled,true);
});
