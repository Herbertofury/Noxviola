'use strict';

// WebExtension match-pattern and permission admission for the browser-host APIs.
// A content-script match is not a grant for cookies or privileged browser data.
function pattern(value) {
  if (value === '<all_urls>') return {schemes: ['http:', 'https:', 'ftp:', 'file:'], host: '*', path: '/*'};
  if (typeof value !== 'string') return null;
  const match = /^(\*|https?|ftp|file):\/\/([^/]*)(\/[^#]*)$/.exec(value);
  if (!match) return null;
  const [, scheme, rawHost, pathname] = match;
  if (scheme === 'file') return rawHost === '' ? {schemes: ['file:'], host: '', path: pathname} : null;
  const wildcard = rawHost.startsWith('*.');
  const host = wildcard ? rawHost.slice(2) : rawHost;
  if (host === '*') return wildcard ? null : {schemes: scheme === '*' ? ['http:', 'https:'] : [scheme + ':'], host: '*', path: pathname};
  if (!host || /[@?#\s*]/.test(host)) return null;
  if (host.startsWith('[') ? !host.endsWith(']') : host.includes(':')) return null;
  let parsed;
  try { parsed = new URL('https://' + host + '/'); } catch { return null; }
  if (parsed.port || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.host !== parsed.hostname) return null;
  return {schemes: scheme === '*' ? ['http:', 'https:'] : [scheme + ':'], host: parsed.hostname.toLowerCase(), subdomains: wildcard, path: pathname};
}
function hostMatches(spec, hostname) {
  return spec.host === '*' || hostname === spec.host || (spec.subdomains && hostname.endsWith('.' + spec.host));
}
function wildcardMachine(source) {
  const cache = new Map();
  function closure(values) {
    const states = new Set(values);
    for (const state of states) if (source[state] === '*') states.add(state + 1);
    return [...states].sort((a, b) => a - b);
  }
  return { start: closure([0]), end: source.length, next(states, token) {
    const key = states.join(',') + ':' + JSON.stringify(token);
    if (!cache.has(key)) cache.set(key, closure(states.flatMap(state => source[state] === '*' ? [state] : source[state] === token ? [state + 1] : [])));
    return cache.get(key);
  } };
}
function glob(value, candidate) {
  if (value === candidate || value === '*') return true;
  if (!value.includes('*')) return false;
  const machine = wildcardMachine(value);
  let states = machine.start;
  // Only the pattern creates wildcard transitions. Every candidate code unit,
  // including '*' or regexp punctuation, is consumed as a literal character.
  for (let index = 0; index < candidate.length; index++) {
    states = machine.next(states, candidate[index]);
    if (!states.length) return false;
  }
  return states.includes(machine.end);
}
function matches(value, address, {ignorePath = false, allowFileAccess = false, ownExtensionId} = {}) {
  // tabs.query may target the caller's own extension page. Keep this out of
  // pattern()/host grants: it is not permission to inspect other extensions.
  const own = typeof value === 'string' && /^chrome-extension:\/\/([a-p]{32})(\/[^#]*)$/.exec(value);
  if (own) {
    if (own[1] !== ownExtensionId) return false;
    let url;
    try { url = new URL(address); } catch { return false; }
    return url.protocol === 'chrome-extension:' && url.hostname === ownExtensionId && !url.username && !url.password && !url.port && (ignorePath || glob(own[2],url.pathname + url.search));
  }
  const spec = pattern(value);
  if (!spec) return false;
  let url;
  try { url = new URL(address); } catch { return false; }
  if (url.username || url.password || !spec.schemes.includes(url.protocol) || (url.protocol === 'file:' && !allowFileAccess)) return false;
  return hostMatches(spec, url.hostname.toLowerCase()) && (ignorePath || glob(spec.path, url.pathname + url.search));
}
function hostPatterns(context) {
  return [...(context.permissions?.required || []), ...(context.permissions?.hosts || [])].filter(value => pattern(value));
}
function hasPermission(context, permission) { return context.permissions?.required?.includes(permission) === true; }
function hasHost(context, address) {
  return hostPatterns(context).some(value => matches(value, address, {ignorePath: true, allowFileAccess: context.allowFileAccess}));
}

function globContains(granted, requested) {
  if (granted === '*' || granted === requested) return true;
  if (!requested.includes('*')) return glob(granted, requested);
  if (!granted.includes('*')) return false;
  // Inclusion of wildcard languages, not a guessed representative URL. Each
  // '*' has an epsilon edge to the next token and a loop for every character.
  // The literal characters plus one "other" class are the complete alphabet.
  const alphabet = [...new Set((granted + requested).split('').filter(value => value !== '*')), null];
  const allow = wildcardMachine(granted), need = wildcardMachine(requested), queue = [], seen = new Set();
  const enqueue = (left, right) => {
    const key = left.join(',') + '/' + right.join(',');
    if (!seen.has(key)) {seen.add(key); queue.push([left, right]);}
  };
  enqueue(allow.start, need.start);
  for (let index = 0; index < queue.length; index++) {
    const [left, right] = queue[index];
    if (right.includes(need.end) && !left.includes(allow.end)) return false;
    for (const token of alphabet) {
      const next = need.next(right, token);
      if (next.length) enqueue(allow.next(left, token), next);
    }
  }
  return true;
}
function patternContains(granted, requested, {ignorePath = false, allowFileAccess = false} = {}) {
  const left = pattern(granted), right = pattern(requested);
  if (!left || !right) return false;
  const schemes = value => value.schemes.filter(scheme => allowFileAccess || scheme !== 'file:');
  const requestedSchemes = schemes(right), grantedSchemes = schemes(left);
  if (!requestedSchemes.length || !requestedSchemes.every(scheme => grantedSchemes.includes(scheme))) return false;
  if (right.host === '*' && left.host !== '*') return false;
  if (right.subdomains && !left.subdomains && left.host !== '*') return false;
  if (!hostMatches(left, right.host)) return false;
  return ignorePath || globContains(left.path, right.path);
}
function permissionArgument(message) {
  const error = new TypeError(message); error.code = 'INVALID_ARGUMENT'; throw error;
}
function originPattern(value) {
  const parsed = pattern(value);
  if (!parsed) permissionArgument('Unsupported or invalid permission origin pattern: ' + String(value));
  return parsed;
}
function permissionGrants(context) {
  const permissions = [], origins = [], explicit = [], scriptable = [], optionalExplicit = [];
  const normalizeOrigin = (value, ignoresPath) => {
    const parsed = originPattern(value);
    if (!context.allowFileAccess && parsed.schemes.every(scheme => scheme === 'file:')) return null;
    return value === '<all_urls>' ? value : value.slice(0, value.indexOf('://')) + '://' +
      (parsed.subdomains ? '*.' : '') + parsed.host + (ignoresPath ? '/*' : parsed.path);
  };
  const addOrigin = (value, ignoresPath) => {
    const normalized = normalizeOrigin(value, ignoresPath);
    if (normalized === null) return;
    origins.push(normalized); (ignoresPath ? explicit : scriptable).push(normalized);
  };
  for (const value of context.permissions?.required || []) {
    if (pattern(value)) addOrigin(value, true);
    else if (value.includes('://') || value.startsWith('<')) originPattern(value);
    else permissions.push(value);
  }
  for (const value of context.permissions?.hosts || []) addOrigin(value, true);
  // Scriptable host grants appear in the permissions inventory, but stay
  // separate from hostPatterns(): they never authorize cookies or tab data.
  for (const script of context.permissions?.contentScripts || []) for (const value of script.matches || []) addOrigin(value, false);
  for (const value of [...(context.permissions?.optional || []).filter(value => pattern(value) || value.includes('://') || value.startsWith('<')), ...(context.permissions?.optionalHosts || [])]) {
    const normalized = normalizeOrigin(value, true);
    if (normalized !== null) optionalExplicit.push(normalized);
  }
  return {permissions: [...new Set(permissions)], origins: [...new Set(origins)], explicit, scriptable, optionalExplicit};
}
function grantedPermissions(context) {
  const {permissions, origins} = permissionGrants(context);
  return {permissions, origins};
}
function containsPermissions(context, requested) {
  for (const name of ['permissions', 'origins']) if (requested[name] !== undefined &&
    (!Array.isArray(requested[name]) || requested[name].some(value => typeof value !== 'string' || !value))) permissionArgument(name + ' must be an array of nonempty strings.');
  const named = requested.permissions || [], origins = requested.origins || [];
  for (const name of named) if (!/^[A-Za-z][A-Za-z0-9_.]*$/.test(name)) permissionArgument('Named permission queries do not accept origin patterns or permission arguments.');
  for (const value of origins) originPattern(value);
  const grants = permissionGrants(context);
  return named.every(name => grants.permissions.includes(name)) && origins.every(value => {
    const explicitCoverage = granted => patternContains(granted, value, {ignorePath: true, allowFileAccess: context.allowFileAccess});
    if (grants.explicit.some(explicitCoverage)) return true;
    // Chromium classifies a query into optional explicit and required
    // scriptable sets when both declarations cover it. Script injection alone
    // cannot report that the separately declared optional host was granted.
    if (grants.optionalExplicit.some(explicitCoverage)) return false;
    return grants.scriptable.some(granted => patternContains(granted, value, {allowFileAccess: context.allowFileAccess}));
  });
}
function cookieAccessible(context, cookie) {
  const domain = String(cookie.domain || '').replace(/^\./, '').toLowerCase();
  if (!domain) return false;
  return hostPatterns(context).some(value => {
    const spec = pattern(value);
    const schemes = cookie.secure ? ['https:'] : ['http:', 'https:'];
    if (!schemes.some(scheme => spec.schemes.includes(scheme))) return false;
    // A domain cookie may also be visible at a specifically granted subdomain.
    return hostMatches(spec, domain) || (!cookie.hostOnly && spec.host.endsWith('.' + domain));
  });
}
function tabFor(context, tab, activeGrant) {
  if (!tab || tab.identity !== context.identity) throw new Error('Tab does not belong to the authorized browser identity.');
  const output = {...tab};
  delete output.identity;
  const permitted = hasPermission(context, 'tabs') || hasHost(context, tab.url || '') || activeGrant?.(context, tab);
  if (!permitted) for (const key of ['url', 'pendingUrl', 'title', 'favIconUrl']) delete output[key];
  else if (output.pendingUrl && !hasPermission(context, 'tabs') && !hasHost(context, output.pendingUrl)) delete output.pendingUrl;
  return output;
}
function navigationURL(value, context) {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f]/.test(value)) throw new Error('An absolute, credential-free navigation URL is required.');
  const url = new URL(value);
  if (url.username || url.password) throw new Error('URL credentials are not allowed.');
  if (['http:', 'https:'].includes(url.protocol) || url.href === 'about:blank') return url.href;
  if (url.protocol === 'chrome-extension:' && url.hostname === context.runtimeId && !url.port) return url.href;
  throw new Error('This extension navigation scheme or origin is not supported.');
}
module.exports = {pattern, matches, hostMatches, glob, hostPatterns, hasPermission, hasHost, globContains, patternContains, grantedPermissions, containsPermissions, cookieAccessible, tabFor, navigationURL};
