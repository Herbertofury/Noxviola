'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const APP_FILES = [
  'browser/main.cjs', 'browser/preload.cjs', 'browser/renderer.js',
  'browser/index.html', 'browser/style.css', 'browser/assets/noxviola.png',
  'browser/tab-preview-host.cjs', 'browser/tab-preview-preload.cjs', 'browser/tab-preview.html', 'browser/tab-preview.js', 'browser/tab-preview.css',
  'browser/tab-search-host.cjs', 'browser/tab-search-preload.cjs', 'browser/tab-search.html', 'browser/tab-search.js', 'browser/tab-search.css',
  'browser/sidebar-layout.cjs', 'browser/sidebar-web-panel.cjs',
  'browser/capabilities.json', 'browser/state.cjs', 'browser/favicons.cjs', 'browser/find-session.cjs',
  'browser/storage.cjs', 'browser/session-writer.cjs', 'browser/session-path.cjs',
  'browser/permissions.cjs', 'browser/downloads.cjs', 'browser/extensions.cjs', 'browser/extension-runtime.cjs',
  'browser/extension-api.preload.cjs', 'browser/extension-bridge.cjs', 'browser/extension-policy.cjs',
  'browser/extension-menus.cjs', 'browser/extension-icons.cjs', 'browser/extension-adapter-LICENSE.txt', 'browser/extension-browser-polyfill-LICENSE.txt',
  'browser/preferences.cjs', 'browser/resources.cjs', 'browser/spellcheck.cjs', 'browser/service-store.cjs',
  'browser/curseforge-follow.cjs', 'browser/modrinth-follow.cjs', 'browser/follows.cjs', 'browser/history.cjs', 'browser/bookmarks.cjs', 'browser/workspaces.cjs',
  'browser/vault.cjs', 'browser/accounts.cjs', 'LICENSE', 'THIRD_PARTY_NOTICES.md',
];

function stageApp(root, destination, commit, { dirty = false } = {}) {
  fs.mkdirSync(destination, { recursive: true });
  for (const relative of APP_FILES) {
    const source = path.join(root, relative);
    const target = path.join(destination, relative);
    if (!fs.lstatSync(source).isFile()) throw new Error(`Not a regular application source: ${relative}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const runtime = {
    name: pkg.name, productName: pkg.productName, version: pkg.version,
    description: pkg.description, main: pkg.main, license: pkg.license,
    ...(pkg.dependencies ? { dependencies: pkg.dependencies } : {}),
  };
  fs.writeFileSync(path.join(destination, 'package.json'), JSON.stringify(runtime, null, 2) + '\n');
  const provenance = {
    project: 'Noxviola', commit, worktreeDirty: dirty,
    electron: pkg.devDependencies.electron, packager: pkg.devDependencies['@electron/packager'],
    acceptance: 'UNVERIFIED PREVIEW: packaged, not native-accepted or signed',
    source: `https://github.com/Herbertofury/Noxviola/tree/${commit}`,
  };
  fs.writeFileSync(path.join(destination, 'BUILD.json'), JSON.stringify(provenance, null, 2) + '\n');
  fs.writeFileSync(path.join(destination, 'PREVIEW-NOTICE.txt'), 'Unverified preview. No complete native browser/security/performance acceptance. No auto-update, signing or release qualification. Only application source and locked production dependency files are staged; profiles and personal data are excluded.\n');
  return provenance;
}

function manifest(directory) {
  const records = [];
  function walk(base) {
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      const file = path.join(base, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Unexpected symbolic link in package: ${path.relative(directory, file)}`);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) records.push({
        path: path.relative(directory, file).split(path.sep).join('/'),
        bytes: fs.statSync(file).size,
        sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
      });
      else throw new Error(`Unexpected special file in package: ${path.relative(directory, file)}`);
    }
  }
  walk(directory);
  return records.sort((a, b) => a.path.localeCompare(b.path));
}

function verifyPackageFiles(directory) {
  const file = path.join(directory, 'PACKAGE-MANIFEST.json');
  if (!fs.lstatSync(directory).isDirectory() || !fs.lstatSync(file).isFile()) throw new Error('Package and manifest must be ordinary filesystem entries.');
  const bytes = fs.readFileSync(file);
  const recorded = JSON.parse(bytes);
  if (!Array.isArray(recorded.files) || !Array.isArray(recorded.applicationFiles) ||
      !/^[a-f0-9]{40}$/.test(recorded.commit || '')) throw new Error('Invalid package manifest.');
  for (const entries of [recorded.files, recorded.applicationFiles]) {
    const names = new Set();
    for (const entry of entries) {
      if (typeof entry.path !== 'string' || entry.path.includes('\\') || path.posix.isAbsolute(entry.path) ||
          entry.path.split('/').some(part => !part || part === '.' || part === '..') || names.has(entry.path) ||
          !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256 || '')) throw new Error('Invalid or duplicate package file record.');
      names.add(entry.path);
    }
  }
  const actual = manifest(directory).filter(entry => entry.path !== 'PACKAGE-MANIFEST.json');
  if (JSON.stringify(actual) !== JSON.stringify(recorded.files)) {
    throw new Error('The package file set or bytes do not match PACKAGE-MANIFEST.json.');
  }
  if (actual.reduce((sum, entry) => sum + entry.bytes, 0) !== recorded.totalBytes) throw new Error('Package byte total mismatch.');
  const applicationDigest = crypto.createHash('sha256').update(JSON.stringify(recorded.applicationFiles)).digest('hex');
  if (applicationDigest !== recorded.applicationManifestSha256) throw new Error('Application manifest digest mismatch.');
  return {
    ...recorded, directory: path.resolve(directory),
    manifest: { path: file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') },
  };
}

async function verifyPackagedApplication(directory, { root = path.resolve(__dirname, '..'), requireClean = true } = {}) {
  const packaged = verifyPackageFiles(directory);
  if (requireClean && packaged.worktreeDirty) throw new Error('Packaged runtime acceptance requires a clean source checkpoint.');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (packaged.electron !== pkg.devDependencies.electron) throw new Error('Packaged Electron pin differs from the acceptance source.');
  const { listPackage, extractFile, uncache } = await import('@electron/asar');
  const resources = packaged.platform === 'darwin' ? path.join(directory, 'Noxviola.app', 'Contents', 'Resources') : path.join(directory, 'resources');
  const archive = path.join(resources, 'app.asar');
  uncache(archive); // Verification always reads the current header bytes.
  const allowed = new Map(packaged.applicationFiles.map(entry => [entry.path, entry]));
  for (const entry of listPackage(archive).map(name => name.replace(/^[/\\]+/, '').split('\\').join('/'))) {
    if (!allowed.has(entry) && ![...allowed.keys()].some(file => file.startsWith(entry + '/'))) throw new Error(`Unexpected packaged application entry: ${entry}`);
  }
  for (const [name, expected] of allowed) {
    // ASAR's filesystem traverses using the host path separator, even when
    // verifying a cross-platform package with portable '/' manifest names.
    const bytes = extractFile(archive, path.normalize(name));
    if (bytes.length !== expected.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== expected.sha256) throw new Error(`Packaged source mismatch: ${name}`);
  }
  for (const name of APP_FILES) {
    const bytes = fs.readFileSync(path.join(root, name));
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== allowed.get(name)?.sha256) throw new Error(`Packaged application differs from the current acceptance source: ${name}`);
  }
  const entry = JSON.parse(extractFile(archive, 'package.json').toString('utf8'));
  if (entry.main !== 'browser/main.cjs') throw new Error('Native acceptance must execute the unchanged production package entry point.');
  const build = JSON.parse(extractFile(archive, 'BUILD.json').toString('utf8'));
  for (const key of ['commit', 'worktreeDirty', 'electron', 'packager']) {
    if (build[key] !== packaged[key]) throw new Error(`Embedded build provenance differs from the package manifest: ${key}`);
  }
  const relativeExecutable = packaged.platform === 'win32' ? 'Noxviola.exe' : packaged.platform === 'linux' ? 'Noxviola' : 'Noxviola.app/Contents/MacOS/Noxviola';
  const executable = path.join(directory, relativeExecutable);
  if (!packaged.files.some(file => file.path === relativeExecutable)) throw new Error('Packaged executable is missing from its manifest.');
  return { ...packaged, executable, archive, entry: entry.main };
}

function removeEmptyDependencyScopes(directory) {
  const removed = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    // npm 10 retains empty scopes for omitted development dependencies. Remove
    // only these top-level directory shells in our disposable staging tree;
    // preserve every file and every directory inside an installed package.
    if (!entry.isDirectory() || !entry.name.startsWith('@')) continue;
    const scope = path.join(directory, entry.name);
    if (fs.readdirSync(scope).length !== 0) continue;
    fs.rmdirSync(scope);
    removed.push(entry.name);
  }
  return removed.sort();
}

function stageDependencies(root, destination, temporary) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (!Object.keys(pkg.dependencies || {}).length) return [];
  const dependencyRoot = path.join(temporary, 'production-dependencies');
  fs.mkdirSync(dependencyRoot);
  // npm ci verifies the exact lockfile. Installation scripts are disabled and
  // only production dependencies are installed; the source node_modules tree,
  // user npm configuration, and development dependencies are never copied.
  for (const name of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(root, name), path.join(dependencyRoot, name));
  const args = ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'];
  if (process.env.npm_execpath) {
    execFileSync(process.execPath, [process.env.npm_execpath, ...args], { cwd: dependencyRoot, stdio: 'inherit' });
  } else if (process.platform === 'win32') {
    // Every command token is static; no path or manifest content enters a shell.
    execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm ci --omit=dev --ignore-scripts --no-audit --no-fund'], { cwd: dependencyRoot, stdio: 'inherit' });
  } else execFileSync('npm', args, { cwd: dependencyRoot, stdio: 'inherit' });
  const modules = path.join(dependencyRoot, 'node_modules');
  manifest(modules); // Refuse symlinks and special files before copying.
  const installed = JSON.parse(fs.readFileSync(path.join(modules, '.package-lock.json'), 'utf8'));
  const packages = Object.entries(installed.packages).map(([location, value]) => ({
    path: location, version: value.version, integrity: value.integrity,
  })).sort((a, b) => a.path.localeCompare(b.path));
  const stagedModules = path.join(destination, 'node_modules');
  fs.cpSync(modules, stagedModules, { recursive: true, dereference: false });
  removeEmptyDependencyScopes(stagedModules);
  return packages;
}

function packageTarget(argv = process.argv.slice(2)) {
  const target = { platform: process.platform, arch: process.arch };
  for (let index = 0; index < argv.length; index++) {
    const option = argv[index];
    if (option === '--help') return null;
    if (!['--platform', '--arch', '--receipt'].includes(option) || !argv[index + 1] || argv[index + 1].startsWith('--')) {
      throw new Error(`Unknown or incomplete packaging argument: ${option}`);
    }
    target[option.slice(2)] = argv[++index];
  }
  if (!['linux', 'win32', 'darwin'].includes(target.platform)) throw new Error(`Unsupported preview platform: ${target.platform}`);
  if (!['x64', 'arm64'].includes(target.arch)) throw new Error(`Unsupported preview architecture: ${target.arch}`);
  return target;
}

async function main(argv = process.argv.slice(2)) {
  const options = packageTarget(argv);
  if (!options) {
    console.log('node scripts/package-preview.cjs [--platform linux|win32|darwin] [--arch x64|arm64] [--receipt FILE]\nPackages and verifies the actual ASAR without launching it. Defaults to the current host. A preview is not native acceptance.');
    return;
  }
  const { receipt, ...target } = options;
  const root = path.resolve(__dirname, '..');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'noxviola-package-'));
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    const dirty = !!execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: root, encoding: 'utf8' }).trim();
    const stage = path.join(temporary, 'app');
    const info = stageApp(root, stage, commit, { dirty });
    info.productionPackages = stageDependencies(root, stage, temporary);
    fs.writeFileSync(path.join(stage, 'BUILD.json'), JSON.stringify(info, null, 2) + '\n');
    const expected = manifest(stage);
    const applicationManifestSha256 = crypto.createHash('sha256').update(JSON.stringify(expected)).digest('hex');
    const { packager } = await import('@electron/packager');
    const output = await packager({
      dir: stage, name: 'Noxviola', platform: target.platform, arch: target.arch,
      electronVersion: info.electron, out: path.join(root, 'dist-preview', applicationManifestSha256.slice(0, 16)),
      asar: true, prune: false, overwrite: false,
    });
    if (output.length !== 1) throw new Error('No unique preview was produced. An existing output is preserved; move it aside before packaging again.');
    const packages = [];
    for (const directory of output) {
      const { listPackage, extractFile } = await import('@electron/asar');
      const resources = target.platform === 'darwin' ? path.join(directory, 'Noxviola.app', 'Contents', 'Resources') : path.join(directory, 'resources');
      const archive = path.join(resources, 'app.asar');
      const allowed = new Set(expected.map(file => file.path));
      const listing = listPackage(archive).map(entry => entry.replace(/^[/\\]+/, '').split('\\').join('/'));
      for (const entry of listing) {
        if (!allowed.has(entry) && !expected.some(file => file.path.startsWith(entry + '/'))) throw new Error(`Unexpected packaged application entry: ${entry}`);
      }
      for (const file of expected) {
        const digest = crypto.createHash('sha256').update(extractFile(archive, path.normalize(file.path))).digest('hex');
        if (digest !== file.sha256) throw new Error(`Packaged source mismatch: ${file.path}`);
      }
      const files = manifest(directory);
      fs.writeFileSync(path.join(directory, 'PACKAGE-MANIFEST.json'), JSON.stringify({
        ...info, ...target, applicationManifestSha256, applicationFiles: expected,
        totalBytes: files.reduce((sum, file) => sum + file.bytes, 0), files,
      }, null, 2) + '\n');
      const verified = await verifyPackagedApplication(directory, { root, requireClean: false });
      packages.push({ directory, executable: verified.executable, archive: verified.archive, manifest: verified.manifest, applicationManifestSha256 });
      console.log(`Verified ${expected.length} application/dependency files and ${files.length} complete package files.`);
    }
    if (receipt) {
      const receiptFile = path.resolve(receipt);
      fs.mkdirSync(path.dirname(receiptFile), { recursive: true });
      fs.writeFileSync(receiptFile, JSON.stringify({ schema: 1, ...info, ...target, packages }, null, 2) + '\n', { flag: 'wx' });
      console.log(`Package receipt: ${receiptFile}`);
    }
    console.log('Packaged UNVERIFIED previews only:', output.join(', '));
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { APP_FILES, stageApp, stageDependencies, removeEmptyDependencyScopes, manifest, packageTarget, verifyPackageFiles, verifyPackagedApplication };
