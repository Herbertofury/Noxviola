'use strict';

// Pure, local planning only. No filesystem, network, cookie or credential access.
const {createHash} = require('node:crypto');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function assert(value, message) { if (!value) throw new TypeError(message); }
function string(value) { return typeof value === 'string' && value.length > 0; }
function secretLink(parsed) {
  const sensitiveKey = /(?:token|secret|password|passwd|credential|signature|(?:^|[-_])sig$|authorization|api[-_]?key|^code$|^key$|^jwt$|^samlresponse$|^ticket$)/i;
  const fragment = parsed.hash.slice(1);
  const fragmentParameters = new URLSearchParams(fragment.includes('?') ? fragment.slice(fragment.indexOf('?') + 1) : fragment);
  return [...parsed.searchParams.keys(), ...fragmentParameters.keys()].some(key => sensitiveKey.test(key)) ||
    /(?:^|\/)(?:reset-password|password-reset|reset|magic-link|oauth|authorize|verify-email)(?:\/|$)/i.test(parsed.pathname) ||
    /(?:^|[=&#])eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(fragment);
}
function snapshot(value) {
  assert(value && string(value.participant) && string(value.revision), 'A participant and exact revision are required.');
  assert(Array.isArray(value.bookmarks), 'A complete bookmark snapshot is required.');
  const ids = new Set();
  const bookmarks = value.bookmarks.map(row => {
    assert(row && string(row.id) && !ids.has(row.id), 'Bookmark IDs must be unique within each participant.');
    ids.add(row.id);
    assert(typeof row.title === 'string' && string(row.url), 'Each bookmark requires its title and URL.');
    assert(Array.isArray(row.path) && row.path.every(x => typeof x === 'string'), 'Each bookmark requires its complete folder path.');
    // Do not round-trip through URL.href: query order, fragments and escaped bytes
    // can be meaningful. Deduplication is conservative exact-string equality.
    let parsed;
    try { parsed = new URL(row.url); } catch { throw new TypeError('Invalid bookmark URL.'); }
    return {id:row.id, title:row.title, url:row.url, path:[...row.path], portable:['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password && !secretLink(parsed)};
  });
  return {participant:value.participant, revision:value.revision, bookmarks};
}

// Whole-input refusal is a resource boundary, never truncation. Raise limits
// deliberately after measured adapter tests; callers retain the original input.
const LIMITS = Object.freeze({participants:32, bookmarks:100000, stringLength:32768, totalBytes:32 * 1024 * 1024, pathSegments:256, projectedOperations:250000, projectedPathSlots:2000000, projectedSerializedBytes:64 * 1024 * 1024});
function boundedInput(input) {
  assert(input && typeof input === 'object', 'Sync input must be an object.');
  assert(Array.isArray(input.participants) && input.participants.length <= LIMITS.participants, 'Too many participants; complete input preserved.');
  assert(Array.isArray(input.snapshots) && input.snapshots.length <= LIMITS.participants, 'Too many snapshots; complete input preserved.');
  let count = 0, bytes = 0, pathSlots = 0;
  function measure(value) {
    assert(typeof value === 'string' && value.length <= LIMITS.stringLength, 'Text limit exceeded; complete input preserved.');
    bytes += Buffer.byteLength(value, 'utf8');
    assert(bytes <= LIMITS.totalBytes, 'Input size limit exceeded; complete input preserved.');
  }
  measure(input.authority);
  for (const participant of input.participants) measure(participant);
  for (const item of input.snapshots) {
    assert(item && Array.isArray(item.bookmarks), 'A complete bookmark snapshot is required.');
    measure(item.participant); measure(item.revision);
    count += item.bookmarks.length;
    assert(count <= LIMITS.bookmarks, 'Bookmark count limit exceeded; complete input preserved.');
    for (const row of item.bookmarks) {
      assert(row && Array.isArray(row.path) && row.path.length <= LIMITS.pathSegments, 'Folder path limit exceeded; complete input preserved.');
      pathSlots += row.path.length + 1;
      measure(row.id); measure(row.title); measure(row.url);
      for (const segment of row.path) measure(segment);
    }
  }
  // Conservative worst-case fanout, checked BEFORE constructing normalized
  // snapshots, canonical provenance, target additions or JSON preview output.
  // Count both chosen row metadata and its retained source provenance. JSON
  // escaping can expand a one-byte control character to six bytes.
  const fanout = input.participants.length;
  const operations = count * fanout;
  const projectedPaths = pathSlots * fanout * 2;
  // Participant labels recur in every provenance record and conflict, not
  // just once in the input envelope. Budget their escaped fanout separately.
  const participantBytes = Math.max(...input.participants.map(value => Buffer.byteLength(value, 'utf8')));
  const serialized = bytes * 6 * fanout * 2 + projectedPaths * 8 + operations * (512 + participantBytes * 6 * 2);
  assert(operations <= LIMITS.projectedOperations && projectedPaths <= LIMITS.projectedPathSlots && serialized <= LIMITS.projectedSerializedBytes,
    'Projected plan resource limit exceeded; complete input preserved.');
}
function planBookmarkSync(input) {
  boundedInput(input);
  const {authority, participants, snapshots, categories = ['bookmarks']} = input;
  assert(Array.isArray(categories) && categories.length === 1 && categories[0] === 'bookmarks', 'Cookie, login and credential synchronization is not implemented.');
  assert(Array.isArray(participants) && participants.length >= 2 && participants.every(string) && new Set(participants).size === participants.length, 'Select distinct browser/profile participants.');
  assert(participants.includes(authority), 'Authority must be one of the selected participants.');
  assert(Array.isArray(snapshots) && snapshots.length === participants.length, 'Every selected participant needs a complete fresh snapshot.');
  const normalized = snapshots.map(snapshot), byId = new Map(normalized.map(row => [row.participant,row]));
  assert(byId.size === participants.length && participants.every(id => byId.has(id)), 'Snapshots must match the selected profiles exactly.');
  const ordered = [authority, ...participants.filter(id => id !== authority).sort()];
  const canonical = new Map(), quarantined = [];
  for (const participant of ordered) for (const row of byId.get(participant).bookmarks) {
    if (!row.portable) { quarantined.push({participant, id:row.id, reason:'Non-HTTP(S), credential-bearing or possible authentication URL requires explicit separate handling; source untouched.'}); continue; }
    const entry = canonical.get(row.url);
    if (entry) entry.sources.push({participant,id:row.id,title:row.title,path:row.path});
    else canonical.set(row.url, {url:row.url,title:row.title,path:row.path,source:participant,sources:[{participant,id:row.id,title:row.title,path:row.path}]});
  }
  const targets = participants.map(participant => {
    const rows = byId.get(participant).bookmarks, existing = new Map();
    for (const row of rows) { const values = existing.get(row.url) || []; values.push(row); existing.set(row.url,values); }
    const additions = [], conflicts = [];
    for (const value of canonical.values()) {
      const matches = existing.get(value.url);
      if (matches) {
        // Existing names, ordering and duplicates are never rewritten or removed.
        if (matches.some(row => row.title !== value.title || JSON.stringify(row.path) !== JSON.stringify(value.path))) conflicts.push({url:value.url, existingIds:matches.map(row=>row.id), authoritySource:value.source, resolution:'preserve-existing', preferredTitle:value.title,preferredPath:value.path});
        continue;
      }
      additions.push({operation:'add', key:hash([participant,value.url]), title:value.title,url:value.url,
        path:[value.source === authority ? 'Authority bookmarks' : 'Temporary organize', ...value.path],
        sources:value.sources});
    }
    return {participant,expectedRevision:byId.get(participant).revision,additions,conflicts};
  });
  const normalizedInput = {authority,participants:[...participants],snapshots:normalized,categories:['bookmarks']};
  return {version:1,mode:'additive-preview-only',inputDigest:hash(normalizedInput),authority,targets,quarantined,
    unsupported:['cookie-transfer','login-session-transfer','password-transfer','deletion-propagation','rename-propagation','live-transport'],
    requires:['explicit-profile-selection','preview-bound-user-action','adapter-permissions','fresh-revision-check','durable-backup','per-target-write-verification']};
}

function verifyPreview(plan, currentInput) {
  // Recompute, rather than trusting editable serialized operations or a UI flag.
  const current = planBookmarkSync(currentInput);
  assert(JSON.stringify(plan) === JSON.stringify(current), 'Sync preview is stale or modified. Review a new preview before writing.');
  return current;
}
module.exports = {planBookmarkSync, verifyPreview, LIMITS};
