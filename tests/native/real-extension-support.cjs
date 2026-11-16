'use strict';
// Shared evidence/admission helpers for the separate real-package gate. Merely
// importing this file or running its Node contracts never launches Electron.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const { sourceEvidence, readContext } = require('../../scripts/native-smoke.cjs');
const PIN = require('./corpus/darkreader-4.9.135-chrome.json');
const ROOT = path.resolve(__dirname, '../..');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const CHECKS = Object.freeze(['sandboxed light baseline', 'real reviewed ZIP installation', 'persistent background startup', 'actual page darkening',
  'actual toolbar popup', 'popup off returns light pixels', 'popup on restores dark pixels', 'package settings control opens and changes section']);

function readRegular(file, expectedLength) {
  const before = fs.lstatSync(file);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error('Corpus input must be a regular, non-linked file.');
  if (expectedLength !== undefined && before.size !== expectedLength) throw new Error(`Corpus archive does not match the pinned release length: ${before.size} bytes.`);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || before.dev !== opened.dev || before.ino !== opened.ino || before.size !== opened.size) throw new Error('Corpus input changed while opening.');
    const bytes = fs.readFileSync(fd);
    const after = fs.fstatSync(fd), named = fs.lstatSync(file);
    if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs ||
        named.dev !== after.dev || named.ino !== after.ino || !named.isFile() || named.isSymbolicLink()) throw new Error('Corpus input changed while reading.');
    return bytes;
  } finally { fs.closeSync(fd); }
}

function verifyArchive(file, expected = PIN.asset) {
  if (!path.isAbsolute(file)) throw new Error('The corpus archive must have an explicit absolute path.');
  const bytes = readRegular(file, expected.bytes);
  const digest = sha256(bytes);
  if (bytes.length !== expected.bytes || digest !== expected.sha256) throw new Error(`Corpus archive does not match the pinned release: ${bytes.length} bytes, SHA-256 ${digest}.`);
  return { bytes, sha256: digest, size: bytes.length };
}

function realSourceEvidence(root = ROOT) {
  const evidence = sourceEvidence(root);
  const additional = ['scripts/real-extension-smoke.cjs', 'scripts/fetch-extension-corpus.cjs', '.github/workflows/browser-extensions.yml'].map(relative => {
    const bytes = readRegular(path.join(root, relative));
    return { path: relative, bytes: bytes.length, sha256: sha256(bytes) };
  });
  const files = [...evidence.files, ...additional].sort((a, b) => a.path.localeCompare(b.path));
  return { ...evidence, files, manifestSha256: sha256(JSON.stringify(files)) };
}

function prepareCorpus(context, originalArchive, source) {
  readContext(context.configFile);
  const verified = verifyArchive(originalArchive);
  const directory = path.join(context.directory, 'corpus');
  fs.mkdirSync(directory);
  const archive = path.join(directory, PIN.asset.name);
  fs.writeFileSync(archive, verified.bytes, { flag: 'wx', mode: 0o600 });
  const receipt = {
    schema: 1, corpusId: PIN.id, fixtureToken: context.token, profile: context.profile,
    sourceManifestSha256: source.manifestSha256, sourceCommit: source.commit,
    originalArchive, archive, bytes: verified.size, sha256: verified.sha256,
    provenance: PIN, generatedAt: new Date().toISOString(),
  };
  const receiptFile = path.join(directory, 'corpus-receipt.json');
  fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  readCorpusReceipt(context, receiptFile);
  return { receipt, receiptFile };
}

function readCorpusReceipt(context, file) {
  const directory = path.join(context.directory, 'corpus');
  if (path.resolve(file) !== path.join(directory, 'corpus-receipt.json') || fs.realpathSync(directory) !== directory) throw new Error('The corpus receipt must belong to this marked fixture.');
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readRegular(file)));
  if (value.schema !== 1 || value.corpusId !== PIN.id || value.fixtureToken !== context.token || value.profile !== context.profile ||
      value.archive !== path.join(directory, PIN.asset.name) || value.bytes !== PIN.asset.bytes || value.sha256 !== PIN.asset.sha256 ||
      !/^[0-9a-f]{64}$/.test(value.sourceManifestSha256) || JSON.stringify(value.provenance) !== JSON.stringify(PIN)) throw new Error('Corpus receipt does not bind this fixture to the exact pinned release.');
  verifyArchive(value.archive);
  return value;
}

function createLightServer() {
  const bytes = readRegular(path.join(__dirname, 'fixtures/real-extension-light.html'));
  const requests = [], sockets = new Set();
  const server = http.createServer((request, response) => {
    const address = new URL(request.url, 'http://127.0.0.1');
    requests.push({ method: request.method, path: address.pathname, capturedAt: new Date().toISOString() });
    response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET' || !['/', '/light'].includes(address.pathname)) {
      response.writeHead(404); response.end('No such local fixture.'); return;
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(bytes);
  });
  server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  return {
    requests, page: { bytes: bytes.length, sha256: sha256(bytes) },
    async listen() {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      return `http://127.0.0.1:${server.address().port}`;
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      if (server.listening) await new Promise(resolve => server.close(resolve));
    },
  };
}

function publicAddress(value) {
  try {
    const address = new URL(value);
    if (!['http:', 'https:', 'chrome-extension:'].includes(address.protocol)) return { scheme: address.protocol };
    return { scheme: address.protocol, host: address.host, path: address.pathname, queryKeys: [...new Set(address.searchParams.keys())] };
  } catch { return { invalid: true }; }
}

function assertLight(sample) {
  assert.equal(sample.fixture, 'light-v1', 'The selected document must be the actual generated fixture');
  assert.ok(sample.pixel.meanRGB >= 230 && sample.pixel.alpha >= 250, 'The original light page must render an opaque light pixel');
}

function assertPinnedPermissions(permissions) {
  // MV2 declares host patterns inside manifest.permissions. The canonical
  // inspector preserves those original arrays; the corpus descriptor splits
  // API names and sites only to make the human review easier to read.
  assert.deepEqual([...permissions.required].sort(), [...PIN.permissions.required, ...PIN.permissions.hosts].sort());
  assert.deepEqual(permissions.hosts, []);
  assert.deepEqual(permissions.optional, PIN.permissions.optional);
  assert.deepEqual(permissions.optionalHosts, []);
}

function assertDarkened(before, after) {
  assertLight(before);
  assert.equal(after.fixture, 'light-v1', 'An extension page must not be substituted for the test document');
  assert.ok(after.styleCount > 0, 'The unchanged package must inject actual Dark Reader styles');
  assert.ok(after.pixel.alpha >= 250 && after.pixel.meanRGB < 128 && before.pixel.meanRGB - after.pixel.meanRGB >= 100,
    `Actual captured page pixels must darken; before=${before.pixel.meanRGB}, after=${after.pixel.meanRGB}`);
  assert.notEqual(after.bodyBackground, before.bodyBackground, 'Computed page styling must change too');
}

function assertRunCompleted(receipt, exitCode, signal) {
  const completeChecks = Array.isArray(receipt?.checks) && receipt.checks.length === CHECKS.length &&
    receipt.checks.every((check, index) => check.name === CHECKS[index] && check.passed === true);
  const completeObservation = Array.isArray(receipt?.observerErrors) && receipt.observerErrors.length === 0;
  if (exitCode !== 0 || signal || !receipt?.passed || !receipt?.runtimeReady || !receipt?.sandboxForced || !completeChecks ||
      !completeObservation || !receipt?.completedWorkflows || !receipt?.normalCloseObserved || receipt.firstFailure) {
    const error = new Error(`Real extension gate failed (exit ${exitCode}, signal ${signal || 'none'}): ${receipt?.firstFailure?.message || receipt?.error || 'No complete passing runtime receipt.'}`);
    error.runtimeReceipt = receipt || null;
    throw error;
  }
  return { ...receipt, processExitedCleanly: true };
}

module.exports = { PIN, ROOT, CHECKS, sha256, readRegular, verifyArchive, realSourceEvidence, prepareCorpus, readCorpusReceipt,
  createLightServer, publicAddress, assertLight, assertPinnedPermissions, assertDarkened, assertRunCompleted };
