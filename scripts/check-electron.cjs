'use strict';
// Inspect the pinned distribution as files. Never require Electron's lazy
// loader or execute its binary: provisioning and native acceptance are separate.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { electronExecutable } = require('./native-smoke.cjs');

const expectedVersion = require('../package.json').devDependencies.electron;
const packageFile = require.resolve('electron/package.json');
const directory = path.dirname(packageFile);
const installedVersion = JSON.parse(fs.readFileSync(packageFile, 'utf8')).version;
assert.equal(installedVersion, expectedVersion, 'Installed Electron npm package must match the pinned version');
const executable = electronExecutable();
const distributionVersion = fs.readFileSync(path.join(directory, 'dist', 'version'), 'utf8').trim().replace(/^v/, '');
assert.equal(distributionVersion, expectedVersion, 'Downloaded Electron distribution must match the pinned version; run npm run setup:electron');
const expectedRelative = process.platform === 'win32' ? 'electron.exe' : process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : 'electron';
assert.equal(executable, path.join(directory, 'dist', expectedRelative), 'Electron distribution must match the host platform');
const info = fs.lstatSync(executable);
assert.ok(info.isFile() && info.size > 0, 'Electron executable must be a nonempty regular file');
console.log(JSON.stringify({
  installedVersion, distributionVersion, executable,
  bytes: info.size, sha256: crypto.createHash('sha256').update(fs.readFileSync(executable)).digest('hex'),
  runtimeExecuted: false,
}, null, 2));
