'use strict';
const path = require('node:path');

// Chromium's nested CacheStorage index can exceed legacy Win32 path limits even
// when the configured identity directory is short enough. Use the extended path
// spelling for the same directory; never relocate a profile or change OS policy.
function configureSessionDataPath(app, platform = process.platform) {
  if (platform !== 'win32') return null;
  if (app.isReady()) throw new Error('Configure the Windows session storage path before Electron is ready.');
  const original = app.getPath('sessionData');
  if (typeof original !== 'string' || !path.win32.isAbsolute(original)) {
    throw new Error('The Windows session storage directory must be an absolute path.');
  }
  if (original.startsWith('\\\\?\\')) return {original, effective:original, changed:false};
  const normalized = path.win32.normalize(original);
  if (!/^[a-z]:\\/i.test(normalized) && !normalized.startsWith('\\\\')) {
    throw new Error('The Windows session storage directory must have an absolute drive or UNC path.');
  }
  if (normalized.split('\\').some(component => /[ .]$/.test(component))) {
    throw new Error('The Windows session storage directory contains an ambiguous trailing dot or space. Its existing location was preserved.');
  }
  const effective = path.win32.toNamespacedPath(original);
  if (effective !== original) app.setPath('sessionData', effective);
  return {original, effective, changed: effective !== original};
}

module.exports = {configureSessionDataPath};
