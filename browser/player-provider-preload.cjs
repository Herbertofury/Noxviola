'use strict';

// The page keeps its Media Session handlers. Only their standard track
// actions are surfaced, and this preload gives pages no host privileges.
const {contextBridge,ipcRenderer}=require('electron');
if(process.isMainFrame){
  let queued=false;
  document.addEventListener('noxviola-player-change',()=>{
    if(queued)return;
    queued=true;
    setTimeout(()=>{queued=false;ipcRenderer.send('player-source-changed');},80);
  });
  contextBridge.executeInMainWorld({func:()=>{
    const session=navigator.mediaSession;
    if(!session)return;
    const allowed=new Set(['previoustrack','nexttrack']);
    const actions=new Map(),announce=()=>document.dispatchEvent(new Event('noxviola-player-change'));
    const original=session.setActionHandler;
    function setActionHandler(action,handler){
      const result=Reflect.apply(original,this,arguments);
      if(this===session&&allowed.has(action)){
        if(typeof handler==='function')actions.set(action,handler);
        else actions.delete(action);
        announce();
      }
      return result;
    }
    const field=Object.getOwnPropertyDescriptor(MediaSession.prototype,'metadata');
    if(field?.get&&field?.set)Object.defineProperty(session,'metadata',{
      configurable:true,
      get(){return field.get.call(this);},
      set(value){field.set.call(this,value);announce();},
    });
    Object.defineProperty(session,'setActionHandler',{value:setActionHandler,writable:true,configurable:true});
    Object.defineProperty(globalThis,Symbol.for('noxviola.player.transport'),{value:Object.freeze({
      available:()=>[...actions.keys()],
      invoke:action=>{
        const handler=actions.get(action);
        if(!handler)throw new Error('This player does not provide that track command.');
        handler.call(session,{action});
      },
    })});
  }});
}
