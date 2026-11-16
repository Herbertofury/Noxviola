'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {SpellcheckService}=require('../browser/spellcheck.cjs');

function session(){return {enabled:true,calls:[],setSpellCheckerEnabled(value){this.calls.push(value);this.enabled=value;}};}
test('an explicit disabled spelling setting applies to every Session and changes only through the setting',()=>{
  const spelling=new SpellcheckService({enabled:false}),shell=session(),personal=session(),work=session();
  spelling.attach(shell);spelling.attach(personal);spelling.attach(personal);
  assert.deepEqual(shell.calls,[false]);assert.deepEqual(personal.calls,[false]);
  spelling.setEnabled(true);spelling.attach(work);
  for(const target of [shell,personal,work])assert.equal(target.enabled,true);
  spelling.setEnabled(false);
  for(const target of [shell,personal,work])assert.equal(target.enabled,false);
  const prior=work.calls.length;spelling.setEnabled(false);assert.equal(work.calls.length,prior,'unchanged preferences do not repeat engine work');
  assert.throws(()=>spelling.setEnabled('true'),/explicitly/);
});
test('failed native changes restore prior Session settings and do not claim the new choice',()=>{
  const spelling=new SpellcheckService({enabled:false}),first=session(),second=session();spelling.attach(first);spelling.attach(second);
  second.setSpellCheckerEnabled=function(value){this.enabled=value;if(value)throw new Error('Synthetic native failure');};
  assert.throws(()=>spelling.setEnabled(true),/Synthetic native failure/);
  assert.equal(spelling.enabled,false);assert.equal(first.enabled,false);assert.equal(second.enabled,false);
});
test('an incomplete rollback is retried when the user explicitly disables the formerly disabled setting',()=>{
  const spelling=new SpellcheckService({enabled:false}),first=session(),second=session();spelling.attach(first);spelling.attach(second);
  let failing=true;
  first.setSpellCheckerEnabled=function(value){if(failing&&!value)throw new Error('Rollback unavailable');this.enabled=value;};
  second.setSpellCheckerEnabled=function(value){if(failing&&value)throw new Error('Enable unavailable');this.enabled=value;};
  assert.throws(()=>spelling.setEnabled(true),/could not be changed consistently/);
  assert.equal(first.enabled,true);assert.equal(spelling.enabled,false);assert.equal(spelling.inconsistent,true);
  failing=false;spelling.setEnabled(false);
  assert.equal(first.enabled,false);assert.equal(second.enabled,false);assert.equal(spelling.inconsistent,false);
});
test('native spelling suggestions correct the selected word only while the browser and feature remain active',()=>{
  const errors=[],replaced=[];let closing=false,destroyed=false;
  const spelling=new SpellcheckService({enabled:true,canAct:()=>!closing,onError:error=>errors.push(error)});
  const contents={isDestroyed:()=>destroyed,replaceMisspelling:word=>replaced.push(word)};
  const params={isEditable:true,misspelledWord:'mispeled',dictionarySuggestions:['misspelled','misplaced']};
  const menu=spelling.contextMenu(contents,params);assert.deepEqual(menu.map(item=>item.label||item.type),['misspelled','misplaced','separator']);
  menu[0].click();assert.deepEqual(replaced,['misspelled']);
  closing=true;menu[1].click();closing=false;destroyed=true;menu[1].click();destroyed=false;
  spelling.setEnabled(false);menu[1].click();assert.deepEqual(replaced,['misspelled']);
  assert.deepEqual(spelling.contextMenu(contents,params),[]);
  spelling.setEnabled(true);contents.replaceMisspelling=()=>{throw new Error('Native correction rejected');};
  menu[0].click();assert.deepEqual(errors,['Spelling correction could not be applied: Native correction rejected']);
  assert.deepEqual(spelling.contextMenu(contents,{...params,isEditable:false}),[]);
  assert.deepEqual(spelling.contextMenu(contents,{...params,misspelledWord:''}),[]);
  assert.deepEqual(spelling.contextMenu(contents,{...params,dictionarySuggestions:[]}),[{label:'No spelling suggestions',enabled:false},{type:'separator'}]);
});
