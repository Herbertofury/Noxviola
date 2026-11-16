'use strict';
// Fetch only the recorded upstream archive. The hash is an exact-byte pin, not
// publisher/signature verification. This command never loads extension code.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {PIN}=require('../tests/native/real-extension-support.cjs');

async function fetchCorpus(destination,{fetch:fetcher=globalThis.fetch,asset=PIN.asset}={}) {
  if(!path.isAbsolute(destination))throw new Error('Choose an absolute corpus archive destination.');
  if(fs.existsSync(destination))throw new Error('The corpus destination already exists; it was preserved.');
  const response=await fetcher(asset.url,{redirect:'follow',signal:AbortSignal.timeout(60_000)});
  if(!response.ok||!response.body)throw new Error(`The pinned upstream archive could not be fetched (HTTP ${response.status}).`);
  const chunks=[];let length=0;
  const reader=response.body.getReader();
  try {
    for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;
      if(length>asset.bytes)throw new Error('The upstream archive exceeds its exact pinned byte length.');chunks.push(Buffer.from(value));}
  } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
  const bytes=Buffer.concat(chunks),digest=crypto.createHash('sha256').update(bytes).digest('hex');
  if(length!==asset.bytes||digest!==asset.sha256)throw new Error(`Upstream archive identity mismatch: ${length} bytes, SHA-256 ${digest}.`);
  fs.writeFileSync(destination,bytes,{flag:'wx',mode:0o600});
  return {file:destination,source:asset.url,bytes:length,sha256:digest};
}
if(require.main===module){
  if(process.argv.length!==3){console.error('Usage: node scripts/fetch-extension-corpus.cjs ABSOLUTE_DESTINATION');process.exitCode=1;}
  else fetchCorpus(process.argv[2]).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
module.exports={fetchCorpus};
