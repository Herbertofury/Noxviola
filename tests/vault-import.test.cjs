'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vault = require('../browser/vault.cjs');
const item = (id, notes = '') => vault.normalize({id, url:'https://example.com/', title:'Synthetic reference', notes});
test('library import preserves complete metadata, colliding identities and exact repeated imports', () => {
  const base = {version:1, items:[{...item('a'), extra:{unknown:true}}], settings:{layout:'cards'}};
  const source = {version:1, items:[{...item('other'), extra:{unknown:true}}, item('a','Distinct'), item('a-import-1','Reserved')], settings:{layout:'cards'}, retained:'yes'};
  const result = vault.previewImport(base, source);
  assert.deepEqual(result.summary, {total:3,added:2,skipped:1,remapped:1,metadataAdded:1});
  assert.equal(result.document.items[1].id, 'a-import-2');
  assert.equal(result.document.retained, 'yes');
  assert.equal(vault.previewImport(result.document, source).summary.added, 0);
  assert.throws(() => vault.previewImport(base, {...source,settings:{layout:'different'}}), /Conflicting/);
});
test('10,000 library records survive preview and merge with no result cap', () => {
  const items = Array.from({length:10000}, (_,index) => item(String(index), `Note ${index}`));
  const result = vault.previewImport({version:1,items:[]}, {version:1,items});
  assert.equal(result.summary.added,10000); assert.equal(result.document.items.length,10000);
  assert.deepEqual(result.document.items.at(-1), items.at(-1));
});
test('unrecognized library types and structured known fields block import without reinterpretation', () => {
  const current={version:1,items:[]};
  for(const record of [{...item('a'),kind:'future-media'},{...item('a'),notes:{structured:true}}]) {
    const incoming={version:1,items:[record]},before=structuredClone(incoming);
    assert.throws(()=>vault.previewImport(current,incoming),error=>error.code==='UNSUPPORTED_DATA');
    assert.deepEqual(incoming,before);assert.equal(current.items.length,0);
  }
});
test('preview apply refuses intervening edits; editing retains unknown metadata; archive is reversible', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nox-library-')); t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'library.json'); vault.save(file,[{...item('a'),extension:{retained:true}}]);
  const original=vault.inspect(file).value;
  const preview=vault.previewImport(original,{version:1,items:[item('b')]});
  const changed=vault.upsert(original.items,{id:'a',title:'Edited'});
  assert.deepEqual(changed[0].extension,{retained:true}); vault.save(file,changed,original);
  assert.throws(()=>vault.applyImport(file,preview,original),/changed after preview/);
  const archived=vault.upsert(changed,{id:'a',archived:true}); assert.equal(archived[0].archived,true);
  assert.equal(vault.upsert(archived,{id:'a',archived:false})[0].archived,false);
});
