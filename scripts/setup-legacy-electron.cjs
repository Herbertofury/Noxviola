'use strict';
// Official runtime acquisition for a generated 44 -> candidate profile test.
// Importing, provisioning and verifying this module never execute Electron.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const path = require('node:path');
const { crc32 } = require('node:zlib');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { parse, readRegular } = require('../browser/storage.cjs');

const ROOT = path.resolve(__dirname, '..');
const MARKER = 'noxviola-synthetic-legacy-engine-v1';
const OWNER_FILE = 'fixture-owner.json';
const PREFIX = 'noxviola-legacy-engine-';
const DESCRIPTOR_BYTES = readRegular(path.join(ROOT, 'tests/native/legacy-runtime.json'));
const DESCRIPTOR = parse(DESCRIPTOR_BYTES);
const DESCRIPTOR_SHA = crypto.createHash('sha256').update(DESCRIPTOR_BYTES).digest('hex');
const HASH = /^[0-9a-f]{64}$/;
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function keys(value, expected, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(compare), [...expected].sort(compare), `${label} has unexpected or missing fields`);
}

function runtimePin() {
  assert.equal(DESCRIPTOR.schemaVersion, 1);
  assert.equal(DESCRIPTOR.purpose, 'synthetic-legacy-profile-seed-only');
  assert.equal(DESCRIPTOR.version, '44.11.3');
  assert.equal(DESCRIPTOR.releaseUrl, 'https://github.com/electron/electron/releases/tag/v44.11.3');
  const artifact = DESCRIPTOR.artifacts[`${process.platform}-${process.arch}`];
  assert.ok(artifact, `No pinned legacy runtime for ${process.platform}/${process.arch}; no platform override is permitted`);
  assert.equal(artifact.platform, process.platform); assert.equal(artifact.arch, process.arch);
  assert.equal(artifact.name, `electron-v${DESCRIPTOR.version}-${process.platform}-${process.arch}.zip`);
  assert.equal(artifact.url, `https://github.com/electron/electron/releases/download/v${DESCRIPTOR.version}/${artifact.name}`);
  assert.equal(artifact.executable, process.platform === 'win32' ? 'electron.exe' : 'electron');
  assert.ok(HASH.test(artifact.sha256) && Number.isSafeInteger(artifact.bytes) && artifact.bytes > 0);
  assert.ok(Number.isSafeInteger(artifact.assetId) && artifact.assetId > 0);
  return { ...artifact, version: DESCRIPTOR.version, descriptorSha256: DESCRIPTOR_SHA };
}

function refuseDownloadOverrides(env = process.env) {
  // These are the actual resolution aliases used by locked @electron/get,
  // plus installer platform/architecture/path overrides. Do not clear them
  // silently or replace them with a custom downloader URL resolver.
  const suffixes = ['electronmirror', 'electronnightlymirror', 'electroncustomdir', 'electroncustomfilename', 'electroncustomversion'];
  const exact = new Set(['electroninstallplatform', 'electroninstallarch', 'electronoverridedistpath', 'npmconfigplatform', 'npmconfigarch']);
  for (const [key, value] of Object.entries(env)) {
    const normalized = key.toLowerCase().replaceAll('_', '');
    if (value && (exact.has(normalized) || suffixes.some(suffix => normalized.endsWith(suffix)))) {
      throw new Error(`Legacy runtime provisioning refuses the ${key} override; only the pinned official host artifact is allowed`);
    }
  }
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.ino !== 0n;
}
function unchanged(left, right) {
  return sameIdentity(left, right) && left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs && left.mode === right.mode;
}
async function withRegular(file, work) {
  const named = await fsp.lstat(file, { bigint: true });
  assert.ok(named.isFile() && named.nlink === 1n, `Expected a single-link regular file: ${file}`);
  const handle = await fsp.open(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
  try {
    const before = await handle.stat({ bigint: true });
    assert.ok(before.isFile() && unchanged(named, before), `File changed before opening: ${file}`);
    const result = await work(handle, before);
    assert.ok(unchanged(before, await handle.stat({ bigint: true })) && unchanged(before, await fsp.lstat(file, { bigint: true })), `File changed during verification: ${file}`);
    return result;
  } finally { await handle.close(); }
}
function rangeStream(handle, start, end) {
  assert.ok(Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end >= start, 'Invalid file read range');
  // fs.ReadStream.destroy() may close a supplied fd even with autoClose:false.
  // Reader/parser/pipeline cancellation must never acquire that ownership.
  return Readable.from((async function* () {
    let position = start;
    while (position < end) {
      const bytes = Buffer.allocUnsafe(Math.min(64 * 1024, end - position));
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, position);
      assert.ok(bytesRead > 0, 'A verified file ended before its declared length');
      position += bytesRead;
      yield bytes.subarray(0, bytesRead);
    }
  })(), { objectMode: false });
}
async function digestHandle(handle, expectedBytes) {
  const hash = crypto.createHash('sha256'); let bytes = 0;
  for await (const chunk of rangeStream(handle, 0, Number(expectedBytes))) {
    bytes += chunk.length;
    assert.ok(BigInt(bytes) <= expectedBytes, 'A file grew during verification');
    hash.update(chunk);
  }
  assert.equal(BigInt(bytes), expectedBytes, 'A file changed size during verification');
  return { bytes, sha256: hash.digest('hex') };
}
async function hashFile(file, expected) {
  return withRegular(file, async (handle, stat) => {
    if (expected) assert.equal(stat.size, BigInt(expected.bytes), `File size differs from verified archive: ${file}`);
    const digest = await digestHandle(handle, stat.size);
    if (expected) assert.equal(digest.sha256, expected.sha256, `File bytes differ from verified archive: ${file}`);
    return digest;
  });
}

function entryPath(name, directory) {
  assert.equal(typeof name, 'string');
  assert.ok(name && !/[\\\x00-\x1f\x7f:]/.test(name) && !name.startsWith('/'), `Unsafe archive path: ${JSON.stringify(name)}`);
  const relative = directory ? name.slice(0, -1) : name;
  const parts = relative.split('/');
  for (const part of parts) {
    assert.ok(part && part !== '.' && part !== '..' && !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part), `Unsafe archive path: ${JSON.stringify(name)}`);
  }
  return relative;
}

// General byte/tree validation only. A tiny synthetic archive can exercise
// this function; only verifyLegacyRuntime can admit a pinned executable.
async function inspectArchive(file, expected, { hashContents = true } = {}) {
  return withRegular(file, async (handle, stat) => {
    if (expected) assert.equal(stat.size, BigInt(expected.bytes), 'Pinned legacy archive byte length differs');
    const archive = await digestHandle(handle, stat.size);
    if (expected) assert.equal(archive.sha256, expected.sha256, 'Pinned legacy archive SHA-256 differs');
    const yauzl = require('yauzl');
    // fromFd().close() owns/closes its fd even with autoClose:false. Keep the
    // verified FileHandle under withRegular's sole ownership instead. The
    // documented reader close callback releases no caller-owned descriptor.
    class VerifiedReader extends yauzl.RandomAccessReader {
      _readStreamForRange(start, end) {
        return rangeStream(handle, start, end);
      }
    }
    const zip = await new Promise((resolve, reject) => yauzl.fromRandomAccessReader(new VerifiedReader(), Number(stat.size), {
      autoClose: false, lazyEntries: true, strictFileNames: true, validateEntrySizes: true,
    }, (error, value) => error ? reject(error) : resolve(value)));
    const closed = new Promise(resolve => zip.once('close', resolve));
    const entries = new Map(), aliases = new Map(), explicit = new Set();
    const register = (name, type, declared = false) => {
      const canonical = name.normalize('NFC').toLowerCase();
      assert.ok(!aliases.has(canonical) || aliases.get(canonical) === name, `Ambiguous archive path: ${name}`);
      aliases.set(canonical, name);
      if (declared) { assert.ok(!explicit.has(name), `Duplicate archive path: ${name}`); explicit.add(name); }
      const prior = entries.get(name);
      assert.ok(!prior || prior.type === type, `Archive file/directory conflict: ${name}`);
      if (!prior) entries.set(name, { path: name, type, bytes: 0, sha256: null });
      return entries.get(name);
    };
    try {
      await new Promise((resolve, reject) => {
        let ended = false;
        const fail = error => { if (!ended) { ended = true; zip.close(); reject(error); } };
        zip.once('error', fail);
        zip.once('end', () => { if (!ended) { ended = true; resolve(); } });
        zip.on('entry', entry => {
          (async () => {
            if (entry.generalPurposeBitFlag & 0x800) new TextDecoder('utf-8', { fatal: true }).decode(entry.fileNameRaw);
            const directory = entry.fileName.endsWith('/'), name = entryPath(entry.fileName, directory);
            const kind = (entry.externalFileAttributes >>> 16) & 0xf000;
            assert.ok(kind === 0 || kind === (directory ? 0x4000 : 0x8000), `Archive links and special files are forbidden: ${name}`);
            assert.equal(entry.generalPurposeBitFlag & 1, 0, 'Encrypted runtime archives are forbidden');
            const components = name.split('/');
            for (let i = 1; i < components.length; i++) register(components.slice(0, i).join('/'), 'directory');
            const record = register(name, directory ? 'directory' : 'file', true);
            if (directory) { assert.equal(entry.uncompressedSize, 0, 'Archive directory contains data'); assert.equal(entry.crc32, 0, 'Archive directory checksum is invalid'); return; }
            assert.ok(Number.isSafeInteger(entry.uncompressedSize) && entry.uncompressedSize >= 0, 'Invalid archive member size');
            record.bytes = entry.uncompressedSize;
            if (!hashContents) return;
            const stream = await new Promise((done, failed) => zip.openReadStream(entry, (error, value) => error ? failed(error) : done(value)));
            const hash = crypto.createHash('sha256'); let length = 0, checksum = 0;
            for await (const chunk of stream) { length += chunk.length; checksum = crc32(chunk, checksum); hash.update(chunk); }
            assert.equal(length, entry.uncompressedSize, `Archive member size mismatch: ${name}`);
            assert.equal(checksum, entry.crc32, `Archive member CRC mismatch: ${name}`);
            record.sha256 = hash.digest('hex');
          })().then(() => { if (!ended) zip.readEntry(); }, fail);
        });
        zip.readEntry();
      });
    } finally { zip.close(); await closed; }
    const sorted = [...entries.values()].sort((a, b) => compare(a.path, b.path));
    return { archive, entries: sorted, entryCount: sorted.length, manifestSha256: hashContents ? sha256(JSON.stringify(sorted)) : null };
  });
}

async function directoryState(directory) {
  const stat = await fsp.lstat(directory, { bigint: true });
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink() && stat.ino !== 0n, `Expected an owned regular directory: ${directory}`);
  return { stat, names: (await fsp.readdir(directory)).sort(compare) };
}
async function verifyTree(runtimeDirectory, entries) {
  const expected = new Map(entries.map(entry => [entry.path, entry]));
  const children = new Map();
  for (const entry of entries) {
    const parts = entry.path.split('/'), name = parts.pop(), parent = parts.join('/');
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(name);
  }
  async function visit(relative) {
    const directory = path.join(runtimeDirectory, ...relative.split('/').filter(Boolean));
    const before = await directoryState(directory);
    assert.deepEqual(before.names, (children.get(relative) || []).sort(compare), `Extracted runtime has missing or extra entries: ${relative || '.'}`);
    for (const name of before.names) {
      const member = relative ? `${relative}/${name}` : name, record = expected.get(member);
      if (record.type === 'directory') await visit(member);
      else await hashFile(path.join(runtimeDirectory, ...member.split('/')), record);
    }
    const after = await directoryState(directory);
    assert.ok(unchanged(before.stat, after.stat), `Runtime directory changed during verification: ${relative || '.'}`);
    assert.deepEqual(after.names, before.names, 'Runtime entries changed during verification');
  }
  await visit('');
}
async function verifyArchiveTree(archive, runtimeDirectory, expected) {
  const inspection = await inspectArchive(archive, expected);
  await verifyTree(runtimeDirectory, inspection.entries);
  return inspection;
}

async function owner(directory, pin) {
  assert.ok(path.isAbsolute(directory), 'Legacy runtime directory must be absolute');
  const before = await directoryState(directory);
  const canonical = await fsp.realpath(directory), temporary = await fsp.realpath(os.tmpdir());
  assert.equal(canonical, directory, 'Legacy runtime directory must use its canonical owned path');
  assert.equal(path.dirname(directory), temporary, 'Legacy runtime must be a direct child of the system temporary directory');
  assert.ok(new RegExp(`^${PREFIX}[A-Za-z0-9]+$`).test(path.basename(directory)), 'Legacy runtime directory has no generated prefix');
  const repo = await fsp.realpath(ROOT), relative = path.relative(repo, directory);
  assert.ok(relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative), 'Legacy runtime cannot be inside the checkout');
  if (process.platform !== 'win32') assert.equal(Number(before.stat.mode & 0o077n), 0, 'Generated runtime root must remain private to its owner');
  const marker = parse(readRegular(path.join(directory, OWNER_FILE)));
  keys(marker, ['schemaVersion', 'marker', 'token', 'directory', 'version', 'platform', 'arch', 'descriptorSha256'], 'Legacy owner marker');
  assert.equal(marker.schemaVersion, 1); assert.equal(marker.marker, MARKER); assert.ok(TOKEN.test(marker.token));
  assert.equal(marker.directory, directory); assert.equal(marker.version, pin.version);
  assert.equal(marker.platform, pin.platform); assert.equal(marker.arch, pin.arch); assert.equal(marker.descriptorSha256, pin.descriptorSha256);
  return { marker, before };
}
function expectedArchive(directory, pin) {
  return { path: path.join(directory, pin.name), name: pin.name, url: pin.url, assetId: pin.assetId, bytes: pin.bytes, sha256: pin.sha256 };
}

async function verifyLegacyRuntime(receiptFile) {
  assert.ok(typeof receiptFile === 'string' && path.isAbsolute(receiptFile), 'Choose an absolute legacy runtime receipt path');
  const pin = runtimePin(), receipt = parse(readRegular(receiptFile));
  keys(receipt, ['schemaVersion', 'marker', 'token', 'version', 'platform', 'arch', 'directory', 'runtimeDirectory', 'descriptorSha256', 'archive', 'executable', 'executableBytes', 'executableSha256', 'manifestSha256', 'entryCount', 'runtimeExecuted'], 'Legacy runtime receipt');
  assert.equal(receipt.schemaVersion, 1); assert.equal(receipt.marker, MARKER); assert.equal(receipt.runtimeExecuted, false);
  assert.equal(receipt.version, pin.version, 'Legacy receipt version must match the pinned descriptor');
  assert.equal(receipt.platform, process.platform, 'Legacy receipt platform differs from this host');
  assert.equal(receipt.arch, process.arch, 'Legacy receipt architecture differs from this host');
  assert.equal(receipt.descriptorSha256, pin.descriptorSha256, 'Legacy descriptor provenance differs');
  const { marker, before } = await owner(receipt.directory, pin);
  assert.equal(receipt.token, marker.token, 'Legacy receipt is not bound to its owner marker');
  assert.equal(receipt.runtimeDirectory, path.join(receipt.directory, 'runtime'), 'Legacy runtime path must stay inside its owned directory');
  assert.equal(receipt.executable, path.join(receipt.runtimeDirectory, pin.executable), 'Legacy executable path differs from its pinned platform');
  const archive = expectedArchive(receipt.directory, pin);
  assert.deepEqual(receipt.archive, archive, 'Legacy archive provenance must exactly match the source descriptor');
  assert.deepEqual(before.names, [OWNER_FILE, 'runtime', pin.name].sort(compare), 'Legacy root contains missing or extra entries');
  const verified = await verifyArchiveTree(archive.path, receipt.runtimeDirectory, pin);
  assert.equal(receipt.entryCount, verified.entryCount, 'Runtime entry-count receipt differs');
  assert.equal(receipt.manifestSha256, verified.manifestSha256, 'Runtime manifest receipt differs');
  const executable = verified.entries.find(entry => entry.path === pin.executable && entry.type === 'file');
  assert.ok(executable?.bytes > 0, 'The pinned archive has no executable file');
  assert.equal(receipt.executableBytes, executable.bytes); assert.equal(receipt.executableSha256, executable.sha256);
  const version = readRegular(path.join(receipt.runtimeDirectory, 'version')).toString('utf8').trim().replace(/^v/, '');
  assert.equal(version, pin.version, 'Extracted legacy runtime version differs from the pinned release');
  if (process.platform !== 'win32') assert.ok((await fsp.stat(receipt.executable)).mode & 0o111, 'Legacy executable has no executable permission');
  const after = await directoryState(receipt.directory);
  assert.ok(unchanged(before.stat, after.stat), 'Legacy owner directory changed during verification');
  assert.deepEqual(after.names, before.names);
  assert.deepEqual(parse(readRegular(path.join(receipt.directory, OWNER_FILE))), marker, 'Legacy owner marker changed during verification');
  return { ...receipt, receiptFile };
}

async function provisionLegacyRuntime(receiptFile) {
  assert.ok(typeof receiptFile === 'string' && path.isAbsolute(receiptFile), 'Choose an absolute legacy runtime receipt path');
  refuseDownloadOverrides();
  const pin = runtimePin();
  await fsp.lstat(receiptFile).then(() => { throw new Error('The legacy receipt destination already exists; it was preserved'); }, error => { if (error.code !== 'ENOENT') throw error; });
  await fsp.mkdir(path.dirname(receiptFile), { recursive: true, mode: 0o700 });
  assert.ok((await fsp.stat(path.dirname(receiptFile))).isDirectory(), 'The receipt destination parent must be a directory');
  const directory = await fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(), PREFIX)));
  const marker = { schemaVersion: 1, marker: MARKER, token: crypto.randomUUID(), directory, version: pin.version, platform: pin.platform, arch: pin.arch, descriptorSha256: pin.descriptorSha256 };
  try {
    await fsp.writeFile(path.join(directory, OWNER_FILE), JSON.stringify(marker), { flag: 'wx', mode: 0o600 });
    await owner(directory, pin);
    const downloadDirectory = path.join(directory, 'download'); await fsp.mkdir(downloadDirectory, { mode: 0o700 });
    const { downloadArtifact, ElectronDownloadCacheMode } = require('@electron/get');
    const downloaded = await downloadArtifact({ version: pin.version, platform: process.platform, arch: process.arch, artifactName: 'electron',
      checksums: { [pin.name]: pin.sha256 }, cacheMode: ElectronDownloadCacheMode.Bypass, cacheRoot: path.join(downloadDirectory, 'cache'), tempDirectory: downloadDirectory });
    const archive = expectedArchive(directory, pin);
    const downloadedRelative = path.relative(downloadDirectory, downloaded);
    assert.ok(downloadedRelative && !downloadedRelative.startsWith(`..${path.sep}`) && !path.isAbsolute(downloadedRelative) && path.basename(downloaded) === pin.name, 'The downloader must retain its output inside the owned temporary directory');
    await withRegular(downloaded, (handle, stat) => pipeline(rangeStream(handle, 0, Number(stat.size)), fs.createWriteStream(archive.path, { flags: 'wx', mode: 0o600, flush: true })));
    await inspectArchive(archive.path, pin, { hashContents: false });
    await fsp.rm(downloadDirectory, { recursive: true });
    const runtimeDirectory = path.join(directory, 'runtime'); await fsp.mkdir(runtimeDirectory, { mode: 0o700 });
    const { extract } = require('@electron-internal/extract-zip');
    await extract(archive.path, { dir: runtimeDirectory });
    const verified = await verifyArchiveTree(archive.path, runtimeDirectory, pin);
    const executableEntry = verified.entries.find(entry => entry.path === pin.executable && entry.type === 'file');
    assert.ok(executableEntry?.bytes > 0, 'The verified archive must contain its platform executable');
    const receipt = { ...marker, runtimeDirectory, archive, executable: path.join(runtimeDirectory, pin.executable), executableBytes: executableEntry.bytes,
      executableSha256: executableEntry.sha256, manifestSha256: verified.manifestSha256, entryCount: verified.entryCount, runtimeExecuted: false };
    await fsp.writeFile(receiptFile, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return await verifyLegacyRuntime(receiptFile);
  } catch (error) { error.message += `; generated legacy files preserved at ${directory}`; throw error; }
}

function options(argv) {
  assert.equal(argv.length, 2, 'Usage: node scripts/setup-legacy-electron.cjs --receipt FILE');
  assert.equal(argv[0], '--receipt', 'Only --receipt is accepted; no runtime/version/platform override is available');
  assert.ok(typeof argv[1] === 'string' && argv[1].trim() && !argv[1].startsWith('-') && !argv[1].includes('\0'), 'Choose a nonempty receipt filename, not another switch');
  return { receiptFile: path.resolve(argv[1]) };
}
if (require.main === module) {
  Promise.resolve().then(() => provisionLegacyRuntime(options(process.argv.slice(2)).receiptFile)).then(receipt => console.log(JSON.stringify(receipt, null, 2)))
    .catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
}
module.exports = { verifyLegacyRuntime, provisionLegacyRuntime, runtimePin, refuseDownloadOverrides, inspectArchive, verifyArchiveTree, options, MARKER, OWNER_FILE };
