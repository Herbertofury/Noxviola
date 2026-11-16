"use strict";
const crypto = require('node:crypto');
const storage = require('./storage.cjs');
const preferenceStore = require('./preferences.cjs');
const paneLayout=require('./pane-layout.cjs');
const ID = /^[a-zA-Z0-9_-]+$/;
const SEARCH = Object.freeze({google: 'https://www.google.com/search?q=', duckduckgo: 'https://duckduckgo.com/?q=', bing: 'https://www.bing.com/search?q='});
function assertDistinctIdentityPartitions(raw) {
  // Electron44.11.3 MakePartitionName lowercases persistent partition paths on
  // every OS. Preserve ID spelling, but never treat case aliases as isolated.
  // Reserve the default identity before validation/inference can insert it.
  const partitions = new Map([['personal', 'personal']]);
  function include(id) {
    if (typeof id !== 'string' || !ID.test(id)) return;
    const key = id.toLowerCase(), existing = partitions.get(key);
    if (existing !== undefined && existing !== id) {
      throw storage.fail(`Browser identities "${existing}" and "${id}" share the same case-insensitive Electron storage partition. Original identities and checkpoints were preserved.`, 'UNSUPPORTED_DATA');
    }
    partitions.set(key, id);
  }
  for (const profile of Array.isArray(raw.profiles) ? raw.profiles : []) include(profile?.id);
  for (const tab of Array.isArray(raw.tabs) ? raw.tabs : []) include(tab?.identity);
}
function httpUrl(value) {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f]/.test(value)) return null;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
// Parsing a persisted extension URL is not authorization to load it. The live
// host must independently verify current enrollment in the tab's identity.
function extensionUrl(value) {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'chrome-extension:' && /^[a-p]{32}$/.test(url.hostname) && !url.port && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
function address(value, provider = 'google', customSearchURL) {
  const input = typeof value === 'string' ? value.trim() : '';
  if (!input) return 'about:blank';
  if (/[\u0000-\u001f\u007f]/.test(input)) return null;
  if (input.toLowerCase() === 'about:blank') return 'about:blank';
  if (/^https?:\/\//i.test(input)) return httpUrl(input);
  if (!/\s/.test(input) && (/^(?:localhost|[\w.-]+\.[\w.-]+)(?::\d+)?(?:[/?#]|$)/i.test(input) || /^\[[0-9a-f:]+\](?::\d+)?(?:[/?#]|$)/i.test(input))) return httpUrl(`https://${input}`);
  if (/^[a-z][a-z\d+.-]*:/i.test(input) || (!/\s/.test(input) && input.includes('@'))) return null;
  if(provider==='custom')return preferenceStore.searchTemplate(customSearchURL)?customSearchURL.replace('{searchTerms}',encodeURIComponent(input)):null;
  return `${SEARCH[provider] || SEARCH.google}${encodeURIComponent(input)}`;
}
function cleanState(raw = {}, {strict = false} = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw storage.fail('Invalid session document.');
  if (raw.version !== undefined && raw.version !== 1) throw storage.fail('Unsupported session version; no checkpoint was replaced.', 'UNSUPPORTED_VERSION');
  assertDistinctIdentityPartitions(raw);
  if (strict && (!Array.isArray(raw.tabs) || !Array.isArray(raw.profiles))) throw storage.fail('Session tabs and identities must be arrays.');
  const seen = new Set();
  const tabs = (Array.isArray(raw.tabs) ? raw.tabs : []).flatMap(row => {
    const url = row?.url === 'about:blank' ? 'about:blank' : httpUrl(row?.url) || extensionUrl(row?.url);
    if (!url) { if (strict) throw storage.fail('A saved tab has an unsupported or credential-bearing address.'); return []; }
    if (strict && row.title !== undefined && typeof row.title !== 'string') throw storage.fail('A saved tab title has an unsupported value.', 'UNSUPPORTED_DATA');
    for(const name of ['pinned','muted'])if(row[name]!==undefined&&typeof row[name]!=='boolean')throw storage.fail(`A saved tab has an unsupported ${name} value.`,'UNSUPPORTED_DATA');
    for(const name of ['workspaceId','groupId'])if(row[name]!==undefined&&row[name]!==null&&(typeof row[name]!=='string'||!row[name]||/[\u0000-\u001f\u007f]/.test(row[name])))throw storage.fail(`A saved tab has an unsupported ${name} value.`,'UNSUPPORTED_DATA');
    let id = typeof row.id === 'string' && row.id && !seen.has(row.id) ? row.id : null;
    if (!id && strict) throw storage.fail('Saved tab IDs are missing or repeated.');
    id ||= crypto.randomUUID(); seen.add(id);
    const identity = typeof row.identity === 'string' && ID.test(row.identity) ? row.identity : 'personal';
    if (strict && row.identity !== undefined && identity !== row.identity) throw storage.fail('Invalid saved identity.');
    return [{...row, id, url, title: typeof row.title === 'string' ? row.title : url, identity}];
  });
  const profiles = [], profileIds = new Set();
  for (const item of Array.isArray(raw.profiles) ? raw.profiles : []) {
    if (!item || typeof item.id !== 'string' || !ID.test(item.id) || typeof item.name !== 'string' || profileIds.has(item.id)) {
      if (strict) throw storage.fail('Saved identities are invalid or repeated.');
      continue;
    }
    profiles.push({...item}); profileIds.add(item.id);
  }
  for (const tab of tabs) if (!profileIds.has(tab.identity)) {
    if (strict) throw storage.fail('A saved tab refers to a missing identity.');
    profiles.push({id: tab.identity, name: tab.identity}); profileIds.add(tab.identity);
  }
  if (!profileIds.has('personal')) profiles.unshift({id: 'personal', name: 'Personal'});
  if (strict && raw.preferences !== undefined && (!raw.preferences || typeof raw.preferences !== 'object' || Array.isArray(raw.preferences))) throw storage.fail('Saved preferences have an unsupported format.', 'UNSUPPORTED_DATA');
  const preferences = preferenceStore.preferences(raw.preferences || {},{strict});
  if(raw.activeWorkspaceId!==undefined&&(typeof raw.activeWorkspaceId!=='string'||!raw.activeWorkspaceId||/[\u0000-\u001f\u007f]/.test(raw.activeWorkspaceId)))throw storage.fail('The saved active workspace has an unsupported value.','UNSUPPORTED_DATA');
  if(raw.workspaceLastTabs!==undefined){
    if(!raw.workspaceLastTabs||typeof raw.workspaceLastTabs!=='object'||Array.isArray(raw.workspaceLastTabs))throw storage.fail('Saved workspace focus data is invalid.','UNSUPPORTED_DATA');
    for(const [workspaceId,tabId] of Object.entries(raw.workspaceLastTabs))if(!workspaceId||/[\u0000-\u001f\u007f]/.test(workspaceId)||typeof tabId!=='string'||!tabId)throw storage.fail('Saved workspace focus data is invalid.','UNSUPPORTED_DATA');
  }
  if(raw.siteZooms!==undefined){
    if(!raw.siteZooms||typeof raw.siteZooms!=='object'||Array.isArray(raw.siteZooms))throw storage.fail('Saved page zoom preferences are invalid.','UNSUPPORTED_DATA');
    for(const [identity,values] of Object.entries(raw.siteZooms)){
      if(!ID.test(identity)||!values||typeof values!=='object'||Array.isArray(values))throw storage.fail('Saved page zoom identity preferences are invalid.','UNSUPPORTED_DATA');
      for(const [origin,factor] of Object.entries(values))if(!httpUrl(origin)||new URL(origin).origin!==origin||typeof factor!=='number'||!Number.isFinite(factor)||factor<0.25||factor>5)throw storage.fail('Saved page zoom values are unsupported.','UNSUPPORTED_DATA');
    }
  }
  if(raw.paneTree!==undefined){paneLayout.validate(raw.paneTree,tabs.map(t=>t.id));const paneTabs=paneLayout.ids(raw.paneTree).map(id=>tabs.find(t=>t.id===id));if(paneTabs.length&&(!paneTabs.some(t=>t.id===raw.activeId)||new Set(paneTabs.map(t=>t.workspaceId||'default')).size>1))throw storage.fail('Pane layout must contain the active tab in one workspace.');}
  if(raw.paneLayouts!==undefined){if(!Array.isArray(raw.paneLayouts))throw storage.fail('Saved pane units must be an array.');const seen=new Set(paneLayout.ids(raw.paneTree));for(const tree of raw.paneLayouts){paneLayout.validate(tree,tabs.map(t=>t.id));const ids=paneLayout.ids(tree);if(ids.length<2||ids.some(id=>seen.has(id)||id===raw.activeId)||new Set(ids.map(id=>tabs.find(t=>t.id===id).workspaceId||'default')).size!==1)throw storage.fail('Saved pane units must be distinct and within one workspace.');for(const id of ids)seen.add(id);}}
  return {...raw, version: 1, profiles, tabs, preferences, activeId: tabs.some(tab => tab.id === raw.activeId) ? raw.activeId : tabs[0]?.id || null};
}
function decode(value) { return cleanState(value, {strict: true}); }
function inspectState(file) { return storage.inspect(file, decode, () => cleanState({})); }
function readState(file) { return inspectState(file).value; }
function saveState(file, value) { return storage.write(file, value?.version === 1 ? decode(value) : cleanState(value), decode); }
function recoverState(file, preview) { return storage.recover(file, preview, decode); }
module.exports = {address, httpUrl, extensionUrl, cleanState, readState, saveState, inspectState, recoverState, SEARCH};
