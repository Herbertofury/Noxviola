"use strict";
const crypto = require('node:crypto');
const {isDeepStrictEqual} = require('node:util');
const storage = require('./storage.cjs');
const {httpUrl} = require('./state.cjs');
function normalize(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid library item.');
  const url = httpUrl(item.url); if (!url) throw new Error('An HTTP(S) source link without embedded credentials is required.');
  for (const field of ['favorite', 'archived']) if (item[field] !== undefined && typeof item[field] !== 'boolean') throw new Error(`Invalid ${field} flag.`);
  return {...item, id: typeof item.id === 'string' && item.id ? item.id : crypto.randomUUID(), title: String(item.title || url), url,
    kind: ['website','image','video','creator','character'].includes(item.kind) ? item.kind : 'website',
    group: String(item.group || ''), characters: String(item.characters || ''), notes: String(item.notes || ''),
    favorite: item.favorite === true, archived: item.archived === true};
}
function decode(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw storage.fail('Invalid library document.');
  if (doc.version !== 1) throw storage.fail('Unsupported library version; the file was preserved.', 'UNSUPPORTED_VERSION');
  if (!Array.isArray(doc.items)) throw storage.fail('Library items must be an array.');
  if (doc.items.some(item => typeof item?.id !== 'string' || !item.id)) throw storage.fail('A library item has no stable ID.');
  for (const item of doc.items) {
    for (const field of ['title','group','characters','notes']) if (item[field] !== undefined && typeof item[field] !== 'string') throw storage.fail(`A library ${field} value cannot be interpreted without alteration.`, 'UNSUPPORTED_DATA');
    if (item.kind !== undefined && !['website','image','video','creator','character'].includes(item.kind)) throw storage.fail('A library item type is not supported by this version; its value was preserved.', 'UNSUPPORTED_DATA');
  }
  const items = doc.items.map(normalize);
  if (new Set(items.map(item => item.id)).size !== items.length) throw storage.fail('Library item IDs are repeated.');
  return {...doc, items};
}
const empty = () => ({version: 1, items: []});
function inspect(file) { return storage.inspect(file, decode, empty); }
function load(file) { const opened = inspect(file); if (opened.status === 'recovery') throw storage.fail('Library needs explicit recovery.', 'RECOVERY_REQUIRED'); return opened.value.items; }
function save(file, items, expected) {
  const opened = inspect(file);
  if (opened.status === 'recovery') throw storage.fail('Restore the library checkpoint before saving.', 'RECOVERY_REQUIRED');
  if (expected && !isDeepStrictEqual(opened.value, expected)) throw storage.fail('The library changed outside this window. Reopen it before saving.', 'STALE_PREVIEW');
  const document = {...opened.value, items: items.map(normalize)};
  storage.write(file, document, decode); return document;
}
function upsert(items, item) {
  const existing = item.id ? items.find(row => row.id === item.id) : null;
  const normalized = normalize({...existing, ...item});
  return existing ? items.map(row => row.id === normalized.id ? normalized : row) : [...items, normalized];
}
function stable(value) { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])); return value; }
function recordKey(item) { const {id, ...metadata} = item; return JSON.stringify(stable(metadata)); }
function previewImport(current, incoming) {
  const base = decode(current), source = decode(incoming), merged = {...base, items: [...base.items]};
  const summary = {total: source.items.length, added: 0, skipped: 0, remapped: 0, metadataAdded: 0};
  for (const [key, value] of Object.entries(source)) {
    if (key === 'version' || key === 'items') continue;
    if (Object.hasOwn(base, key) && !isDeepStrictEqual(base[key], value)) throw new Error(`Conflicting library metadata: ${key}`);
    if (!Object.hasOwn(base, key)) { Object.defineProperty(merged, key, {value, enumerable:true, writable:true, configurable:true}); summary.metadataAdded++; }
  }
  const ids = new Set([...base.items, ...source.items].map(item => item.id));
  const existingIds = new Set(base.items.map(item => item.id));
  const records = new Set(base.items.map(recordKey));
  for (const item of source.items) {
    const key = recordKey(item);
    if (records.has(key)) { summary.skipped++; continue; }
    records.add(key);
    let id = item.id;
    if (existingIds.has(id)) { let index = 1; while (ids.has(`${id}-import-${index}`)) index++; id = `${id}-import-${index}`; summary.remapped++; }
    ids.add(id); existingIds.add(id); merged.items.push({...item, id}); summary.added++;
  }
  return {document: decode(merged), summary};
}
function applyImport(file, preview, expected) {
  const current = inspect(file);
  if (current.status === 'recovery' || !isDeepStrictEqual(current.value, expected)) throw new Error('Library changed after preview. Preview the import again.');
  storage.write(file, preview.document, decode); return preview.document;
}
function recover(file, preview) { return storage.recover(file, preview, decode); }
function exportFile(file, document) { return storage.write(file, document, decode); }
module.exports = {normalize, decode, inspect, load, save, upsert, previewImport, applyImport, recover, exportFile};
