'use strict';
// Content contexts retain native messaging. Added browser-host APIs are exposed
// only in authenticated extension documents, not in this web-frame world.
(() => {
  const query = new URL(location.href).searchParams;
  const target = query.get('noxviolaBridgeTarget');
  if (target) {
    chrome.runtime.onMessage.addListener((message,_sender,respond) => {
      if (message?.kind !== 'noxviola-bridge-ping' || message.runId !== target) return;
      respond({kind:'noxviola-bridge-pong',runId:target,url:location.href});
    });
    chrome.runtime.sendMessage({kind:'noxviola-bridge-target-ready',runId:target},() => {
      if (chrome.runtime.lastError) document.documentElement.dataset.noxviolaBridgeTargetError = chrome.runtime.lastError.message;
    });
    return;
  }
  const runId = query.get('noxviolaBridgeRun');
  if (!runId) return;
  document.documentElement.dataset.noxviolaBridgeInjected = 'true';
  chrome.runtime.onMessage.addListener((message,_sender,respond) => {
    if (message?.kind!=='noxviola-bridge-icon-stage' || message.runId!==runId) return;
    let finished=false;
    const finish=value=>{if(finished)return;finished=true;clearTimeout(deadline);window.removeEventListener('message',observed);respond(value);};
    const observed=event=>{
      if(event.source===window && event.origin===location.origin && event.data?.kind==='noxviola-bridge-icon-observed' && event.data.runId===runId && event.data.stage===message.stage) finish({observed:true,stage:message.stage});
    };
    const deadline=setTimeout(()=>finish({observed:false,error:'The actual toolbar icon was not acknowledged before its failure deadline.'}),10000);
    window.addEventListener('message',observed);
    document.documentElement.dataset.noxviolaBridgeIconStage=JSON.stringify(message);
    return true;
  });
  const url = new URL('/page',location.origin); url.searchParams.set('noxviolaBridgeTarget',runId);
  chrome.runtime.sendMessage({kind:'noxviola-bridge-run',runId,personalFixtureUrl:url.href,foreignTabId:Number(query.get('foreignTabId')),expectedCookie:query.get('expectedCookie')},response => {
    if (chrome.runtime.lastError) document.documentElement.dataset.noxviolaBridgeResultError = chrome.runtime.lastError.message;
    else if (!response || response.version !== 1) document.documentElement.dataset.noxviolaBridgeResultError = 'The real background returned no versioned bridge result.';
    else document.documentElement.dataset.noxviolaBridgeResult = JSON.stringify(response);
  });
})();
