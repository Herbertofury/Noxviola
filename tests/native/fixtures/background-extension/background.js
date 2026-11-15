'use strict';
let count = 0;
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.kind === 'noxviola-fixture-ping') respond({ count: ++count, runtimeId: chrome.runtime.id });
});
