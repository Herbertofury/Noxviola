'use strict';
// Pure private metadata planning: no HTTP, signup, credentials or account mutation.
const PROVIDERS = Object.freeze({github:Object.freeze({
  origin:'https://github.com',
  profileLookup:'documented-public-api-not-connected',
  availability:'unsupported', ownershipVerification:'unsupported',
  reservation:'prohibited', accountCreation:'human-only-subject-to-terms',
  sources:Object.freeze([
    'https://docs.github.com/en/rest/users/users#get-a-user',
    'https://docs.github.com/en/site-policy/other-site-policies/github-username-policy',
    'https://docs.github.com/en/site-policy/github-terms/github-terms-of-service'
  ]), reviewedAt:'2026-11-16'
}),gitlab:Object.freeze({
  origin:'https://gitlab.com', profileLookup:'documented-public-api-not-connected',
  availability:'unsupported',ownershipVerification:'unsupported', reservation:'policy-review-required',
  accountCreation:'provider-review-required',
  sources:Object.freeze(['https://docs.gitlab.com/api/users/']),reviewedAt:'2026-11-16'
})});
function assert(value,message){if(!value)throw new TypeError(message);}
function keys(value,allowed){assert(value&&typeof value==='object'&&!Array.isArray(value),'Expected metadata object.');assert(Object.keys(value).every(key=>allowed.includes(key)),'Unknown fields refused; never supply credentials or account details.');}
function boundedString(value,max){assert(typeof value==='string'&&value.length>0&&value.length<=max,'Invalid bounded text.');return value;}
function planIdentityHub(input){
  keys(input,['handle','sites','observations','reportedAccounts','now']);
  const handle=boundedString(input.handle,128);
  assert(Array.isArray(input.sites)&&input.sites.length<=100&&input.sites.length>0,'Select between 1 and 100 sites.');
  const sites=input.sites.map(site=>{boundedString(site,64);assert(/^[a-z0-9-]+$/.test(site),'Invalid site identifier.');return site;});
  assert(new Set(sites).size===sites.length,'Repeated site identifiers.');
  assert(Number.isSafeInteger(input.now)&&input.now>=0,'Supply the current timestamp.');
  const observations=input.observations===undefined?[]:input.observations,reported=input.reportedAccounts===undefined?[]:input.reportedAccounts;
  assert(Array.isArray(observations)&&observations.length<=100&&Array.isArray(reported)&&reported.length<=100,'Too many metadata records.');
  const bySite=new Map(),accounts=new Set();
  for(const row of observations){
    keys(row,['site','handle','status','checkedAt']);
    assert(sites.includes(row.site)&&row.handle===handle&&!bySite.has(row.site),'Observation scope mismatch or duplicate.');
    assert(['profile-present','not-found','rate-limited','error'].includes(row.status),'Unsupported observation.');
    assert(Number.isSafeInteger(row.checkedAt)&&row.checkedAt>=0&&row.checkedAt<=input.now,'Invalid observation timestamp.');
    bySite.set(row.site,row);
  }
  for(const row of reported){keys(row,['site','handle']);assert(sites.includes(row.site)&&row.handle===handle&&!accounts.has(row.site),'Account report scope mismatch or duplicate.');accounts.add(row.site);}
  return sites.map(site=>{
    const provider=Object.hasOwn(PROVIDERS,site)?PROVIDERS[site]:undefined,observation=bySite.get(site);
    const stale=Boolean(observation&&input.now-observation.checkedAt>15*60*1000);
    // A caller's normalized public-profile observation is not authenticated
    // ownership, a reservation, or a provider availability assertion.
    const publicPresence=!provider?'unsupported':!observation?'not-checked':stale?'stale':observation.status;
    const ownership=accounts.has(site)?'user-reported-not-verified':'not-recorded';
    return {site,handle,publicPresence,ownership,availability:'unknown',
      reservation:provider?.reservation||'unsupported',
      signup:provider?.accountCreation||'provider-review-required',
      nextStep:!provider?'add-reviewed-provider':accounts.has(site)?'verify-existing-account-with-user':provider.reservation==='prohibited'?'reservation-prohibited-consider-active-use-only':'review-per-site-signup',
      warnings:[...(!provider?['Provider support is missing; no check was performed.']:[]),...(stale?['Observation is stale.']:[]),
        'Public lookup and missing profiles do not prove availability or ownership.',
        'No account was created or reserved. No external request was sent.']};
  });
}
module.exports={PROVIDERS,planIdentityHub};
