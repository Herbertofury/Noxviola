'use strict';
// Explicit native gate. This is deliberately absent from npm test and packaging.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const { createFixtureServer } = require('../tests/native/fixture-server.cjs');
const ROOT = path.resolve(__dirname, '..');
const MARKER = 'noxviola-synthetic-native-fixture-v1';

function preflight({ platform = process.platform, env = process.env, uid = process.getuid?.() } = {}) {
  if (env.ELECTRON_RUN_AS_NODE || env.ELECTRON_DISABLE_SANDBOX || env.NODE_OPTIONS) {
    return 'Native acceptance refuses ELECTRON_RUN_AS_NODE, ELECTRON_DISABLE_SANDBOX or NODE_OPTIONS overrides.';
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
  for (const relative of ['browser', 'package.json', 'package-lock.json', 'scripts/native-smoke.cjs', 'tests/native']) record(relative);
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
  const packageDirectory = path.dirname(require.resolve('electron/package.json'));
  const relative = fs.readFileSync(path.join(packageDirectory, 'path.txt'), 'utf8').trim();
  const executable = path.resolve(packageDirectory, 'dist', relative);
  if (!fs.statSync(executable).isFile()) throw new Error('Electron binary was not installed. Run npm ci with its official installation script enabled.');
  return executable;
}

async function runPhase(executable, context, phase) {
  const log = fs.openSync(path.join(context.output, `electron-phase-${phase}.log`), 'w', 0o600);
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(executable, [path.join(ROOT, 'tests/native/driver.cjs'), context.configFile, String(phase)], {
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
          const resultFile = path.join(context.output, `phase-${phase}.json`);
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

async function main(argv = process.argv.slice(2)) {
  let output = path.join(ROOT, 'native-results');
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--output' && argv[index + 1]) output = path.resolve(argv[++index]);
    else if (argv[index] === '--help') {
      console.log('node scripts/native-smoke.cjs [--output DIRECTORY]\nRuns actual sandboxed Electron against fresh synthetic fixtures. Exit 0 = tested workflows passed; 1 = failure; 2 = environment blocked. Never disables the sandbox.');
      return 0;
    } else throw new Error(`Unknown native-gate argument: ${argv[index]}`);
  }
  fs.mkdirSync(output, { recursive: true });
  output = fs.mkdtempSync(path.join(output, 'run-'));
  console.log(`Native evidence directory: ${output}`);
  const report = {
    schema: 1, startedAt: new Date().toISOString(), platform: process.platform, arch: process.arch,
    electron: require('../package.json').devDependencies.electron, source: sourceEvidence(),
    scope: 'Actual source app, sandboxed Electron, loopback fixtures, fresh synthetic profile, two process launches',
    status: 'blocked', runtimeAttempted: false, runtimeStarted: false, phases: [],
    unverified: ['Native OS file-picker interaction', 'Real Internet sites and authenticated accounts', 'Cross-browser extension compatibility beyond the recorded synthetic extensions', 'Full first-party and engine network/telemetry audit', 'Full security, accessibility, performance and release qualification'],
  };
  let context;
  let fixture;
  try {
    const reason = preflight();
    if (reason) { report.reason = reason; console.error(`BLOCKED: ${reason}`); return 2; }
    let executable;
    try { executable = electronExecutable(); } catch (error) { report.reason = error.message; console.error(`BLOCKED: ${report.reason}`); return 2; }
    fixture = createFixtureServer();
    let origin;
    try { origin = await fixture.listen(); } catch (error) { report.reason = `Loopback fixture server unavailable: ${error.message}`; console.error(`BLOCKED: ${report.reason}`); return 2; }
    context = createContext(origin, output);
    report.runtimeAttempted = true;
    report.status = 'failed';
    for (const phase of [1, 2]) {
      const completed = await runPhase(executable, context, phase);
      report.phases.push(completed);
      report.runtimeStarted ||= completed.runtimeReady;
    }
    report.sourceAfter = sourceEvidence();
    if (report.sourceAfter.manifestSha256 !== report.source.manifestSha256) throw new Error('Application or native fixture sources changed during execution; the run cannot qualify a single source snapshot.');
    report.fixtureRequests = fixture.requests.length;
    report.status = 'passed';
    console.log('PASS: Actual sandboxed Electron fixture workflows completed across two launches. This is not complete browser or release qualification.');
    return 0;
  } catch (error) {
    report.status = 'failed';
    if (error.phaseResult) {
      report.phases.push(error.phaseResult);
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
module.exports = { preflight, createContext, readContext, sourceEvidence, main };
