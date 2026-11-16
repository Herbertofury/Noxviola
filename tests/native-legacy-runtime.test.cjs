'use strict';
// Portable byte/provenance refusal contracts. Tiny ZIPs contain generated text,
// never an Electron executable; no test downloads or executes a real runtime.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { crc32, deflateRawSync } = require('node:zlib');
const { verifyLegacyRuntime, provisionLegacyRuntime, runtimePin, refuseDownloadOverrides, inspectArchive, verifyArchiveTree, options, MARKER, OWNER_FILE } = require('../scripts/setup-legacy-electron.cjs');
const descriptor = require('./native/legacy-runtime.json');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function temporary(t, prefix = 'noxviola-legacy-contract-') {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function archive(entries) {
  const local = [], central = []; let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name), bytes = Buffer.from(entry.bytes || ''), method = entry.deflate ? 8 : 0;
    const packed = method ? deflateRawSync(bytes) : bytes, checksum = entry.badCRC ? (crc32(bytes) ^ 0xff) >>> 0 : crc32(bytes);
    const flags = entry.encrypted ? 1 : 0;
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(flags, 6); header.writeUInt16LE(method, 8);
    header.writeUInt32LE(checksum, 14); header.writeUInt32LE(packed.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(name.length, 26);
    const record = Buffer.alloc(46); record.writeUInt32LE(0x02014b50); record.writeUInt16LE(0x0314, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(flags, 8); record.writeUInt16LE(method, 10);
    record.writeUInt32LE(checksum, 16); record.writeUInt32LE(packed.length, 20); record.writeUInt32LE(bytes.length, 24); record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(((entry.mode || (entry.name.endsWith('/') ? 0o40755 : 0o100644)) << 16) >>> 0, 38); record.writeUInt32LE(offset, 42);
    local.push(header, name, packed); central.push(record, name); offset += header.length + name.length + packed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
async function synthetic(t) {
  const directory = temporary(t), file = path.join(directory, 'tiny.zip'), runtime = path.join(directory, 'runtime');
  const entries = [{ name: 'version', bytes: 'generated-only\n' }, { name: 'resources/' }, { name: 'resources/data.bin', bytes: 'complete synthetic bytes\0\n', deflate: true }, { name: 'empty/' }];
  await fsp.writeFile(file, archive(entries)); await fsp.mkdir(runtime);
  const { extract } = require('@electron-internal/extract-zip');
  await extract(file, { dir: runtime });
  return { directory, file, runtime, entries };
}
function forgedReceipt(t) {
  const pin = runtimePin(), directory = temporary(t, 'noxviola-legacy-engine-'), output = temporary(t);
  const marker = { schemaVersion: 1, marker: MARKER, token: crypto.randomUUID(), directory, version: pin.version, platform: pin.platform, arch: pin.arch, descriptorSha256: pin.descriptorSha256 };
  const runtimeDirectory = path.join(directory, 'runtime'); fs.mkdirSync(runtimeDirectory);
  const file = path.join(output, 'receipt.json');
  const archiveRecord = { path: path.join(directory, pin.name), name: pin.name, url: pin.url, assetId: pin.assetId, bytes: pin.bytes, sha256: pin.sha256 };
  fs.writeFileSync(archiveRecord.path, 'not the original distribution');
  fs.writeFileSync(path.join(directory, OWNER_FILE), JSON.stringify(marker));
  const receipt = { ...marker, runtimeDirectory, archive: archiveRecord, executable: path.join(runtimeDirectory, pin.executable), executableBytes: 1, executableSha256: 'a'.repeat(64), manifestSha256: 'b'.repeat(64), entryCount: 1, runtimeExecuted: false };
  const save = value => fs.writeFileSync(file, JSON.stringify(value)); save(receipt);
  return { pin, directory, file, receipt, marker, save };
}

test('legacy runtime pins only the original official44 assets and resolves only the actual host', () => {
  assert.equal(descriptor.version, '44.11.3');
  assert.deepEqual(Object.keys(descriptor.artifacts).sort(), ['linux-x64', 'win32-x64']);
  assert.equal(descriptor.artifacts['linux-x64'].bytes, 123141628);
  assert.equal(descriptor.artifacts['linux-x64'].sha256, 'f2390c1e7803e5f4d59d46a92fd7067d0b13c237d0dec886b00e63d0078078d4');
  assert.equal(descriptor.artifacts['win32-x64'].bytes, 158283059);
  assert.equal(descriptor.artifacts['win32-x64'].sha256, '97fca9b8e9b90cdc88c1efd44160ca4b89b15101721d93c8befcbeb35b93fb59');
  const pin = runtimePin(); assert.equal(pin.platform, process.platform); assert.equal(pin.arch, process.arch);
  assert.equal(pin.url, `https://github.com/electron/electron/releases/download/v44.11.3/${pin.name}`);
  pin.version = 'invented'; assert.equal(runtimePin().version, '44.11.3', 'Returned metadata cannot mutate the canonical pin');
});

test('CLI normalizes its one explicit receipt path and refuses source or platform overrides', () => {
  assert.deepEqual(options(['--receipt', 'native-results/legacy-runtime.json']), { receiptFile: path.resolve('native-results/legacy-runtime.json') });
  for (const args of [[], ['--receipt'], ['--receipt', ''], ['--receipt', '--platform'], ['--receipt', 'out', '--receipt', 'another'], ['--version', '44.11.3'], ['--receipt', 'out', '--platform', 'win32']]) assert.throws(() => options(args));
  for (const key of ['ELECTRON_MIRROR', 'ELECTRON_NIGHTLY_MIRROR', 'ELECTRON_CUSTOM_DIR', 'ELECTRON_CUSTOM_FILENAME', 'ELECTRON_CUSTOM_VERSION', 'npm_config_electron_mirror', 'NPM_CONFIG_ELECTRON_CUSTOM_VERSION', 'npm_package_config_electron_customDir', 'ELECTRON_INSTALL_PLATFORM', 'ELECTRON_INSTALL_ARCH', 'npm_config_platform', 'npm_config_arch', 'ELECTRON_OVERRIDE_DIST_PATH']) {
    assert.throws(() => refuseDownloadOverrides({ [key]: 'generated override' }), /refuses/);
  }
  assert.doesNotThrow(() => refuseDownloadOverrides({ ELECTRON_MIRROR: '' }));
});

test('the maintained extractor and streaming verifier retain every tiny-archive file and directory without fd ownership errors', async t => {
  const { file, runtime, entries } = await synthetic(t);
  const proof = await verifyArchiveTree(file, runtime);
  assert.equal(proof.archive.sha256, sha256(await fsp.readFile(file)));
  assert.equal(proof.entryCount, 4);
  assert.deepEqual(proof.entries.map(item => item.path), ['empty', 'resources', 'resources/data.bin', 'version']);
  const content = proof.entries.find(item => item.path === 'resources/data.bin');
  assert.equal(content.sha256, sha256(Buffer.from(entries[2].bytes)));
  assert.equal(content.bytes, Buffer.byteLength(entries[2].bytes));
  assert.equal(proof.manifestSha256, sha256(JSON.stringify(proof.entries)));
  assert.equal('executable' in proof, false, 'General byte validation cannot qualify a legacy runtime');
});

test('extracted byte changes, omitted files and extra files all reject against the actual archive', async t => {
  const { file, runtime, entries } = await synthetic(t), target = path.join(runtime, 'resources/data.bin');
  const original = Buffer.from(entries[2].bytes), changed = Buffer.from(original); changed[0] ^= 1;
  await fsp.writeFile(target, changed); await assert.rejects(verifyArchiveTree(file, runtime), /bytes differ/);
  await fsp.writeFile(target, original); await fsp.writeFile(path.join(runtime, 'extra'), 'unrecorded');
  await assert.rejects(verifyArchiveTree(file, runtime), /extra entries/); await fsp.unlink(path.join(runtime, 'extra'));
  await fsp.unlink(target); await assert.rejects(verifyArchiveTree(file, runtime), /missing or extra/);
});

test('unsafe, duplicate, case-ambiguous, encrypted and linked archive members never reach extraction', async t => {
  const directory = temporary(t), file = path.join(directory, 'bad.zip');
  const cases = [
    [{ name: '../escape', bytes: 'x' }], [{ name: '/absolute', bytes: 'x' }], [{ name: 'a\\escape', bytes: 'x' }], [{ name: 'a:stream', bytes: 'x' }],
    [{ name: 'same', bytes: '1' }, { name: 'same', bytes: '2' }], [{ name: 'A', bytes: '1' }, { name: 'a', bytes: '2' }],
    [{ name: 'a', bytes: 'file' }, { name: 'a/nested', bytes: 'conflict' }], [{ name: 'link', bytes: 'target', mode: 0o120777 }],
    [{ name: 'private', bytes: 'encrypted', encrypted: true }], [{ name: 'bad-crc', bytes: 'payload', badCRC: true }],
  ];
  for (const members of cases) {
    await fsp.writeFile(file, archive(members)); await assert.rejects(inspectArchive(file));
  }
  assert.deepEqual(await fsp.readdir(directory), ['bad.zip']);
});

test('an extracted directory link or shared hardlink cannot substitute even identical bytes', async t => {
  const { directory, file, runtime } = await synthetic(t);
  const resources = path.join(runtime, 'resources'), foreign = path.join(directory, 'foreign');
  await fsp.rename(resources, foreign);
  await fsp.symlink(foreign, resources, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(verifyArchiveTree(file, runtime), /regular directory/);
  await fsp.unlink(resources); await fsp.rename(foreign, resources);
  const target = path.join(resources, 'data.bin'), shared = path.join(directory, 'shared.bin');
  await fsp.link(target, shared);
  await assert.rejects(verifyArchiveTree(file, runtime), /single-link regular file/);
});

test('runtime receipt cannot choose its version, executable, owner token, platform or archive provenance', async t => {
  const { file, receipt, save } = forgedReceipt(t);
  for (const mutate of [
    value => { value.version = '45.3.2'; }, value => { value.token = crypto.randomUUID(); },
    value => { value.platform = process.platform === 'linux' ? 'win32' : 'linux'; }, value => { value.arch = 'arm64'; },
    value => { value.executable = process.execPath; }, value => { value.runtimeDirectory = path.dirname(value.directory); },
    value => { value.archive.url = 'https://example.invalid/electron.zip'; }, value => { value.archive.sha256 = 'c'.repeat(64); },
    value => { value.descriptorSha256 = 'd'.repeat(64); }, value => { value.runtimeExecuted = true; }, value => { value.unverifiedOverride = true; },
  ]) {
    const changed = structuredClone(receipt); mutate(changed); save(changed);
    await assert.rejects(verifyLegacyRuntime(file));
  }
  await assert.rejects(verifyLegacyRuntime('relative.json'), /absolute/);
});

test('caller-invented matching file hashes never replace the pinned original archive authority', async t => {
  const { file, receipt, save } = forgedReceipt(t);
  const bytes = await fsp.readFile(receipt.archive.path);
  save({ ...receipt, archive: { ...receipt.archive, bytes: bytes.length, sha256: sha256(bytes) } });
  await assert.rejects(verifyLegacyRuntime(file), /archive provenance/);
  save(receipt); await assert.rejects(verifyLegacyRuntime(file), /Pinned legacy archive byte length differs/);
  assert.deepEqual(await fsp.readFile(receipt.archive.path), bytes, 'Failed admission preserves the original attempted evidence');
});

test('an existing receipt is preserved without loading a downloader or launching an engine', async t => {
  const directory = temporary(t), file = path.join(directory, 'existing.json'), original = Buffer.from('preserve prior evidence');
  await fsp.writeFile(file, original);
  await assert.rejects(provisionLegacyRuntime(file), /already exists/);
  assert.deepEqual(await fsp.readFile(file), original);
});

test('actual provisioning creates the CLI parent and pins the official download request before rejecting tiny substitute bytes', t => {
  const output = temporary(t), target = path.join(output, 'new-parent/receipt.json'), modulePath = path.resolve(__dirname, '../scripts/setup-legacy-electron.cjs');
  // Replace only the download transport in an ordinary Node child. The real
  // provisioner must reject these synthetic bytes before importing extraction;
  // this is a negative admission test, never an official-runtime success.
  const child = spawnSync(process.execPath, ['-e', `
    const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
    const original=Module._load;let generated;
    Module._load=function(request,parent,...rest){
      if(request==='electron'||request==='@electron-internal/extract-zip')throw new Error('Engine/extractor must not be reached for invalid archive bytes');
      if(request==='@electron/get')return {ElectronDownloadCacheMode:{Bypass:3},async downloadArtifact(options){
        const pin=require(${JSON.stringify(modulePath)}).runtimePin();
        assert.equal(options.version,pin.version);assert.equal(options.platform,process.platform);assert.equal(options.arch,process.arch);
        assert.deepEqual(options.checksums,{[pin.name]:pin.sha256});assert.equal(options.cacheMode,3);
        assert.equal(options.artifactName,'electron');assert.equal(options.mirrorOptions,undefined);assert.equal(options.downloader,undefined);
        assert.ok(fs.statSync(path.dirname(${JSON.stringify(target)})).isDirectory());
        generated=path.dirname(options.tempDirectory);const file=path.join(options.tempDirectory,pin.name);fs.writeFileSync(file,'tiny generated substitute');return file;
      }};
      return original.call(this,request,parent,...rest);
    };
    const helper=require(${JSON.stringify(modulePath)});
    helper.provisionLegacyRuntime(${JSON.stringify(target)}).then(()=>{throw new Error('Invalid archive unexpectedly admitted');},error=>{
      assert.match(error.message,/Pinned legacy archive byte length differs/);assert.ok(generated);
      assert.equal(fs.existsSync(${JSON.stringify(target)}),false);console.log(JSON.stringify({generated,rejected:true}));
    });
  `], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(child.error, undefined); assert.equal(child.status, 0, child.stderr);
  const result = JSON.parse(child.stdout.trim()); assert.equal(result.rejected, true);
  assert.ok(path.basename(result.generated).startsWith('noxviola-legacy-engine-'));
  t.after(() => fs.rmSync(result.generated, { recursive: true, force: true }));
});
