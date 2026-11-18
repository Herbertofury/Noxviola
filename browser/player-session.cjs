'use strict';

// Coordinates a browser-owned Player source with its views. There is no
// polling or timer outside the explicitly requested resume delay.
function createPlayerSession({media,identity,sources,settings,changed=()=>{},report=()=>{}}){
  let current={identity:null,item:null,provider:null,interrupted:false};
  let dirty=false,running=null,disposed=false,held=null,resume=null,revision=0,quietSince=null;
  let manualOverride=false,configuration='',paintKey='';
  const preferred=new Map();
  const audible=source=>!source.webContents.isDestroyed()&&!source.webContents.isAudioMuted()&&source.webContents.isCurrentlyAudible();
  function clearDelay(){
    if(resume)clearTimeout(resume);
    resume=null;
  }
  function reset(){
    held=null;quietSince=null;manualOverride=false;revision++;clearDelay();
  }
  function publish(next,force=false){
    current=next;
    // Elapsed time alone is not an event. Views interpolate or seek locally.
    const key=JSON.stringify({...next,item:next.item?{...next.item,currentTime:undefined}:null});
    if(force||key!==paintKey){paintKey=key;changed(next);}
  }
  async function refresh(){
    const owner=identity(),options=settings();
    const config=JSON.stringify([owner,options.enabled,options.autoPause,options.resumeSeconds]);
    if(current.identity!==owner||configuration!==config){
      const previous=current.identity===owner?held:null;
      // Disabling automatic interruption leaves the currently paused track
      // under the user's control. Changing delay retains this session's token.
      reset();
      if(previous&&options.enabled&&options.autoPause)held=previous;
      configuration=config;
    }
    const generation=revision;
    const all=sources(),players=all.filter(source=>source.identity===owner&&source.provider);
    if(!options.enabled||!players.length){
      if(held)reset();
      publish({identity:owner,item:null,provider:null,interrupted:false});
      return;
    }
    const {items}=await media.list(owner,players.map(source=>source.id));
    if(disposed||generation!==revision||owner!==identity())return;
    const playback=items.filter(item=>item.hasSource&&!item.ended);
    const favorite=preferred.get(owner);
    const item=playback.find(candidate=>candidate.id===held?.id)||
      playback.find(candidate=>candidate.provider===favorite&&!candidate.paused)||
      playback.find(candidate=>!candidate.paused)||
      playback.find(candidate=>candidate.id===current.item?.id)||
      playback.find(candidate=>candidate.provider===favorite)||playback[0]||null;
    if(held&&held.id!==item?.id){held=null;quietSince=null;clearDelay();}
    const competing=Boolean(item&&all.some(source=>source.id!==item.sourceId&&audible(source)));
    if(!competing)manualOverride=false;
    if(competing){quietSince=null;clearDelay();}
    if(item&&!item.paused&&competing&&options.autoPause&&!manualOverride){
      const result=await media.act(owner,{id:item.id,action:'pause'});
      if(disposed||generation!==revision||owner!==identity())return;
      held={id:item.id,owner};
      publish({identity:owner,item:result,provider:result.provider,interrupted:true});
      return;
    }
    if(held&&!competing&&options.resumeSeconds!==null){
      quietSince??=Date.now();
      if(!resume)resume=setTimeout(()=>{
        resume=null;
        if(disposed||generation!==revision||owner!==identity()||!held||sources().some(source=>source.id!==item.sourceId&&audible(source)))return;
        const ticket=held;held=null;quietSince=null;
        void media.act(ticket.owner,{id:ticket.id,action:'play',automatic:true}).catch(report).finally(schedule);
      },Math.max(0,options.resumeSeconds*1000-(Date.now()-quietSince)));
    }
    publish({identity:owner,item,provider:item?.provider||favorite||players[0]?.provider||null,interrupted:!!held});
  }
  function schedule(){
    if(disposed)return Promise.resolve();
    dirty=true;
    if(!running)running=Promise.resolve().then(async()=>{
      while(dirty&&!disposed){
        dirty=false;
        try{await refresh();}catch(error){
          held=null;quietSince=null;clearDelay();
          report(error);
        }
      }
    }).finally(()=>{running=null;if(dirty&&!disposed)schedule();});
    return running;
  }
  function select(owner,provider){
    if(preferred.get(owner)!==provider){
      preferred.set(owner,provider);
      reset();
    }
    void schedule();
  }
  function invalidate(){
    reset();
    publish({identity:identity(),item:null,provider:null,interrupted:false});
    void schedule();
  }
  async function perform(owner,{id,action,value}={}){
    if(disposed||!settings().enabled||owner!==identity()||owner!==current.identity||current.item?.id!==id)
      throw new Error('The selected player session has changed.');
    if(!['play','pause','toggle','seek','volume','effects','previoustrack','nexttrack'].includes(action))
      throw new Error('Unsupported player action.');
    if(['play','pause','toggle'].includes(action)){
      reset();manualOverride=action==='play'||(action==='toggle'&&current.item.paused);
    }
    const item=await media.act(owner,{id,action,value});
    if(owner===identity()&&current.item?.id===id)publish({identity:owner,item,provider:item.provider,interrupted:!!held},action==='seek');
    void schedule();
    return item;
  }
  function dispose(){disposed=true;reset();preferred.clear();}
  return {schedule,select,invalidate,perform,dispose,state:()=>current};
}

module.exports={createPlayerSession};
