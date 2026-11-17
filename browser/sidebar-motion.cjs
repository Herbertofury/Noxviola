'use strict';
// Match the observed Firefox sidebar timing curve without blocking on panel load.
// The curve is cubic-bezier(0.2, 0, 0, 1); x is inverted numerically.
function sidebarEase(progress){
  const x=Math.max(0,Math.min(1,progress));if(x===0||x===1)return x;
  let low=0,high=1;
  for(let i=0;i<18;i++){const t=(low+high)/2,curveX=0.6*(1-t)*(1-t)*t+t*t*t;if(curveX<x)low=t;else high=t;}
  const t=(low+high)/2;return 3*t*t-2*t*t*t;
}
function sidebarDuration(from,to,openMs,closeMs,reducedMotion=false){return reducedMotion?0:Math.abs(to-from)*(to>from?openMs:closeMs);}
module.exports={sidebarEase,sidebarDuration};
