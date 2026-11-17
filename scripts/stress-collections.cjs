'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const{performance,monitorEventLoopDelay}=require('node:perf_hooks');const{TabCollections}=require('../browser/tab-collections.cjs');
(async()=>{
 const total=Number(process.argv[2]||100000),dir=fs.mkdtempSync(path.join(os.tmpdir(),'nox-collection-stress-')),file=path.join(dir,'collections.sqlite');let store=new TabCollections({file});
 const ask=(op,args={})=>store.request({op,identity:'synthetic',...args});const delay=monitorEventLoopDelay({resolution:10});delay.enable();const start=performance.now();let groups=0,last;
 for(let base=0;base<total;base+=1000){const tabs=Array.from({length:Math.min(1000,total-base)},(_,i)=>({url:`https://synthetic.example/projects/${base+i}?release=2026&variant=desktop`,title:`Synthetic project ${base+i} documentation release notes and performance reference`,pinned:false}));last=await ask('save',{title:`Synthetic research batch ${groups++}`,created:1,tabs});}
 const ingestMs=performance.now()-start;const timings=[];for(let n=0;n<100;n++){const t=performance.now();const result=await ask('tabs',{group:last.id,after:total-1000+900});if(result.items.length!==100)throw Error('Deep page lost rows');timings.push(performance.now()-t);}
 const check=await ask('health');store.close();await new Promise(r=>setTimeout(r,100));store=new TabCollections({file});const reopened=await ask('tabs',{group:last.id});if(reopened.items.length!==100)throw Error('Restart lost rows');const files=fs.readdirSync(dir).map(name=>({name,bytes:fs.statSync(path.join(dir,name)).size}));timings.sort((a,b)=>a-b);delay.disable();store.close();
 console.log(JSON.stringify({synthetic:true,tabs:total,groups,ingestMs,page100P50ms:timings[50],page100P95ms:timings[95],parentEventLoopP99ms:delay.percentile(99)/1e6,parentRss:process.memoryUsage().rss,integrity:check.integrity,restart:true,files},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
