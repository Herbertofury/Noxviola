'use strict';
chrome.storage.local.get({ fixtureSeed: null, visits: 0 }, previous => {
  if (chrome.runtime.lastError) {
    document.documentElement.dataset.noxviolaExtensionError = chrome.runtime.lastError.message;
    return;
  }
  const next = {
    fixtureSeed: previous.fixtureSeed ?? new URL(location.href).searchParams.get('extensionSeed'),
    visits: previous.visits + 1,
  };
  chrome.storage.local.set(next, () => {
    if (chrome.runtime.lastError) {
      document.documentElement.dataset.noxviolaExtensionError = chrome.runtime.lastError.message;
      return;
    }
    document.documentElement.dataset.noxviolaExtension = JSON.stringify(next);
  });
});
