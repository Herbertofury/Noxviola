"use strict";
// Preservation-oriented JSON checkpoints shared by browser services.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {isDeepStrictEqual} = require('node:util');
function fail(message, code = 'INVALID_DATA') {
  const error = new Error(message); error.code = code; return error;
}
function numericValue(token) {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
  let digits = `${match[2]}${match[3] || ''}`.replace(/^0+/, '');
  if (!digits) return '0';
  const trailing = /0*$/.exec(digits)[0].length;
  if (trailing) digits = digits.slice(0, -trailing);
  const exponent = BigInt(match[4] || 0) - BigInt((match[3] || '').length) + BigInt(trailing);
  return `${match[1]}${digits}e${exponent}`;
}
function parse(text) {
  if (Buffer.isBuffer(text) || text instanceof Uint8Array) {
    try { text = new TextDecoder('utf-8', {fatal:true, ignoreBOM:true}).decode(text); }
    catch { throw fail('This file is not valid UTF-8; its original bytes were preserved.', 'UNSUPPORTED_DATA'); }
  }
  if (typeof text !== 'string') throw fail('JSON input must be text or UTF-8 bytes.');
  const value = JSON.parse(text);
  // Grammar is already validated. Check repeated keys, including escaped names,
  // before their overwritten values can become a silently rewritten checkpoint.
  const stack = [];
  for (const match of text.matchAll(/"(?:[^"\\]|\\.)*"|[{}\[\]:,]|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/gs)) {
    const token = match[0], current = stack.at(-1);
    if (token === '{') stack.push({object: true, key: true, keys: new Set()});
    else if (token === '[') stack.push({object: false});
    else if (token === '}' || token === ']') stack.pop();
    else if (token === ':' && current?.object) current.key = false;
    else if (token === ',' && current?.object) current.key = true;
    else if (/^-?\d/.test(token)) {
      const number = Number(token);
      if (!Number.isFinite(number) || numericValue(token) !== numericValue(String(number))) {
        throw fail('A JSON number exceeds this runtime’s exact round-trip range; the original file is preserved.', 'UNSUPPORTED_DATA');
      }
    } else if (token.startsWith('"') && current?.object && current.key) {
      const key = JSON.parse(token);
      if (current.keys.has(key)) throw fail('Duplicate JSON object keys are ambiguous; the original file is preserved.');
      current.keys.add(key);
    }
  }
  return value;
}
function readRegular(file) {
  const expected = fs.lstatSync(file, {bigint:true});
  if (!expected.isFile()) throw fail('Storage must be a regular file, not a link or device.');
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0);
  const fd = fs.openSync(file, flags);
  try {
    const before = fs.fstatSync(fd, {bigint:true});
    if (!before.isFile() || before.dev !== expected.dev || before.ino !== expected.ino) throw fail('The selected file changed before it could be read.', 'STALE_PREVIEW');
    const data = fs.readFileSync(fd), after = fs.fstatSync(fd, {bigint:true});
    if (before.size !== BigInt(data.length) || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
      throw fail('The selected file changed while it was being read. Try again.', 'STALE_PREVIEW');
    }
    return data;
  } finally { fs.closeSync(fd); }
}
function bytes(file) { try { return readRegular(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
function decodeBytes(data, decode) { return decode(parse(data)); }
function inspect(file, decode, empty) {
  const primary = bytes(file), previous = bytes(`${file}.previous`);
  if (!primary && !previous) return {status: 'new', value: empty()};
  let reason = 'The current checkpoint is missing.';
  if (primary) {
    try { return {status: 'ready', value: decodeBytes(primary, decode)}; }
    catch (error) {
      if (['UNSUPPORTED_VERSION', 'UNSUPPORTED_DATA'].includes(error.code)) throw error;
      reason = error.message;
    }
  }
  if (!previous) throw fail(`${reason} No previous checkpoint is available. Existing files were preserved.`, 'RECOVERY_REQUIRED');
  const value = decodeBytes(previous, decode);
  return {status: 'recovery', value, reason, preview: {primary, previous}};
}
function syncDirectory(directory) {
  if (process.platform === 'win32') return;
  const fd = fs.openSync(directory, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function replace(file, data) {
  fs.mkdirSync(path.dirname(file), {recursive: true, mode: 0o700});
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, data); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    fs.renameSync(temporary, file); syncDirectory(path.dirname(file));
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
function write(file, value, decode) {
  const validated = decode(value);
  const serialized = `${JSON.stringify(validated, null, 2)}\n`;
  if (!isDeepStrictEqual(validated, parse(serialized))) throw fail('The checkpoint contains values JSON cannot preserve exactly.');
  const primary = bytes(file), previous = bytes(`${file}.previous`);
  if (previous) decodeBytes(previous, decode);
  if (!primary && previous) throw fail('Restore the previous checkpoint before saving.', 'RECOVERY_REQUIRED');
  if (primary) {
    const existing = decodeBytes(primary, decode);
    if (isDeepStrictEqual(existing, validated)) {
      // Establish the first recoverable copy once; later identical saves keep
      // the actual older checkpoint instead of repeatedly rotating it away.
      if (!previous) replace(`${file}.previous`, primary);
      return {changed: false};
    }
    replace(`${file}.previous`, primary);
  }
  replace(file, serialized);
  return {changed: true};
}
function recover(file, preview, decode) {
  if (!preview || !Buffer.isBuffer(preview.previous)) throw fail('No inspected checkpoint was supplied.');
  const primary = bytes(file), previous = bytes(`${file}.previous`);
  if (!isDeepStrictEqual(primary, preview.primary) || !isDeepStrictEqual(previous, preview.previous)) {
    throw fail('The checkpoint changed after inspection. Reopen recovery before restoring.', 'STALE_PREVIEW');
  }
  const value = decodeBytes(previous, decode);
  let preserved = null;
  if (primary) {
    preserved = `${file}.recovery-${crypto.randomUUID()}`;
    const fd = fs.openSync(preserved, 'wx', 0o600);
    try { fs.writeFileSync(fd, primary); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    syncDirectory(path.dirname(file));
  }
  replace(file, previous);
  return {value, preserved};
}
module.exports = {parse, inspect, write, recover, replace, readRegular, fail};
