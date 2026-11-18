'use strict';

// Synchronized layers share one audio clock. Inactive music owns no running
// decoder or timer. Only trusted browser activity changes the mix.
window.createModMusic=(report)=>{
  let current=null;
  function stop(){
    const previous=current;current=null;
    if(!previous)return;
    previous.abort?.abort();
    if(previous.audio){previous.audio.pause();previous.audio.removeAttribute('src');}
    if(previous.context)void previous.context.close().catch(()=>{});
    clearTimeout(previous.release);
  }
  function playback(track){
    if(track.audio){
      if(track.ducked)track.audio.pause();
      else if(track.audio.paused)void track.audio.play().catch(error=>{if(current===track)report(error.message);});
    }else if(track.ready){
      const next=track.ducked?'suspended':'running';
      if(track.target===next)return;
      track.target=next;
      void (track.ducked?track.context.suspend():track.context.resume()).catch(error=>{if(current===track)report(error.message);});
    }
  }
  async function loadLayers(track,paths){
    const context=track.context,signal=track.abort.signal;
    try{
      const buffers=await Promise.all(paths.map(async url=>{
        const response=await fetch(url,{signal});
        if(!response.ok)throw new Error('A mod music layer is unavailable.');
        return context.decodeAudioData(await response.arrayBuffer());
      }));
      if(current!==track)return;
      const start=context.currentTime+.06;
      track.layers=buffers.map((buffer,index)=>{
        const tone=context.createBufferSource(),gain=context.createGain();
        tone.buffer=buffer;tone.loop=true;
        gain.gain.value=(index===0?.18:0)/Math.sqrt(index+1);
        tone.connect(gain).connect(context.destination);tone.start(start);
        return gain;
      });
      track.ready=true;
      playback(track);
    }catch(error){
      if(current!==track)return;
      report(error.message);
      void context.close().catch(()=>{});
      track.context=null;
    }
  }
  function update(paths,ducked){
    const key=JSON.stringify(paths||[]);
    if(current?.key!==key){
      stop();
      if(!paths?.length)return;
      const track={key,ducked};
      current=track;
      if(paths.length===1){
        track.audio=new Audio(paths[0]);track.audio.loop=true;track.audio.volume=.18;
      }else{
        track.abort=new AbortController();track.context=new AudioContext();
        void loadLayers(track,paths);
      }
    }
    if(current){current.ducked=ducked;playback(current);}
  }
  function activity(){
    const track=current;
    if(!track?.ready||track.ducked)return;
    const now=track.context.currentTime;
    const level=performance.now()-track.lastActivity<420?Math.min((track.level||0)+1,track.layers.length-1):1;
    track.level=level;track.lastActivity=performance.now();
    track.layers.slice(1).forEach((gain,index)=>gain.gain.setTargetAtTime(index<level ? .10/Math.sqrt(index+2) : 0,now,.22));
    clearTimeout(track.release);
    track.release=setTimeout(()=>{
      track.level=0;
      for(const gain of track.layers.slice(1))gain.gain.setTargetAtTime(0,track.context.currentTime,.42);
    },1800);
  }
  return {update,activity,stop};
};
