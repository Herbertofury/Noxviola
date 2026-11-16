'use strict';
// Explicit native gates. npm test never launches an engine; packaging alone
// never counts as native acceptance.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const { createFixtureServer } = require('../tests/native/fixture-server.cjs');
const ROOT = path.resolve(__dirname, '..');
const MARKER = 'noxviola-synthetic-native-fixture-v1';

function preflight({ platform = process.platform, env = process.env, uid = process.getuid?.() } = {}) {
  if (env.ELECTRON_RUN_AS_NODE || env.ELECTRON_DISABLE_SANDBOX || env.NODE_OPTIONS || env.NODE_PATH) {
    return 'Native acceptance refuses ELECTRON_RUN_AS_NODE, ELECTRON_DISABLE_SANDBOX, NODE_OPTIONS or NODE_PATH overrides.';
  }
  if (platform === 'linux' && uid === 0) return 'Sandboxed Electron acceptance must run as an ordinary user.';
  if (platform === 'linux' && !env.DISPLAY && !env.WAYLAND_DISPLAY) {
    return 'No Linux desktop display is available (DISPLAY/WAYLAND_DISPLAY absent). No headless or sandbox-disabled retry was attempted.';
  }
  return null;
}

function createContext(origin, output) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'noxviola-native-')));
  const token = crypto.randomUUID();
  const profile = path.join(directory, 'profile');
  for (const name of ['profile', 'downloads', 'logs', 'crash']) fs.mkdirSync(path.join(directory, name));
  const marker = { marker: MARKER, token, profile };
  fs.writeFileSync(path.join(directory, 'fixture-owner.json'), JSON.stringify(marker), { mode: 0o600 });
  const config = { ...marker, directory, origin, output };
  const configFile = path.join(directory, 'config.json');
  fs.writeFileSync(configFile, JSON.stringify(config), { mode: 0o600 });
  return { ...config, configFile };
}

function readContext(file) {
  const directory = fs.realpathSync(path.dirname(file));
  const temporary = fs.realpathSync(os.tmpdir());
  const relative = path.relative(temporary, directory);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !path.basename(directory).startsWith('noxviola-native-')) {
    throw new Error('Native fixture must use a fresh, marked directory inside the system temporary directory.');
  }
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  const marker = JSON.parse(fs.readFileSync(path.join(directory, 'fixture-owner.json'), 'utf8'));
  if (config.marker !== MARKER || marker.marker !== MARKER || config.token !== marker.token ||
      config.directory !== directory || config.profile !== path.join(directory, 'profile') || marker.profile !== config.profile ||
      fs.realpathSync(config.profile) !== config.profile) throw new Error('Invalid native fixture ownership marker or profile path.');
  const origin = new URL(config.origin);
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || origin.username || origin.password || !origin.port || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('Native fixtures may only use their generated loopback server.');
  }
  return config;
}

function sourceEvidence(root = ROOT) {
  const files = [];
  function record(relative) {
    const file = path.join(root, relative);
    const entry = fs.lstatSync(file);
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symbolic link in native acceptance inputs: ${relative}`);
    if (entry.isDirectory()) {
      for (const name of fs.readdirSync(file).sort()) record(`${relative}/${name}`);
    } else if (entry.isFile()) {
      const bytes = fs.readFileSync(file);
      files.push({ path: relative, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
    } else throw new Error(`Unexpected special file in native acceptance inputs: ${relative}`);
  }
  for (const relative of ['browser', 'package.json', 'package-lock.json', 'scripts/native-smoke.cjs', 'scripts/setup-legacy-electron.cjs', 'scripts/package-preview.cjs', 'tests/native']) record(relative);
  files.sort((left, right) => left.path.localeCompare(right.path));
  let commit = null;
  let dirty = null;
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    dirty = !!execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { /* A source archive may not include Git metadata; byte hashes remain available. */ }
  return { commit, dirty, manifestSha256: crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex'), files };
}

function electronExecutable() {
  try {
    const packageDirectory = path.dirname(require.resolve('electron/package.json'));
    const relative = fs.readFileSync(path.join(packageDirectory, 'path.txt'), 'utf8').trim();
    const executable = path.resolve(packageDirectory, 'dist', relative);
    if (!fs.statSync(executable).isFile()) throw new Error('The executable path is not a regular file.');
    return executable;
  } catch (error) {
    throw new Error(`Electron distribution is unavailable. Run npm run setup:electron, then npm run check:electron. ${error.message}`);
  }
}

async function runPhase(executable, context, phase) {
  if (!['legacy-seed', 1, 2].includes(phase)) throw new Error('Only the legacy seed and two production fixture phases may launch.');
  const label = phase === 'legacy-seed' ? phase : `phase-${phase}`;
  const entry = phase === 'legacy-seed' ? 'legacy-seed.cjs' : 'driver.cjs';
  const arguments_ = [path.join(ROOT, 'tests/native', entry), context.configFile];
  if (phase !== 'legacy-seed') arguments_.push(String(phase));
  const log = fs.openSync(path.join(context.output, `electron-${label}.log`), 'w', 0o600);
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(executable, arguments_, {
        cwd: ROOT, stdio: ['ignore', log, log], windowsHide: false,
      });
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error(`Electron fixture phase ${phase} exceeded 180 seconds. This is a failed gate, not a skipped test.`));
      }, 180_000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', (code, signal) => {
        clearTimeout(timeout);
        try {
          const resultFile = path.join(context.output, `${label}.json`);
          const result = fs.existsSync(resultFile) ? JSON.parse(fs.readFileSync(resultFile, 'utf8')) : null;
          if (code !== 0 || !result?.passed) {
            const error = new Error(`Electron phase ${phase} failed (exit ${code}, signal ${signal || 'none'}). ${result?.error || 'See the retained runtime log.'}`);
            error.phaseResult = result;
            reject(error);
          } else resolve({ ...result, processExitedCleanly: true });
        } catch (error) { reject(error); }
      });
    });
  } finally { fs.closeSync(log); }
}

function nativeOptions(argv = process.argv.slice(2)) {
  const result = { output: path.join(ROOT, 'native-results'), packageReceipt: null, legacyRuntimeReceipt: null, publicHttps: false };
  const seen = new Set();
  for (let index = 0; index < argv.length; index++) {
    const option = argv[index];
    if (option === '--help') return null;
    if (seen.has(option)) throw new Error(`Repeated native-gate argument: ${option}`);
    seen.add(option);
    if (option === '--public-https') result.publicHttps = true;
    else if (['--output', '--package-receipt', '--legacy-runtime-receipt'].includes(option) && argv[index + 1] && !argv[index + 1].startsWith('--')) {
      const key = { '--output': 'output', '--package-receipt': 'packageReceipt', '--legacy-runtime-receipt': 'legacyRuntimeReceipt' }[option];
      result[key] = path.resolve(argv[++index]);
    } else throw new Error(`Unknown or incomplete native-gate argument: ${option}`);
  }
  if (result.publicHttps && !result.packageReceipt) throw new Error('--public-https requires the packaged executable gate.');
  if (result.legacyRuntimeReceipt && result.packageReceipt) throw new Error('--legacy-runtime-receipt requires the source-app gate, without --package-receipt.');
  return result;
}

function runtimeTransition(seed, phases, legacyRuntime = null, readerVersion = require('../package.json').devDependencies.electron) {
  const writerVersion = legacyRuntime?.version || readerVersion;
  if (seed?.versions?.electron !== writerVersion || phases.length !== 2 ||
      phases.some(phase => phase?.versions?.electron !== readerVersion)) {
    throw new Error('Observed writer, reader and restart versions must match the independently admitted runtime transition.');
  }
  return {
    writer: seed.versions, reader: phases[0].versions, restart: phases[1].versions,
    crossVersion: writerVersion !== readerVersion,
    scope: 'Generated personal-identity web stores and cookie lifetimes through the original partition factory, current application and normal restart; no arbitrary owner-profile or extension-data migration claim.',
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = nativeOptions(argv);
  if (!options) {
    console.log('node scripts/native-smoke.cjs [--output DIRECTORY] [--legacy-runtime-receipt FILE | --package-receipt FILE] [--public-https]\nWithout a package receipt, runs the deep actual source-app fixture gate. --legacy-runtime-receipt admits the exact official previous engine solely for its generated store seed, followed by the current pinned source app and restart. Without it the seed uses the current engine and proves no cross-version upgrade. With a receipt from package:preview, launches the exact packaged executable through its unchanged production entry. --public-https adds two declared public pages to the packaged gate. Exit 0 = recorded workflows passed; 1 = failure; 2 = environment blocked. Never disables the sandbox.');
    return 0;
  }
  let { output } = options;
  const { packageReceipt, legacyRuntimeReceipt, publicHttps } = options;
  fs.mkdirSync(output, { recursive: true });
  output = fs.mkdtempSync(path.join(output, 'run-'));
  console.log(`Native evidence directory: ${output}`);
  const report = {
    schema: 1, startedAt: new Date().toISOString(), platform: process.platform, arch: process.arch,
    electron: require('../package.json').devDependencies.electron, source: sourceEvidence(),
    scope: packageReceipt ? 'Two launches of the manifest-verified packaged executable and unchanged production ASAR entry, fresh synthetic profile, loopback fixtures and declared HTTPS cases when requested' : 'Sandboxed legacy fromPartition seed followed by two actual source-app processes, one loopback origin and fresh synthetic profile',
    executionMode: packageReceipt ? 'packaged-executable' : 'source-app',
    status: 'blocked', runtimeAttempted: false, runtimeStarted: false, legacySeed: null, phases: [],
    unverified: ['Native OS file-picker interaction', 'Authenticated accounts and Internet compatibility beyond the explicitly recorded public pages', 'Cross-browser extension compatibility beyond the recorded synthetic extensions', 'Full first-party and engine network/telemetry audit', 'Full security, accessibility, performance and release qualification'],
  };
  if (packageReceipt) report.unverified.push('Packaged extension import and lifecycle; the synthetic extension workflows have a separate source-app gate');
  let context;
  let fixture;
  let packaged;
  let packagedSource;
  let legacyRuntime;
  try {
    const reason = preflight();
    if (reason) { report.reason = reason; console.error(`BLOCKED: ${reason}`); return 2; }
    let executable;
    if (packageReceipt) {
      const receipt = JSON.parse(fs.readFileSync(packageReceipt, 'utf8'));
      if (receipt.schema !== 1 || receipt.packages?.length !== 1 || !path.isAbsolute(receipt.packages[0].directory)) throw new Error('The package build receipt must identify exactly one absolute package directory.');
      const { verifyPackagedApplication } = require('./package-preview.cjs');
      packaged = await verifyPackagedApplication(receipt.packages[0].directory);
      if (packaged.platform !== process.platform || packaged.arch !== process.arch) throw new Error('The packaged runtime gate only launches the matching host platform and architecture.');
      if (packaged.commit !== report.source.commit || report.source.dirty !== false || receipt.commit !== packaged.commit || receipt.packages[0].manifest.sha256 !== packaged.manifest.sha256) throw new Error('Package and native source must identify the same clean checkpoint and exact package manifest.');
      report.package = { directory: packaged.directory, executable: packaged.executable, archive: packaged.archive, entry: packaged.entry, manifest: packaged.manifest, commit: packaged.commit, applicationManifestSha256: packaged.applicationManifestSha256, electron: packaged.electron, platform: packaged.platform, arch: packaged.arch };
      executable = packaged.executable;
    } else {
      try { executable = electronExecutable(); } catch (error) { report.reason = error.message; console.error(`BLOCKED: ${report.reason}`); return 2; }
      if (legacyRuntimeReceipt) {
        legacyRuntime = await require('./setup-legacy-electron.cjs').verifyLegacyRuntime(legacyRuntimeReceipt);
        report.legacyRuntime = { ...legacyRuntime, stage: 'Verified provisioning receipt before the seed process was launched' };
      }
    }
    fixture = createFixtureServer();
    let origin;
    try { origin = await fixture.listen(); } catch (error) { report.reason = `Loopback fixture server unavailable: ${error.message}`; console.error(`BLOCKED: ${report.reason}`); return 2; }
    context = createContext(origin, output);
    if (legacyRuntime) {
      context.legacyRuntime = legacyRuntime;
      fs.writeFileSync(context.configFile, JSON.stringify(context), { mode: 0o600 });
    }
    if (packaged) {
      packagedSource = packaged;
      // A package under the checkout could accidentally resolve a missing module
      // from the checkout's ancestor node_modules. Execute a byte-identical copy
      // in the owned temp fixture, outside the checkout, with its own working dir.
      const executionDirectory = path.join(context.directory, 'application', path.basename(packaged.directory));
      fs.cpSync(packaged.directory, executionDirectory, { recursive: true, dereference: false, preserveTimestamps: true, errorOnExist: true });
      packaged = await require('./package-preview.cjs').verifyPackagedApplication(executionDirectory);
      if (packaged.manifest.sha256 !== packagedSource.manifest.sha256) throw new Error('Isolated executable copy differs from the built package.');
      report.package.executionDirectory = executionDirectory;
      report.package.executedOutsideCheckout = true;
      report.package.copyManifestSha256 = packaged.manifest.sha256;
    }
    report.runtimeAttempted = true;
    report.status = 'failed';
    if (!packaged) {
      report.legacySeed = await runPhase(legacyRuntime?.executable || executable, context, 'legacy-seed');
      report.runtimeStarted ||= report.legacySeed.runtimeReady;
    }
    for (const phase of [1, 2]) {
      const completed = packaged ? await require('../tests/native/packaged-driver.cjs').runPackagedPhase(packaged, context, phase, { publicHttps }) : await runPhase(executable, context, phase);
      if (!completed.passed || !completed.processExitedCleanly) {
        const error = new Error(`Native phase ${phase} did not finish with a passing receipt and clean process exit.`);
        error.phaseResult = completed;
        throw error;
      }
      report.phases.push(completed);
      report.runtimeStarted ||= completed.runtimeReady;
    }
    if (!packaged) report.runtimeTransition = runtimeTransition(report.legacySeed, report.phases, legacyRuntime);
    report.sourceAfter = sourceEvidence();
    if (report.sourceAfter.manifestSha256 !== report.source.manifestSha256) throw new Error('Application or native fixture sources changed during execution; the run cannot qualify a single source snapshot.');
    if (packaged) {
      const after = await require('./package-preview.cjs').verifyPackagedApplication(packaged.directory);
      if (after.manifest.sha256 !== packaged.manifest.sha256) throw new Error('The package manifest changed during packaged execution.');
      const originalAfter = await require('./package-preview.cjs').verifyPackagedApplication(packagedSource.directory);
      if (originalAfter.manifest.sha256 !== packagedSource.manifest.sha256) throw new Error('The original distribution changed during packaged execution.');
      report.packageVerifiedAfterExecution = true;
    }
    report.fixtureRequests = fixture.requests.length;
    report.status = 'passed';
    console.log(packaged ? 'PASS: Two actual packaged executable launches completed with unchanged package bytes. See the recorded workflow, HTTPS, network and resource scope; this is not complete release qualification.' : 'PASS: A sandboxed legacy seed and two actual source-app launches completed. This is scoped store-transition/restart evidence, not complete browser or release qualification.');
    return 0;
  } catch (error) {
    report.status = 'failed';
    if (error.phaseResult) {
      if (error.phaseResult.phase === 'legacy-seed') report.legacySeed = error.phaseResult;
      else report.phases.push(error.phaseResult);
      report.runtimeStarted ||= error.phaseResult.runtimeReady;
    }
    report.reason = error.stack || error.message;
    console.error(report.reason);
    return 1;
  } finally {
    let cleanupFailed = false;
    try {
      await fixture?.close();
      if (context) {
        // Only the marked directory created above is eligible for cleanup.
        readContext(context.configFile);
        fs.rmSync(context.directory, { recursive: true, force: true });
      }
    } catch (error) {
      cleanupFailed = true;
      report.status = 'failed';
      report.cleanupError = error.message;
      console.error(`Fixture cleanup failed: ${error.message}`);
    }
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(output, 'acceptance.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    if (cleanupFailed) return 1;
  }
}

if (require.main === module) main().then(code => { process.exitCode = code; }).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { preflight, createContext, readContext, sourceEvidence, electronExecutable, nativeOptions, runtimeTransition, main };
