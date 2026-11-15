'use strict';

const crypto = require('node:crypto');
const storage = require('./storage.cjs');
const {ServiceStore, clone, record, keys, id, identity, identities, text, timestamp, integer, url} = require('./service-store.cjs');

const TRANSITIONS = Object.freeze(['link', 'typed', 'auto_bookmark', 'auto_subframe', 'manual_subframe', 'generated', 'auto_toplevel', 'form_submit', 'reload', 'keyword', 'keyword_generated']);
const DAY = 86400000;
const empty = () => ({version: 1, items: [], preferences: []});
function preference(value) {
  record(value, 'History preference'); identity(value.identity);
  if (typeof value.recording !== 'boolean') throw storage.fail('History recording must be enabled or disabled.');
  if (value.retentionDays !== null && (!Number.isSafeInteger(value.retentionDays) || value.retentionDays < 1 || value.retentionDays > Number.MAX_SAFE_INTEGER / DAY)) throw storage.fail('History retention must be a positive number of days, or null for no automatic expiration.');
  return {...value};
}
function decode(value) {
  record(value, 'History document');
  if (value.version !== 1) throw storage.fail('Unsupported history version; original data was preserved.', 'UNSUPPORTED_VERSION');
  if (!Array.isArray(value.items) || !Array.isArray(value.preferences)) throw storage.fail('History items and preferences must be arrays.');
  const pageIds = new Set(), pageKeys = new Set(), visits = new Map(), settings = new Set();
  const items = value.items.map(item => {
    record(item, 'History page'); id(item.id); identity(item.identity); text(item.title, 'History title');
    if (url(item.url) !== item.url) throw storage.fail('A saved history URL is not canonical.', 'UNSUPPORTED_DATA');
    const key = JSON.stringify([item.identity, item.url]);
    if (pageIds.has(item.id) || pageKeys.has(key)) throw storage.fail('History page IDs or identity/URL pairs are repeated.');
    pageIds.add(item.id); pageKeys.add(key);
    if (!Array.isArray(item.visits) || !item.visits.length) throw storage.fail('A history page must contain at least one visit.');
    const rows = item.visits.map(visit => {
      record(visit, 'History visit'); id(visit.visitId, 'Visit ID'); timestamp(visit.visitTime, 'Visit time'); id(visit.referringVisitId, 'Referring visit ID');
      if (!TRANSITIONS.includes(visit.transition)) throw storage.fail('An unsupported history transition was preserved.', 'UNSUPPORTED_DATA');
      if (visits.has(visit.visitId) || visit.visitId === '0') throw storage.fail('History visit IDs must be unique.');
      visits.set(visit.visitId, item.identity);
      return {...visit};
    });
    return {...item, visits: rows};
  });
  for (const item of items) for (const visit of item.visits) {
    const owner = visits.get(visit.referringVisitId);
    if (owner !== undefined && owner !== item.identity) throw storage.fail('A history referrer crosses browser identities.');
  }
  const preferences = value.preferences.map(item => {
    const result = preference(item);
    if (settings.has(result.identity)) throw storage.fail('History identity preferences are repeated.');
    settings.add(result.identity); return result;
  });
  identities([...items.map(item => item.identity), ...preferences.map(item => item.identity)]);
  return {...value, items, preferences};
}
function summary(item) {
  let lastVisitTime = 0, typedCount = 0;
  for (const visit of item.visits) { lastVisitTime = Math.max(lastVisitTime, visit.visitTime); if (visit.transition === 'typed') typedCount++; }
  return {id: item.id, identity: item.identity, url: item.url, title: item.title, lastVisitTime, visitCount: item.visits.length, typedCount};
}
function range(value = {}, required = false) {
  if (required && (value.startTime === undefined || value.endTime === undefined)) throw storage.fail('Both history range endpoints are required.');
  const startTime = value.startTime === undefined ? 0 : timestamp(value.startTime, 'Start time');
  const endTime = value.endTime === undefined ? Infinity : timestamp(value.endTime, 'End time');
  if (startTime > endTime) throw storage.fail('The history range ends before it starts.');
  return {startTime, endTime};
}
function removeVisits(document, owner, matches) {
  const removed = new Set(), urls = [], items = [];
  for (const item of document.items) {
    if (item.identity !== owner) { items.push(item); continue; }
    const visits = item.visits.filter(visit => { if (!matches(visit, item)) return true; removed.add(visit.visitId); return false; });
    if (visits.length) items.push(visits.length === item.visits.length ? item : {...item, visits});
    else urls.push(item.url);
  }
  if (!removed.size) return {document, removedVisits: 0, removedUrls: 0, urls: [], visitIds: []};
  // A removed referring visit must not remain as a misleading resolvable link.
  const repaired = items.map(item => item.identity !== owner ? item : {...item, visits: item.visits.map(visit => removed.has(visit.referringVisitId) ? {...visit, referringVisitId: '0'} : visit)});
  return {document: {...document, items: repaired}, removedVisits: removed.size, removedUrls: urls.length, urls, visitIds: [...removed]};
}

class HistoryService extends ServiceStore {
  constructor(options = {}) { super({...options, name: 'History', decode, empty}); this._reindex(); }
  _reindex() {
    this._pages = new Map(); this._visits = new Map(); this._preferences = new Map(); this._identityPages = new Map(); this._summaries = new Map();
    for (const item of this._document.items) {
      this._pages.set(JSON.stringify([item.identity, item.url]), item);
      const pages = this._identityPages.get(item.identity) || []; pages.push(item); this._identityPages.set(item.identity, pages);
      this._summaries.set(item.id, summary(item));
      for (const visit of item.visits) this._visits.set(visit.visitId, item.identity);
    }
    for (const item of this._document.preferences) this._preferences.set(item.identity, item);
  }
  settings(owner) {
    this._identity(owner);
    return clone(this._preferences.get(owner) || {identity: owner, recording: true, retentionDays: null});
  }
  configure(owner, changes) {
    this._identity(owner); keys(changes, ['recording', 'retentionDays'], 'History preferences');
    const next = preference({...this.settings(owner), ...changes});
    const preferences = this._document.preferences.filter(item => item.identity !== owner).concat(next);
    let candidate = {...this._document, preferences}, removed = null;
    if (next.retentionDays !== null) {
      const cutoff = this._time() - next.retentionDays * DAY;
      removed = removeVisits(candidate, owner, visit => visit.visitTime < cutoff); candidate = removed.document;
    }
    const events = [{type: 'settings', identity: owner, settings: clone(next)}];
    if (removed?.removedVisits) events.push(this._removedEvent(owner, removed));
    this._commit(candidate, events); return this.settings(owner);
  }
  record(owner, details) {
    this._identity(owner); keys(details, ['url', 'title', 'visitTime', 'transition', 'referringVisitId'], 'History visit');
    const address = url(details.url), title = details.title === undefined ? undefined : text(details.title, 'History title');
    const visitTime = details.visitTime === undefined ? this._time() : timestamp(details.visitTime, 'Visit time');
    const transition = details.transition === undefined ? 'link' : details.transition;
    if (!TRANSITIONS.includes(transition)) throw storage.fail('Unsupported history transition.');
    const referringVisitId = details.referringVisitId === undefined ? '0' : id(details.referringVisitId, 'Referring visit ID');
    if (referringVisitId !== '0' && this._visits.get(referringVisitId) !== owner) throw storage.fail('The referring visit does not exist in this identity.', 'NOT_FOUND');
    const settings = this.settings(owner);
    if (!settings.recording) return {recorded: false, reason: 'recording-disabled'};
    let candidate = this._document, expired = null;
    if (settings.retentionDays !== null) {
      const cutoff = this._time() - settings.retentionDays * DAY;
      expired = removeVisits(candidate, owner, visit => visit.visitTime < cutoff); candidate = expired.document;
      if (visitTime < cutoff) {
        if (expired.removedVisits) this._commit(candidate, [this._removedEvent(owner, expired)]);
        return {recorded: false, reason: 'outside-retention'};
      }
    }
    const current = candidate === this._document ? this._pages.get(JSON.stringify([owner, address])) : candidate.items.find(item => item.identity === owner && item.url === address);
    const prior = current ? summary(current) : null;
    const visit = {visitId: crypto.randomUUID(), visitTime, transition, referringVisitId: expired?.visitIds.includes(referringVisitId) ? '0' : referringVisitId};
    const item = current ? {...current, title: title !== undefined && visitTime >= prior.lastVisitTime ? title : current.title, visits: [...current.visits, visit]} :
      {id: crypto.randomUUID(), identity: owner, url: address, title: title ?? address, visits: [visit]};
    const items = current ? candidate.items.map(row => row.id === current.id ? item : row) : [...candidate.items, item];
    const result = {recorded: true, item: summary(item), visit: {id: item.id, ...visit, isLocal: true}};
    const events = expired?.removedVisits ? [this._removedEvent(owner, expired)] : [];
    events.push({type: 'visited', identity: owner, item: result.item, visit: result.visit});
    this._commit({...candidate, items}, events); return clone(result);
  }
  updateTitle(owner, address, title) {
    this._identity(owner); address = url(address); text(title, 'History title');
    if (!this.settings(owner).recording) return false;
    const current = this._pages.get(JSON.stringify([owner, address]));
    if (!current || current.title === title) return false;
    const next = {...current, title};
    return this._commit({...this._document, items: this._document.items.map(item => item.id === current.id ? next : item)},
      [{type: 'title', identity: owner, item: summary(next)}]);
  }
  query(owner, options = {}) {
    this._identity(owner); keys(options, ['text', 'startTime', 'endTime', 'offset', 'limit', 'maxResults'], 'History query');
    const terms = options.text === undefined ? [] : text(options.text, 'History query').toLocaleLowerCase().split(/\s+/u).filter(Boolean);
    const {startTime, endTime} = range(options);
    const offset = options.offset === undefined ? 0 : integer(options.offset, 'Offset');
    if (options.limit !== undefined && options.maxResults !== undefined) throw storage.fail('Use either limit or maxResults, not both.');
    const requested = options.limit !== undefined ? options.limit : options.maxResults;
    const limit = requested === undefined ? Infinity : integer(requested, 'Result limit');
    const found = [];
    for (const item of this._identityPages.get(owner) || []) {
      const page = this._summaries.get(item.id);
      if (page.lastVisitTime < startTime || page.lastVisitTime >= endTime) continue;
      const haystack = `${item.title}\n${item.url}`.toLocaleLowerCase();
      if (terms.every(term => haystack.includes(term))) found.push({...page});
    }
    found.sort((a, b) => b.lastVisitTime - a.lastVisitTime || a.id.localeCompare(b.id));
    return {items: found.slice(offset, offset + limit), total: found.length, offset, hasMore: offset + limit < found.length};
  }
  search(owner, options = {}) { return this.query(owner, options).items; }
  getVisits(owner, address) {
    this._identity(owner); address = url(typeof address === 'object' && address ? address.url : address);
    const item = this._pages.get(JSON.stringify([owner, address]));
    return item ? item.visits.map(visit => ({id: item.id, visitId: visit.visitId, visitTime: visit.visitTime, transition: visit.transition,
      referringVisitId: visit.referringVisitId, isLocal: true})).sort((a, b) => b.visitTime - a.visitTime || a.visitId.localeCompare(b.visitId)) : [];
  }
  _removedEvent(owner, result, allHistory = false) { return {type: 'removed', identity: owner, allHistory, urls: allHistory ? [] : result.urls, visitIds: result.visitIds}; }
  _remove(owner, predicate, allHistory = false) {
    const result = removeVisits(this._document, owner, predicate);
    if (result.removedVisits) this._commit(result.document, [this._removedEvent(owner, result, allHistory)]);
    return {removedVisits: result.removedVisits, removedUrls: result.removedUrls};
  }
  deleteUrl(owner, address) {
    this._identity(owner); address = url(typeof address === 'object' && address ? address.url : address);
    return this._remove(owner, (_visit, item) => item.url === address);
  }
  deleteRange(owner, options) {
    this._identity(owner); keys(options, ['startTime', 'endTime'], 'History range');
    const {startTime, endTime} = range(options, true);
    return this._remove(owner, visit => visit.visitTime >= startTime && visit.visitTime < endTime);
  }
  clear(owner) { this._identity(owner); return this._remove(owner, () => true, true); }
  deleteAll(owner) { return this.clear(owner); }
  prune(owner) {
    this._identity(owner); const {retentionDays} = this.settings(owner);
    if (retentionDays === null) return {removedVisits: 0, removedUrls: 0};
    const cutoff = this._time() - retentionDays * DAY;
    return this._remove(owner, visit => visit.visitTime < cutoff);
  }
}

module.exports = {HistoryService, decode, TRANSITIONS};
