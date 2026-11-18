'use strict';

// Explicit, local inspection only: no timer, remote artwork, telemetry, or media
// state persistence. Sources come from the browser's canonical identity owners.
// WebFrameMain exposes executeJavaScript (main world), so a hostile website can
// affect its own reported media state. It receives no shell bridge or secrets.
const {randomUUID} = require('node:crypto');
const {presets,processElement}=require('./player-audio.cjs');

const LIMITATION = 'Controls operate on real audio/video elements in page frames and open shadow roots. Next and previous require a registered Media Session handler on a Player site. Closed shadow roots, Web Audio-only players, proprietary commands and DRM authorization are outside this adapter. Website playback restrictions and errors remain effective.';

// Kept as a function so the same actual DOM operations can be exercised in tests.
function inPage(key, operation, argument, processAudio) {
  const own = Object.getOwnPropertyDescriptor(globalThis, key);
  let registry = own?.value;
  if (!registry || registry.document !== document || !(registry.ids instanceof WeakMap) || !(registry.elements instanceof Map)) {
    registry = {document, ids:new WeakMap(), elements:new Map(), effects:new Map(), processing:new WeakSet(), serial:0};
    Object.defineProperty(globalThis, key, {value:registry, configurable:true});
  }
  function elements(root, found = []) {
    for (const node of root.querySelectorAll('*')) {
      if (node instanceof HTMLMediaElement) found.push(node);
      if (node.shadowRoot) elements(node.shadowRoot, found);
    }
    return found;
  }
  function state(element, elementId) {
    const finite = value => Number.isFinite(value) ? value : null;
    const ranges = [];
    for (let index=0; index<element.seekable.length; index++) ranges.push([element.seekable.start(index),element.seekable.end(index)]);
    const metadata = navigator.mediaSession?.metadata,effect=registry.effects.get(element);
    const transport=globalThis[Symbol.for('noxviola.player.transport')];
    return {elementId,tag:element.tagName.toLowerCase(),hasSource:Boolean(element.currentSrc || element.src || element.srcObject),
      title:String(metadata?.title || element.getAttribute('aria-label') || element.title || '').slice(0,2048),
      artist:String(metadata?.artist || '').slice(0,2048),album:String(metadata?.album || '').slice(0,2048),
      paused:element.paused,ended:element.ended,muted:effect?.userMuted??element.muted,volume:finite(element.volume),
      gain:effect?.gain??1,preset:effect?.preset??'Flat',canProcess:typeof element.captureStream==='function'&&!element.mediaKeys&&!element.srcObject,
      currentTime:finite(element.currentTime),duration:finite(element.duration),playbackRate:finite(element.playbackRate),
      seekable:ranges,actions:transport?.available()||[],error:element.error ? {code:element.error.code,message:String(element.error.message || '').slice(0,2048)} : null};
  }
  if (operation === 'list') {
    const all = elements(document), present = new Set(all), items = [];
    for(const [element,effect] of registry.effects)if(!present.has(element))effect.stop();
    for (const [id, reference] of registry.elements) {
      const element = reference.deref(); if (!element || !present.has(element)) registry.elements.delete(id);
    }
    for (const element of all) {
      let id = registry.ids.get(element);
      if (!id || !registry.elements.has(id)) {id=++registry.serial;registry.ids.set(element,id);registry.elements.set(id,new WeakRef(element));}
      items.push(state(element,id));
    }
    return items;
  }
  const element = registry.elements.get(argument.elementId)?.deref();
  if (!(element instanceof HTMLMediaElement) || !element.isConnected || element.ownerDocument !== document) throw new Error('The media element changed. Refresh the media list.');
  return (async () => {
    switch (operation) {
      case 'play': await element.play(); break;
      case 'pause': element.pause(); break;
      case 'toggle': if (element.paused || element.ended) await element.play(); else element.pause(); break;
      case 'previoustrack':case 'nexttrack': {
        const transport=globalThis[Symbol.for('noxviola.player.transport')];
        if(!transport)throw new Error('The page does not provide a player transport.');
        transport.invoke(operation);
        break;
      }
      case 'mute': case 'unmute': {
        const muted=operation==='mute',effect=registry.effects.get(element);
        if(effect){effect.userMuted=muted;effect.update({gain:effect.gain,preset:effect.preset,filters:effect.filters});}
        else element.muted=muted;
        break;
      }
      case 'effects':
        if(registry.processing.has(element))throw new Error('Wait for audio processing to start.');
        registry.processing.add(element);
        try{await processAudio(element,registry,argument.value);}
        finally{registry.processing.delete(element);}
        break;
      case 'volume': element.volume=argument.value; break;
      case 'seek': {
        let seekable=false;
        for (let index=0;index<element.seekable.length;index++) if (argument.value>=element.seekable.start(index) && argument.value<=element.seekable.end(index)) seekable=true;
        if (!seekable) throw new Error('The requested position is outside this media element’s seekable range.');
        element.currentTime=argument.value; break;
      }
      default: throw new Error('Unsupported media action.');
    }
    return state(element,argument.elementId);
  })();
}

function frameState(frame) {
  try {
    if (!frame || frame.detached || frame.isDestroyed?.() || !Number.isSafeInteger(frame.frameTreeNodeId)) return null;
    // Only browser-owned web documents are admitted, not extension/shell pages.
    const origin=new URL(frame.origin);
    if (!['https:','http:'].includes(origin.protocol) || origin.username || origin.password) return null;
    return {frame,id:frame.frameTreeNodeId,token:frame.frameToken,processId:frame.processId,routingId:frame.routingId,origin:origin.origin,url:frame.url};
  } catch {return null;}
}
function sameFrame(before) {
  const now=frameState(before.frame);
  return Boolean(now && now.id===before.id && now.token===before.token && now.processId===before.processId && now.routingId===before.routingId && now.origin===before.origin && now.url===before.url);
}
function safeText(value) {return typeof value==='string' ? value.slice(0,2048) : '';}
function publicState(item) {
  if (!item || !Number.isSafeInteger(item.elementId) || item.elementId<1 || !['audio','video'].includes(item.tag)) throw new Error('The website returned an invalid media item.');
  const number=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
  return {tag:item.tag,hasSource:item.hasSource===true,title:safeText(item.title),artist:safeText(item.artist),album:safeText(item.album),
    paused:item.paused===true,ended:item.ended===true,muted:item.muted===true,volume:number(item.volume),
    gain:number(item.gain)??1,preset:Object.hasOwn(presets,item.preset)?item.preset:'Flat',canProcess:item.canProcess===true,
    actions:Array.isArray(item.actions)?item.actions.filter(value=>['previoustrack','nexttrack'].includes(value)):[],
    currentTime:number(item.currentTime),duration:number(item.duration),playbackRate:number(item.playbackRate),
    seekable:Array.isArray(item.seekable)?item.seekable.filter(range=>Array.isArray(range)&&range.length===2&&range.every(value=>number(value)!==null)&&range[0]>=0&&range[1]>=range[0]).map(range=>[...range]):[],
    error:item.error?{code:number(item.error.code),message:safeText(item.error.message)}:null};
}

function createMediaControls({getSources,onChange=()=>{}}) {
  if (typeof getSources!=='function' || typeof onChange!=='function') throw new TypeError('Media controls require source and change callbacks.');
  const registryKey=`__noxviola_media_${randomUUID().replaceAll('-','')}`, tracked=new Map(), targets=new Map();
  let disposed=false;
  function notify() {if (!disposed) onChange();}
  function forget(wc) {for (const [id,target] of targets) if (target.wc===wc) targets.delete(id);}
  function untrack(wc) {
    const record=tracked.get(wc);if (!record) return;
    for (const [name,handler] of record.listeners) wc.removeListener(name,handler);
    tracked.delete(wc);forget(wc);
  }
  function track(wc) {
    if (tracked.has(wc)) return tracked.get(wc);
    const record={generation:0,listeners:[]};tracked.set(wc,record);
    const add=(event,handler)=>{record.listeners.push([event,handler]);wc.on(event,handler);};
    const invalidate=()=>{record.generation++;forget(wc);notify();};
    add('did-start-navigation',(_event,_url,isSameDocument)=>{if (!isSameDocument) invalidate();});
    add('render-process-gone',invalidate);
    add('destroyed',()=>{untrack(wc);notify();});
    for (const name of ['media-started-playing','media-paused','audio-state-changed','page-title-updated']) add(name,notify);
    return record;
  }
  function sources(identity,sourceIds) {
    if (disposed) throw new Error('Media controls have been disposed.');
    if (typeof identity!=='string' || !identity) throw new TypeError('An identity is required.');
    const all=getSources();if (!Array.isArray(all)) throw new TypeError('Media sources must be an array.');
    const live=all.filter(source=>source&&typeof source.id==='string'&&source.id&&typeof source.identity==='string'&&['tab','sidebar'].includes(source.kind)&&source.webContents&&!source.webContents.isDestroyed());
    const owned=new Set(live.map(source=>source.webContents));
    for (const wc of tracked.keys()) if (!owned.has(wc)) untrack(wc);
    const unique=new Set(),allowed=sourceIds&&new Set(sourceIds);
    return live.filter(source=>{if(source.identity!==identity||(allowed&&!allowed.has(source.id))||unique.has(source.webContents))return false;unique.add(source.webContents);track(source.webContents);return true;});
  }
  function valid(target,identity) {
    const source=sources(identity).find(source=>source.id===target.sourceId && source.webContents===target.wc);
    return Boolean(source && target.identity===identity && tracked.get(target.wc)?.generation===target.generation && sameFrame(target.frame));
  }
  function sourceState(source) {
    const wc=source.webContents;let origin='';try{origin=new URL(wc.getURL()).origin;}catch{}
    return {id:source.id,identity:source.identity,kind:source.kind,title:safeText(source.title),origin,muted:wc.isAudioMuted(),audible:wc.isCurrentlyAudible()};
  }
  function card(target,item,source) {
    const state=publicState(item);
    return {id:target.id,sourceId:source.id,identity:source.identity,kind:source.kind,provider:source.provider||null,sourceTitle:safeText(source.title),
      origin:target.frame.origin,pageMuted:source.webContents.isAudioMuted(),...state,actions:source.provider?state.actions:[]};
  }
  async function list(identity,sourceIds) {
    const live=sources(identity,sourceIds), items=[],errors=[],seen=new Set();
    const inspected=new Set(live.map(source=>source.id));
    await Promise.all(live.map(async source=>{
      const wc=source.webContents,generation=tracked.get(wc).generation;
      let frames;try{frames=wc.mainFrame.framesInSubtree;}catch(error){errors.push({sourceId:source.id,message:safeText(error.message)});return;}
      await Promise.all(frames.map(async nativeFrame=>{
        const frame=frameState(nativeFrame);if(!frame)return;
        try {
          const results=await nativeFrame.executeJavaScript(`(${inPage.toString()})(${JSON.stringify(registryKey)},'list')`);
          if(disposed||wc.isDestroyed()||tracked.get(wc)?.generation!==generation||!sameFrame(frame))return;
          if(!Array.isArray(results))throw new Error('The website returned an invalid media list.');
          for(const item of results){
            publicState(item);
            let target=[...targets.values()].find(target=>target.identity===identity&&target.sourceId===source.id&&target.wc===wc&&target.frame.frame===nativeFrame&&target.generation===generation&&target.elementId===item.elementId);
            if(!target){target={id:randomUUID(),sourceId:source.id,identity,wc,frame,generation,elementId:item.elementId};targets.set(target.id,target);}
            seen.add(target.id);items.push(card(target,item,source));
          }
        }catch(error){errors.push({sourceId:source.id,origin:frame.origin,message:safeText(error.message)});}
      }));
    }));
    for(const [id,target] of targets)if(target.identity===identity&&(!sourceIds||inspected.has(target.sourceId))&&!seen.has(id))targets.delete(id);
    return {identity,items,sources:live.map(sourceState),errors,limitation:LIMITATION};
  }
  async function act(identity,request) {
    if(!request||typeof request!=='object')throw new TypeError('A media action is required.');
    const live=sources(identity),action=request.action;
    if(['page-mute','page-unmute'].includes(action)){
      const source=live.find(source=>source.id===request.sourceId);if(!source)throw new Error('This media source is no longer available in this identity.');
      source.webContents.setAudioMuted(action==='page-mute');notify();return sourceState(source);
    }
    if(!['play','pause','toggle','mute','unmute','volume','seek','effects','previoustrack','nexttrack'].includes(action))throw new Error('Unsupported media action.');
    if(action==='volume'&&!(Number.isFinite(request.value)&&request.value>=0&&request.value<=1))throw new Error('Volume must be between 0 and 1.');
    if(action==='seek'&&!(Number.isFinite(request.value)&&request.value>=0))throw new Error('A nonnegative seek position is required.');
    const target=targets.get(request.id);
    if(!target||!valid(target,identity))throw new Error('This media item is no longer available in this identity. Refresh the media list.');
    const source=live.find(source=>source.id===target.sourceId&&source.webContents===target.wc);
    if(['previoustrack','nexttrack'].includes(action)&&!source.provider)throw new Error('Track controls are only available in the Player.');
    let value=request.value,processor='undefined';
    if(action==='effects'){
      if(!value||!Number.isFinite(value.gain)||value.gain<1||value.gain>5||!Object.hasOwn(presets,value.preset))throw new Error('Choose gain between 100% and 500% and an available equalizer preset.');
      value={gain:value.gain,preset:value.preset,filters:presets[value.preset]};
      processor=processElement.toString();
    }
    const gesture=!request.automatic&&['play','toggle','effects','previoustrack','nexttrack'].includes(action);
    const result=await target.frame.frame.executeJavaScript(`(${inPage.toString()})(${JSON.stringify(registryKey)},${JSON.stringify(action)},${JSON.stringify({elementId:target.elementId,value})},${processor})`,gesture);
    if(!valid(target,identity))throw new Error('The media document changed while the action was running.');
    notify();return card(target,result,source);
  }
  function dispose(){if(disposed)return;disposed=true;for(const wc of [...tracked.keys()])untrack(wc);targets.clear();}
  return {list,act,dispose};
}

module.exports={createMediaControls,inPage,LIMITATION};
