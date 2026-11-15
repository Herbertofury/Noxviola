'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const registry = require('../browser/capabilities.json');

function text(value, label) { assert.equal(typeof value, 'string', label); assert.ok(value.trim(), `${label} must not be empty`); }
function unique(items, key, label) {
  const seen = new Set();
  for (const item of items) {
    const value = key(item); text(value, `${label} ID`);
    assert.ok(!seen.has(value), `Duplicate ${label} ID: ${value}`); seen.add(value);
  }
  return seen;
}

test('capability ledger has unique stable records and resolvable primary source references', () => {
  assert.equal(registry.schemaVersion, 1);
  text(registry.inventoryVersion, 'inventory version'); text(registry.auditedAt, 'audit date');
  const sources = unique(registry.sources, source => source.id, 'source');
  unique(registry.capabilities, capability => capability.id, 'capability');
  unique(registry.browsers, browser => browser.id, 'browser');
  unique(registry.discoveryQueue, row => row.id, 'discovery queue');
  for (const source of registry.sources) {
    for (const field of ['url', 'title', 'accessedAt', 'kind', 'versionScope']) text(source[field], `${source.id}.${field}`);
    if (/^https:\/\//.test(source.url)) assert.ok(new URL(source.url).hostname);
    else {
      const local = path.resolve(__dirname, '../browser', source.url);
      assert.ok(local.startsWith(path.resolve(__dirname, '..') + path.sep), `Local source escapes repository: ${source.id}`);
      assert.ok(fs.statSync(local).isFile(), `Missing local source: ${source.id}`);
    }
  }
  function visit(value, location) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (['sourceIds', 'referenceSources'].includes(key)) {
        assert.ok(Array.isArray(child), `${location}.${key}`);
        for (const id of child) assert.ok(sources.has(id), `Unknown source ${id} at ${location}.${key}`);
      } else visit(child, `${location}.${key}`);
    }
  }
  visit(registry, 'registry');
});

test('every capability has renderer-compatible behavior, ownership, options and acceptance fields', () => {
  const browsers = new Set(registry.browsers.map(browser => browser.id));
  const statuses = new Set(Object.keys(registry.statusDefinitions));
  for (const row of registry.capabilities) {
    for (const field of ['name', 'category', 'behavior', 'performance', 'privacy', 'nextAction', 'priority', 'updatedAt']) text(row[field], `${row.id}.${field}`);
    assert.ok(statuses.has(row.noxviola?.status), `${row.id} has an unknown status`);
    for (const field of ['codeOwner', 'integrationStrategy', 'note']) text(row.noxviola[field], `${row.id}.noxviola.${field}`);
    assert.ok(Array.isArray(row.noxviola.paths) && row.noxviola.paths.length, `${row.id} requires code ownership paths`);
    for (const file of row.noxviola.paths) text(file, `${row.id} code path`);
    assert.ok(Array.isArray(row.sourceIds) && row.sourceIds.length, `${row.id} requires source evidence`);
    assert.ok(Array.isArray(row.variants), `${row.id} variants`);
    for (const variant of row.variants) {
      assert.ok(browsers.has(variant.browser), `${row.id} unknown reference browser`);
      text(variant.versionBasis, `${row.id} version basis`); text(variant.availability, `${row.id} availability`);
      assert.ok(typeof variant.options === 'string' || Array.isArray(variant.options), `${row.id} renderer options`);
      for (const option of Array.isArray(variant.options) ? variant.options : [variant.options]) text(option, `${row.id} option`);
    }
    assert.ok(Array.isArray(row.configuration.knownOptions), `${row.id} known options`);
    text(row.configuration.coverage, `${row.id} options coverage`); text(row.configuration.remaining, `${row.id} unresolved options`);
    assert.ok(Array.isArray(row.dependencies), `${row.id} dependencies`);
    assert.ok(Array.isArray(row.acceptanceTests) && row.acceptanceTests.length, `${row.id} acceptance tests`);
    unique(row.acceptanceTests, check => check.id, `${row.id} acceptance`);
    for (const check of row.acceptanceTests) {
      text(check.procedure, `${row.id} acceptance procedure`); text(check.result, `${row.id} acceptance result`);
      assert.ok(Array.isArray(check.evidence), `${row.id} acceptance evidence`);
    }
  }
});

test('verified claims require completed scoped acceptance rather than available source or mock tests', () => {
  for (const row of registry.capabilities) {
    text(row.evidence?.level, `${row.id} evidence level`);
    text(row.evidence?.installedBrowserAudit, `${row.id} installed audit evidence`);
    text(row.evidence?.nativeRuntime, `${row.id} native evidence`);
    if (row.noxviola.status !== 'verified') continue;
    for (const check of row.acceptanceTests) {
      assert.equal(check.result, 'passed', `${row.id} has unfinished acceptance`);
      assert.ok(check.evidence.length, `${row.id} verified claim lacks evidence`);
    }
    assert.equal(row.configuration.coverage, 'complete', `${row.id} verified contract still has partial configuration coverage`);
  }
  if (!registry.coverage.complete) assert.notEqual(registry.acceptanceGates.G002, 'passed', 'An incomplete audit cannot pass the full inventory gate');
  for (const browser of registry.browsers) {
    if (browser.installedAudit.startsWith('unresolved')) assert.equal(browser.installedVersion, null, 'Documentation versions must not masquerade as installed versions');
  }
});

test('searchable Markdown index retains every capability and the same current status', () => {
  const markdown = fs.readFileSync(path.join(__dirname, '../docs/browser-capabilities-index.md'), 'utf8');
  for (const row of registry.capabilities) {
    const line = markdown.split('\n').find(value => value.startsWith(`| ${row.id} |`));
    assert.ok(line, `Index omitted ${row.id}`);
    assert.ok(line.includes(`| ${row.noxviola.status} |`), `Index status drift for ${row.id}`);
  }
});
