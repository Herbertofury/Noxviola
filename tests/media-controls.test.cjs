'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {JSDOM}=require('jsdom');
const {createMediaControls}=require('../browser/media-controls.cjs');

function fixture({identity='personal',id='tab-1',kind='tab',html='<audio title="Synthetic song"></audio>'}={}){
 const dom=new JSDOM(html,{url:'https://fixture.invalid/player',runScripts:'outside-only'}),wc=new EventEmitter(),calls=[];
 const frame={frameTreeNodeId:1,frameToken:'document-one',processId:2,routingId:3,origin:'https://fixture.invalid',url:'https://fixture.invalid/player',detached:false,isDestroyed:()=>false};
 frame.framesInSubtree=[frame];frame.executeJavaScript=async(code,userGesture)=>{calls.push({code,userGesture});return structuredClone(await dom.window.eval(code));};
 let muted=false;Object.assign(wc,{mainFrame:frame,isDestroyed:()=>false,getURL:()=>frame.url,isAudioMuted:()=>muted,isCurrentlyAudible:()=>false,setAudioMuted:value=>{muted=value;}});
 const allMedia=()=>[...dom.window.document.querySelectorAll('audio,video')];
 function prepare(element){
  let paused=true,ended=false,currentTime=0,volume=1,elementMuted=false;const operations=[];
  Object.defineProperties(element,{paused:{get:()=>paused},ended:{get:()=>ended},currentTime:{get:()=>currentTime,set:value=>{currentTime=value;operations.push(['seek',value]);}},duration:{get:()=>60},volume:{get:()=>volume,set:value=>{volume=value;operations.push(['volume',value]);}},muted:{get:()=>elementMuted,set:value=>{elementMuted=value;operations.push(['mute',value]);}},currentSrc:{get:()=>'https://fixture.invalid/generated.wav'},seekable:{get:()=>({length:1,start:()=>0,end:()=>60})}});
  element.play=async()=>{operations.push(['play']);paused=false;ended=false;};element.pause=()=>{operations.push(['pause']);paused=true;};return {operations};
 }
 const prepared=allMedia().map(prepare),source={id,identity,kind,title:'Synthetic fixture',webContents:wc};
 return {dom,wc,frame,source,prepared,prepare,calls,close:()=>dom.window.close()};
}

test('media controls operate on real element methods/properties and return current metadata',async()=>{
 const f=fixture();let changes=0;const service=createMediaControls({getSources:()=>[f.source],onChange:()=>changes++});
 try{
  Object.defineProperty(f.dom.window.navigator,'mediaSession',{value:{metadata:{title:'A song',artist:'Synthetic artist',album:'Synthetic album'}}});
  const before=await service.list('personal');assert.equal(before.items.length,1);const item=before.items[0];assert.equal(item.title,'A song');assert.equal(item.artist,'Synthetic artist');assert.equal(item.paused,true);assert.equal(item.duration,60);assert.deepEqual(item.seekable,[[0,60]]);
  assert.equal((await service.act('personal',{id:item.id,action:'play'})).paused,false);assert.equal(f.calls.at(-1).userGesture,true);
  assert.equal((await service.act('personal',{id:item.id,action:'pause'})).paused,true);
  assert.equal((await service.act('personal',{id:item.id,action:'toggle'})).paused,false);
  assert.equal((await service.act('personal',{id:item.id,action:'mute'})).muted,true);
  assert.equal((await service.act('personal',{id:item.id,action:'unmute'})).muted,false);
  assert.equal((await service.act('personal',{id:item.id,action:'volume',value:.3})).volume,.3);
  assert.equal((await service.act('personal',{id:item.id,action:'seek',value:12})).currentTime,12);
  assert.deepEqual(f.prepared[0].operations,[['play'],['pause'],['play'],['mute',true],['mute',false],['volume',.3],['seek',12]]);assert.equal(changes,7);
  const again=await service.list('personal');assert.equal(again.items[0].id,item.id,'Refreshing the same real element preserves its control identity');
 }finally{service.dispose();f.close();}
});

test('identity boundaries reject foreign media IDs and source-wide mute requests',async()=>{
 const f=fixture(),g=fixture({identity:'work',id:'sidebar-work',kind:'sidebar'}),service=createMediaControls({getSources:()=>[f.source,g.source]});
 try{
  const personal=await service.list('personal'),work=await service.list('work');assert.equal(personal.items.length,1);assert.equal(work.items.length,1);assert.equal(work.items[0].kind,'sidebar');
  await assert.rejects(service.act('work',{id:personal.items[0].id,action:'play'}),/no longer available in this identity/);
  await assert.rejects(service.act('work',{sourceId:f.source.id,action:'page-mute'}),/no longer available in this identity/);
  const muted=await service.act('personal',{sourceId:f.source.id,action:'page-mute'});assert.equal(muted.muted,true);assert.equal(f.wc.isAudioMuted(),true);assert.equal(g.wc.isAudioMuted(),false);
 }finally{service.dispose();f.close();g.close();}
});

test('native navigation, document replacement and removed owners invalidate stale actions',async()=>{
 const f=fixture();let owners=[f.source];const service=createMediaControls({getSources:()=>owners});
 try{
  const [item]=(await service.list('personal')).items;f.wc.emit('did-start-navigation',{},f.frame.url,false,true);await assert.rejects(service.act('personal',{id:item.id,action:'play'}),/no longer available/);
  const [second]=(await service.list('personal')).items;f.frame.frameToken='new-document';await assert.rejects(service.act('personal',{id:second.id,action:'play'}),/no longer available/);
  const [third]=(await service.list('personal')).items;owners=[];await assert.rejects(service.act('personal',{id:third.id,action:'play'}),/no longer available/);assert.equal(f.wc.listenerCount('media-paused'),0);
  assert.equal(f.prepared[0].operations.length,0);
 }finally{service.dispose();f.close();}
});

test('DOM removal cannot redirect a stale control to a replacement element',async()=>{
 const f=fixture(),service=createMediaControls({getSources:()=>[f.source]});
 try{
  const [item]=(await service.list('personal')).items;f.dom.window.document.querySelector('audio').remove();const replacement=f.dom.window.document.createElement('audio');f.dom.window.document.body.append(replacement);const prepared=f.prepare(replacement);
  await assert.rejects(service.act('personal',{id:item.id,action:'play'}),/media element changed/);assert.equal(prepared.operations.length,0);
  const [fresh]=(await service.list('personal')).items;assert.notEqual(fresh.id,item.id);assert.equal((await service.act('personal',{id:fresh.id,action:'play'})).paused,false);
 }finally{service.dispose();f.close();}
});

test('real play failures, invalid inputs, and unseekable positions surface as failures',async()=>{
 const f=fixture(),service=createMediaControls({getSources:()=>[f.source]});
 try{
  const [item]=(await service.list('personal')).items;f.dom.window.document.querySelector('audio').play=async()=>{throw new Error('NotAllowedError: website blocked playback');};
  await assert.rejects(service.act('personal',{id:item.id,action:'play'}),/NotAllowedError/);
  for(const value of [-1,1.01,Infinity,NaN,'0.5'])await assert.rejects(service.act('personal',{id:item.id,action:'volume',value}),/Volume/);
  await assert.rejects(service.act('personal',{id:item.id,action:'seek',value:61}),/seekable range/);
  await assert.rejects(service.act('personal',{id:item.id,action:'nexttrack'}),/Track controls are only available in the Player/);assert.equal(f.prepared[0].operations.length,0);
 }finally{service.dispose();f.close();}
});

test('discovery includes subframes and open shadow media and performs no periodic work',async()=>{
 const f=fixture({html:'<div id="host"></div>'}),g=fixture({html:'<video></video>'});const shadow=f.dom.window.document.getElementById('host').attachShadow({mode:'open'}),audio=f.dom.window.document.createElement('audio');shadow.append(audio);f.prepare(audio);
 Object.assign(g.frame,{frameTreeNodeId:10,frameToken:'child-document'});f.frame.framesInSubtree.push(g.frame);let changes=0;const service=createMediaControls({getSources:()=>[f.source],onChange:()=>changes++});
 try{
  const result=await service.list('personal');assert.equal(result.items.length,2);assert.deepEqual(result.items.map(item=>item.tag).sort(),['audio','video']);
  f.wc.emit('media-paused');assert.equal(changes,1);assert.equal(f.calls.length,1,'Native events notify without polling or injecting another script');
  service.dispose();for(const name of ['media-paused','media-started-playing','audio-state-changed','did-start-navigation','destroyed'])assert.equal(f.wc.listenerCount(name),0);
  await assert.rejects(service.list('personal'),/disposed/);
 }finally{service.dispose();f.close();g.close();}
});
