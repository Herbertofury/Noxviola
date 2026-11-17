'use strict';
(async()=>{
  const count=((await chrome.storage.local.get('visits')).visits||0)+1;
  await chrome.storage.local.set({visits:count});
  const options=await chrome.sidePanel.getOptions({});
  const firefox=await chrome.sidebarAction.getPanel({});
  document.body.dataset.result=JSON.stringify({count,options,firefox,runtimeId:chrome.runtime.id});
})().catch(error=>{document.body.dataset.error=error.message;});
