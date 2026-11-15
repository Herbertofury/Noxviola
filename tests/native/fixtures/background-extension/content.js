'use strict';
chrome.runtime.sendMessage({ kind: 'noxviola-fixture-ping' }, response => {
  if (chrome.runtime.lastError) document.documentElement.dataset.noxviolaBackgroundError = chrome.runtime.lastError.message;
  else document.documentElement.dataset.noxviolaBackground = JSON.stringify(response);
});
