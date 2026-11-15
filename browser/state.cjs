"use strict";
const crypto = require('node:crypto');
const storage = require('./storage.cjs');
const ID = /^[a-zA-Z0-9_-]+$/;
const SEARCH = Object.freeze({google: 'https://www.google.com/search?q=', duckduckgo: 'https://duckduckgo.com/?q=', bing: 'https://www.bing.com/search?q='});
function httpUrl(value) {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f]/.test(value)) return null;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
function address(value, provider = 'google') {
  const input = typeof value === 'string' ? value.trim() : '';
  if (!input) return 'about:blank';
  if (/[\u0000-\u001f\u007f]/.test(input)) return null;
  if (input.toLowerCase() === 'about:blank') return 'about:blank';
  if (/^https?:\/\//i.test(input)) return httpUrl(input);
  if (!/\s/.test(input) && (/^(?:localhost|[\w.-]+\.[\w.-]+)(?::\d+)?(?:[/?#]|$)/i.test(input) || /^\[[0-9a-f:]+\](?::\d+)?(?:[/?#]|$)/i.test(input))) return httpUrl(`https://${input}`);
  if (/^[a-z][a-z\d+.-]*:/i.test(input) || (!/\s/.test(input) && input.includes('@'))) return null;
  return `${SEARCH[provider] || SEARCH.google}${encodeURIComponent(input)}`;
}
function cleanState(raw = {}, {strict = false} = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw storage.fail('Invalid session document.');
  if (raw.version !== undefined && raw.version !== 1) throw storage.fail('Unsupported session version; no checkpoint was replaced.', 'UNSUPPORTED_VERSION');
  if (strict && (!Array.isArray(raw.tabs) || !Array.isArray(raw.profiles))) throw storage.fail('Session tabs and identities must be arrays.');
  const seen = new Set();
  const tabs = (Array.isArray(raw.tabs) ? raw.tabs : []).flatMap(row => {
    const url = row?.url === 'about:blank' ? 'about:blank' : httpUrl(row?.url);
    if (!url) { if (strict) throw storage.fail('A saved tab has an unsupported or credential-bearing address.'); return []; }
    if (strict && row.title !== undefined && typeof row.title !== 'string') throw storage.fail('A saved tab title has an unsupported value.', 'UNSUPPORTED_DATA');
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
  const preferences = {...raw.preferences};
  if (strict && ((preferences.searchEngine !== undefined && !Object.hasOwn(SEARCH,preferences.searchEngine)) ||
      (preferences.tabLayout !== undefined && !['horizontal','vertical'].includes(preferences.tabLayout)))) throw storage.fail('This browser cannot safely interpret a saved preference; its value was preserved.', 'UNSUPPORTED_DATA');
  if (!Object.hasOwn(SEARCH, preferences.searchEngine)) preferences.searchEngine = 'duckduckgo';
  if (!['horizontal', 'vertical'].includes(preferences.tabLayout)) preferences.tabLayout = 'horizontal';
  return {...raw, version: 1, profiles, tabs, preferences, activeId: tabs.some(tab => tab.id === raw.activeId) ? raw.activeId : tabs[0]?.id || null};
}
function decode(value) { return cleanState(value, {strict: true}); }
function inspectState(file) { return storage.inspect(file, decode, () => cleanState({})); }
function readState(file) { return inspectState(file).value; }
function saveState(file, value) { return storage.write(file, value?.version === 1 ? decode(value) : cleanState(value), decode); }
function recoverState(file, preview) { return storage.recover(file, preview, decode); }
module.exports = {address, httpUrl, cleanState, readState, saveState, inspectState, recoverState, SEARCH};
