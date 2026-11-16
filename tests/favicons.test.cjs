'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createFaviconLoader} = require('../browser/favicons.cjs');
const png = 'data:image/png;base64,cG5n';
function fixture(response = new Response(new Uint8Array([1,2,3]))) {
  const calls=[];
  const session={fetch:async (...args)=>{calls.push(args);return response;}};
  const nativeImage={createFromBuffer:bytes=>({isEmpty:()=>bytes.length===0,resize:()=>({toDataURL:()=>png})})};
  return {calls,session,loader:createFaviconLoader({nativeImage,maxBytes:16})};
}
test('fetches only an advertised same-origin icon in the identity session without credentials or redirects',async()=>{
  const f=fixture();
  assert.equal(await f.loader.load(f.session,'https://site.test/page',['https://other.test/icon.png','https://site.test/icon.png']),png);
  assert.equal(f.calls.length,1);
  assert.equal(f.calls[0][0],'https://site.test/icon.png');
  assert.equal(f.calls[0][1].credentials,'omit');assert.equal(f.calls[0][1].redirect,'error');
});
test('uses the page origin fallback for foreign, unsafe or credential-bearing icon URLs',async()=>{
  for(const icon of ['https://other.test/i','file:///icon','https://name:secret@site.test/icon']){
    const f=fixture();assert.equal(await f.loader.load(f.session,'https://site.test/',[icon]),png);assert.equal(f.calls[0][0],'https://site.test/favicon.ico');
  }
  const other=fixture();assert.equal(await other.loader.load(other.session,'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/x',['https://site.test/i']),'');assert.equal(other.calls.length,0);
});
test('refuses oversize responses and failed images',async()=>{
  for(const response of [new Response('x',{status:404}),new Response(new Uint8Array(17)),new Response(new Uint8Array(1),{headers:{'content-length':'100'}}),new Response(new Uint8Array())]){
    const f=fixture(response);assert.equal(await f.loader.load(f.session,'https://site.test/', ['https://site.test/icon']),'');
  }
});
test('retains a bounded ICO for Chromium to decode when nativeImage cannot decode it',async()=>{
  const bytes=Buffer.from([0,0,1,0,1,0,1,2,3]);
  const loader=createFaviconLoader({nativeImage:{createFromBuffer:()=>({isEmpty:()=>true})}});
  const session={fetch:async()=>new Response(bytes)};
  assert.equal(await loader.load(session,'https://site.test/', ['https://site.test/favicon.ico']),`data:image/x-icon;base64,${bytes.toString('base64')}`);
});
