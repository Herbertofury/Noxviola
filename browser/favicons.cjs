'use strict';

// Fetch only from the page's origin, using its identity session. The shell
// receives a bounded image, never the remote URL or the site's credentials.
function createFaviconLoader({nativeImage, maxBytes = 256 * 1024, timeoutMs = 5000}) {
  async function load(session, pageAddress, candidates) {
    let page;
    try { page = new URL(pageAddress); } catch { return ''; }
    if (!['https:', 'http:'].includes(page.protocol) || page.username || page.password || !Array.isArray(candidates)) return '';
    const url = candidates.find(value => {
      try {
        const icon = new URL(value);
        return icon.origin === page.origin && ['https:', 'http:'].includes(icon.protocol) && !icon.username && !icon.password;
      } catch { return false; }
    }) || (candidates.length ? new URL('/favicon.ico',page).href : '');
    if (!url) return '';
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await session.fetch(url, {credentials:'omit', redirect:'error', signal:controller.signal});
      if (!response.ok || !response.body) return '';
      const declared = response.headers.get('content-length');
      if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) return '';
      const reader = response.body.getReader(), chunks = []; let size = 0;
      try {
        while (true) {
          const {done,value} = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > maxBytes) { await reader.cancel(); return ''; }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
      const bytes = Buffer.concat(chunks);
      const image = nativeImage.createFromBuffer(bytes);
      // Chromium's sandboxed image decoder supports ICO, although Electron's
      // nativeImage buffer decoder only accepts PNG/JPEG on some platforms.
      if (image.isEmpty()) return bytes.length >= 6 && bytes.readUInt32LE(0) === 0x00010000 && bytes.readUInt16LE(4) > 0 ? `data:image/x-icon;base64,${bytes.toString('base64')}` : '';
      const icon = image.resize({width:32,height:32,quality:'good'}).toDataURL();
      return typeof icon === 'string' && icon.startsWith('data:image/png;base64,') ? icon : '';
    } catch { return ''; }
    finally { clearTimeout(timer); controller.abort(); }
  }
  return {load};
}
module.exports = {createFaviconLoader};
