'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {ResourceMonitor}=require('../browser/resources.cjs');
test('resource samples are explicit, count each native process once and distinguish missing CPU interval',()=>{
  let calls=0,time=1000;const session={},metrics=[{pid:2,type:'Tab',cpu:{percentCPUUsage:12.5,cumulativeCPUUsage:5},memory:{workingSetSize:1024,peakWorkingSetSize:2048},sandboxed:true}];
  const wc=id=>({id,session,isDestroyed:()=>false,getOSProcessId:()=>2,getURL:()=>'',getType:()=> 'webview'});
  const monitor=new ResourceMonitor({app:{getAppMetrics(){calls++;return metrics;}},webContents:{getAllWebContents:()=>[wc(4),wc(5)]},tabs:()=>[{id:'a',title:'One',identity:'personal',webContentsId:4},{id:'b',title:'Two',identity:'work',webContentsId:5}],clock:()=>time});
  assert.equal(calls,0);const first=monitor.sample();assert.equal(first.processCount,1);assert.equal(first.workingSetBytes,1024*1024);assert.equal(first.processes[0].owners.length,2);assert.equal(first.processes[0].cpuPercent,null);assert.equal(first.intervalMs,null);
  time=3500;const second=monitor.sample();assert.equal(second.intervalMs,2500);assert.equal(second.processes[0].cpuPercent,12.5);assert.equal(calls,2);
});
test('extension attribution requires the same native session and missing metrics stay unknown',()=>{
  const session={},other={},wc={id:8,session,isDestroyed:()=>false,getOSProcessId:()=>8,getURL:()=>`chrome-extension://${'a'.repeat(32)}/background.html`,getType:()=> 'backgroundPage'};
  const monitor=new ResourceMonitor({app:{getAppMetrics:()=>[{pid:8,type:'Tab',cpu:{}}]},webContents:{getAllWebContents:()=>[wc]},extensions:()=>[{id:'one',name:'Other identity',identities:[{runtimeId:'a'.repeat(32),session:other}]}]});
  const sample=monitor.sample();assert.equal(sample.workingSetBytes,null);assert.equal(sample.processes[0].sandboxed,null);assert.notEqual(sample.processes[0].owners[0].kind,'extension');
});
