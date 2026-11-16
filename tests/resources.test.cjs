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

test('reported private kilobytes become bytes and shared owners never duplicate a process total',()=>{
  let calls=0;
  const metrics=[
    {pid:10,type:'Browser',memory:{workingSetSize:4096,peakWorkingSetSize:8192,privateBytes:2048}},
    {pid:20,type:'Tab',memory:{workingSetSize:2048,peakWorkingSetSize:3072,privateBytes:512},sandboxed:true},
  ];
  const wc=id=>({id,isDestroyed:()=>false,getOSProcessId:()=>20,getURL:()=>'',getType:()=> 'webview'});
  const monitor=new ResourceMonitor({app:{getAppMetrics(){calls++;return metrics;}},webContents:{getAllWebContents:()=>[wc(1),wc(2)]},
    tabs:()=>[{id:'a',title:'First',identity:'personal',webContentsId:1},{id:'b',title:'Second',identity:'personal',webContentsId:2}]});
  assert.equal(calls,0);
  const sample=monitor.sample();
  assert.equal(calls,1,'one explicit sample must make one native metrics call');
  assert.deepEqual(sample.processes.map(row=>row.privateBytes),[2*1024*1024,512*1024]);
  assert.equal(sample.processes[1].owners.length,2);
  assert.equal(sample.privateBytes,2560*1024);
  assert.deepEqual(sample.privateBytesAvailability,{reportedProcesses:2,totalProcesses:2,complete:true});
  assert.equal(sample.workingSetBytes,6144*1024,'working-set accounting remains separate and unchanged');
  assert.match(sample.caveat,/kilobytes \(1024 bytes\)/);
  assert.match(sample.caveat,/optional Windows-only/);
  assert.match(sample.caveat,/not reported on Linux/);
});

test('partial or invalid private measurements remain unknown without hiding reported working sets',()=>{
  const invalid=[undefined,null,-1,NaN,Infinity,-Infinity,'64',0.5,Number.MAX_SAFE_INTEGER,1n];
  for(const value of invalid){
    const monitor=new ResourceMonitor({app:{getAppMetrics:()=>[
      {pid:1,type:'Browser',memory:{workingSetSize:1024,privateBytes:128}},
      {pid:2,type:'Tab',memory:{workingSetSize:512,privateBytes:value}},
    ]},webContents:{getAllWebContents:()=>[]}});
    const sample=monitor.sample();
    assert.equal(sample.processes[0].privateBytes,128*1024);
    assert.equal(sample.processes[1].privateBytes,null);
    assert.equal(sample.privateBytes,null,'a partial private subtotal must never be presented as the process total');
    assert.deepEqual(sample.privateBytesAvailability,{reportedProcesses:1,totalProcesses:2,complete:false});
    assert.equal(sample.workingSetBytes,1536*1024);
    assert.equal(sample.processes[1].sandboxed,null,'missing sandbox status must not become false');
  }
});

test('a reported private zero is distinct from missing data or an empty process sample',()=>{
  let metrics=[{pid:1,type:'Browser',memory:{privateBytes:0}}];
  const monitor=new ResourceMonitor({app:{getAppMetrics:()=>metrics},webContents:{getAllWebContents:()=>[]}});
  const zero=monitor.sample();assert.equal(zero.processes[0].privateBytes,0);assert.equal(zero.privateBytes,0);
  assert.deepEqual(zero.privateBytesAvailability,{reportedProcesses:1,totalProcesses:1,complete:true});
  metrics=[{pid:1,type:'Browser'}];const missing=monitor.sample();assert.equal(missing.privateBytes,null);
  assert.deepEqual(missing.privateBytesAvailability,{reportedProcesses:0,totalProcesses:1,complete:false});
  metrics=[];const empty=monitor.sample();assert.equal(empty.privateBytes,null);
  assert.deepEqual(empty.privateBytesAvailability,{reportedProcesses:0,totalProcesses:0,complete:false});
});
