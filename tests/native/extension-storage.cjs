'use strict';
// Test-only native acceptance. This calls the installed fixture's existing
// chrome.storage API; it does not provide an API implementation or ship in ASAR.
const assert = require('node:assert/strict');
const path = require('node:path');
const { readContext } = require('../../scripts/native-smoke.cjs');

const AREAS = ['local', 'sync'];
function storageSources() {
  const electron = process.versions.electron;
  const chromium = process.versions.chrome;
  const documented = {'45.3.2':'156.0.8078.100', '45.5.0':'156.0.8078.109'};
  assert.equal(chromium, documented[electron], 'Native storage documentation must match the observed engine pair');
  return [
    `https://github.com/electron/electron/blob/v${electron}/docs/api/extensions.md#chromestorage`,
    `https://github.com/electron/electron/blob/v${electron}/shell/browser/extensions/api/storage/electron_sync_value_store_cache.cc`,
    `https://github.com/electron/electron/blob/v${electron}/shell/browser/extensions/api/storage/electron_managed_value_store_cache.cc`,
    `https://github.com/chromium/chromium/blob/${chromium}/extensions/common/api/storage.json`,
    `https://github.com/chromium/chromium/blob/${chromium}/extensions/browser/api/storage/storage_api.cc`,
    `https://github.com/chromium/chromium/blob/${chromium}/extensions/browser/api/storage/storage_frontend.cc`,
    `https://github.com/chromium/chromium/blob/${chromium}/extensions/browser/api/storage/settings_storage_quota_enforcer.cc`,
  ];
}
const DEFAULTS = { shared: 'unused default', nullValue: 'unused default', falseValue: true, zero: 9, empty: 'unused default', missing: { fallback: true } };
const MANAGED_DEFAULTS = { shared: 'managed query default', nullValue: null, falseValue: false, zero: 0, empty: '', missing: { fallback: true } };
const MANAGED_READ_ONLY_ERROR = 'This is a read-only store.';

function managedAttempt(identity, token) {
  return { shared: { identity, token, area: 'managed', forbiddenWrite: true }, managedOnly: token };
}

function storageValues(identity, token, area, revision = 1) {
  assert.ok(typeof identity === 'string' && identity);
  assert.ok(typeof token === 'string' && token);
  assert.ok(AREAS.includes(area));
  return {
    shared: { identity, token, area, revision, nested: ['generated', null, false, 0] },
    quotaPrior: `${identity}:${area}:retained`,
    nullValue: null, falseValue: false, zero: 0, empty: '',
  };
}

function storageBytes(values) {
  return Object.entries(values).reduce((sum, [key, value]) => sum + Buffer.byteLength(key) + Buffer.byteLength(JSON.stringify(value)), 0);
}

function expectedEvents(identity, token) {
  const events = [];
  for (const areaName of AREAS) {
    const first = storageValues(identity, token, areaName);
    const final = storageValues(identity, token, areaName, 2);
    const transient = { identity, area: areaName, token };
    events.push({ areaName, changes: Object.fromEntries(Object.entries(first).map(([key, newValue]) => [key, { newValue }])) });
    events.push({ areaName, changes: { shared: { oldValue: first.shared, newValue: final.shared } } });
    events.push({ areaName, changes: { transient: { newValue: transient } } });
    events.push({ areaName, changes: { transient: { oldValue: transient } } });
  }
  events.push({ areaName: 'sync', changes: { quotaSignal: { newValue: token } } });
  events.push({ areaName: 'sync', changes: { quotaSignal: { oldValue: token } } });
  return events;
}

// This function is serialized into a committed fixture background document.
// Its only inputs are generated values and the expected native runtime ID.
// Native callbacks and real onChanged notifications are each observed once;
// deadlines turn a missing callback/event into failure, never another attempt.
async function nativeStorageExercise(input) {
  const record = { version: 2, mode: input.mode, identity: input.identity, runtimeId: input.runtimeId, completed: false, areas: {}, events: [] };
  let listener;
  let pendingEvent;
  let activeStep = 'native context';
  const failure = error => ({ name: String(error?.name || typeof error), message: String(error?.message || error), stack: String(error?.stack || '') });
  const copy = value => JSON.parse(JSON.stringify(value));
  const native = (area, method, args) => new Promise((resolve, reject) => {
    const label = `${area}.${method}`;
    const deadline = setTimeout(() => reject(new Error(`Native ${label} did not invoke its callback`)), 10_000);
    try {
      chrome.storage[area][method](...args, value => {
        // runtime.lastError exists only inside the native callback.
        const error = chrome.runtime.lastError?.message || null;
        clearTimeout(deadline);
        resolve({ error, value: value === undefined ? null : value });
      });
    } catch (error) { clearTimeout(deadline); reject(error); }
  });
  const call = async (area, method, args) => {
    const outcome = await native(area, method, args);
    if (outcome.error) throw new Error(`Native ${area}.${method}: ${outcome.error}`);
    return outcome.value;
  };
  const mutate = async (area, method, args, label) => {
    activeStep = label;
    let deadline;
    const changed = new Promise((resolve, reject) => {
      pendingEvent = resolve;
      deadline = setTimeout(() => reject(new Error(`Native storage.onChanged did not report ${label}`)), 10_000);
    });
    try { await Promise.all([call(area, method, args), changed]); }
    finally { clearTimeout(deadline); pendingEvent = null; }
  };
  const managedSnapshot = async () => ({
    all: await call('managed', 'get', [null]),
    keys: await call('managed', 'getKeys', []),
    bytes: await call('managed', 'getBytesInUse', [null]),
  });
  const exerciseManaged = async () => {
    // local and sync already hold different real values when this runs. An
    // alias to either writable namespace therefore cannot look like an empty
    // managed area. No policy is installed or simulated by the fixture.
    const data = record.managed = { queries: {}, bytes: {}, rejections: [] };
    for (const [name, args] of [
      ['all', [null]], ['omitted', []], ['single', ['shared']],
      ['array', [['shared', 'nullValue', 'missing']]], ['defaults', [input.managedDefaults]],
      ['emptyArray', [[]]], ['emptyObject', [{}]], ['missing', ['missing']],
    ]) {
      activeStep = `managed ${name} query`;
      data.queries[name] = await call('managed', 'get', args);
    }
    activeStep = 'managed native key enumeration';
    data.keys = await call('managed', 'getKeys', []);
    for (const [name, args] of [['all', [null]], ['omitted', []], ['single', ['shared']], ['array', [['shared', 'missing']]], ['emptyArray', [[]]]]) {
      activeStep = `managed ${name} byte count`;
      data.bytes[name] = await call('managed', 'getBytesInUse', args);
    }
    activeStep = 'managed defaults do not persist';
    data.afterDefaults = await managedSnapshot();
    for (const [method, args] of [['set', [input.managedAttempt]], ['remove', [['shared', 'quotaPrior', 'missing']]], ['clear', []]]) {
      activeStep = `managed ${method} read-only rejection`;
      const rejected = { method, args: copy(args), ...await native('managed', method, args) };
      data.rejections.push(rejected);
      rejected.after = await managedSnapshot();
    }
    activeStep = 'managed rejection preserves the real writable namespaces';
    data.otherAreas = {};
    for (const area of ['local', 'sync']) data.otherAreas[area] = await call(area, 'get', [null]);
    data.final = await managedSnapshot();
  };
  try {
    if (document.readyState !== 'complete' || location.protocol !== 'chrome-extension:' || location.hostname !== input.runtimeId || chrome.runtime.id !== input.runtimeId) {
      throw new Error('Storage proof requires the exact committed native extension document');
    }
    if (!chrome.runtime.getManifest().permissions?.includes('storage')) throw new Error('The installed fixture must explicitly request storage');
    for (const area of ['local', 'sync']) {
      for (const method of ['get', 'set', 'remove', 'getBytesInUse']) {
        if (typeof chrome.storage?.[area]?.[method] !== 'function') throw new Error(`Native storage.${area}.${method} is absent`);
      }
    }
    for (const method of ['get', 'getKeys', 'getBytesInUse', 'set', 'remove', 'clear']) {
      if (typeof chrome.storage?.managed?.[method] !== 'function') throw new Error(`Native storage.managed.${method} is absent`);
    }
    if (typeof chrome.storage.onChanged?.addListener !== 'function') throw new Error('Native storage.onChanged is absent');
    record.document = { url: location.href, origin: location.origin, readyState: document.readyState, runtimeId: chrome.runtime.id };
    record.constants = Object.fromEntries(['QUOTA_BYTES', 'QUOTA_BYTES_PER_ITEM', 'MAX_ITEMS', 'MAX_WRITE_OPERATIONS_PER_MINUTE', 'MAX_WRITE_OPERATIONS_PER_HOUR'].map(key => [key, chrome.storage.sync[key] ?? null]));
    listener = (changes, areaName) => {
      record.events.push(copy({ areaName, changes }));
      if (pendingEvent) pendingEvent();
    };
    chrome.storage.onChanged.addListener(listener);
    if (input.mode === 'read') {
      for (const area of ['local', 'sync']) {
        activeStep = `read persisted ${area}`;
        record.areas[area] = { all: await call(area, 'get', [null]), bytes: await call(area, 'getBytesInUse', [null]) };
      }
      await exerciseManaged();
      record.completed = true;
      return record;
    }
    if (input.mode !== 'exercise') throw new Error('Unknown native storage proof operation');
    for (const area of ['local', 'sync']) {
      const data = record.areas[area] = {};
      const values = input.values[area];
      activeStep = `fresh ${area} query semantics`;
      data.initial = await call(area, 'get', [null]);
      data.initialDefaults = await call(area, 'get', [input.defaults]);
      data.afterDefaults = await call(area, 'get', [null]);
      await mutate(area, 'set', [values], `${area} initial write`);
      activeStep = `${area} stored query semantics`;
      data.queries = {
        all: await call(area, 'get', [null]),
        omitted: await call(area, 'get', []),
        single: await call(area, 'get', ['shared']),
        array: await call(area, 'get', [['shared', 'nullValue', 'missing']]),
        defaults: await call(area, 'get', [input.defaults]),
        emptyArray: await call(area, 'get', [[]]),
        emptyObject: await call(area, 'get', [{}]),
        missing: await call(area, 'get', ['missing']),
      };
      await mutate(area, 'set', [{ shared: { ...values.shared, revision: 2 } }], `${area} existing value update`);
      const transient = { identity: input.identity, area, token: input.token };
      await mutate(area, 'set', [{ transient }], `${area} temporary value write`);
      await mutate(area, 'remove', [['transient', 'missing']], `${area} existing and absent value removal`);
      activeStep = `${area} final read`;
      data.final = await call(area, 'get', [null]);
      data.bytes = await call(area, 'getBytesInUse', [null]);
    }
    await exerciseManaged();
    activeStep = 'sync per-item quota rejection';
    const limit = record.constants.QUOTA_BYTES_PER_ITEM;
    // The candidate's pinned Chromium schema documents this exact boundary.
    // Refuse an unexpected limit rather than allocating an unbounded payload.
    if (limit !== 8192) throw new Error(`Unexpected native sync per-item quota: ${limit}`);
    const oversized = 'x'.repeat(limit);
    record.quota = {
      before: await call('sync', 'get', [null]),
      beforeBytes: await call('sync', 'getBytesInUse', [null]),
      attempted: { key: 'quotaPrior', stringBytes: oversized.length, itemBytes: 'quotaPrior'.length + JSON.stringify(oversized).length, siblingKey: 'shared' },
    };
    const rejected = await native('sync', 'set', [{ quotaPrior: oversized, shared: { forbiddenPartialWrite: true } }]);
    record.quota.error = rejected.error;
    record.quota.after = await call('sync', 'get', [null]);
    record.quota.afterBytes = await call('sync', 'getBytesInUse', [null]);
    // A later successful native event is a real completion barrier, and proves
    // the rejected call did not disable subsequent valid writes or events.
    await mutate('sync', 'set', [{ quotaSignal: input.token }], 'sync valid write after quota rejection');
    await mutate('sync', 'remove', ['quotaSignal'], 'sync cleanup after quota rejection');
    activeStep = 'final separate namespace reads';
    record.final = {};
    for (const area of ['local', 'sync']) record.final[area] = await call(area, 'get', [null]);
    record.managed.final = await managedSnapshot();
    record.completed = true;
  } catch (error) { record.failure = { step: activeStep, ...failure(error) }; }
  finally {
    if (listener) {
      chrome.storage.onChanged.removeListener(listener);
      record.listenerRemoved = !chrome.storage.onChanged.hasListener(listener);
    }
  }
  return record;
}

function assertNativeStorage(record, { identity, runtimeId, token, mode }) {
  assert.equal(record.version, 2);
  assert.equal(record.identity, identity); assert.equal(record.runtimeId, runtimeId); assert.equal(record.mode, mode);
  assert.equal(record.completed, true, `Actual native extension storage failed: ${JSON.stringify(record.failure || record)}`);
  assert.equal(record.document.runtimeId, runtimeId);
  assert.equal(new URL(record.document.url).hostname, runtimeId);
  assert.equal(new URL(record.document.url).protocol, 'chrome-extension:');
  assert.equal(record.document.readyState, 'complete');
  assert.equal(record.constants.QUOTA_BYTES_PER_ITEM, 8192);
  const final = Object.fromEntries(AREAS.map(area => [area, storageValues(identity, token, area, 2)]));
  const managed = record.managed;
  assert.ok(managed, 'Actual managed storage evidence is required');
  assert.deepEqual(Object.keys(managed.queries).sort(), ['all', 'omitted', 'single', 'array', 'defaults', 'emptyArray', 'emptyObject', 'missing'].sort());
  for (const [name, value] of Object.entries(managed.queries)) assert.deepEqual(value, name === 'defaults' ? MANAGED_DEFAULTS : {}, `Native managed ${name} query must reflect an empty store`);
  assert.deepEqual(managed.keys, [], 'Native managed key enumeration must be empty');
  assert.deepEqual(managed.bytes, { all: 0, omitted: 0, single: 0, array: 0, emptyArray: 0 });
  const emptyManaged = { all: {}, keys: [], bytes: 0 };
  assert.deepEqual(managed.afterDefaults, emptyManaged, 'Managed query defaults must not become stored policy');
  assert.deepEqual(managed.rejections.map(({ method, args }) => ({ method, args })), [
    { method: 'set', args: [managedAttempt(identity, token)] },
    { method: 'remove', args: [['shared', 'quotaPrior', 'missing']] },
    { method: 'clear', args: [] },
  ], 'Every native managed mutation must actually be attempted once with the generated inputs');
  for (const rejected of managed.rejections) {
    assert.equal(rejected.error, MANAGED_READ_ONLY_ERROR, `Native managed ${rejected.method} must report its real read-only error, not an unavailable backend or quota error`);
    assert.equal(rejected.value, null, 'A rejected managed mutation must not report a value');
    assert.deepEqual(rejected.after, emptyManaged, `Managed storage must stay empty after ${rejected.method}`);
  }
  assert.deepEqual(managed.final, emptyManaged);
  assert.deepEqual(managed.otherAreas, final, 'Failed managed mutations must preserve both complete writable namespaces');
  for (const area of AREAS) {
    const observed = record.areas[area];
    if (mode === 'read') {
      assert.deepEqual(observed.all, final[area], `${area} must retain this identity's complete native values`);
      assert.equal(observed.bytes, storageBytes(final[area]));
      continue;
    }
    const first = storageValues(identity, token, area);
    assert.deepEqual(observed.initial, {}, `${area} in a fresh identity must not inherit the other identity's extension data`);
    assert.deepEqual(observed.initialDefaults, DEFAULTS);
    assert.deepEqual(observed.afterDefaults, {}, 'Default query values must not be stored');
    assert.deepEqual(observed.queries.all, first);
    assert.deepEqual(observed.queries.omitted, first);
    assert.deepEqual(observed.queries.single, { shared: first.shared });
    assert.deepEqual(observed.queries.array, { shared: first.shared, nullValue: null });
    assert.deepEqual(observed.queries.defaults, { ...DEFAULTS, ...Object.fromEntries(Object.keys(DEFAULTS).filter(key => Object.hasOwn(first, key)).map(key => [key, first[key]])) });
    for (const query of ['emptyArray', 'emptyObject', 'missing']) assert.deepEqual(observed.queries[query], {});
    assert.deepEqual(observed.final, final[area]); assert.equal(observed.bytes, storageBytes(final[area]));
  }
  assert.equal(record.listenerRemoved, true, 'The test must remove its native event observer');
  if (mode === 'read') {
    assert.deepEqual(record.events, [], 'Managed reads and rejected writes must not emit successful change events');
    return final;
  }
  assert.deepEqual(record.events, expectedEvents(identity, token), 'Actual onChanged area, old/new payload and event sequence must match the native mutations exactly');
  assert.deepEqual(record.final, final, 'Local and sync must remain separate after all native operations');
  assert.match(record.quota.error || '', /quota.*exceed|exceed.*quota/i, 'An oversized native write must reject through runtime.lastError');
  assert.match(record.quota.error, /quota_?bytes_?per_?item/i, 'The real rejection must identify the per-item byte quota, not an unrelated failure');
  assert.deepEqual(record.quota.attempted, { key: 'quotaPrior', stringBytes: 8192, itemBytes: 8204, siblingKey: 'shared' });
  assert.deepEqual(record.quota.before, final.sync);
  assert.deepEqual(record.quota.after, record.quota.before, 'Rejected multi-key quota write must preserve every prior value without partial mutation');
  assert.equal(record.quota.beforeBytes, storageBytes(final.sync));
  assert.equal(record.quota.afterBytes, record.quota.beforeBytes);
  return final;
}

function createExtensionStorage({ context, result, backgroundPages, partitionFor }) {
  assert.ok(process.versions.electron, 'Native extension storage acceptance requires actual Electron');
  const marker = readContext(path.join(context.directory, 'config.json'));
  assert.equal(marker.token, context.token); assert.equal(marker.profile, context.profile);
  const evidence = result.extensionStorage = {
    source: 'Actual chrome.storage in the installed synthetic MV2 extension background documents',
    semantics: 'Separate local and sync disk namespaces; managed is empty and read-only with no enterprise policy provider. No cross-device transport is provided or claimed',
    scope: 'Same-candidate normal restart, two identity Sessions, native callbacks and onChanged, query defaults, atomic per-item quota rejection, and actual managed reads/keys/byte counts plus rejected set/remove/clear without changing local or sync. Enterprise policy loading/updates, rate quotas, service workers, content-script storage behavior and data deletion on uninstall are not qualified by this helper.',
    documentation: storageSources(), contexts: [], runs: [],
  };
  function contexts(expected) {
    const identities = [expected.personalIdentity, expected.secondIdentity];
    assert.notEqual(identities[0], identities[1]);
    const pages = identities.map(identity => {
      const runtimeId = expected.bridgeRuntimeIds[identity];
      const partition = partitionFor(identity);
      const loaded = partition.extensions.getExtension(runtimeId);
      assert.ok(loaded?.manifest?.permissions?.includes('storage'), 'The actually loaded fixture must declare storage');
      const candidates = backgroundPages(runtimeId, identity).filter(page => !page.isDestroyed());
      assert.equal(candidates.length, 1, 'Select exactly one actual background for this identity and runtime');
      const page = candidates[0];
      assert.equal(page.session, partition);
      assert.equal(page.isLoadingMainFrame(), false, 'The background must have committed before native inspection');
      assert.ok(page.mainFrame.url.startsWith(`chrome-extension://${runtimeId}/`));
      evidence.contexts.push({ identity, runtimeId, webContentsId: page.id, type: page.getType(), url: page.mainFrame.url, storagePath: partition.getStoragePath() });
      return { identity, runtimeId, page, partition };
    });
    assert.equal(pages[0].runtimeId, pages[1].runtimeId, 'Identity isolation must use the same native extension ID, not different packages');
    assert.notEqual(pages[0].partition, pages[1].partition, 'Identity isolation requires distinct actual Electron Sessions');
    assert.notEqual(pages[0].partition.getStoragePath(), pages[1].partition.getStoragePath());
    return pages;
  }
  async function run(target, mode, stage) {
    const input = { identity: target.identity, runtimeId: target.runtimeId, token: context.token, mode, defaults: DEFAULTS,
      managedDefaults: MANAGED_DEFAULTS, managedAttempt: managedAttempt(target.identity, context.token),
      values: Object.fromEntries(AREAS.map(area => [area, storageValues(target.identity, context.token, area)])) };
    const entry = { stage, identity: target.identity, runtimeId: target.runtimeId };
    evidence.runs.push(entry);
    entry.observed = await target.page.executeJavaScript(`(${nativeStorageExercise.toString()})(${JSON.stringify(input)})`);
    return assertNativeStorage(entry.observed, input);
  }
  return {
    async firstLaunch(expected) {
      const targets = contexts(expected);
      const saved = { version: 1, token: context.token, packageId: expected.bridgeId, identities: [] };
      // The second identity starts after the first has durable native values.
      // Its empty reads and the final re-read of the first prove both directions.
      for (const target of targets) saved.identities.push({ identity: target.identity, runtimeId: target.runtimeId, values: await run(target, 'exercise', 'before-normal-close') });
      for (const target of targets) await run(target, 'read', 'after-both-identity-writes');
      evidence.expectedRestart = saved;
      return saved;
    },
    async afterRestart(expected, saved) {
      assert.equal(saved.version, 1); assert.equal(saved.token, context.token); assert.equal(saved.packageId, expected.bridgeId);
      const targets = contexts(expected);
      assert.deepEqual(saved.identities.map(({ identity, runtimeId }) => ({ identity, runtimeId })), targets.map(({ identity, runtimeId }) => ({ identity, runtimeId })));
      for (const target of targets) {
        const observed = await run(target, 'read', 'after-normal-process-restart');
        assert.deepEqual(observed, saved.identities.find(item => item.identity === target.identity).values, 'The native restart must retain the exact saved complete namespace contents');
      }
      evidence.expectedRestart = saved;
    },
  };
}

module.exports = { createExtensionStorage, assertNativeStorage, storageValues, storageBytes, expectedEvents, DEFAULTS, MANAGED_DEFAULTS, MANAGED_READ_ONLY_ERROR, managedAttempt };
