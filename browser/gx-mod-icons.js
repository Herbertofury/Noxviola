'use strict';

window.createModIcons=report=>{
  let pendingRuntime,revision=0,lastKey='',views=[];
  function getRuntime(){
    if(window.lottie)return Promise.resolve(window.lottie);
    pendingRuntime??=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='assets/lottie-light.min.js';
      script.onload=()=>window.lottie?resolve(window.lottie):reject(new Error('The local icon renderer did not initialize.'));
      script.onerror=()=>reject(new Error('The local icon renderer could not load.'));
      document.head.append(script);
    });
    return pendingRuntime;
  }
  function clear(){
    for(const {button,host,animation,play} of views){
      button.removeEventListener('pointerenter',play);
      button.removeEventListener('focus',play);
      delete button.dataset.modIcon;
      animation.destroy();host.remove();
    }
    views=[];
  }
  function update(data){
    const key=JSON.stringify(data||{});
    if(key===lastKey)return;
    lastKey=key;clear();
    const generation=++revision;
    if(!Object.keys(data||{}).length)return;
    void getRuntime().then(async lottie=>{
      for(const [role,url] of Object.entries(data)){
        if(generation!==revision)return;
        const button=document.querySelector(`#sidebar-rail [data-sidebar="${role}"]`);
        if(!button)continue;
        try{
          const response=await fetch(url);
          if(!response.ok)throw new Error('A mod sidebar icon is unavailable.');
          // The renderer maps these After Effects names to DOM IDs and CSS
          // classes. Keep package layers out of the trusted chrome namespace.
          const animationData=JSON.parse(await response.text(),(key,value)=>
            (key==='ln'||key==='cl')&&typeof value==='string'?undefined:value);
          if(generation!==revision)return;
          const host=document.createElement('span');
          host.className='mod-sidebar-icon';host.setAttribute('aria-hidden','true');host.hidden=true;button.prepend(host);
          let animation;
          try{animation=lottie.loadAnimation({container:host,renderer:'svg',loop:false,autoplay:false,animationData});}
          catch(error){host.remove();throw error;}
          const play=()=>{
            if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches)animation.goToAndPlay(0,true);
          };
          views.push({button,host,animation,play});
          animation.addEventListener('DOMLoaded',()=>{
            if(generation!==revision)return;
            host.hidden=false;button.dataset.modIcon='true';
            animation.goToAndStop(0,true);
            button.addEventListener('pointerenter',play);
            button.addEventListener('focus',play);
          });
        }catch(error){if(generation===revision)report(error.message);}
      }
    }).catch(error=>{if(generation===revision)report(error.message);});
  }
  return {update};
};
