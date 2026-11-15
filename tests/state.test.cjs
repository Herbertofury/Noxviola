'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {address,httpUrl,cleanState,readState,saveState,inspectState,recoverState}=require('../browser/state.cjs');

function identityFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nox-identity-alias-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  return path.join(directory, 'session.json');
}
function identityDocument(profiles, identities = []) {
  return {version: 1, profiles: profiles.map(id => ({id, name: id})),
    tabs: identities.map((identity, index) => ({id: `tab-${index}`, identity, url: 'https://example.com/'}))};
}

test('case-distinct explicit identity IDs cannot share an Electron disk partition', () => {
  for (const ids of [['Work', 'work'], ['CREATOR_One', 'creator_one'], ['A-B', 'a-b']]) {
    const input = identityDocument(ids, ids), before = structuredClone(input);
    for (const strict of [false, true]) assert.throws(() => cleanState(input, {strict}), {code: 'UNSUPPORTED_DATA'});
    assert.deepEqual(input, before, 'Rejected IDs must not be lowercased, merged or remapped');
  }
});

test('automatic personal and legacy inferred identities participate in partition-alias validation', () => {
  const inputs = [identityDocument(['Personal']), identityDocument(['PERSONAL'], ['PERSONAL']),
    identityDocument([], ['Personal']), identityDocument([], ['Work', 'work']), identityDocument(['Work'], ['work'])];
  for (const input of inputs) {
    const before = structuredClone(input);
    for (const strict of [false, true]) assert.throws(() => cleanState(input, {strict}), {code: 'UNSUPPORTED_DATA'});
    assert.deepEqual(input, before);
  }
});

test('unambiguous uppercase identity IDs retain their spelling and metadata across restart', t => {
  const file = identityFixture(t);
  const input = identityDocument(['Work', 'Creator_A'], ['Work', 'Creator_A']);
  input.profiles[0].custom = {retained: true};
  const normalized = cleanState(input);
  assert.deepEqual(normalized.profiles.map(profile => profile.id), ['personal', 'Work', 'Creator_A']);
  assert.deepEqual(cleanState(identityDocument([], ['Legacy_A'])).profiles.map(profile => profile.id), ['personal', 'Legacy_A']);
  saveState(file, normalized);
  const restarted = readState(file);
  assert.deepEqual(restarted.tabs.map(tab => tab.identity), ['Work', 'Creator_A']);
  assert.deepEqual(restarted.profiles.find(profile => profile.id === 'Work').custom, {retained: true});
});

test('a case-aliased primary blocks fallback and overwriting while preserving a valid previous checkpoint byte-for-byte', t => {
  const file = identityFixture(t);
  const valid = cleanState(identityDocument(['personal', 'Safe'], ['Safe']));
  const previous = Buffer.from(JSON.stringify(valid, null, 4).replace(/\n/g, '\r\n') + '\r\n');
  const invalid = [identityDocument(['Work', 'work'], ['Work', 'work']), identityDocument(['Personal']), identityDocument(['Work'], ['work'])];
  fs.writeFileSync(`${file}.previous`, previous);
  for (const value of invalid) {
    const primary = Buffer.from(JSON.stringify({...value, ownerMetadata: {preserved: true}}, null, 2) + '\n');
    fs.writeFileSync(file, primary);
    assert.throws(() => inspectState(file), {code: 'UNSUPPORTED_DATA'});
    assert.throws(() => readState(file), {code: 'UNSUPPORTED_DATA'});
    assert.throws(() => saveState(file, valid), {code: 'UNSUPPORTED_DATA'});
    assert.deepEqual(fs.readFileSync(file), primary);
    assert.deepEqual(fs.readFileSync(`${file}.previous`), previous);
  }
  assert.deepEqual(fs.readdirSync(path.dirname(file)).sort(), ['session.json', 'session.json.previous']);
});

test('saving case-aliased candidate identities cannot rotate or alter existing checkpoints', t => {
  const file = identityFixture(t);
  saveState(file, cleanState(identityDocument(['personal', 'Safe'], ['Safe'])));
  saveState(file, cleanState(identityDocument(['personal', 'Other'], ['Other'])));
  const primary = fs.readFileSync(file), previous = fs.readFileSync(`${file}.previous`);
  for (const candidate of [identityDocument(['Work', 'work']), {tabs: [{id: 'one', url: 'https://example.com/', identity: 'Personal'}]}]) {
    assert.throws(() => saveState(file, candidate), {code: 'UNSUPPORTED_DATA'});
    assert.deepEqual(fs.readFileSync(file), primary);
    assert.deepEqual(fs.readFileSync(`${file}.previous`), previous);
  }
});

test('a case-aliased previous checkpoint cannot be offered or explicitly restored as recovery', t => {
  const file = identityFixture(t), primary = Buffer.from('{damaged');
  const previous = Buffer.from(JSON.stringify(identityDocument(['Work', 'work'], ['Work', 'work'])));
  fs.writeFileSync(file, primary); fs.writeFileSync(`${file}.previous`, previous);
  assert.throws(() => inspectState(file), {code: 'UNSUPPORTED_DATA'});
  assert.throws(() => recoverState(file, {primary, previous}), {code: 'UNSUPPORTED_DATA'});
  assert.deepEqual(fs.readFileSync(file), primary);
  assert.deepEqual(fs.readFileSync(`${file}.previous`), previous);
  assert.deepEqual(fs.readdirSync(path.dirname(file)).sort(), ['session.json', 'session.json.previous']);
});
test('addresses allow HTTP(S), reject privileged protocols, encode searches',()=>{assert.equal(address('example.com'),'https://example.com/');assert.equal(address('two words'),'https://www.google.com/search?q=two%20words');for(const x of ['javascript:alert(1)','file:///etc/passwd','data:text/html,hi'])assert.equal(address(x),null);assert.equal(httpUrl('ftp://example.com'),null);});
test('restore retains all tabs including duplicate URLs and distinct identities',()=>{const tabs=Array.from({length:100},(_,i)=>({id:String(i),url:'https://example.com/',title:'Same'}));const s=cleanState({tabs,activeId:'99'});assert.equal(s.tabs.length,100);assert.equal(new Set(s.tabs.map(t=>t.id)).size,100);assert.equal(s.activeId,'99');});
test('invalid entries are isolated and duplicate IDs repaired',()=>{const s=cleanState({tabs:[{id:'a',url:'https://a.test'},{id:'a',url:'https://a.test'},{url:'file:///bad'}]});assert.equal(s.tabs.length,2);assert.notEqual(s.tabs[0].id,s.tabs[1].id);});
test('atomic checkpoints survive restart and corrupt latest file',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nox-state-'));try{const f=path.join(dir,'state.json');const a={tabs:[{id:'a',url:'https://a.test/'}],activeId:'a'};saveState(f,a);assert.equal(readState(f).tabs[0].id,'a');saveState(f,{tabs:[{id:'b',url:'https://b.test/'}]});fs.writeFileSync(f,'broken');assert.equal(readState(f).tabs[0].id,'a');assert.equal(fs.readdirSync(dir).some(x=>x.endsWith('.tmp')),false);}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('named container identities survive restart without shared partition IDs',()=>{const s=cleanState({profiles:[{id:'personal',name:'Personal'},{id:'creator',name:'Noxviola creator'}],tabs:[{id:'a',url:'https://same.test',identity:'personal'},{id:'b',url:'https://same.test',identity:'creator'}]});assert.equal(s.tabs[0].identity,'personal');assert.equal(s.tabs[1].identity,'creator');assert.equal(s.profiles[1].name,'Noxviola creator');});
