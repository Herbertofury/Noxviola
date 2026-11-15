'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ID = /^[a-zA-Z0-9_-]+$/;
const bindingsBySession = new WeakMap();
// Pinned Chromium: origin SHA-1, per-cache UUID, and the longest uint64
// doom-generation filename. Include NUL and the Win32 directory 8.3 reserve.
const CACHE_DIRECTORY = path.win32.join('Service Worker', 'CacheStorage', '0'.repeat(40), '0'.repeat(36));
const DOOM_FILE = 'todelete_' + '0'.repeat(16) + '_0_18446744073709551615';
const FILE_SUFFIX = path.win32.join(CACHE_DIRECTORY, DOOM_FILE);
const DIRECTORY_SUFFIX = path.win32.join(CACHE_DIRECTORY, 'index-dir');

function unsafe(message) {
  const error = new Error('Identity storage: ' + message + ' Existing files were preserved.');
  error.code = 'IDENTITY_STORAGE_UNSAFE';
  return error;
}

function validateIdentity(identity) {
  if (typeof identity !== 'string' || !ID.test(identity)) throw unsafe('Select a valid browser identity.');
}

// Path syntax belongs to the host filesystem. The explicit paths argument
// supports Windows string tests; POSIX link tests are not Windows qualification.
function identityStoragePaths(root, identity, paths = path) {
  validateIdentity(identity);
  if (typeof root !== 'string' || !root || /[\x00-\x1f]/.test(root) || !paths.isAbsolute(root)) {
    throw unsafe('The session directory must be absolute.');
  }
  if (paths.sep === '\\') {
    const spelling = root.replaceAll('/', '\\');
    if (spelling.startsWith('\\\\?\\') || spelling.startsWith('\\\\.\\')) {
      throw unsafe('An ordinary drive or UNC session directory is required; a global device namespace is unsupported.');
    }
    if (!/^[a-z]:\\/i.test(spelling) && !/^\\\\[^\\]+\\[^\\]+(?:\\|$)/.test(spelling)) {
      throw unsafe('The session directory must have an absolute drive or complete UNC path.');
    }
    if (spelling.split('\\').some(component => component !== '.' && component !== '..' && /[ .]$/.test(component))) {
      throw unsafe('The session directory contains an ambiguous trailing dot or space.');
    }
  }
  const folded = identity.toLowerCase();
  // The same 128 digest bits as 32 hex characters, in 22 Windows-safe characters.
  const digest = crypto.createHash('sha256').update(folded).digest().subarray(0, 16).toString('base64url');
  return {
    root, identity, partition:'persist:noxviola-identity-' + identity,
    original:paths.join(root, 'Partitions', 'noxviola-identity-' + folded),
    partitions:paths.join(root, 'Partitions'), aliasRoot:paths.join(root, 'i'),
    alias:paths.join(root, 'i', digest),
  };
}

function ordinarySpelling(value) {
  if (value.startsWith('\\\\?\\UNC\\')) return '\\\\' + value.slice(8);
  if (value.startsWith('\\\\?\\')) return value.slice(4);
  return value;
}

function fitsLegacyCacheStorage(...directories) {
  return directories.every(directory => {
    const length = ordinarySpelling(directory).replace(/[\\/]+$/, '').length;
    return length + 1 + FILE_SUFFIX.length + 1 <= 260 &&
      length + 1 + DIRECTORY_SUFFIX.length + 1 + 12 <= 260;
  });
}

function entry(file, filesystem) {
  try { return filesystem.lstatSync(file, {bigint:true}); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function directory(file, filesystem, allowLink = true) {
  const item = entry(file, filesystem);
  if (!item) throw unsafe('The existing directory is missing: ' + file + '.');
  if ((!allowLink && item.isSymbolicLink()) || (!item.isDirectory() && !item.isSymbolicLink())) {
    throw unsafe('An ordinary directory is required at ' + file + '.');
  }
  let stat, canonical;
  try {
    stat = filesystem.statSync(file, {bigint:true});
    canonical = (filesystem.realpathSync.native || filesystem.realpathSync)(file);
  } catch (error) {
    throw unsafe('The existing directory cannot be resolved at ' + file + ': ' + error.message + '.');
  }
  if (!stat.isDirectory()) throw unsafe('The existing target is not a directory: ' + file + '.');
  return {canonical, device:stat.dev, inode:stat.ino, link:item.isSymbolicLink()};
}

function reliableFileId(info) {
  return typeof info.device === 'bigint' && typeof info.inode === 'bigint' && info.device !== 0n && info.inode !== 0n;
}

function sameDirectory(left, right) {
  if (reliableFileId(left) && reliableFileId(right)) return left.device === right.device && left.inode === right.inode;
  // Windows directories can be case-sensitive. Zero file IDs are not evidence.
  return left.canonical === right.canonical;
}

function inspectLocation(root, identity, filesystem, paths) {
  const locations = identityStoragePaths(root, identity, paths);
  const rootInfo = directory(root, filesystem);
  const aliasRoot = entry(locations.aliasRoot, filesystem) ? directory(locations.aliasRoot, filesystem, false) : null;
  const aliasEntry = aliasRoot ? entry(locations.alias, filesystem) : null;
  if (aliasEntry && !aliasEntry.isSymbolicLink()) throw unsafe('The compact path is occupied by a foreign entry: ' + locations.alias + '.');
  const partitions = entry(locations.partitions, filesystem) ? directory(locations.partitions, filesystem) : null;
  const originalEntry = partitions ? entry(locations.original, filesystem) : null;
  if (aliasEntry && !originalEntry) {
    throw unsafe('A compact link already exists but its original identity directory is missing: ' + locations.original + '.');
  }
  const original = originalEntry ? directory(locations.original, filesystem) : {
    canonical:paths.join(partitions?.canonical || paths.join(rootInfo.canonical, 'Partitions'), paths.basename(locations.original)), missing:true,
  };
  const alias = aliasEntry ? directory(locations.alias, filesystem) : null;
  if (alias && !sameDirectory(alias, original)) throw unsafe('The compact link points to a different identity directory: ' + locations.alias + '.');
  return {locations, root:rootInfo, partitions, original, aliasRoot, alias};
}

function assertStable(before, after) {
  for (const name of ['root', 'partitions', 'original', 'aliasRoot']) {
    if (before[name] && (!after[name] || (!before[name].missing && after[name].missing) || !sameDirectory(before[name], after[name]))) {
      throw unsafe('The ' + name + ' directory changed during identity resolution.');
    }
  }
}

function makeDirectory(file, filesystem) {
  try { filesystem.mkdirSync(file); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  // Concurrent normal directory creation is acceptable; a substituted link is not.
  return directory(file, filesystem, false);
}

function prepareIdentityAlias(root, identity, {filesystem = fs, paths = path, checkTarget = () => {}} = {}) {
  const before = inspectLocation(root, identity, filesystem, paths);
  if (before.alias) { checkTarget(before); return before; }
  const {locations} = before;
  if (before.original.missing) {
    // Inspect the alias before any original-target mkdir. An existing dangling
    // link is a recovery problem, never permission to create an empty profile.
    if (entry(locations.alias, filesystem)) throw unsafe('A compact link appeared before its original directory could be initialized.');
    if (!before.partitions) makeDirectory(locations.partitions, filesystem);
    if (entry(locations.alias, filesystem)) throw unsafe('A compact link appeared before its original directory could be initialized.');
    makeDirectory(locations.original, filesystem);
  }
  const prepared = inspectLocation(root, identity, filesystem, paths);
  assertStable(before, prepared);
  checkTarget(prepared);
  if (prepared.alias) return prepared;
  const aliasRoot = prepared.aliasRoot || makeDirectory(locations.aliasRoot, filesystem);
  const current = inspectLocation(root, identity, filesystem, paths);
  assertStable(prepared, current);
  if (!sameDirectory(aliasRoot, current.aliasRoot)) throw unsafe('The compact-link directory changed before link creation.');
  try { filesystem.symlinkSync(locations.original, locations.alias, 'junction'); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const after = inspectLocation(root, identity, filesystem, paths);
  assertStable(current, after);
  if (!after.alias) throw unsafe('The compact link was not present after creation.');
  checkTarget(after);
  return after;
}

function createIdentitySessionResolver({session, root, platform = process.platform}) {
  if (!session || (typeof session !== 'object' && typeof session !== 'function')) throw new TypeError('An Electron Session module is required.');
  identityStoragePaths(root, 'personal');
  if (typeof session.fromPartition !== 'function' || (platform === 'win32' && typeof session.fromPath !== 'function')) {
    throw new TypeError('The required Electron Session factory is unavailable.');
  }
  let bindings = bindingsBySession.get(session);
  if (!bindings) { bindings = new Map(); bindingsBySession.set(session, bindings); }
  const cache = new Map();

  function check(identity, mode, record) {
    const key = identity.toLowerCase(), prior = bindings.get(key);
    if (prior && prior.identity !== identity) throw unsafe('Identities "' + prior.identity + '" and "' + identity + '" share the same Electron partition.');
    if (prior && prior.mode !== mode) throw unsafe('Identity "' + identity + '" is already bound to a different Session factory.');
    if (prior?.record && record) {
      assertStable(prior.record, record);
      if (mode === 'path' && prior.record.locations.alias !== record.locations.alias) {
        throw unsafe('Identity "' + identity + '" is already bound to a different compact path spelling.');
      }
    }
    if (record) {
      for (const [otherKey, other] of bindings) {
        if (otherKey !== key && other.record && sameDirectory(other.record.original, record.original)) {
          throw unsafe('Identities "' + other.identity + '" and "' + identity + '" resolve to the same physical directory.');
        }
      }
    }
  }

  return function resolve(identity) {
    validateIdentity(identity);
    const locations = identityStoragePaths(root, identity);
    const prior = bindings.get(identity.toLowerCase());
    if (prior && prior.identity !== identity) throw unsafe('Identities "' + prior.identity + '" and "' + identity + '" share the same Electron partition.');
    let record = null, mode = 'partition';
    if (platform === 'win32') {
      record = inspectLocation(root, identity, fs, path);
      if (record.alias || !fitsLegacyCacheStorage(locations.original, record.original.canonical)) mode = 'path';
      check(identity, mode, record);
      if (mode === 'path') {
        const canonicalAliasSpelling = path.join(record.root.canonical, 'i', path.basename(locations.alias));
        if (!fitsLegacyCacheStorage(locations.alias, canonicalAliasSpelling)) {
          throw unsafe('The selected session root remains too long for the pinned cache lifecycle even with a compact link. No alternate profile was selected.');
        }
        record = prepareIdentityAlias(root, identity, {checkTarget:candidate => check(identity, mode, candidate)});
      }
    }
    check(identity, mode, record);
    const cached = cache.get(identity);
    if (cached) {
      // A native partition may create its directory after its first lookup.
      // Capture the observed file identity so later deletion/replacement fails.
      if (record) bindings.get(identity.toLowerCase()).record = record;
      return cached;
    }
    // Preserve this binding even if Electron reports a failure: retries must use
    // the same factory and path, never open a second context on the same files.
    bindings.set(identity.toLowerCase(), {identity, mode, record});
    const result = mode === 'path' ? session.fromPath(locations.alias) : session.fromPartition(locations.partition);
    cache.set(identity, result);
    return result;
  };
}

module.exports = {createIdentitySessionResolver, prepareIdentityAlias, identityStoragePaths, fitsLegacyCacheStorage};
