'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {planIdentityHub}=require('../browser/identity-hub-plan.cjs');
const input=()=>({handle:'synthetic-name',sites:['github','unreviewed-site'],now:1000000,observations:[],reportedAccounts:[]});
test('unknown providers explicitly need support, not invented availability',()=>{const p=planIdentityHub(input());assert.equal(p[1].nextStep,'add-reviewed-provider');assert.equal(p[1].availability,'unknown');});
test('GitHub reservation is prohibited and creation is human-only',()=>{const p=planIdentityHub(input())[0];assert.equal(p.reservation,'prohibited');assert.equal(p.signup,'human-only-subject-to-terms');});
test('404-like and error states never claim available or owned',()=>{for(const status of ['not-found','rate-limited','error','profile-present']){const i=input();i.observations=[{site:'github',handle:i.handle,status,checkedAt:i.now}];const p=planIdentityHub(i)[0];assert.equal(p.availability,'unknown');assert.equal(p.ownership,'not-recorded');}});
test('self-reported account is never promoted to verified ownership',()=>{const i=input();i.reportedAccounts=[{site:'github',handle:i.handle}];assert.equal(planIdentityHub(i)[0].ownership,'user-reported-not-verified');});
test('stale and future observations cannot appear fresh',()=>{const i=input();i.observations=[{site:'github',handle:i.handle,status:'profile-present',checkedAt:1}];assert.equal(planIdentityHub(i)[0].publicPresence,'stale');i.observations[0].checkedAt=i.now+1;assert.throws(()=>planIdentityHub(i),/timestamp/);});
test('credentials, duplicate scopes, wrong handles and large inputs rejected',()=>{
 const i=input();i.password='never';assert.throws(()=>planIdentityHub(i),/Unknown/);
 const j=input();j.sites=['github','github'];assert.throws(()=>planIdentityHub(j),/Repeated/);
 const k=input();k.observations=[{site:'github',handle:'different',status:'not-found',checkedAt:k.now}];assert.throws(()=>planIdentityHub(k),/scope/);
 const l=input();l.sites=Array(101).fill('github');assert.throws(()=>planIdentityHub(l),/100/);
});
test('input remains unchanged and no transport instructions are returned',()=>{const i=input(),before=JSON.stringify(i);const p=planIdentityHub(i);assert.equal(JSON.stringify(i),before);assert.ok(p.every(row=>!('request' in row)&&!('credentials' in row)));});

test('GitLab lookup research is not permission for signup or reservation',()=>{const i=input();i.sites=['gitlab'];const p=planIdentityHub(i)[0];assert.equal(p.reservation,'policy-review-required');assert.equal(p.signup,'provider-review-required');assert.equal(p.availability,'unknown');});
test('inherited object names never become supported sites',()=>{const i=input();i.sites=['constructor'];assert.equal(planIdentityHub(i)[0].nextStep,'add-reviewed-provider');});

test('explicit malformed optional arrays are not silently treated as missing',()=>{for(const field of ['observations','reportedAccounts'])for(const value of [null,false,0,''])assert.throws(()=>planIdentityHub({...input(),[field]:value}),/metadata/);});
