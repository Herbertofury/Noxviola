'use strict';

const {setTimeout:delay}=require('node:timers/promises');
const test=require('node:test');
const assert=require('node:assert/strict');
const {createPlayerSession}=require('../browser/player-session.cjs');

function fixture(t){
  let owner='personal',playing=true,peer=false;
  const settings={enabled:true,autoPause:true,resumeSeconds:0};
  const calls=[],reports=[],presentations=[];
  const item=()=>({id:'media',provider:'spotify',sourceId:'player',hasSource:true,paused:!playing,ended:false,title:'Synthetic song'});
  const source=(id,identity,provider,isCurrentlyAudible)=>({
    id,identity,provider,webContents:{isDestroyed:()=>false,isAudioMuted:()=>false,isCurrentlyAudible},
  });
  const sources=()=>[
    source('player','personal','spotify',()=>playing),
    source('peer','work',null,()=>peer),
  ];
  const media={
    list:async(identity,ids)=>({items:identity==='personal'&&ids.includes('player')?[item()]:[]}),
    act:async(identity,request)=>{
      calls.push({identity,...request});
      if(request.action==='pause')playing=false;
      if(request.action==='play')playing=true;
      return item();
    },
  };
  const player=createPlayerSession({media,identity:()=>owner,sources,settings:()=>settings,
    changed:value=>presentations.push(value),report:error=>reports.push(error)});
  t.after(()=>player.dispose());
  return {player,calls,reports,presentations,settings,media,setPeer:value=>{peer=value;},setOwner:value=>{owner=value;}};
}

test('Player interrupts for a competing tab and resumes only its own track',async t=>{
  const {player,calls,reports,setPeer}=fixture(t);
  await player.schedule();
  assert.equal(player.state().item.paused,false);
  setPeer(true);await player.schedule();
  assert.deepEqual(calls,[{identity:'personal',id:'media',action:'pause'}]);
  assert.equal(player.state().interrupted,true);
  assert.equal(player.state().item.paused,true);
  setPeer(false);await player.schedule();
  for(let i=0;i<20&&calls.length<2;i++)await delay(10);
  await player.schedule();
  assert.deepEqual(calls[1],{identity:'personal',id:'media',action:'play',automatic:true});
  assert.equal(player.state().interrupted,false);
  assert.equal(player.state().item.paused,false);
  assert.deepEqual(reports,[]);
});

test('Player Never and a manual pause both prevent automatic resumption',async t=>{
  const {player,calls,settings,setPeer}=fixture(t);
  settings.resumeSeconds=null;
  setPeer(true);await player.schedule();setPeer(false);await player.schedule();
  await delay(20);
  assert.equal(calls.length,1);
  await player.perform('personal',{id:'media',action:'play'});
  await player.schedule();
  setPeer(true);await player.schedule();
  await player.perform('personal',{id:'media',action:'pause'});
  settings.resumeSeconds=0;setPeer(false);await player.schedule();
  await delay(20);
  assert.deepEqual(calls.map(call=>call.action),['pause','play','pause','pause']);
  assert.equal(player.state().interrupted,false);
});

test('An identity switch invalidates in-flight metadata and rejects old transport commands',async t=>{
  const {player,calls,presentations,media,setOwner}=fixture(t);
  const deferred=Promise.withResolvers(),original=media.list;
  media.list=(identity,ids)=>identity==='personal'?deferred.promise:original(identity,ids);
  const inFlight=player.schedule();
  await Promise.resolve();
  setOwner('work');player.invalidate();
  deferred.resolve({items:[{id:'stale',hasSource:true,paused:false,title:'Old identity'}]});
  await inFlight;
  assert.deepEqual(player.state(),{identity:'work',item:null,provider:null,interrupted:false});
  assert.ok(presentations.every(value=>value.item===null));
  await assert.rejects(player.perform('personal',{id:'stale',action:'pause'}),/session has changed/);
  assert.deepEqual(calls,[]);
});
