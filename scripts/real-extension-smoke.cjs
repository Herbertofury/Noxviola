'use strict';
// Deliberately separate from synthetic native and packaged acceptance. Nothing
// runs on import, in npm test, or while preparing/downloading the corpus ZIP.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { preflight, createContext, readContext, electronExecutable } = require('./native-smoke.cjs');
const { PIN, ROOT, verifyArchive, realSourceEvidence, prepareCorpus, readCorpusReceipt,
  createLightServer, assertRunCompleted } = require('../tests/native/real-extension-support.cjs');

function options(argv) {
  const value = { archive: null, output: path.join(ROOT, 'native-real-extension-results') };
  const seen = new Set();
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index];
    if (name === '--help') return null;
    if (seen.has(name)) throw new Error(`Repeated real-extension argument: ${name}`);
    seen.add(name);
    if (!['--archive', '--output'].includes(name) || !argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error(`Unknown or incomplete real-extension argument: ${name}`);
    value[name.slice(2)] = path.resolve(argv[++index]);
  }
  if (!value.archive) throw new Error('--archive must identify the unchanged pinned Dark Reader Chrome MV2 ZIP.');
  return value;
}

async function runElectron(executable, context, receiptFile) {
  const log = fs.openSync(path.join(context.output, 'electron-real-extension.log'), 'wx', 0o600);
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(executable, [path.join(ROOT, 'tests/native/real-extension-driver.cjs'), context.configFile, receiptFile],
        { cwd: ROOT, stdio: ['ignore', log, log], windowsHide: false });
      let expired = false;
      const timer = setTimeout(() => { expired = true; child.kill(); }, 180_000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', (code, signal) => {
        clearTimeout(timer);
        let receipt = null;
        try {
          const file = path.join(context.output, 'real-extension.json');
          if (fs.existsSync(file)) receipt = JSON.parse(fs.readFileSync(file, 'utf8'));
          if (expired) {
            const error = new Error('Real-package execution exceeded 180 seconds. This is a failed gate; no delayed or sandbox-disabled retry was made.');
            error.runtimeReceipt = receipt;
            throw error;
          }
          resolve(assertRunCompleted(receipt, code, signal));
        } catch (error) { error.childExited = true; reject(error); }
      });
    });
  } finally { fs.closeSync(log); }
}

async function main(argv = process.argv.slice(2)) {
  const args = options(argv);
  if (!args) {
    console.log('node scripts/real-extension-smoke.cjs --archive /absolute/path/darkreader-chrome.zip [--output DIRECTORY]\nRuns one separate sandboxed source-app gate with the exact upstream Dark Reader 4.9.135 Chrome MV2 release, real local review/install controls, a deterministic loopback page, actual theme pixels and popup/options interactions. Public package network behavior is observed, not intercepted. Exit 0 = only these recorded workflows passed; 1 = failure; 2 = environment blocked. No packaged or universal compatibility claim.');
    return 0;
  }
  fs.mkdirSync(args.output, { recursive: true });
  const output = fs.mkdtempSync(path.join(args.output, 'run-'));
  const report = {
    schema: 1, startedAt: new Date().toISOString(), platform: process.platform, arch: process.arch,
    electron: require('../package.json').devDependencies.electron,
    source: realSourceEvidence(), corpus: PIN, executionMode: 'source-app-real-upstream-package',
    status: 'blocked', runtimeAttempted: false, runtimeStarted: false,
    scope: 'One unchanged pinned upstream package, one explicit identity in a new marked profile, ordinary production import/review/install/actions, generated light page and actual popup/settings controls.',
    unverified: ['Packaged-executable extension import and lifecycle', 'Native OS file-picker interaction', 'Other packages, versions, browser builds and extension features',
      'Marketplace signatures, publisher identity and source-to-release reproducibility', 'Full network/privacy audit, performance comparisons and release qualification'],
  };
  console.log(`Real-package evidence directory: ${output}`);
  let context, fixture, prepared;
  let returnCode = 1;
  try {
    const blocked = preflight();
    if (blocked) { report.reason = blocked; console.error(`BLOCKED: ${blocked}`); returnCode = 2; return returnCode; }
    let executable;
    try { executable = electronExecutable(); }
    catch (error) { report.reason = error.message; console.error(`BLOCKED: ${report.reason}`); returnCode = 2; return returnCode; }
    // Admission precedes both the engine launch and copying any package code.
    verifyArchive(args.archive);
    fixture = createLightServer();
    let origin;
    try { origin = await fixture.listen(); }
    catch (error) { report.reason = `Loopback light fixture unavailable: ${error.message}`; returnCode = 2; return returnCode; }
    context = createContext(origin, output);
    prepared = prepareCorpus(context, args.archive, report.source);
    report.fixture = { token: context.token, origin, page: fixture.page };
    report.archive = prepared.receipt;
    fs.writeFileSync(path.join(output, 'corpus-receipt.json'), JSON.stringify(prepared.receipt, null, 2) + '\n', { mode: 0o600 });
    report.status = 'failed';
    report.runtimeAttempted = true;
    report.runtime = await runElectron(executable, context, prepared.receiptFile);
    report.runtimeStarted = report.runtime.runtimeReady === true;
    if (report.runtime.source.manifestSha256 !== report.source.manifestSha256 || report.runtime.fixtureToken !== context.token ||
        report.runtime.archive.sha256 !== PIN.asset.sha256) throw new Error('The runtime receipt belongs to different source, corpus or fixture inputs.');
    report.sourceAfter = realSourceEvidence();
    if (report.sourceAfter.manifestSha256 !== report.source.manifestSha256) throw new Error('Sources changed during the real-package gate; this cannot qualify one source snapshot.');
    verifyArchive(args.archive);
    readCorpusReceipt(context, prepared.receiptFile);
    report.archiveVerifiedAfterExecution = true;
    report.status = 'passed';
    returnCode = 0;
    console.log('PASS: The recorded unchanged Dark Reader package workflows completed. See individual checks and limitations; this is not universal compatibility or packaged acceptance.');
  } catch (error) {
    report.status = 'failed';
    report.reason = error.stack || error.message;
    if (error.runtimeReceipt) { report.runtime = error.runtimeReceipt; report.runtimeStarted = error.runtimeReceipt.runtimeReady === true; }
    console.error(report.reason);
  } finally {
    // Keep exact raw receipts, logs and generated screenshots outside the
    // disposable profile. Never add the profile or installed package to an artifact.
    report.fixtureRequests = fixture?.requests || [];
    try {
      await fixture?.close();
      if (context) { readContext(context.configFile); fs.rmSync(context.directory, { recursive: true, force: true }); }
    } catch (error) {
      report.status = 'failed'; report.cleanupError = error.message; returnCode = 1;
    }
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(output, 'real-extension-acceptance.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    if (report.cleanupError) return 1;
  }
  return returnCode;
}

if (require.main === module) main().then(code => { process.exitCode = code; }).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { options, runElectron, main };
