'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createExtensionStorage, assertNativeStorage, storageValues, storageBytes, expectedEvents, DEFAULTS,
} = require('./native/extension-storage.cjs');

// Portable tests of receipt refusal rules only. These data objects are not
// runtime evidence; actual API execution occurs solely in the hosted native gate.
const binding = { identity: 'personal', runtimeId: 'a'.repeat(32), token: 'generated-contract-token', mode: 'exercise' };
function receipt() {
  const final = Object.fromEntries(['local', 'sync'].map(area => [area, storageValues(binding.identity, binding.token, area, 2)]));
  const record = {
    version: 1, ...binding, completed: true,
    document: { url: `chrome-extension://${binding.runtimeId}/_generated_background_page.html`, origin: `chrome-extension://${binding.runtimeId}`, runtimeId: binding.runtimeId, readyState: 'complete' },
    constants: { QUOTA_BYTES: 102400, QUOTA_BYTES_PER_ITEM: 8192, MAX_ITEMS: 512, MAX_WRITE_OPERATIONS_PER_MINUTE: 120, MAX_WRITE_OPERATIONS_PER_HOUR: 1800 },
    areas: {}, events: expectedEvents(binding.identity, binding.token), final, listenerRemoved: true,
    quota: { before: structuredClone(final.sync), after: structuredClone(final.sync), beforeBytes: storageBytes(final.sync), afterBytes: storageBytes(final.sync), error: 'Resource::kQuotaBytesPerItem quota exceeded',
      attempted: { key: 'quotaPrior', stringBytes: 8192, itemBytes: 8204, siblingKey: 'shared' } },
  };
  for (const area of ['local', 'sync']) {
    const first = storageValues(binding.identity, binding.token, area);
    record.areas[area] = {
      initial: {}, initialDefaults: structuredClone(DEFAULTS), afterDefaults: {},
      queries: { all: first, omitted: structuredClone(first), single: { shared: first.shared }, array: { shared: first.shared, nullValue: null },
        defaults: { shared: first.shared, nullValue: null, falseValue: false, zero: 0, empty: '', missing: { fallback: true } }, emptyArray: {}, emptyObject: {}, missing: {} },
      final: structuredClone(final[area]), bytes: storageBytes(final[area]),
    };
  }
  return record;
}

test('native storage helper cannot turn a Node-only contract into runtime acceptance', () => {
  assert.throws(() => createExtensionStorage({}), /requires actual Electron/);
  const record = receipt();
  assert.doesNotThrow(() => assertNativeStorage(record, binding));
  record.completed = false;
  record.failure = { step: 'fresh sync query semantics', message: '"sync" is not available in this instance of Chrome' };
  assert.throws(() => assertNativeStorage(record, binding), /not available in this instance/);
});

test('native storage receipt rejects namespace aliasing, foreign identity values and incorrect defaults', () => {
  for (const mutate of [
    record => { record.areas.sync.initial = { shared: storageValues('other', binding.token, 'sync').shared }; },
    record => { record.final.sync = structuredClone(record.final.local); },
    record => { record.areas.sync.queries.defaults.nullValue = 'unused default'; },
    record => { record.areas.local.queries.defaults.falseValue = true; },
    record => { record.areas.sync.afterDefaults = structuredClone(DEFAULTS); },
    record => { record.areas.sync.queries.array.missing = null; },
  ]) {
    const record = receipt(); mutate(record);
    assert.throws(() => assertNativeStorage(record, binding));
  }
});

test('native change evidence rejects wrong area, missing old values, spurious quota events and observer leaks', () => {
  for (const mutate of [
    record => { record.events[0].areaName = 'sync'; },
    record => { delete record.events[1].changes.shared.oldValue; },
    record => { record.events[3].changes.transient.newValue = null; },
    record => { record.events.splice(8, 0, { areaName: 'sync', changes: { shared: { newValue: { forbiddenPartialWrite: true } } } }); },
    record => { record.events.pop(); },
    record => { record.listenerRemoved = false; },
  ]) {
    const record = receipt(); mutate(record);
    assert.throws(() => assertNativeStorage(record, binding), /onChanged|observer/);
  }
});

test('quota acceptance requires the native per-item error and exact prior-value preservation', () => {
  for (const mutate of [
    record => { record.quota.error = null; },
    record => { record.quota.error = 'MAX_WRITE_OPERATIONS_PER_MINUTE quota exceeded'; },
    record => { record.quota.error = 'Storage backend unavailable'; },
    record => { record.quota.after.shared = { forbiddenPartialWrite: true }; },
    record => { delete record.quota.after.quotaPrior; },
    record => { record.quota.afterBytes++; },
  ]) {
    const record = receipt(); mutate(record);
    assert.throws(() => assertNativeStorage(record, binding));
  }
});

test('restart evidence requires both complete native namespaces from the exact identity and runtime', () => {
  const full = receipt();
  const record = { ...full, mode: 'read', areas: Object.fromEntries(['local', 'sync'].map(area => [area, { all: structuredClone(full.final[area]), bytes: storageBytes(full.final[area]) }])) };
  const readBinding = { ...binding, mode: 'read' };
  assert.doesNotThrow(() => assertNativeStorage(record, readBinding));
  for (const mutate of [
    value => { value.areas.sync.all = {}; },
    value => { value.areas.sync.all = structuredClone(value.areas.local.all); },
    value => { value.areas.local.all.shared.identity = 'foreign'; },
    value => { value.runtimeId = 'b'.repeat(32); },
    value => { value.document.url = `https://${binding.runtimeId}/`; },
  ]) {
    const changed = structuredClone(record); mutate(changed);
    assert.throws(() => assertNativeStorage(changed, readBinding));
  }
});
