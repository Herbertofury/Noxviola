'use strict';

// This view exposes only the existing non-secret Account Atlas. It does not
// store credentials, connect to a password manager, or authenticate a site.
const accountStore = require('./accounts.cjs');

function validCollections(profiles, accounts) {
  if (!Array.isArray(profiles) || !Array.isArray(accounts)) throw new Error('Account data is unavailable.');
}

function sidebarAccountData({identity, profiles, accounts, error = '', recoveryAvailable = false}) {
  validCollections(profiles, accounts);
  if (typeof identity !== 'string' || !profiles.some(profile => profile.id === identity)) throw new Error('Choose an existing browser identity.');
  const problem = typeof error === 'string' ? error : 'Account data is unavailable.';
  return {
    identity,
    status: problem ? (recoveryAvailable ? 'recovery' : 'blocked') : 'ready',
    error: problem,
    recoveryAvailable: Boolean(problem && recoveryAvailable),
    profiles: profiles.map(profile => ({id: profile.id, name: profile.name})),
    items: problem ? [] : accounts.filter(item => item.identity === identity && !item.archived).map(item => ({
      id: item.id, label: item.label, handle: item.handle, origin: item.origin, identity: item.identity,
    })),
  };
}

function sidebarAccountRoute({id, identity, currentIdentity, profiles, accounts, error = ''}) {
  validCollections(profiles, accounts);
  if (error) throw new Error('Account data is unavailable; open the account atlas to resolve it.');
  if (typeof identity !== 'string' || identity !== currentIdentity) throw new Error('The browser identity changed; choose the account again.');
  const item = accounts.find(record => record.id === id && record.identity === identity);
  if (!item) throw new Error('This account is no longer available in the selected identity.');
  return accountStore.route(item, profiles);
}

module.exports = {sidebarAccountData, sidebarAccountRoute};
