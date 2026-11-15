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
function glob(value, candidate) {
  const expression = value.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp('^' + expression + '$').test(candidate);
}
function matches(value, address, {ignorePath = false, allowFileAccess = false} = {}) {
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
module.exports = {pattern, matches, hostMatches, glob, hostPatterns, hasPermission, hasHost, cookieAccessible, tabFor, navigationURL};
