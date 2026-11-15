'use strict';

// Local package management only. The injected session.extensions is Electron's
// real runtime; a successful load is deliberately not a compatibility verdict.
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');
const {Transform} = require('node:stream');
const {pipeline} = require('node:stream/promises');
const {crc32} = require('node:zlib');

const SUPPORT_URL = 'https://github.com/electron/electron/blob/v44.11.3/docs/api/extensions.md';
const LIFECYCLE_URL = 'https://github.com/electron/electron/blob/v44.11.3/docs/api/extensions-api.md';
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;

class ExtensionError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'ExtensionError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
function fail(code, message, details) { throw new ExtensionError(code, message, details); }
function clone(value) { return structuredClone(value); }

// JSON.parse alone accepts duplicate permissions/identity keys. Reject that
// ambiguity before either presenting a consent screen or reading durable state.
function parseJson(text, label) {
  if (Buffer.isBuffer(text) || text instanceof Uint8Array) {
    try { text = new TextDecoder('utf-8', {fatal: true}).decode(text); }
    catch { fail('INVALID_UTF8', `${label}: invalid UTF-8. The original bytes were preserved.`); }
  }
  let value;
  try { value = JSON.parse(text); } catch (error) { fail('INVALID_JSON', `${label}: ${error.message}`); }
  const stack = [];
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      const start = i++;
      while (text[i] !== '"') { if (text[i] === '\\') i++; i++; }
      const top = stack.at(-1);
      if (top?.keys && top.expectKey) {
        const key = JSON.parse(text.slice(start, i + 1));
        if (top.keys.has(key)) fail('DUPLICATE_JSON_KEY', `${label}: duplicate key ${JSON.stringify(key)}`);
        top.keys.add(key);
        top.expectKey = false;
      }
    } else if (char === '{') stack.push({keys: new Set(), expectKey: true});
    else if (char === '[') stack.push({});
    else if (char === '}' || char === ']') stack.pop();
    else if (char === ',' && stack.at(-1)?.keys) stack.at(-1).expectKey = true;
  }
  return value;
}

function safeRelative(input, {directory = false} = {}) {
  if (typeof input !== 'string' || !input || /[\\\x00-\x1f\x7f:]/.test(input) || input.startsWith('/')) {
    fail('UNSAFE_PACKAGE_PATH', `Unsafe package path: ${JSON.stringify(input)}`);
  }
  const name = directory && input.endsWith('/') ? input.slice(0, -1) : input;
  const parts = name.split('/');
  for (const part of parts) {
    if (!part || part === '.' || part === '..' || /[. ]$/.test(part) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) {
      fail('UNSAFE_PACKAGE_PATH', `Package path is not portable or escapes its directory: ${JSON.stringify(input)}`);
    }
  }
  return parts.join('/');
}
function uniquePath(seen, name) {
  const key = name.normalize('NFC').toLowerCase();
  if (seen.has(key)) fail('DUPLICATE_PACKAGE_PATH', `Ambiguous package path: ${name}`);
  seen.add(key);
}
async function regularFile(file, missing = false) {
  let handle;
  try {
    handle = await fsp.open(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
    if (!(await handle.stat()).isFile()) fail('NOT_REGULAR_FILE', `Not a regular file: ${file}`);
    return await handle.readFile();
  } catch (error) {
    if (missing && error.code === 'ENOENT') return null;
    throw error;
  } finally { await handle?.close(); }
}
async function safeDirectory(dir) {
  await fsp.mkdir(dir, {recursive: true, mode: 0o700});
  const stat = await fsp.lstat(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('UNSAFE_DIRECTORY', `Not an owned directory: ${dir}`);
}
async function syncDirectory(dir) {
  if (process.platform === 'win32') return;
  const handle = await fsp.open(dir, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}
async function replaceFile(file, bytes) {
  const temporary = `${file}.tmp-${crypto.randomUUID()}`;
  let handle;
  try {
    handle = await fsp.open(temporary, 'wx', 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;
    await fsp.rename(temporary, file);
    await syncDirectory(path.dirname(file));
  } finally {
    await handle?.close();
    await fsp.rm(temporary, {force: true});
  }
}
async function copyRegular(source, target) {
  const handle = await fsp.open(source, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
  try {
    if (!(await handle.stat()).isFile()) fail('UNSAFE_PACKAGE_FILE', `Only regular package files are accepted: ${source}`);
    await pipeline(handle.createReadStream({autoClose: false}), fs.createWriteStream(target, {flags: 'wx', mode: 0o600, flush: true}));
  } finally { await handle.close(); }
}
async function walk(root, visitor) {
  const seen = new Set();
  async function visit(relative) {
    const dir = path.join(root, relative);
    const entries = await fsp.readdir(dir, {withFileTypes: true});
    // Code-point ordering is stable across platform/ICU upgrades. Preserve the
    // actual spelling in the digest; case folding is only a collision check.
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      const name = safeRelative(relative ? `${relative}/${entry.name}` : entry.name);
      uniquePath(seen, name);
      const file = path.join(root, name);
      const stat = await fsp.lstat(file);
      if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) {
        fail('UNSAFE_PACKAGE_FILE', `Links and special files are not accepted: ${name}`);
      }
      await visitor(name, stat, file);
      if (stat.isDirectory()) await visit(name);
    }
  }
  await visit('');
}
async function copyDirectory(source, destination) {
  await safeDirectory(destination);
  await walk(source, async (name, stat, file) => {
    const target = path.join(destination, name);
    if (stat.isDirectory()) await fsp.mkdir(target, {mode: 0o700});
    else await copyRegular(file, target);
  });
}
async function syncPackageDirectories(root) {
  if (process.platform === 'win32') return;
  const directories = [root];
  await walk(root, async (_name, stat, file) => { if (stat.isDirectory()) directories.push(file); });
  for (const directory of directories.reverse()) await syncDirectory(directory);
}

async function extractArchive(archive, destination) {
  // Maintained parser: ZIP64, size validation and lazy streaming. No shell
  // extraction, signature stripping, executable hooks, or arbitrary file cap.
  const yauzl = require('yauzl');
  const zip = await new Promise((resolve, reject) => yauzl.open(archive, {
    lazyEntries: true, strictFileNames: true, validateEntrySizes: true,
  }, (error, value) => error ? reject(error) : resolve(value)));
  const seen = new Set();
  await new Promise((resolve, reject) => {
    let settled = false;
    const stop = error => {
      if (settled) return;
      settled = true;
      zip.close();
      reject(error);
    };
    zip.on('error', stop);
    zip.on('end', () => { if (!settled) { settled = true; resolve(); } });
    zip.on('entry', entry => {
      (async () => {
        const directory = entry.fileName.endsWith('/');
        const name = safeRelative(entry.fileName, {directory});
        uniquePath(seen, name);
        const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
        if (mode !== 0 && mode !== (directory ? 0x4000 : 0x8000)) fail('UNSAFE_PACKAGE_FILE', `Archive link or special file: ${name}`);
        if (entry.generalPurposeBitFlag & 1) fail('ENCRYPTED_ARCHIVE', 'Encrypted extension archives cannot be inspected.');
        const target = path.join(destination, name);
        if (directory) {
          if (entry.uncompressedSize !== 0) fail('INVALID_ARCHIVE', `Directory contains data: ${name}`);
          await fsp.mkdir(target, {recursive: true, mode: 0o700});
          return;
        }
        await fsp.mkdir(path.dirname(target), {recursive: true, mode: 0o700});
        if (typeof fsp.statfs === 'function') {
          const available = await fsp.statfs(destination, {bigint: true});
          if (BigInt(entry.uncompressedSize) > available.bavail * available.bsize) {
            fail('INSUFFICIENT_DISK_SPACE', `Not enough disk space to inspect ${name}; the declared size is ${entry.uncompressedSize} bytes.`);
          }
        }
        const stream = await new Promise((done, failed) => zip.openReadStream(entry, (error, value) => error ? failed(error) : done(value)));
        let checksum = 0;
        let length = 0;
        const verify = new Transform({transform(chunk, _encoding, callback) {
          length += chunk.length;
          checksum = crc32(chunk, checksum);
          callback(null, chunk);
        }});
        await pipeline(stream, verify, fs.createWriteStream(target, {flags: 'wx', mode: 0o600, flush: true}));
        if (length !== entry.uncompressedSize || checksum !== entry.crc32) fail('ARCHIVE_CHECKSUM', `Archive checksum or size mismatch: ${name}`);
      })().then(() => { if (!settled) zip.readEntry(); }, stop);
    });
    zip.readEntry();
  });
}

async function packageRoot(unpacked) {
  if (await regularFile(path.join(unpacked, 'manifest.json'), true)) return {root: unpacked, wrapped: false};
  const entries = await fsp.readdir(unpacked, {withFileTypes: true});
  if (entries.length === 1 && entries[0].isDirectory()) {
    const root = path.join(unpacked, entries[0].name);
    if (await regularFile(path.join(root, 'manifest.json'), true)) return {root, wrapped: true};
  }
  fail('MANIFEST_MISSING', 'The extension needs a manifest.json at its root, or inside one containing directory.');
}
function stringArray(value, label, fallback = []) {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) fail('INVALID_MANIFEST', `${label} must be an array of nonempty strings.`);
  return [...new Set(value)];
}
function localPage(value, label) {
  if (typeof value !== 'string' || !value || /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//')) fail('INVALID_MANIFEST', `${label} must be a local extension path.`);
  let pathname;
  try { pathname = decodeURIComponent(value.split(/[?#]/, 1)[0]); } catch { fail('INVALID_MANIFEST', `${label} contains invalid escaping.`); }
  safeRelative(pathname.replace(/^\//, ''));
  return value;
}
function validateManifest(manifest) {
  if (!manifest || Array.isArray(manifest) || typeof manifest !== 'object') fail('INVALID_MANIFEST', 'The manifest must be an object.');
  if (typeof manifest.name !== 'string' || !manifest.name.trim()) fail('INVALID_MANIFEST', 'An extension name is required.');
  if (typeof manifest.version !== 'string' || !/^(0|[1-9]\d{0,4})(\.(0|[1-9]\d{0,4})){0,3}$/.test(manifest.version) ||
      manifest.version.split('.').some(part => Number(part) > 65535) || !manifest.version.split('.').some(Number)) fail('INVALID_MANIFEST', 'Invalid Chrome-compatible extension version.');
  if (![2, 3].includes(manifest.manifest_version)) fail('MANIFEST_VERSION', 'Only WebExtension Manifest V2 and V3 packages can be inspected by this runtime.');
  if (manifest.app || manifest.theme) fail('UNSUPPORTED_PACKAGE_TYPE', 'Legacy Chrome apps and browser theme packages need a separate host; they are not executable WebExtensions.');
  const permissions = {
    required: stringArray(manifest.permissions, 'permissions'),
    hosts: stringArray(manifest.host_permissions, 'host_permissions'),
    optional: stringArray(manifest.optional_permissions, 'optional_permissions'),
    optionalHosts: stringArray(manifest.optional_host_permissions, 'optional_host_permissions'),
    contentScripts: [],
    fileAccessDefault: false,
  };
  const resources = [];
  const addResource = (value, label) => { resources.push(localPage(value, label)); return value; };
  if (manifest.content_scripts !== undefined) {
    if (!Array.isArray(manifest.content_scripts)) fail('INVALID_MANIFEST', 'content_scripts must be an array.');
    for (const script of manifest.content_scripts) {
      if (!script || typeof script !== 'object') fail('INVALID_MANIFEST', 'Invalid content script declaration.');
      const matches = stringArray(script.matches, 'content_scripts.matches');
      if (!matches.length) fail('INVALID_MANIFEST', 'A content script needs a match pattern.');
      permissions.contentScripts.push({matches, excludeMatches: stringArray(script.exclude_matches, 'exclude_matches'), allFrames: !!script.all_frames, runAt: script.run_at || 'document_idle'});
      for (const item of [...stringArray(script.js, 'content_scripts.js'), ...stringArray(script.css, 'content_scripts.css')]) addResource(item, 'Content script');
    }
  }
  if (manifest.background !== undefined) {
    if (!manifest.background || typeof manifest.background !== 'object' || Array.isArray(manifest.background)) fail('INVALID_MANIFEST', 'Invalid background declaration.');
    for (const script of stringArray(manifest.background.scripts, 'background.scripts')) addResource(script, 'Background script');
    for (const key of ['page', 'service_worker']) if (manifest.background[key]) addResource(manifest.background[key], `background.${key}`);
  }
  const pages = {popup: null, options: null};
  const action = manifest.action || manifest.browser_action || manifest.page_action;
  if (action?.default_popup) pages.popup = addResource(action.default_popup, 'Extension popup');
  if (manifest.options_ui?.page || manifest.options_page) pages.options = addResource(manifest.options_ui?.page || manifest.options_page, 'Extension options');
  if (manifest.devtools_page) addResource(manifest.devtools_page, 'Developer tools page');
  return {permissions, resources, pages};
}

const DOCUMENTED_METHODS = new Set([
  'runtime.lastError', 'runtime.id', 'runtime.getBackgroundPage', 'runtime.getManifest', 'runtime.getPlatformInfo', 'runtime.getURL',
  'runtime.connect', 'runtime.sendMessage', 'runtime.reload', 'runtime.onStartup', 'runtime.onInstalled', 'runtime.onSuspend',
  'runtime.onSuspendCanceled', 'runtime.onConnect', 'runtime.onMessage', 'extension.lastError', 'extension.getURL', 'extension.getBackgroundPage',
  'management.getAll', 'management.get', 'management.getSelf', 'management.getPermissionWarningsById', 'management.getPermissionWarningsByManifest',
  'management.onEnabled', 'management.onDisabled', 'tabs.sendMessage', 'tabs.reload', 'tabs.executeScript', 'tabs.query', 'tabs.update',
]);
function compatibility(manifest, detectedApis, electronVersion) {
  const issues = [];
  const add = (code, detail, api, status = 'unknown') => issues.push({code, status, detail, ...(api ? {api} : {})});
  for (const api of detectedApis) {
    const bare = api.replace(/^(chrome|browser)\./, '');
    if (bare.startsWith('storage.sync')) add('STORAGE_SYNC_UNSUPPORTED', 'Electron 44.11.3 documents storage.sync as unsupported. No local or cloud substitute is injected.', api, 'unsupported');
    else if (bare.startsWith('storage.managed')) add('MANAGED_STORAGE_UNSUPPORTED', 'Electron 44.11.3 documents storage.managed as unsupported. Enterprise policy storage is not integrated.', api, 'unsupported');
    else if (bare.startsWith('storage.local') || bare === 'storage.onChanged' || /^(scripting|webRequest|devtools\.(inspectedWindow|network|panels))\./.test(bare)) { /* documented subset */ }
    else if (DOCUMENTED_METHODS.has(bare) || (/\.on\w+\.(addListener|removeListener|hasListener|hasListeners)$/.test(bare) && DOCUMENTED_METHODS.has(bare.split('.').slice(0, -1).join('.')))) {
      if (bare === 'tabs.query' || bare === 'tabs.update') add('PARTIAL_TABS_API', 'Electron documents partial tab semantics; active/current-window behavior and unsupported fields need functional verification.', api, 'limited');
    } else add('API_NOT_VERIFIED', 'This API is outside the Electron API subset verified by this manager. An upstream browser bridge or a real functional test is required.', api);
  }
  const documentedPermissions = new Set(['storage', 'scripting', 'webRequest', 'webRequestBlocking', 'tabs', 'activeTab', 'management']);
  for (const permission of stringArray(manifest.permissions, 'permissions')) {
    if (permission === '<all_urls>' || permission.includes('://') || documentedPermissions.has(permission)) continue;
    add('PERMISSION_API_NOT_VERIFIED', `The ${permission} permission does not establish that the corresponding API works in Electron.`, permission);
  }
  for (const key of ['sidebar_action', 'side_panel', 'omnibox', 'commands', 'chrome_url_overrides', 'devtools_page']) {
    if (manifest[key]) add('HOST_INTEGRATION_REQUIRED', `${key} needs browser-host integration and has not been functionally verified.`, key, 'limited');
  }
  if (manifest.background?.service_worker) add('SERVICE_WORKER_UNVERIFIED', 'Manifest V3 background service-worker startup and event lifetime require a real runtime test.', 'background.service_worker');
  if (manifest.browser_specific_settings || manifest.applications) add('FIREFOX_METADATA', 'Firefox-specific metadata is preserved. Gecko-specific API behavior and signing trust are not supplied by this import.', 'browser_specific_settings', 'limited');
  if (manifest.update_url) add('UPDATES_NOT_ENABLED', 'The package declares an update source. Automatic acquisition/signature verification is not implemented; no update request is sent.', 'update_url', 'limited');
  return {
    status: issues.length ? 'limited' : 'unverified',
    functionalVerification: 'not-tested',
    runtime: 'electron-session-extensions',
    electronVersion: electronVersion || 'not-running-in-electron',
    detectedApis,
    detection: 'Static dotted API references only; computed calls, aliases and runtime dependencies may be missed. No browser.* rewrite or API shim is injected.',
    issues,
    sources: [SUPPORT_URL, LIFECYCLE_URL],
  };
}

async function inspectTree(root, electronVersion) {
  const rootStat = await fsp.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('UNSAFE_PACKAGE_FILE', 'The package root must be an owned regular directory.');
  const manifestBytes = await regularFile(path.join(root, 'manifest.json'));
  const manifestHash = crypto.createHash('sha256').update(manifestBytes).digest('hex');
  const manifest = parseJson(manifestBytes, 'manifest.json');
  const {permissions, resources, pages} = validateManifest(manifest);
  const digest = crypto.createHash('sha256');
  const apis = new Set();
  let bytes = 0;
  let files = 0;
  let signatureFiles = false;
  await walk(root, async (name, stat, file) => {
    if (!stat.isFile()) return;
    files++;
    const hash = crypto.createHash('sha256');
    let fileBytes = 0;
    const scan = /\.(?:m?js|cjs|html?)$/i.test(name);
    let tail = '';
    const handle = await fsp.open(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
    try {
      if (!(await handle.stat()).isFile()) fail('UNSAFE_PACKAGE_FILE', `Package changed while inspecting: ${name}`);
      for await (const chunk of handle.createReadStream({autoClose: false})) {
        bytes += chunk.length;
        fileBytes += chunk.length;
        hash.update(chunk);
        if (scan) {
          const source = tail + chunk.toString('utf8');
          for (const match of source.matchAll(/\b(chrome|browser)\s*\.\s*([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*){1,4})/g)) apis.add(`${match[1]}.${match[2].replace(/\s/g, '')}`);
          tail = source.slice(-512);
        }
      }
    } finally { await handle.close(); }
    const fileHash = hash.digest('hex');
    if (name === 'manifest.json' && fileHash !== manifestHash) fail('PACKAGE_CHANGED_DURING_INSPECTION', 'The manifest changed while its permissions were being inspected.');
    digest.update(JSON.stringify([name, fileBytes, fileHash]) + '\n');
    if (/^META-INF\/.+\.(?:rsa|sf|mf)$/i.test(name)) signatureFiles = true;
  });
  for (const resource of resources) {
    const name = decodeURIComponent(resource.split(/[?#]/, 1)[0]).replace(/^\//, '');
    const stat = await fsp.lstat(path.join(root, name)).catch(() => null);
    if (!stat?.isFile() || stat.isSymbolicLink()) fail('RESOURCE_MISSING', `Manifest resource is missing or not a regular file: ${resource}`);
  }
  let sourceIdentity = null;
  if (manifest.key !== undefined) {
    if (typeof manifest.key !== 'string' || !/^[A-Za-z\d+/\r\n]+=*$/.test(manifest.key)) fail('INVALID_MANIFEST', 'Invalid extension public key.');
    sourceIdentity = `chromium-key:${crypto.createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex')}`;
  } else {
    const gecko = manifest.browser_specific_settings?.gecko?.id || manifest.applications?.gecko?.id;
    if (gecko !== undefined) {
      if (typeof gecko !== 'string' || !gecko) fail('INVALID_MANIFEST', 'Invalid Gecko extension identity.');
      sourceIdentity = `gecko:${gecko}`;
    }
  }
  return {
    name: manifest.name, version: manifest.version,
    description: typeof manifest.description === 'string' ? manifest.description : '',
    manifestVersion: manifest.manifest_version, packageDigest: digest.digest('hex'),
    sourceIdentity, permissions, pages, bytes, files, signatureFiles,
    compatibility: compatibility(manifest, [...apis].sort(), electronVersion),
  };
}

function validateRegistry(state) {
  if (!state || state.version !== 1 || !Array.isArray(state.items)) fail('REGISTRY_VERSION', 'Extension registry schema is invalid or newer than this browser. Existing bytes were preserved.');
  const ids = new Set();
  for (const item of state.items) {
    if (!item || !ID.test(item.id) || ids.has(item.id) || !HASH.test(item.packageDigest) || typeof item.name !== 'string' || typeof item.version !== 'string' || !Array.isArray(item.identities)) fail('REGISTRY_INVALID', 'Invalid or duplicate extension registry entry. Existing bytes were preserved.');
    ids.add(item.id);
    const identities = new Set();
    for (const grant of item.identities) {
      if (!grant || typeof grant.identity !== 'string' || !grant.identity || grant.identity.includes('\0') || identities.has(grant.identity) || typeof grant.enabled !== 'boolean' || typeof grant.allowFileAccess !== 'boolean' || typeof grant.acceptedAt !== 'string') fail('REGISTRY_INVALID', 'Invalid identity permission record. Existing bytes were preserved.');
      identities.add(grant.identity);
    }
  }
  return state;
}

class ExtensionManager {
  constructor({directory, getSession, getIdentities, loadExtension = (session, directory, options) => session.extensions.loadExtension(directory, options), electronVersion = process.versions.electron} = {}) {
    if (!directory || typeof getSession !== 'function' || typeof getIdentities !== 'function') throw new TypeError('directory, getSession and getIdentities are required');
    if (typeof loadExtension !== 'function') throw new TypeError('loadExtension must be a function');
    this.directory = path.resolve(directory);
    this.getSession = getSession;
    this.getIdentities = getIdentities;
    // Production injects extension-runtime.cjs. The raw default keeps isolated
    // contract adapters independent of Electron's native background events.
    this.loadExtension = loadExtension;
    this.electronVersion = electronVersion;
    this._state = {version: 1, items: []};
    this._disk = null;
    this._records = new Map();
    this._runtime = new Map();
    this._previews = new Map();
    this._adapters = new Map();
    this._sessions = new Map();
    this._observers = new Map();
    this._tail = Promise.resolve();
    this._opened = false;
    this._disposed = false;
  }
  _enqueue(work) {
    const result = this._tail.then(() => {
      if (!this._opened || this._disposed) fail('MANAGER_CLOSED', 'The extension manager is not open.');
      return work();
    });
    this._tail = result.catch(() => {});
    return result;
  }
  async open() {
    if (this._opened) return this.list();
    await safeDirectory(this.directory);
    this.directory = await fsp.realpath(this.directory);
    this.registryPath = path.join(this.directory, 'registry.json');
    this.packagesPath = path.join(this.directory, 'packages');
    this.previewsPath = path.join(this.directory, 'previews');
    await safeDirectory(this.packagesPath);
    await safeDirectory(this.previewsPath);
    this._disk = await regularFile(this.registryPath, true);
    const previous = await regularFile(`${this.registryPath}.previous`, true);
    if (this._disk === null && previous !== null) fail('REGISTRY_RECOVERY_REQUIRED', 'The primary extension registry is missing but a previous checkpoint exists. Restore it explicitly; no extension was loaded.');
    if (this._disk !== null) this._state = validateRegistry(parseJson(this._disk, 'Extension registry'));
    this._records = new Map(this._state.items.map(item => [item.id, item]));
    this._opened = true;
    return this.list();
  }
  _identity(identity) {
    if (typeof identity !== 'string' || !identity || identity.includes('\0') || !this.getIdentities().includes(identity)) fail('IDENTITY_UNKNOWN', 'Choose an existing browser identity.');
    return identity;
  }
  _item(id) {
    const item = this._records.get(id);
    if (!item) fail('EXTENSION_NOT_FOUND', 'Extension not found.');
    return item;
  }
  _key(id, identity) { return `${id}\0${identity}`; }
  _adapter(identity) {
    this._identity(identity);
    if (this._adapters.has(identity)) return this._adapters.get(identity);
    const session = this.getSession(identity);
    if (typeof session?.isPersistent === 'function' && !session.isPersistent()) fail('PERSISTENT_SESSION_REQUIRED', 'Extensions require a persistent identity session.');
    const adapter = session?.extensions;
    if (!adapter || ['loadExtension', 'removeExtension', 'getExtension', 'getAllExtensions'].some(method => typeof adapter[method] !== 'function')) fail('RUNTIME_UNAVAILABLE', 'This Electron session does not expose the required extension lifecycle API.');
    this._adapters.set(identity, adapter);
    this._sessions.set(identity, session);
    if (typeof adapter.on === 'function') {
      const unloaded = (_event, extension) => {
        for (const item of this._state.items) {
          const key = this._key(item.id, identity);
          const runtime = this._runtime.get(key);
          if (runtime?.runtimeId !== extension.id) continue;
          const enabled = item.identities.find(grant => grant.identity === identity)?.enabled;
          this._runtime.set(key, {...runtime, status: enabled ? 'not-loaded' : 'disabled', error: enabled ? 'The extension runtime unloaded this extension.' : null});
        }
      };
      const loaded = (_event, extension) => {
        for (const item of this._state.items) {
          const key = this._key(item.id, identity);
          const runtime = this._runtime.get(key);
          // Registration alone cannot attest that a persistent background page
          // finished loading. Only the managed load operation confirms ready.
          if (runtime?.runtimeId === extension.id && runtime.status !== 'disable-failed') this._runtime.set(key, {...runtime, status: 'not-loaded', error: 'The runtime registered this extension without confirmed managed readiness. Disable it before loading again.'});
        }
      };
      adapter.on('extension-unloaded', unloaded);
      adapter.on('extension-loaded', loaded);
      this._observers.set(identity, {unloaded, loaded});
    }
    return adapter;
  }
  async _save(next) {
    validateRegistry(next);
    const current = await regularFile(this.registryPath, true);
    if ((current === null) !== (this._disk === null) || (current !== null && !current.equals(this._disk))) fail('REGISTRY_CHANGED', 'The extension registry changed outside this manager. Reopen before changing it.');
    const bytes = Buffer.from(JSON.stringify(next, null, 2) + '\n');
    if (current?.equals(bytes)) return;
    const previous = await regularFile(`${this.registryPath}.previous`, true);
    if (previous !== null) validateRegistry(parseJson(previous, 'Previous extension registry'));
    if (current !== null) await replaceFile(`${this.registryPath}.previous`, current);
    try { await replaceFile(this.registryPath, bytes); }
    catch (error) {
      // A rename may have become visible before a directory sync or its
      // acknowledgement failed. Never roll code back underneath visible state.
      const visible = await regularFile(this.registryPath, true).catch(() => null);
      if (visible?.equals(bytes)) {
        this._state = next;
        this._records = new Map(next.items.map(item => [item.id, item]));
        this._disk = bytes;
        fail('REGISTRY_DURABILITY_UNCONFIRMED', `The extension registry replacement is visible, but disk durability could not be confirmed: ${error.message}. The package and metadata were preserved; no successful write is claimed.`);
      }
      throw error;
    }
    this._state = next;
    this._records = new Map(next.items.map(item => [item.id, item]));
    this._disk = bytes;
  }
  list() {
    return this._state.items.map(item => {
      const result = clone(item);
      result.identities = item.identities.map(grant => ({
        ...clone(grant), status: grant.enabled ? 'not-loaded' : 'disabled', runtimeId: null, error: null,
        ...clone(this._runtime.get(this._key(item.id, grant.identity)) || {}),
      }));
      result.storagePolicy = 'Disabling retains extension storage in that identity. Uninstall removes owned code and enrollment; Chromium extension data is retained, not claimed erased.';
      return result;
    });
  }
  preview(source) {
    return this._enqueue(async () => {
      if (typeof source !== 'string' || !path.isAbsolute(source)) fail('SOURCE_PATH', 'Choose an absolute local package path.');
      const stat = await fsp.lstat(source);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) fail('UNSAFE_PACKAGE_FILE', 'Choose an unpacked directory or a regular ZIP/XPI file, not a link or special file.');
      const token = crypto.randomUUID();
      const staging = path.join(this.previewsPath, token);
      await fsp.mkdir(staging, {mode: 0o700});
      try {
        const unpacked = path.join(staging, 'package');
        await fsp.mkdir(unpacked, {mode: 0o700});
        let format = 'unpacked';
        let archiveDigest = null;
        if (stat.isDirectory()) {
          const canonicalSource = await fsp.realpath(source);
          if (this.directory === canonicalSource || this.directory.startsWith(`${canonicalSource}${path.sep}`)) fail('RECURSIVE_SOURCE', 'The selected source contains the extension manager storage directory.');
          await copyDirectory(source, unpacked);
        } else {
          const extension = path.extname(source).toLowerCase();
          const archive = path.join(staging, 'archive');
          await copyRegular(source, archive);
          const handle = await fsp.open(archive, 'r');
          const magic = Buffer.alloc(4);
          try { await handle.read(magic, 0, 4, 0); } finally { await handle.close(); }
          if (extension === '.crx' || magic.toString('ascii') === 'Cr24') fail('CRX_SIGNATURE_UNVERIFIED', 'CRX installation is blocked: CRX2/CRX3 publisher signatures and distribution trust are not verified. Obtain an authorized unpacked/ZIP source; the CRX header is never silently stripped.');
          if (!['.zip', '.xpi'].includes(extension)) fail('PACKAGE_FORMAT', 'Supported local imports are unpacked WebExtensions, ZIP and XPI. CRX signature verification remains unresolved.');
          format = extension.slice(1);
          const archiveHash = crypto.createHash('sha256');
          for await (const chunk of fs.createReadStream(archive)) archiveHash.update(chunk);
          archiveDigest = archiveHash.digest('hex');
          await extractArchive(archive, unpacked);
        }
        const {root, wrapped} = await packageRoot(unpacked);
        const inspection = await inspectTree(root, this.electronVersion);
        const value = {
          token, ...inspection, format,
          provenance: {source: 'local-user-selected', filename: path.basename(source), archiveDigest, signature: 'not-verified', signatureFilesPresent: inspection.signatureFiles, publisherVerified: false, adaptation: wrapped ? 'single-wrapper-directory-removed' : 'unpacked-copy', codeRewritten: false},
          requiresUnsignedImportAcceptance: format === 'xpi',
          consent: 'Review required and optional permissions, content-script sites and compatibility limitations. File access is off unless separately selected. This package is not publisher-verified and loading is not proof of functionality.',
        };
        this._previews.set(token, {value, root, staging});
        return clone(value);
      } catch (error) {
        await fsp.rm(staging, {recursive: true, force: true});
        throw error;
      }
    });
  }
  cancelPreview(token) {
    return this._enqueue(async () => {
      const preview = this._previews.get(token);
      if (!preview) return;
      await fsp.rm(preview.staging, {recursive: true, force: true});
      this._previews.delete(token);
    });
  }
  install(token, {identities, permissionsAccepted = false, allowFileAccess = false, unsignedImportAccepted = false} = {}) {
    return this._enqueue(async () => {
      const preview = this._previews.get(token);
      if (!preview) fail('PREVIEW_EXPIRED', 'Inspect the package again before installing.');
      if (permissionsAccepted !== true) fail('PERMISSION_ACCEPTANCE_REQUIRED', 'The displayed package permissions require explicit acceptance.');
      if (preview.value.requiresUnsignedImportAcceptance && unsignedImportAccepted !== true) fail('XPI_TRUST_ACCEPTANCE_REQUIRED', 'Firefox signature trust is not verified here. Explicitly accept this as an unsigned local import before continuing.');
      if (typeof allowFileAccess !== 'boolean') fail('PERMISSION_ACCEPTANCE_REQUIRED', 'File access must be selected explicitly.');
      if (!Array.isArray(identities) || !identities.length) fail('IDENTITY_REQUIRED', 'Select at least one browser identity.');
      identities = [...new Set(identities.map(identity => this._identity(identity)))];
      const inspection = await inspectTree(preview.root, this.electronVersion);
      if (inspection.packageDigest !== preview.value.packageDigest) fail('PREVIEW_CHANGED', 'The inspected package changed. Inspect it again before accepting permissions.');
      if (this._state.items.some(item => item.packageDigest === inspection.packageDigest || (inspection.sourceIdentity && item.sourceIdentity === inspection.sourceIdentity))) fail('EXTENSION_ALREADY_INSTALLED', 'This extension package or publisher identity is already installed. Enable it for another identity instead; reviewed updates are not implemented yet.');
      const id = crypto.randomUUID();
      const installedAt = new Date().toISOString();
      const item = {...inspection, id, installedAt, format: preview.value.format, provenance: preview.value.provenance,
        identities: identities.map(identity => ({identity, enabled: true, allowFileAccess, acceptedAt: installedAt}))};
      const target = path.join(this.packagesPath, id);
      await syncPackageDirectories(preview.root);
      try {
        await fsp.rename(preview.root, target);
        await syncDirectory(this.packagesPath);
        await this._save({...this._state, items: [...this._state.items, item]});
      }
      catch (error) {
        if (this._records.has(id)) {
          // The metadata rename became visible, even though its sync failed.
          // Preserve its referenced package. It has still never executed.
          this._previews.delete(token);
          await fsp.rm(preview.staging, {recursive: true, force: true});
        } else {
          // Restore the still-unexecuted preview so a disk failure can be retried.
          if (await fsp.lstat(target).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error))) await fsp.rename(target, preview.root);
        }
        throw error;
      }
      await fsp.rm(preview.staging, {recursive: true, force: true});
      this._previews.delete(token);
      for (const grant of item.identities) await this._load(item, grant, inspection.packageDigest);
      return this.list().find(record => record.id === id);
    });
  }
  async _load(item, grant, verifiedDigest) {
    const key = this._key(item.id, grant.identity);
    let adapter;
    let loadedId;
    let previousIds;
    const packagePath = path.join(this.packagesPath, item.id);
    try {
      adapter = this._adapter(grant.identity);
      const existing = this._runtime.get(key);
      if (existing?.runtimeId && adapter.getExtension(existing.runtimeId)) {
        if (existing.status !== 'loaded') this._runtime.set(key, {...existing, status: 'disable-failed', error: existing.error || 'Extension code may still be running without confirmed readiness. Disable it before loading again.'});
        return;
      }
      if ((verifiedDigest || (await inspectTree(packagePath, this.electronVersion)).packageDigest) !== item.packageDigest) fail('INSTALLED_PACKAGE_CHANGED', 'Installed bytes differ from the package whose permissions were accepted. The extension was not loaded.');
      const expectedId = item.sourceIdentity?.startsWith('chromium-key:') ? item.sourceIdentity.slice('chromium-key:'.length, 'chromium-key:'.length + 32).replace(/[0-9a-f]/g, char => String.fromCharCode(97 + parseInt(char, 16))) : null;
      if (expectedId && adapter.getExtension(expectedId)) fail('RUNTIME_ID_CONFLICT', 'An extension with this publisher identity is already running outside this manager. It was not replaced.');
      previousIds = new Set(adapter.getAllExtensions().map(extension => extension.id));
      const extension = await this.loadExtension(this._sessions.get(grant.identity), packagePath, {allowFileAccess: grant.allowFileAccess});
      loadedId = extension?.id;
      if (!extension || !/^[a-p]{32}$/.test(extension.id) || !adapter.getExtension(extension.id)) fail('RUNTIME_LOAD_UNCONFIRMED', 'The extension runtime did not confirm a loaded extension identity.');
      this._runtime.set(key, {status: 'loaded', runtimeId: extension.id, error: null, functionalVerification: 'not-tested'});
    } catch (error) {
      if (!loadedId && previousIds) loadedId = adapter.getAllExtensions().find(extension => extension.path === packagePath && !previousIds.has(extension.id))?.id;
      if (loadedId) {
        try {
          await adapter.removeExtension(loadedId);
          if (adapter.getExtension(loadedId)) throw new Error('Unconfirmed extension remains loaded.');
        } catch (cleanupError) {
          this._runtime.set(key, {status: 'disable-failed', runtimeId: loadedId, error: `Load verification failed and code may still be running: ${error.message}; ${cleanupError.message}`});
          return;
        }
      }
      this._runtime.set(key, {status: 'load-failed', runtimeId: null, error: error.message, errorCode: error.code || 'RUNTIME_LOAD_FAILED'});
    }
  }
  async _unload(item, identity) {
    const key = this._key(item.id, identity);
    const runtime = this._runtime.get(key);
    if (!runtime?.runtimeId) { this._runtime.set(key, {status: 'disabled', runtimeId: null, error: null}); return; }
    try {
      const adapter = this._adapters.get(identity) || this._adapter(identity);
      await adapter.removeExtension(runtime.runtimeId);
      if (adapter.getExtension(runtime.runtimeId)) fail('RUNTIME_UNLOAD_UNCONFIRMED', 'The runtime still reports this extension as loaded.');
      this._runtime.set(key, {status: 'disabled', runtimeId: null, error: null});
    } catch (error) {
      this._runtime.set(key, {...runtime, status: 'disable-failed', error: `Extension may still be running: ${error.message}`});
      throw error;
    }
  }
  restore() {
    return this._enqueue(async () => {
      for (const item of this._state.items) for (const grant of item.identities) if (grant.enabled) await this._load(item, grant);
      return this.list();
    });
  }
  restoreIdentity(identity) {
    return this._enqueue(async () => {
      this._identity(identity);
      for (const item of this._state.items) {
        const grant = item.identities.find(candidate => candidate.identity === identity);
        if (grant?.enabled) await this._load(item, grant);
      }
      return this.list();
    });
  }
  setEnabled(id, identity, enabled) {
    return this._enqueue(async () => {
      this._identity(identity);
      if (typeof enabled !== 'boolean') fail('INVALID_ENABLED', 'Enabled must be a boolean.');
      const item = this._item(id);
      const grant = item.identities.find(candidate => candidate.identity === identity);
      if (!grant) fail('IDENTITY_PERMISSION_REQUIRED', 'This identity has not accepted this extension’s permissions. Use authorizeIdentity with explicit acceptance.');
      const next = {...item, identities: item.identities.map(candidate => candidate.identity === identity ? {...candidate, enabled} : candidate)};
      try { await this._save({...this._state, items: this._state.items.map(candidate => candidate.id === id ? next : candidate)}); }
      catch (error) {
        if (!enabled) await this._unload(item, identity);
        throw error;
      }
      if (enabled) await this._load(next, next.identities.find(candidate => candidate.identity === identity));
      else await this._unload(next, identity);
      return this.list().find(candidate => candidate.id === id);
    });
  }
  authorizeIdentity(id, identity, {permissionsAccepted = false, allowFileAccess = false} = {}) {
    return this._enqueue(async () => {
      this._identity(identity);
      if (permissionsAccepted !== true || typeof allowFileAccess !== 'boolean') fail('PERMISSION_ACCEPTANCE_REQUIRED', 'Accept the extension permissions for this identity explicitly.');
      const item = this._item(id);
      if (item.identities.some(grant => grant.identity === identity)) fail('IDENTITY_ALREADY_AUTHORIZED', 'Use enable/disable for this already-authorized identity.');
      const grant = {identity, enabled: true, allowFileAccess, acceptedAt: new Date().toISOString()};
      const next = {...item, identities: [...item.identities, grant]};
      await this._save({...this._state, items: this._state.items.map(candidate => candidate.id === id ? next : candidate)});
      await this._load(next, grant);
      return this.list().find(candidate => candidate.id === id);
    });
  }
  pageFor(id, identity, kind) {
    if (!['popup', 'options'].includes(kind)) fail('EXTENSION_PAGE_KIND', 'Choose popup or options.');
    this._identity(identity);
    const item = this._item(id);
    const grant = item.identities.find(candidate => candidate.identity === identity);
    const runtime = this._runtime.get(this._key(id, identity));
    if (!grant?.enabled || runtime?.status !== 'loaded' || !this._adapter(identity).getExtension(runtime.runtimeId)) fail('EXTENSION_DISABLED', 'Enable and load this extension in the selected identity first.');
    if (!item.pages?.[kind]) fail('EXTENSION_PAGE_MISSING', `This extension does not declare a ${kind} page.`);
    const page = localPage(item.pages[kind], kind);
    const url = new URL(page, `chrome-extension://${runtime.runtimeId}/`);
    if (url.protocol !== 'chrome-extension:' || url.hostname !== runtime.runtimeId || url.username || url.password || url.port) fail('EXTENSION_PAGE_ORIGIN', 'The extension page must stay within its approved extension origin.');
    return url.href;
  }
  uninstall(id) {
    return this._enqueue(async () => {
      let item = this._item(id);
      // Persist disabled intent first. A crash midway cannot revive code that
      // the user asked to remove. Failed unloads remain visible and retryable.
      item = {...item, identities: item.identities.map(grant => ({...grant, enabled: false}))};
      try { await this._save({...this._state, items: this._state.items.map(candidate => candidate.id === id ? item : candidate)}); }
      catch (error) {
        const failures = [];
        for (const grant of item.identities) { try { await this._unload(item, grant.identity); } catch (unloadError) { failures.push(unloadError); } }
        if (failures.length) throw new AggregateError([error, ...failures], 'Uninstall could not persist its state or unload every runtime.');
        throw error;
      }
      for (const grant of item.identities) await this._unload(item, grant.identity);
      await fsp.rm(path.join(this.packagesPath, id), {recursive: true, force: true});
      await this._save({...this._state, items: this._state.items.filter(candidate => candidate.id !== id)});
      for (const grant of item.identities) this._runtime.delete(this._key(id, grant.identity));
      return {id, uninstalled: true, dataRemoved: false, detail: 'Owned code and enrollment removed. Chromium extension storage was retained in its original identity; data erasure is not implemented.'};
    });
  }
  dispose() {
    return this._enqueue(async () => {
      const failures = [];
      for (const item of this._state.items) for (const grant of item.identities) {
        try { await this._unload(item, grant.identity); } catch (error) { failures.push(error); }
      }
      for (const preview of this._previews.values()) await fsp.rm(preview.staging, {recursive: true, force: true});
      this._previews.clear();
      for (const [identity, listeners] of this._observers) {
        const adapter = this._adapters.get(identity);
        adapter.removeListener('extension-unloaded', listeners.unloaded);
        adapter.removeListener('extension-loaded', listeners.loaded);
      }
      this._observers.clear();
      this._disposed = true;
      if (failures.length) throw new AggregateError(failures, 'Some extension runtimes did not confirm unloading.');
    });
  }
}

module.exports = {ExtensionManager, ExtensionError, inspectTree, validateManifest, parseJson};
