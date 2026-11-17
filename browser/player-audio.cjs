'use strict';

// Bass, midrange and treble adjustments in dB.
const presets=Object.freeze({
  Flat:[0,0,0], Voice:[-4,5,-2], Music:[3,-1,3], Movie:[4,2,3],
  Bass:[7,0,-1], Treble:[-2,0,6], Gaming:[2,4,3], Night:[-5,3,-4],
});
const services=Object.freeze({
  spotify:['Spotify','https://open.spotify.com/'],
  apple:['Apple Music','https://music.apple.com/'],
  deezer:['Deezer','https://www.deezer.com/'],
  soundcloud:['SoundCloud','https://soundcloud.com/'],
  tidal:['TIDAL','https://listen.tidal.com/'],
  youtube:['YouTube Music','https://music.youtube.com/'],
});

// Serialized into the selected page. The audio stream never leaves it.
// Unlike createMediaElementSource, captureStream lets us restore dry playback.
async function processElement(element, registry, settings) {
  const previous=registry.effects.get(element);
  if(settings.gain===1&&settings.filters.every(level=>level===0)){
    previous?.stop();
    return;
  }
  if(previous){previous.update(settings);return;}
  if(element.mediaKeys||element.srcObject||typeof element.captureStream!=='function')
    throw new Error('Audio effects are unavailable for protected or device audio.');
  if(element.paused||element.ended)throw new Error('Start playback before enabling audio effects.');
  const captured=element.captureStream(),tracks=captured.getAudioTracks();
  for(const track of captured.getVideoTracks())track.stop();
  if(!tracks.length||tracks.some(track=>track.muted||track.readyState!=='live')){
    for(const track of tracks)track.stop();
    throw new Error('The website did not expose an audio track for effects.');
  }
  let context,graph;
  try{
    context=new AudioContext();
    const source=context.createMediaStreamSource(new MediaStream(tracks));
    const filters=[['lowshelf',140],['peaking',1450],['highshelf',4800]].map(([type,frequency])=>{
      const node=context.createBiquadFilter();
      node.type=type;node.frequency.value=frequency;
      return node;
    });
    const gain=context.createGain(),limiter=context.createDynamicsCompressor();
    limiter.threshold.value=-3;limiter.knee.value=0;limiter.ratio.value=20;limiter.attack.value=.003;limiter.release.value=.1;
    let tail=source;
    for(const node of [...filters,gain,limiter]){tail.connect(node);tail=node;}
    const events=new AbortController(),options={signal:events.signal};
    let stopped=false,routed=false;
    function stop(){
      if(stopped)return;
      stopped=true;events.abort();registry.effects.delete(element);
      for(const track of tracks)track.stop();
      void context.close().catch(()=>{});
      if(routed&&element.muted)element.muted=graph.userMuted;
    }
    function volume(){
      gain.gain.setTargetAtTime(graph.userMuted?0:graph.gain*element.volume,context.currentTime,.025);
    }
    function update(state){
      graph.gain=state.gain;graph.preset=state.preset;graph.filters=state.filters;
      filters.forEach((node,index)=>node.gain.setTargetAtTime(state.filters[index],context.currentTime,.025));
      volume();
    }
    graph={stop,update,userMuted:element.muted,gain:1,preset:'Flat',filters:[0,0,0]};
    for(const type of ['emptied','encrypted','ended'])element.addEventListener(type,stop,options);
    for(const track of tracks){track.addEventListener('ended',stop,options);track.addEventListener('mute',stop,options);}
    element.addEventListener('volumechange',()=>{
      if(!routed)return;
      if(!element.muted){graph.userMuted=false;element.muted=true;}
      volume();
    },options);
    window.addEventListener('pagehide',stop,options);
    await context.resume();
    if(stopped||context.state!=='running'||tracks.some(track=>track.muted||track.readyState!=='live'))throw new Error('Audio processing could not start.');
    registry.effects.set(element,graph);gain.gain.value=0;
    limiter.connect(context.destination);routed=true;element.muted=true;update(settings);
  }catch(error){
    if(graph)graph.stop();
    else{
      for(const track of tracks)track.stop();
      if(context)void context.close().catch(()=>{});
    }
    throw error;
  }
}

module.exports={presets,services,processElement};
