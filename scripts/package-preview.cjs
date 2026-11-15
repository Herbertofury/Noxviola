'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const APP_FILES = [
  'browser/main.cjs', 'browser/preload.cjs', 'browser/renderer.js',
  'browser/index.html', 'browser/style.css', 'browser/assets/noxviola.png',
  'browser/capabilities.json', 'browser/state.cjs',
  'browser/storage.cjs', 'browser/session-writer.cjs',
  'browser/permissions.cjs', 'browser/downloads.cjs', 'browser/extensions.cjs',
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
  fs.cpSync(modules, path.join(destination, 'node_modules'), { recursive: true, dereference: false });
  return packages;
}

function packageTarget(argv = process.argv.slice(2)) {
  const target = { platform: process.platform, arch: process.arch };
  for (let index = 0; index < argv.length; index++) {
    const option = argv[index];
    if (option === '--help') return null;
    if (!['--platform', '--arch'].includes(option) || !argv[index + 1] || argv[index + 1].startsWith('--')) {
      throw new Error(`Unknown or incomplete packaging argument: ${option}`);
    }
    target[option.slice(2)] = argv[++index];
  }
  if (!['linux', 'win32', 'darwin'].includes(target.platform)) throw new Error(`Unsupported preview platform: ${target.platform}`);
  if (!['x64', 'arm64'].includes(target.arch)) throw new Error(`Unsupported preview architecture: ${target.arch}`);
  return target;
}

async function main(argv = process.argv.slice(2)) {
  const target = packageTarget(argv);
  if (!target) {
    console.log('node scripts/package-preview.cjs [--platform linux|win32|darwin] [--arch x64|arm64]\nPackages and verifies the actual ASAR without launching it. Defaults to the current host. A preview is not native acceptance.');
    return;
  }
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
        const digest = crypto.createHash('sha256').update(extractFile(archive, file.path)).digest('hex');
        if (digest !== file.sha256) throw new Error(`Packaged source mismatch: ${file.path}`);
      }
      const files = manifest(directory);
      fs.writeFileSync(path.join(directory, 'PACKAGE-MANIFEST.json'), JSON.stringify({
        ...info, ...target, applicationManifestSha256, applicationFiles: expected,
        totalBytes: files.reduce((sum, file) => sum + file.bytes, 0), files,
      }, null, 2) + '\n');
      console.log(`Verified ${expected.length} application/dependency files and ${files.length} complete package files.`);
    }
    console.log('Packaged UNVERIFIED previews only:', output.join(', '));
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { APP_FILES, stageApp, stageDependencies, manifest, packageTarget };
