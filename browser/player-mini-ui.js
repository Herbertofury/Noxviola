'use strict';

(() => {
  const icons={
    play:'M8 5v14l11-7Z',pause:'M9 5v14m6-14v14',
    previoustrack:'M6 5v14m12-14L8 12l10 7Z',nexttrack:'M18 5v14M6 5l10 7-10 7Z',
    float:'M4 5h16v14H4zM9 14l6-6m-5 0h5v5',
    dock:'M4 6h16v12H4zM5 10h14',close:'m6 6 12 12M18 6 6 18',
    note:'M10 18V5l9-2v12m-9 3c0 1.2-1.6 2-3 2s-2-.7-2-1.5S6.5 17 8 17s2 .3 2 1zm9-3c0 1.2-1.6 2-3 2s-2-.7-2-1.5 1.5-1.5 3-1.5 2 .3 2 1z',
  };
  const svg=(name)=>{
    const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
    icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
    const path=document.createElementNS(icon.namespaceURI,'path');path.setAttribute('d',icons[name]);icon.append(path);return icon;
  };
  const text=(tag,css)=>{const element=document.createElement(tag);element.className=css;return element;};
  window.createMiniPlayer=(host,command,floating=false)=>{
    let state={},changing=false,dragging=false,clock=null,clockStart=0,trackStart=0;
    const top=text('div','mini-top'),actions=text('div','mini-actions'),progress=text('div','mini-progress');
    const art=text('span','mini-art');art.append(svg('note'));
    const title=text('strong','mini-track'),detail=text('span','mini-source');
    const metadata=text('div','mini-meta');metadata.append(title,detail);
    function showMessage(value){const output=host.closest('body').querySelector('#mini-error');if(output){output.textContent=value;output.hidden=!value;}}
    async function dispatch(action,value){
      if(changing)return;
      changing=true;showMessage('');
      try{await command(action,value);}catch(error){showMessage(error.message);}
      finally{changing=false;}
    }
    const act=(action,value)=>state.item&&dispatch('act',{id:state.item.id,identity:state.identity,action,value});
    const btn=(glyph,label,handle)=>{
      const button=text('button','mini-button');button.type='button';button.title=label;button.setAttribute('aria-label',label);
      button.append(svg(glyph));button.addEventListener('click',handle);return button;
    };
    const previous=btn('previoustrack','Previous track',()=>act('previoustrack'));
    const play=btn('play','Play',()=>act('toggle'));play.classList.add('mini-play');
    const next=btn('nexttrack','Next track',()=>act('nexttrack'));
    const position=btn(floating?'dock':'float',floating?'Dock Mini Player':'Float Mini Player',()=>dispatch(floating?'dock':'float'));
    const close=btn('close','Hide Mini Player',()=>dispatch('dismiss'));
    const open=text('button','mini-open');open.type='button';open.setAttribute('aria-label','Open Player');open.append(art,metadata);
    open.onclick=()=>dispatch('open',state.provider);
    if(floating)top.append(art,metadata);else top.append(open);
    actions.append(previous,play,next,position,close);
    top.append(actions);host.append(top);

    const seek=document.createElement('input');seek.type='range';seek.min='0';seek.step='.1';seek.setAttribute('aria-label','Playback position');
    seek.addEventListener('pointerdown',()=>{dragging=true;});
    seek.addEventListener('pointercancel',()=>{dragging=false;});
    seek.addEventListener('blur',()=>{dragging=false;});
    seek.addEventListener('change',()=>{dragging=false;void act('seek',Number(seek.value));});
    const volume=document.createElement('input');volume.type='range';volume.min='0';volume.max='1';volume.step='.01';volume.setAttribute('aria-label','Player volume');
    volume.addEventListener('change',()=>void act('volume',Number(volume.value)));
    const volumeLabel=text('label','mini-volume');volumeLabel.textContent='Vol';volumeLabel.append(volume);
    if(floating){
      const link=text('button','mini-link');link.type='button';link.textContent='Open Player';
      link.onclick=()=>dispatch('open',state.provider);
      progress.append(seek,volumeLabel,link);host.append(progress);
    }
    let lastIcon,lastTrackId,lastTime,lastPaused,lastRate;
    function drawPosition(){
      if(dragging||seek.disabled)return;
      const elapsed=state.item.paused?0:(performance.now()-clockStart)/1000*(state.item.playbackRate??1);
      seek.value=String(trackStart+elapsed);
    }
    function stopClock(){
      if(clock!==null)clearInterval(clock);
      clock=null;
    }
    function update(nextState){
      state=nextState||{};
      const item=state.item;
      host.hidden=!state.visible||state.mode!==(floating?'floating':'toolbar')||!item;
      if(host.hidden){stopClock();return;}
      host.dataset.background=String(state.background!==false);
      title.textContent=item.title||item.sourceTitle||state.providerName;
      const description=[item.artist,state.providerName].filter(Boolean).join(' · ');
      detail.textContent=state.interrupted?'Paused for other audio':description;
      title.title=title.textContent;
      const icon=item.paused?'play':'pause',label=item.paused?'Play':'Pause';
      if(lastIcon!==icon){lastIcon=icon;play.replaceChildren(svg(icon));play.title=label;play.setAttribute('aria-label',label);}
      previous.disabled=!item.actions?.includes('previoustrack');next.disabled=!item.actions?.includes('nexttrack');
      if(floating){
        const ranges=item.seekable?.filter(([start,end])=>end>start)||[];
        const range=ranges.find(([start,end])=>(item.currentTime??0)>=start&&(item.currentTime??0)<=end)||ranges[0];
        seek.disabled=!range;
        if(range){
          seek.min=String(range[0]);seek.max=String(range[1]);
          const nextTime=item.currentTime??range[0];
          if(item.id!==lastTrackId||item.currentTime!==lastTime||item.paused!==lastPaused||item.playbackRate!==lastRate){
            trackStart=nextTime;clockStart=performance.now();
            lastTrackId=item.id;lastTime=item.currentTime;lastPaused=item.paused;lastRate=item.playbackRate;
          }
          drawPosition();
        }
        if(item.paused||!range)stopClock();
        else if(clock===null)clock=setInterval(drawPosition,250);
        if(document.activeElement!==volume)volume.value=String(item.volume??1);
      }
    }
    return {update};
  };
})();
