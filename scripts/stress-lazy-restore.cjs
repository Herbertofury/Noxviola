'use strict';
// Synthetic fixture: Python's standard SQLite module populates immutable source
// rows without passing a million objects through the production JSON transport.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');const{performance,monitorEventLoopDelay}=require('node:perf_hooks');const{TabCollections}=require('../browser/tab-collections.cjs');
let activeStore;
(async()=>{const total=Number(process.argv[2]||1000000),dir=fs.mkdtempSync(path.join(os.tmpdir(),'nox-lazy-stress-')),file=path.join(dir,'tabs.sqlite');let store=activeStore=new TabCollections({file});const ask=(op,args={})=>store.request({op,identity:'synthetic',...args});await ask('health');store.close();await new Promise(r=>setTimeout(r,100));
 execFileSync('python3',['-c',`import sqlite3,sys
c=sqlite3.connect(sys.argv[1]);n=int(sys.argv[2]);c.execute("PRAGMA foreign_keys=ON")
c.execute("INSERT INTO collections(id,identity,title,created) VALUES(1,'synthetic','Million dormant tabs',1)")
c.executemany("INSERT INTO tabs(collection_id,url,title) VALUES(1,?,?)",((f'https://synthetic.example/{i}',f'Tab {i}') for i in range(n)))
c.commit();c.close()`,file,String(total)]);
 store=activeStore=new TabCollections({file});const delay=monitorEventLoopDelay({resolution:10});delay.enable();const start=performance.now(),result=await ask('restore-start',{session:'million',workspace:'synthetic-workspace',group:1}),restoreMs=performance.now()-start;if(result.count!==total)throw Error('Wrong source count');
 let after=0,count=0,pages=0,maxPage=0;const pagingStart=performance.now();do{const page=await ask('restore-tabs',{session:'million',after});count+=page.items.length;pages++;maxPage=Math.max(maxPage,page.items.length);after=page.next;}while(after!==null);if(count!==total)throw Error('Lost rows');
 const pageAllMs=performance.now()-pagingStart,claim=await ask('restore-claim',{session:'million',id:total,browser:'last-stable-id'});if(claim.browserId!=='last-stable-id')throw Error('Claim failed');store.child.kill('SIGKILL');await new Promise(r=>setTimeout(r,40));store=activeStore=new TabCollections({file});const retry=await ask('restore-claim',{session:'million',id:total,browser:'retry'});if(retry.browserId!==claim.browserId)throw Error('Unstable restart claim');const integrity=(await ask('health')).integrity;delay.disable();store.close();console.log(JSON.stringify({synthetic:true,tabs:total,restoreMs,restoreResponseBytes:Buffer.byteLength(JSON.stringify(result)),pageAllMs,pages,maxPage,enumerated:count,crashRetryStable:true,integrity,parentEventLoopP99ms:delay.percentile(99)/1e6,parentRssExcludesHelper:process.memoryUsage().rss,files:fs.readdirSync(dir).map(name=>({name,bytes:fs.statSync(path.join(dir,name)).size}))},null,2));
})().catch(e=>{activeStore?.close();console.error(e);process.exitCode=1;});
