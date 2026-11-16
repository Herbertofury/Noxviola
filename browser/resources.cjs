'use strict';

// Electron 44 MemoryInfo reports integer kilobytes (native byte values >> 10).
// privateBytes is optional and Windows-only; do not manufacture a value for a
// process which omits it or reports an invalid/unrepresentable measurement.
// https://github.com/electron/electron/blob/v44.11.3/docs/api/structures/memory-info.md
function privateMemoryBytes(value) {
  if(!Number.isSafeInteger(value)||value<0)return null;
  const bytes=value*1024;
  return Number.isSafeInteger(bytes)?bytes:null;
}

// Explicit samples only: opening/refreshing the resource panel does the work.
// This owns the app-metrics interval so callers can distinguish the initial
// observation from an interval measurement and shared renderer processes.
class ResourceMonitor {
  constructor({app,webContents,tabs=()=>[],extensions=()=>[],clock=()=>Date.now()}) {
    Object.assign(this,{app,webContents,tabs,extensions,clock});this.previous=null;
  }
  sample() {
    const now=this.clock(), intervalMs=this.previous===null?null:Math.max(0,now-this.previous), metrics=this.app.getAppMetrics();
    this.previous=now;
    const contents=this.webContents.getAllWebContents().filter(wc=>!wc.isDestroyed()), tabs=this.tabs(), extensions=this.extensions();
    const rows=metrics.map(metric=>{
      const hosted=contents.filter(wc=>wc.getOSProcessId()===metric.pid), owners=[];
      for(const wc of hosted) {
        const tab=tabs.find(item=>item.webContentsId===wc.id);
        if(tab)owners.push({kind:'tab',id:tab.id,title:tab.title,identity:tab.identity});
        else {
          let url;try{url=new URL(wc.getURL());}catch{}
          const extension=url?.protocol==='chrome-extension:'?extensions.find(item=>item.identities.some(grant=>grant.runtimeId===url.hostname&&grant.session===wc.session)):null;
          if(extension)owners.push({kind:'extension',id:extension.id,title:extension.name});
          else owners.push({kind:wc.getType(),title:wc.getType()==='window'?'Browser interface':wc.getType()});
        }
      }
      return {pid:metric.pid,type:metric.type,name:metric.name||metric.serviceName||metric.type,
        cpuPercent:intervalMs===null?null:metric.cpu?.percentCPUUsage??null,cpuSeconds:metric.cpu?.cumulativeCPUUsage??null,
        workingSetBytes:Number.isFinite(metric.memory?.workingSetSize)?metric.memory.workingSetSize*1024:null,
        peakWorkingSetBytes:Number.isFinite(metric.memory?.peakWorkingSetSize)?metric.memory.peakWorkingSetSize*1024:null,
        privateBytes:privateMemoryBytes(metric.memory?.privateBytes),
        sandboxed:typeof metric.sandboxed==='boolean'?metric.sandboxed:null,owners};
    });
    const reportedProcesses=rows.filter(row=>row.privateBytes!==null).length;
    const privateTotal=rows.length>0&&reportedProcesses===rows.length?rows.reduce((total,row)=>total+row.privateBytes,0):null;
    const privateBytes=Number.isSafeInteger(privateTotal)?privateTotal:null;
    return {sampledAt:now,intervalMs,processes:rows,processCount:rows.length,
      workingSetBytes:rows.every(row=>row.workingSetBytes!==null)?rows.reduce((total,row)=>total+row.workingSetBytes,0):null,
      privateBytes,privateBytesAvailability:{reportedProcesses,totalProcesses:rows.length,complete:privateBytes!==null},
      caveat:'Memory values are converted from Electron kilobytes (1024 bytes) to bytes. Working-set totals can count shared pages more than once. Private bytes are an optional Windows-only metric; missing or invalid values remain unknown, and a total requires valid values from every sampled process. These values do not establish a PSS or overall physical-memory footprint. Sandboxed status is optional on macOS/Windows and is not reported on Linux. CPU values cover the interval between explicit samples; the first sample has no CPU interval. These observations are not a comparative benchmark.'};
  }
}
module.exports={ResourceMonitor};
