'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const page=require('../browser/password-page.cjs');
test('password actions accept HTTPS and exact loopback origins only',()=>{
  assert.equal(page.loginOrigin('https://example.test/login'),'https://example.test');
  assert.equal(page.loginOrigin('http://127.0.0.1:8500/login'),'http://127.0.0.1:8500');
  for(const url of ['http://example.test','https://user:pass@example.test','file:///login','about:blank','http://localhost.example.test'])assert.throws(()=>page.loginOrigin(url));
});
test('a same-origin document replacement cannot reuse an autofill enrollment',async()=>{
  let url='https://example.test/login',calls=[];
  const wc={isDestroyed:()=>false,getURL:()=>url,executeJavaScriptInIsolatedWorld:async(world,scripts)=>{assert.equal(world,23017);calls.push(scripts[0].code);if(calls.length===1)return true;return {error:'The login page changed. Try again.'};}};
  const context=await page.prepare(wc);
  await assert.rejects(page.fill(context,{origin:context.origin,username:'synthetic',password:'synthetic'}),/changed/);
  assert.match(calls.at(-1),/delete globalThis/);
});
test('cross-origin autofill is refused before injecting credentials',async()=>{
  let calls=0;const wc={isDestroyed:()=>false,getURL:()=> 'https://example.test/',executeJavaScriptInIsolatedWorld:async()=>{calls++;return true;}};
  const context=await page.prepare(wc);await assert.rejects(page.fill(context,{origin:'https://other.test',username:'synthetic',password:'synthetic'}),/different site/);assert.equal(calls,1);
});
