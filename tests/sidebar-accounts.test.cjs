'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {sidebarAccountData, sidebarAccountRoute} = require('../browser/sidebar-accounts.cjs');

const profiles = [{id: 'personal', name: 'Personal', privateExtra: 'never expose'}, {id: 'work', name: 'Work'}];
const accounts = [
  {id: 'one', label: 'Personal account', handle: 'me', origin: 'https://example.test', identity: 'personal', archived: false, password: 'must not leak'},
  {id: 'two', label: 'Work account', handle: 'worker', origin: 'https://example.test', identity: 'work', archived: false},
  {id: 'three', label: 'Archived account', handle: '', origin: 'https://archive.test', identity: 'personal', archived: true},
];

test('sidebar exposes only current-identity, non-archived account metadata and safe profile fields', () => {
  const data = sidebarAccountData({identity: 'personal', profiles, accounts});
  assert.equal(data.status, 'ready');
  assert.deepEqual(data.profiles, [{id: 'personal', name: 'Personal'}, {id: 'work', name: 'Work'}]);
  assert.deepEqual(data.items, [{id: 'one', label: 'Personal account', handle: 'me', origin: 'https://example.test', identity: 'personal'}]);
  assert.doesNotMatch(JSON.stringify(data), /must not leak|Work account|Archived account|never expose/);
  assert.deepEqual(sidebarAccountData({identity: 'work', profiles, accounts}).items.map(item => item.id), ['two']);
  assert.throws(() => sidebarAccountData({identity: 'missing', profiles, accounts}), /existing browser identity/);
});

test('unavailable inventory is explicit and does not expose stale rows', () => {
  const data = sidebarAccountData({identity: 'personal', profiles, accounts, error: 'Recovery needed', recoveryAvailable: true});
  assert.equal(data.status, 'recovery'); assert.equal(data.error, 'Recovery needed'); assert.equal(data.recoveryAvailable, true);
  assert.deepEqual(data.items, []);
  assert.equal(sidebarAccountData({identity: 'personal', profiles, accounts, error: 'Unavailable'}).status, 'blocked');
});

test('opening an account rechecks the current identity, archive state and inventory health', () => {
  const clean = accounts.map(({password, ...item}) => item);
  const request = {id: 'one', identity: 'personal', currentIdentity: 'personal', profiles, accounts: clean};
  assert.deepEqual(sidebarAccountRoute(request), {url: 'https://example.test', identity: 'personal'});
  assert.throws(() => sidebarAccountRoute({...request, currentIdentity: 'work'}), /identity changed/);
  assert.throws(() => sidebarAccountRoute({...request, id: 'two'}), /no longer available/);
  assert.throws(() => sidebarAccountRoute({...request, id: 'three'}), /Restore/);
  assert.throws(() => sidebarAccountRoute({...request, error: 'Recovery needed'}), /unavailable/);
  assert.throws(() => sidebarAccountRoute({...request, accounts: [{...clean[0], identity: 'work'}]}), /no longer available/);
});
