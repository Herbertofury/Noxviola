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
  const url = new URL('/page',location.origin); url.searchParams.set('noxviolaBridgeTarget',runId);
  chrome.runtime.sendMessage({kind:'noxviola-bridge-run',runId,personalFixtureUrl:url.href,foreignTabId:Number(query.get('foreignTabId')),expectedCookie:query.get('expectedCookie')},response => {
    if (chrome.runtime.lastError) document.documentElement.dataset.noxviolaBridgeResultError = chrome.runtime.lastError.message;
    else if (!response || response.version !== 1) document.documentElement.dataset.noxviolaBridgeResultError = 'The real background returned no versioned bridge result.';
    else document.documentElement.dataset.noxviolaBridgeResult = JSON.stringify(response);
  });
})();
