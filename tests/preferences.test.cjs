'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const preference=require('../browser/preferences.cjs');
const {address,saveState,readState,cleanState}=require('../browser/state.cjs');

test('legacy preferences gain independent defaults while unknown saved metadata survives',()=>{
  const raw={searchEngine:'bing',tabLayout:'vertical',owner:{kept:true},toolbar:{library:false,future:true},shortcuts:{future:'unchanged'}};
  const result=preference.preferences(raw);assert.equal(result.theme,'dark');assert.equal(result.toolbar.library,false);assert.equal(result.toolbar.extensions,true);
  assert.deepEqual(result.owner,{kept:true});assert.equal(result.toolbar.future,true);assert.equal(result.shortcuts.future,'unchanged');assert.equal(raw.theme,undefined);
  const changed=preference.applyPreferences(result,{theme:'light',toolbar:{split:false}});assert.equal(changed.toolbar.library,false);assert.equal(changed.toolbar.extensions,true);assert.equal(changed.toolbar.split,false);assert.deepEqual(changed.owner,raw.owner);
});
test('custom searches encode the whole query and reject credential-bearing, ambiguous or privileged templates',()=>{
  const template='https://search.example/find?q={searchTerms}&source=local';
  assert.equal(address('cats & dogs #one','custom',template),'https://search.example/find?q=cats%20%26%20dogs%20%23one&source=local');
  for(const value of ['javascript:{searchTerms}','https://user:pass@example.com/?q={searchTerms}','https://example.com/?q={searchTerms}&again={searchTerms}','https://example.com/no-placeholder','file:///{searchTerms}']){
    assert.equal(preference.searchTemplate(value),false);assert.throws(()=>preference.preferences({customSearchURL:value}));
  }
  assert.equal(address('hello','custom','invalid'),null);
});
test('shortcuts resolve platform aliases, reject conflicts and can be individually disabled',()=>{
  assert.throws(()=>preference.preferences({shortcuts:{new:'Control+L'}},{platform:'win32'}),/assigned to both/);
  const value=preference.preferences({shortcuts:{new:'',close:'Ctrl+Shift+K'}},{platform:'win32'});
  assert.equal(preference.shortcutList(value,'win32').find(item=>item.id==='new').accelerator,'');
  assert.equal(preference.shortcutList(value,'win32').find(item=>item.id==='close').accelerator,'Ctrl+Shift+K');
  for(const shortcut of ['Ctrl+Ctrl+T','Ctrl++','text','Ctrl+Command+T','Ctrl+Unknown','T'])assert.throws(()=>preference.accelerator(shortcut));
  assert.equal(preference.accelerator('Shift+Control+K'),'Ctrl+Shift+K');
});
test('tab search settings persist and the new default does not invalidate an existing shortcut',()=>{
  const old=preference.preferences({shortcuts:{history:'Ctrl+Shift+A'}},{platform:'win32'});
  const shortcuts=preference.shortcutList(old,'win32');
  assert.equal(shortcuts.find(item=>item.id==='history').accelerator,'Ctrl+Shift+A');
  assert.equal(shortcuts.find(item=>item.id==='search-tabs').accelerator,'');
  const chosen=preference.applyPreferences(old,{tabSearchPosition:'right',tabSearchStyle:'compact'});
  assert.equal(chosen.tabSearchPosition,'right');assert.equal(chosen.tabSearchStyle,'compact');
  assert.equal(preference.previewPreset(preference.preferences({}),preference.exportPreset(chosen)).preferences.tabSearchStyle,'compact');
});
test('sidebar settings preserve custom apps and never export their URLs in appearance presets',()=>{
  const value=preference.preferences({sidebarSide:'right',sidebarWidth:380,sidebarApps:[{id:'chat',name:'Chat',url:'https://example.test/',future:{keep:true}}],sidebarActive:'app:chat'});
  assert.equal(value.sidebarRailExpanded,false);assert.equal(value.sidebarShowWorkspaces,true);const saved=preference.applyPreferences(value,{sidebarExpanded:true,sidebarRailExpanded:true,sidebarShowWorkspaces:false});assert.deepEqual(saved.sidebarApps,value.sidebarApps);assert.equal(saved.sidebarActive,'app:chat');assert.equal(preference.preferences(saved).sidebarRailExpanded,true);assert.equal(preference.preferences(saved).sidebarShowWorkspaces,false);assert.throws(()=>preference.preferences({...saved,sidebarRailExpanded:'yes'}),/sidebarRailExpanded/);assert.throws(()=>preference.preferences({...saved,sidebarShowWorkspaces:'no'}),/sidebarShowWorkspaces/);
  const preset=preference.exportPreset(saved);assert.equal(Object.hasOwn(preset.preferences,'sidebarApps'),false);assert.equal(Object.hasOwn(preset.preferences,'sidebarActive'),false);
  assert.throws(()=>preference.preferences({...value,sidebarApps:[...value.sidebarApps,...value.sidebarApps]}),/invalid/);
  assert.throws(()=>preference.preferences({...value,sidebarApps:[{id:'chat',name:'Chat',url:'file:///secret'}]}),/invalid/);
  const old=preference.preferences({shortcuts:{history:'Ctrl+Alt+Z'}},{platform:'win32'});assert.equal(preference.shortcutList(old,'win32').find(item=>item.id==='sidebar-toggle').accelerator,'');
});
test('presets include supported presentation choices only and preview without altering live values',()=>{
  const current=preference.preferences({ownerPrivateMetadata:{secret:'not exported'},toolbar:{futureSecret:'not exported'},shortcuts:{futureSecret:'not exported'}});
  const exported=preference.exportPreset(current);assert.equal(exported.preferences.ownerPrivateMetadata,undefined);assert.equal(exported.preferences.toolbar.futureSecret,undefined);assert.equal(exported.preferences.shortcuts.futureSecret,undefined);
  const incoming={format:'noxviola-preferences',version:1,preferences:{theme:'light',showBookmarksBar:true}};
  const review=preference.previewPreset(current,incoming);assert.equal(current.theme,'dark');assert.equal(review.preferences.theme,'light');assert.equal(review.preferences.showBookmarksBar,true);assert.deepEqual(review.preferences.ownerPrivateMetadata,current.ownerPrivateMetadata);
  assert.throws(()=>preference.previewPreset(current,{...incoming,preferences:{extensionGrants:['all']}}),/unsupported preference/);
  assert.throws(()=>preference.previewPreset(current,{...incoming,version:2}),/supported Noxviola/);
});
test('local spelling retains its prior enabled default, requires a boolean choice and is excluded from appearance presets',()=>{
  assert.equal(preference.preferences({}).spellcheckEnabled,true);
  const disabled=preference.preferences({spellcheckEnabled:false});assert.equal(disabled.spellcheckEnabled,false);
  const enabled=preference.applyPreferences(disabled,{spellcheckEnabled:true});assert.equal(enabled.spellcheckEnabled,true);
  for(const value of ['true',1,null,{}])assert.throws(()=>preference.preferences({spellcheckEnabled:value}),/explicitly/);
  const preset=preference.exportPreset(enabled);assert.equal(Object.hasOwn(preset.preferences,'spellcheckEnabled'),false);
  assert.equal(preference.previewPreset(enabled,{format:'noxviola-preferences',version:1,preferences:{theme:'light'}}).preferences.spellcheckEnabled,true);
  assert.throws(()=>preference.previewPreset(disabled,{format:'noxviola-preferences',version:1,preferences:{spellcheckEnabled:true}}),/Spelling checks must be chosen separately/);
});
test('saved customization, pinned muted groups and origin zoom survive restart without rewriting unknown metadata',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'nox-preferences-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const file=path.join(directory,'session.json');
  const saved=cleanState({profiles:[{id:'personal',name:'Personal'}],tabs:[{id:'tab',url:'https://example.com/',identity:'personal',pinned:true,muted:true,workspaceId:'work-1',groupId:'group-1',future:{value:3}}],activeId:'tab',activeWorkspaceId:'work-1',preferences:{theme:'light',searchEngine:'custom',customSearchURL:'https://example.com/?q={searchTerms}',toolbar:{home:false}},siteZooms:{personal:{'https://example.com':1.5}}});
  saveState(file,saved);const restarted=readState(file);assert.deepEqual(restarted,saved);assert.equal(restarted.tabs[0].future.value,3);
  const bytes=fs.readFileSync(file);assert.throws(()=>saveState(file,{...saved,preferences:{...saved.preferences,theme:'unsupported-future-theme'}}));assert.deepEqual(fs.readFileSync(file),bytes);
  assert.throws(()=>cleanState({...saved,siteZooms:{personal:{'https://example.com/path':2}}}),/zoom values/);
});
