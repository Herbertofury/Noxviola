'use strict';

// Execute the production HTML and renderer, substituting only the preload IPC
// boundary. These regressions establish DOM behavior, not Electron isolation,
// native menu execution, native rendering, or packaged-runtime qualification.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM, VirtualConsole} = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '../browser/index.html'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, '../browser/renderer.js'), 'utf8');
const subscriptions = ['onState','onVault','onVaultDraft','onAccounts','onExtensions','onExtensionPreview',
  'onDownloads','onPermissions','onCapabilities','onNotice','onAddress','onFind','onHistory','onBookmarks',
  'onFollows','onWorkspaces','onResources','onSettingsPreview','onFindResult','onExtensionActions'];
const profiles = [{id:'personal',name:'Personal'},{id:'work',name:'Work'}];
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const field = (form, name) => form.elements.namedItem(name);

function state(overrides = {}) {
  return {profiles:copy(profiles),preferences:{searchEngine:'duckduckgo',tabLayout:'horizontal'},
    activeId:'tab-personal',activeWorkspaceId:'default',currentIdentity:'personal',panel:null,closing:false,
    canBack:false,canForward:false,canRestore:false,saveError:'',engine:{electron:'44.11.3',chromium:'fixture'},
    tabs:profiles.map(profile => ({id:'tab-'+profile.id,identity:profile.id,workspaceId:'default',
      title:profile.name+' page',url:'https://'+profile.id+'.example/',live:true,loading:false})),...overrides};
}

function bookmarkView(identity) {
  const name = profiles.find(profile => profile.id === identity).name;
  return {identity,status:'ready',error:'',recoveryAvailable:false,tree:[{
    id:'root:'+identity,identity,title:name,type:'folder',protected:true,children:[{
      id:'bar:'+identity,identity,parentId:'root:'+identity,title:'Bookmarks bar',type:'folder',
      protected:true,folderType:'bookmarks-bar',children:[{
        id:'folder:'+identity,identity,parentId:'bar:'+identity,title:name+' folder',type:'folder',children:[],
      },{
        id:'saved:'+identity,identity,parentId:'bar:'+identity,title:name+' saved page',type:'bookmark',
        url:'https://'+identity+'.example/saved',tags:[],
      }],
    },{
      id:'other:'+identity,identity,parentId:'root:'+identity,title:'Other bookmarks',type:'folder',
      protected:true,folderType:'other',children:[],
    }],
  }]};
}

async function harness(t, {initial = state(), command = async () => undefined} = {}) {
  const calls = [], listeners = new Map(), errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, {url:'https://noxviola.invalid/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
  const {window} = dom;
  window.addEventListener('error', event => { errors.push(event.error?.message || event.message); event.preventDefault(); });
  const api = {command:async (name, value) => {
    calls.push({name,value:copy(value)});
    return copy(name === 'state' ? initial : await command(name,copy(value)));
  }};
  for (const name of subscriptions) api[name] = listener => { listeners.set(name,listener); return () => listeners.delete(name); };
  window.browser = Object.freeze(api); window.eval(source); await tick();
  t.after(() => { window.close(); assert.deepEqual(errors,[],'production renderer must not throw DOM errors'); });
  let current = initial;
  function emit(name, value) {
    assert.ok(listeners.has(name),'renderer subscribes to '+name);
    listeners.get(name)(copy(value));
  }
  return {window,document:window.document,calls,emit,$:id => window.document.getElementById(id),
    update(partial) { current = {...current,...partial}; emit('onState',current); },
    input(control, value) { control.value=value; control.dispatchEvent(new window.Event('input',{bubbles:true})); },
    select(control, value) { control.value=value; control.dispatchEvent(new window.Event('change',{bubbles:true})); },
    check(control, checked) { control.checked=checked; control.dispatchEvent(new window.Event('change',{bubbles:true})); },
    submit(form) { form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})); },
  };
}

async function painted(h, id) {
  const target = h.$(id);
  if (target.getAttribute('aria-busy') !== 'true') return;
  await new Promise((resolve,reject) => {
    const timeout = setTimeout(() => { observer.disconnect(); reject(new Error(id+' did not finish painting')); },3000);
    const observer = new h.window.MutationObserver(() => {
      if (target.getAttribute('aria-busy') !== 'true') { clearTimeout(timeout); observer.disconnect(); resolve(); }
    });
    observer.observe(target,{attributes:true});
  });
}

test('extension action badges render their actual background color and retain authenticated action selection',async t=>{
  const h=await harness(t);
  h.emit('onExtensionActions',[{id:'one',runtimeId:'runtime-one',name:'Extension name',title:'Action title',badgeText:'12',color:[255,255,255,255],enabled:true}]);
  const control=h.$('extension-actions').querySelector('button'),badge=control.querySelector('.extension-badge');
  assert.equal(badge.textContent,'12');assert.equal(badge.style.backgroundColor,'rgb(255, 255, 255)');assert.equal(badge.style.color,'rgb(0, 0, 0)');
  assert.equal(control.getAttribute('aria-label'),'Action title, 12');control.click();await tick();
  assert.deepEqual(h.calls.at(-1),{name:'extension-action',value:{runtimeId:'runtime-one'}});
  h.emit('onExtensionActions',[{runtimeId:'runtime-one',name:'Extension name',badgeText:'!',color:[0,0,0,255],enabled:false}]);
  assert.equal(h.$('extension-actions').querySelector('.extension-badge').style.color,'rgb(255, 255, 255)');assert.equal(h.$('extension-actions').querySelector('button').disabled,true);
});

test('extension toolbar icons preserve host PNG resolutions and reject remote or active image sources',async t=>{
  const h=await harness(t),png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+cjD8AAAAASUVORK5CYII=';
  const item={runtimeId:'runtime-icon',name:'Image action',title:'Visible title',enabled:true,icon:{variants:[{size:16,width:1,height:1,dataUrl:png},{size:32,width:1,height:1,dataUrl:png}]}};
  h.emit('onExtensionActions',[item]);
  const control=h.$('extension-actions').querySelector('button'),img=control.querySelector('img');
  assert.equal(img.src,png);assert.equal(img.getAttribute('srcset'),`${png} 1x, ${png} 2x`);assert.equal(img.width,16);assert.equal(img.height,16);assert.equal(img.alt,'');
  assert.equal(control.textContent,'Image action');assert.equal(control.title,'Visible title');
  img.dispatchEvent(new h.window.Event('error'));assert.equal(control.querySelector('img'),null);assert.match(h.$('notice').textContent,/could not be displayed/);
  for(const dataUrl of ['https://remote.invalid/image.png','data:image/svg+xml,<svg></svg>','file:///private/icon.png']){
    h.emit('onExtensionActions',[{...item,icon:{variants:[{size:16,width:16,height:16,dataUrl}]}}]);assert.equal(h.$('extension-actions').querySelector('img'),null);
  }
  h.emit('onExtensionActions',[{...item,icon:null,iconError:'The accepted package icon could not be read.'}]);
  const fallback=h.$('extension-actions').querySelector('button');assert.equal(fallback.textContent,'Image action');assert.match(fallback.title,/could not be read/);assert.equal(fallback.getAttribute('aria-description'),'The accepted package icon could not be read.');
  const policy=h.document.querySelector('meta[http-equiv="Content-Security-Policy"]').content;
  assert.match(policy,/img-src 'self' data:/);assert.match(policy,/script-src 'self'/);assert.match(policy,/connect-src 'none'/);
});

test('workspace state refreshes actual counts and toggles while preserving focused assignment and form drafts',async t=>{
  const initial=state({panel:'workspaces'});
  initial.tabs[1].workspaceId='project';
  const h=await harness(t,{initial});
  h.emit('onWorkspaces',{items:[{id:'default',name:'Default',protected:true},{id:'project',name:'Project'}],
    groups:[{id:'assigned',workspaceId:'default',name:'Assigned',collapsed:false},{id:'draft',workspaceId:'default',name:'Draft',collapsed:false}]});
  await Promise.all(['workspace-items','group-items','workspace-tabs'].map(id=>painted(h,id)));
  const assignment=h.$('workspace-tabs').querySelector('[data-assignment-tab-id="tab-personal"]');
  const group=assignment.querySelectorAll('select')[1];
  const groupCard=h.$('group-items').querySelector('[data-group-id="assigned"]');
  assert.equal(groupCard.querySelector('.workspace-count').textContent,'0 tabs · Expanded');
  assert.equal(groupCard.querySelector('[data-remove-group]').disabled,false);
  h.select(group,'draft');group.focus();
  h.input(field(h.$('workspace-form'),'name'),'Unfinished workspace name');
  h.input(field(h.$('group-form'),'name'),'Unfinished group name');
  const changed={...initial.tabs[0],groupId:'assigned',pinned:true,muted:true,title:'Updated page',loading:true};
  h.update({tabs:[changed,initial.tabs[1]]});
  assert.equal(h.$('workspace-tabs').querySelector('[data-assignment-tab-id="tab-personal"]'),assignment);
  assert.equal(h.document.activeElement,group);
  assert.equal(group.value,'draft','incoming saved state must not erase an unsaved assignment');
  assert.equal(field(h.$('workspace-form'),'name').value,'Unfinished workspace name');
  assert.equal(field(h.$('group-form'),'name').value,'Unfinished group name');
  assert.equal(groupCard.querySelector('.workspace-count').textContent,'1 tab · Expanded');
  assert.equal(groupCard.querySelector('[data-remove-group]').disabled,true);
  assert.equal(assignment.querySelector('h2').textContent,'Updated page');
  assert.equal(group.getAttribute('aria-label'),'Group for Updated page');
  const pin=assignment.querySelector('[data-tab-pin]'),mute=assignment.querySelector('[data-tab-mute]');
  assert.equal(pin.textContent,'Unpin');assert.equal(mute.textContent,'Unmute');
  pin.click();mute.click();await tick();
  assert.deepEqual(h.calls.find(call=>call.name==='tab-pin'),{name:'tab-pin',value:{id:'tab-personal',pinned:false}});
  assert.deepEqual(h.calls.find(call=>call.name==='tab-mute'),{name:'tab-mute',value:{id:'tab-personal',muted:false}});
  [...assignment.querySelectorAll('button')].find(button=>button.textContent==='Apply').click();await tick();
  assert.deepEqual(h.calls.find(call=>call.name==='tab-assign'),{name:'tab-assign',value:{id:'tab-personal',workspaceId:'default',groupId:'draft'}});
  h.update({tabs:[{...changed,loading:false},initial.tabs[1]]});
  assert.equal(group.value,'assigned','after a completed assignment, the current canonical state is displayed');
  h.update({tabs:[{...initial.tabs[1],workspaceId:'default'}],activeId:'tab-work'});
  await Promise.all(['workspace-items','group-items','workspace-tabs'].map(id=>painted(h,id)));
  assert.equal(h.$('workspace-tabs').querySelector('[data-assignment-tab-id="tab-personal"]'),null);
  const emptyGroup=h.$('group-items').querySelector('[data-group-id="assigned"]');
  assert.equal(emptyGroup.querySelector('.workspace-count').textContent,'0 tabs · Expanded');
  assert.equal(emptyGroup.querySelector('[data-remove-group]').disabled,false);
  const project=h.$('workspace-items').querySelector('[data-workspace-id="project"]');
  assert.equal(project.querySelector('.workspace-count').textContent,'0 tabs');
  assert.equal(project.querySelector('[data-remove-workspace]').disabled,false);
  assert.equal(field(h.$('workspace-form'),'name').value,'Unfinished workspace name');
  assert.equal(field(h.$('group-form'),'name').value,'Unfinished group name');
});

test('a completed workspace assignment cannot erase a newer selection made while its save was pending',async t=>{
  let finish;
  const pending=new Promise(resolve=>{finish=resolve;});
  const initial=state({panel:'workspaces'}),h=await harness(t,{initial,command:async name=>name==='tab-assign'?pending:undefined});
  h.emit('onWorkspaces',{items:[{id:'default',name:'Default',protected:true}],
    groups:[{id:'first',workspaceId:'default',name:'First'},{id:'next',workspaceId:'default',name:'Next'}]});
  await painted(h,'workspace-tabs');
  const row=h.$('workspace-tabs').querySelector('[data-assignment-tab-id="tab-personal"]'),group=row.querySelectorAll('select')[1];
  const apply=[...row.querySelectorAll('button')].find(button=>button.textContent==='Apply');
  h.select(group,'first');apply.click();await tick();
  assert.equal(group.disabled,false);
  h.select(group,'next');group.focus();
  finish();await tick();
  h.update({tabs:[{...initial.tabs[0],groupId:'first'},initial.tabs[1]]});
  assert.equal(h.document.activeElement,group);assert.equal(group.value,'next');
  assert.deepEqual(h.calls.filter(call=>call.name==='tab-assign').map(call=>call.value),[{id:'tab-personal',workspaceId:'default',groupId:'first'}]);
  apply.click();await tick();
  assert.deepEqual(h.calls.filter(call=>call.name==='tab-assign').map(call=>call.value),[
    {id:'tab-personal',workspaceId:'default',groupId:'first'},
    {id:'tab-personal',workspaceId:'default',groupId:'next'},
  ]);
  h.update({tabs:[{...initial.tabs[0],groupId:'next'},initial.tabs[1]]});
  assert.equal(group.value,'next');
});

function recordButton(h, title, label) {
  const card = [...h.$('bookmark-items').querySelectorAll('article')].find(item => item.querySelector('h2')?.textContent === title);
  assert.ok(card,'bookmark card '+title+' exists');
  const button = [...card.querySelectorAll('button')].find(item => item.textContent === label);
  assert.ok(button,label+' action exists'); return button;
}

function switchIdentity(h, identity) {
  h.update({currentIdentity:identity,activeId:'tab-'+identity});
}

test('DOM product: a new bookmark draft keeps its identity and folder across profile changes and a failed save', async t => {
  let rejectSave = true;
  const h = await harness(t,{initial:state({panel:'bookmarks'}),command:async name => {
    if (name === 'bookmark-save' && rejectSave) throw new Error('Synthetic bookmark disk failure');
  }});
  h.emit('onBookmarks',bookmarkView('personal')); h.$('bookmark-add').click();
  const form = h.$('bookmark-form');
  h.input(field(form,'title'),'Private unfinished title');
  h.input(field(form,'url'),'https://personal.example/unfinished');
  h.select(field(form,'parentId'),'folder:personal');
  switchIdentity(h,'work'); h.emit('onBookmarks',bookmarkView('work'));
  assert.equal(field(form,'title').value,'Private unfinished title');
  assert.equal(field(form,'url').value,'https://personal.example/unfinished');
  assert.equal(field(form,'parentId').value,'folder:personal');
  assert.ok([...field(form,'parentId').options].every(option => option.value.endsWith(':personal')));
  assert.match(h.$('bookmark-identity').textContent,/Work/);
  assert.match(h.$('bookmark-draft-identity').textContent,/Personal.*another identity/);
  h.submit(form); await tick();
  const expected = {title:'Private unfinished title',identity:'personal',url:'https://personal.example/unfinished',type:'bookmark',parentId:'folder:personal'};
  assert.deepEqual(h.calls.find(call => call.name === 'bookmark-save').value,expected);
  assert.match(h.$('notice').textContent,/Synthetic bookmark disk failure/);
  assert.equal(field(form,'title').value,expected.title);
  assert.equal(field(form,'parentId').value,expected.parentId);
  assert.equal(h.$('bookmark-editor').open,true);
  assert.equal(form.querySelector('button.primary').disabled,false);
  rejectSave = false; h.submit(form); await tick();
  assert.deepEqual(h.calls.filter(call => call.name === 'bookmark-save').map(call => call.value),[expected,expected]);
  assert.equal(field(form,'title').value,'');
  assert.equal(h.$('bookmark-editor').open,false);
  assert.match(h.$('bookmark-draft-identity').textContent,/Work/);
  assert.ok([...field(form,'parentId').options].every(option => option.value.endsWith(':work')));
});

test('DOM product: editing an existing bookmark stays bound to its original record and identity', async t => {
  const h = await harness(t,{initial:state({panel:'bookmarks'})});
  h.emit('onBookmarks',bookmarkView('personal')); await painted(h,'bookmark-items');
  recordButton(h,'Personal saved page','Edit').click(); await tick();
  const form = h.$('bookmark-form'); h.input(field(form,'title'),'Edited personal title');
  switchIdentity(h,'work'); h.emit('onBookmarks',bookmarkView('work'));
  assert.equal(field(form,'id').value,'saved:personal');
  assert.equal(field(form,'url').value,'https://personal.example/saved');
  assert.equal(field(form,'parentId').value,'bar:personal');
  assert.match(h.$('bookmark-draft-identity').textContent,/Personal/);
  h.submit(form); await tick();
  assert.deepEqual(h.calls.find(call => call.name === 'bookmark-save').value,
    {id:'saved:personal',title:'Edited personal title',url:'https://personal.example/saved',identity:'personal'});
});

test('DOM product: a bookmark move preserves its original identity and selected destination', async t => {
  const h = await harness(t,{initial:state({panel:'bookmarks'})});
  h.emit('onBookmarks',bookmarkView('personal')); await painted(h,'bookmark-items');
  recordButton(h,'Personal saved page','Move').click(); await tick();
  const form = h.$('bookmark-move-form'); h.select(field(form,'parentId'),'other:personal');
  switchIdentity(h,'work'); h.emit('onBookmarks',bookmarkView('work'));
  assert.equal(field(form,'id').value,'saved:personal');
  assert.equal(field(form,'parentId').value,'other:personal');
  assert.ok([...field(form,'parentId').options].every(option => option.value.endsWith(':personal')));
  h.submit(form); await tick();
  assert.deepEqual(h.calls.find(call => call.name === 'bookmark-move').value,
    {id:'saved:personal',parentId:'other:personal',identity:'personal'});
  assert.equal(h.$('bookmark-move-editor').hidden,true);
});

test('DOM product: dirty history settings retain their identity and failed-save values, then refresh the current identity', async t => {
  let rejectSave = true;
  const h = await harness(t,{initial:state({panel:'history'}),command:async name => {
    if (name === 'history-settings' && rejectSave) throw new Error('Synthetic history disk failure');
  }});
  h.emit('onHistory',{identity:'personal',status:'ready',items:[],settings:{recording:true,retentionDays:null}});
  const form = h.$('history-settings');
  h.check(field(form,'recording'),false); h.input(field(form,'retentionDays'),'42');
  switchIdentity(h,'work');
  h.emit('onHistory',{identity:'work',status:'ready',items:[],settings:{recording:true,retentionDays:7}});
  assert.equal(field(form,'recording').checked,false);
  assert.equal(field(form,'retentionDays').value,'42');
  assert.match(h.$('history-identity').textContent,/Work/);
  assert.match(h.$('history-draft-identity').textContent,/Unsaved.*Personal/);
  h.submit(form); await tick();
  const expected = {identity:'personal',recording:false,retentionDays:42};
  assert.deepEqual(h.calls.find(call => call.name === 'history-settings').value,expected);
  assert.match(h.$('notice').textContent,/Synthetic history disk failure/);
  assert.equal(field(form,'recording').checked,false);
  assert.equal(field(form,'retentionDays').value,'42');
  rejectSave = false; h.submit(form); await tick();
  assert.deepEqual(h.calls.filter(call => call.name === 'history-settings').map(call => call.value),[expected,expected]);
  assert.equal(field(form,'recording').checked,true);
  assert.equal(field(form,'retentionDays').value,'7');
  assert.match(h.$('history-draft-identity').textContent,/apply to Work/);
});

test('DOM product: a reused tab node derives drag placement from its current workspace after reassignment', async t => {
  const tab = (id,workspaceId) => ({id,workspaceId,identity:'personal',title:id,url:'https://example.test/'+id});
  const outside = tab('outside','default'), target = tab('target','default'), moving = tab('moving','project'), anchor = tab('anchor','project');
  const h = await harness(t,{initial:state({activeId:'target',tabs:[outside,target,moving,anchor]})});
  const targetNode = h.document.querySelector('[data-tab-id="target"]');
  h.update({activeWorkspaceId:'project',tabs:[outside,moving,anchor,{...target,workspaceId:'project'}]});
  assert.equal(h.document.querySelector('[data-tab-id="target"]'),targetNode,'tab identity and DOM node are preserved');
  assert.equal(targetNode.hidden,false);
  assert.equal(h.document.querySelector('[data-tab-id="outside"]').hidden,true);
  const drop = new h.window.Event('drop',{bubbles:true,cancelable:true});
  Object.defineProperty(drop,'dataTransfer',{value:{types:['application/x-noxviola-tab'],getData:type => type === 'application/x-noxviola-tab' ? 'moving' : ''}});
  targetNode.dispatchEvent(drop); await tick();
  assert.equal(drop.defaultPrevented,true);
  assert.deepEqual(h.calls.find(call => call.name === 'tab-move').value,{id:'moving',index:2});
});

test('DOM product: preference controls preserve a dirty draft and apply committed appearance and toolbar changes', async t => {
  const initialPreferences = {searchEngine:'duckduckgo',tabLayout:'horizontal',theme:'dark',accent:'violet',density:'comfortable',
    homePage:'about:blank',customSearchURL:'https://duckduckgo.com/?q={searchTerms}',showBookmarksBar:false,
    toolbar:{home:true,library:true,extensions:true,split:true},shortcuts:{}};
  const shortcuts = [
    {id:'new',label:'New tab',accelerator:'CmdOrCtrl+T',defaultAccelerator:'CmdOrCtrl+T'},
    {id:'focus-address',label:'Address or search',accelerator:'CmdOrCtrl+L',defaultAccelerator:'CmdOrCtrl+L'},
  ];
  const h = await harness(t,{initial:state({panel:'settings',preferences:initialPreferences,shortcuts})});
  const form = h.$('settings-form');
  for (const [name,value] of Object.entries({searchEngine:'custom',tabLayout:'vertical',tabSearchPosition:'right',tabSearchStyle:'compact',theme:'light',accent:'teal',density:'compact'})) h.select(field(form,name),value);
  h.input(field(form,'homePage'),'https://home.example/');
  h.input(field(form,'customSearchURL'),'https://search.example/?q={searchTerms}');
  h.check(field(form,'showBookmarksBar'),true);
  h.check(field(form,'sidebarRailExpanded'),true);
  h.check(field(form,'sidebarShowWorkspaces'),false);
  assert.equal(field(form,'spellcheckEnabled').checked,true);
  h.check(field(form,'spellcheckEnabled'),false);
  h.check(field(form,'toolbar.home'),false); h.check(field(form,'toolbar.extensions'),false);
  h.input(field(form,'shortcut.new'),'Ctrl+Shift+N');
  h.input(field(form,'shortcut.focus-address'),'');
  h.update({preferences:{...initialPreferences,homePage:'https://background.example/'}});
  assert.equal(field(form,'homePage').value,'https://home.example/','an external preference event does not discard the dirty form');
  assert.equal(field(form,'shortcut.new').value,'Ctrl+Shift+N');
  assert.equal(field(form,'spellcheckEnabled').checked,false,'the unsaved explicit spelling choice survives background state');
  assert.equal(h.document.body.dataset.theme,'dark','typing a draft does not claim a saved theme');
  h.submit(form); await tick();
  const expected = {searchEngine:'custom',tabLayout:'vertical',tabSearchPosition:'right',tabSearchStyle:'compact',theme:'light',accent:'teal',density:'compact',
    sidebarVisible:true,sidebarRailExpanded:true,sidebarShowWorkspaces:false,sidebarSide:'left',sidebarWidth:320,sidebarApps:[],sidebarTools:[{id:'tabs',visible:true},{id:'bookmarks',visible:true},{id:'history',visible:true},{id:'downloads',visible:true}],
    homePage:'https://home.example/',customSearchURL:'https://search.example/?q={searchTerms}',showBookmarksBar:true,spellcheckEnabled:false,
    toolbar:{home:false,library:true,extensions:false,split:true},shortcuts:{new:'Ctrl+Shift+N','focus-address':''}};
  assert.deepEqual(h.calls.find(call => call.name === 'settings-save').value,expected);
  h.update({preferences:expected,shortcuts:shortcuts.map(item => ({...item,accelerator:expected.shortcuts[item.id]}))});
  assert.equal(h.document.body.dataset.theme,'light');
  assert.equal(h.document.body.dataset.accent,'teal');
  assert.equal(h.document.body.dataset.density,'compact');
  assert.equal(h.document.body.dataset.tabLayout,'vertical');
  assert.equal(h.document.body.dataset.tabSearchPosition,'right');
  assert.equal(h.document.body.dataset.sidebarRailExpanded,'true');
  assert.equal(h.$('tabs').getAttribute('aria-orientation'),'vertical');
  assert.equal(h.document.querySelector('[data-toolbar="home"]').hidden,true);
  assert.equal(h.document.querySelector('[data-toolbar="extensions"]').hidden,true);
  assert.equal(h.document.querySelector('[data-toolbar="library"]').hidden,false);
  assert.equal(h.document.querySelector('[data-toolbar="split"]').hidden,false);
  assert.equal(h.$('bookmarks-bar').hidden,false);
  assert.equal(field(form,'homePage').value,expected.homePage);
  assert.equal(field(form,'shortcut.focus-address').value,'');
});

test('following shows honest adapter coverage, last-good errors, scoped commands and full update list',async t=>{
 const h=await harness(t,{initial:state({panel:'following'})});
 const source={id:'repo',identity:'personal',name:'<script>creator</script>',kind:'project',url:'https://github.com/example/project',provider:'github-releases',automatic:false,paused:false,busy:false,lastSuccess:1700000000000,error:'HTTP 429: last-good data kept',items:[{id:'one',title:'<img src=x onerror=alert(1)>',url:'https://github.com/example/project/releases/tag/v1',read:false,observedAt:1,publishedAt:'2026-11-16'}]};
 h.emit('onFollows',{identity:'personal',items:[source,{...source,id:'manual',name:'Manual creator',kind:'creator',provider:'manual',items:[],lastSuccess:0,error:''}]});await painted(h,'follow-items');
 assert.match(h.$('follow-items').textContent,/HTTP 429/);assert.match(h.$('follow-items').textContent,/automatic tracking unavailable/);assert.equal(h.$('follow-items').querySelector('img'),null);
 const cards=h.$('follow-items').querySelectorAll('article');assert.equal(cards.length,2);
 const refresh=[...cards[0].querySelectorAll('button')].find(b=>b.textContent==='Check now');refresh.click();await tick();assert.deepEqual(h.calls.at(-1),{name:'follow-refresh',value:{id:'repo',identity:'personal'}});
 assert.equal([...cards[1].querySelectorAll('button')].some(b=>b.textContent==='Check now'),false);
 h.select(h.$('follow-filter'),'unread');await painted(h,'follow-items');assert.equal(h.$('follow-items').querySelectorAll('article').length,1);
 h.input(h.$('follow-search'),'no-match');await painted(h,'follow-items');assert.equal(h.$('follow-items').querySelectorAll('article').length,0);
});

test('following add preserves form after failure and carries the displayed browser identity',async t=>{
 let fail=true;const h=await harness(t,{initial:state({panel:'following'}),command:async name=>{if(name==='follow-add'&&fail)throw new Error('Storage unavailable');}});
 h.emit('onFollows',{identity:'work',items:[]});const form=h.$('follow-form');h.input(field(form,'name'),'Project');h.input(field(form,'url'),'https://github.com/test/project');h.check(field(form,'automatic'),true);
 h.submit(form);await tick();assert.equal(field(form,'name').value,'Project');assert.match(h.$('notice').textContent,/Storage unavailable/);assert.equal(h.calls.at(-1).value.identity,'work');
 fail=false;h.submit(form);await tick();assert.equal(field(form,'name').value,'');
});

test('following distinguishes snapshot gaps, source dates and provider pauses without promising real-time history',async t=>{
 const h=await harness(t,{initial:state({panel:'following'})});
 h.emit('onFollows',{identity:'personal',items:[{id:'repo',identity:'personal',name:'Tagged project',kind:'project',url:'https://github.com/example/project',provider:'github-releases',automatic:true,paused:false,busy:false,lastSuccess:1700000000000,error:'',freshness:'overdue',coverage:'Public releases and current tags, not a complete change history.',providerNotBefore:Date.now()+3600000,items:[{id:'tag:v1',title:'Tag v1',kind:'tag',commit:'a'.repeat(40),publishedAt:'',observedAt:1700000000000,read:false,presentInLastSnapshot:false}]}]});
 await painted(h,'follow-items');const text=h.$('follow-items').textContent;
 assert.match(text,/Check overdue/);assert.match(text,/not a complete change history/);assert.match(text,/Tag date is not provided/);assert.match(text,/Not returned in last successful snapshot/);assert.match(text,/Observed on this device/);
 assert.equal([...h.$('follow-items').querySelectorAll('button')].find(b=>b.textContent==='Check now').disabled,true);
});

test('Modrinth following shows same-version declarations and saves identity-scoped compatibility without changing the source',async t=>{
 const h=await harness(t,{initial:state({panel:'following'})});
 h.emit('onFollows',{identity:'work',items:[{id:'mod',identity:'work',name:'Versioned mod',kind:'project',provider:'modrinth-versions',url:'https://modrinth.com/mod/example',lastSuccess:1000,compatibility:{loader:'forge',gameVersion:'1.20.1'},matchingVersionIds:[],items:[{id:'modrinth:version1',kind:'modrinth-version',title:'Forge version',versionNumber:'1.0',releaseType:'release',loaders:['forge'],gameVersions:['1.19.2'],observedAt:1000,publishedAt:'2026-11-16',read:false},{id:'modrinth:version2',kind:'modrinth-version',title:'Fabric version',versionNumber:'2.0',releaseType:'beta',loaders:['fabric'],gameVersions:['1.20.1'],observedAt:1000,publishedAt:'2026-11-16',read:false}]}]});
 await painted(h,'follow-items');assert.match(h.$('follow-items').textContent,/0 versions in the last successful snapshot match both saved filters/);assert.match(h.$('follow-items').textContent,/Loaders: forge · Minecraft: 1.19.2/);assert.match(h.$('follow-items').textContent,/Loaders: fabric · Minecraft: 1.20.1/);
 const form=h.$('follow-items').querySelector('form'),inputs=form.querySelectorAll('input');h.input(inputs[0],'fabric');h.submit(form);await tick();assert.deepEqual(h.calls.at(-1),{name:'follow-change',value:{id:'mod',identity:'work',compatibility:{loader:'fabric',gameVersion:'1.20.1'}}});
});

test('following revision differences render safely on demand, without duplicate expansion',async t=>{
 const h=await harness(t,{initial:state({panel:'following'})});const item={id:'one',title:'Current',url:'https://github.com/example/project/releases/tag/v1',fingerprint:'two',read:false,observedAt:2000,publishedAt:'2026-11-16',revisions:[{observedAt:1000,supersededAt:2000,metadata:{title:'<img src=x onerror=alert(1)>',url:'https://github.com/example/project/releases/tag/v1',publishedAt:'2026-11-16',fingerprint:'one'}}]};
 h.emit('onFollows',{identity:'personal',items:[{id:'repo',identity:'personal',name:'Project',kind:'project',url:'https://github.com/example/project',provider:'github-releases',automatic:false,paused:false,lastSuccess:2000,error:'',items:[item]}]});await painted(h,'follow-items');
 const history=h.$('follow-items').querySelector('.follow-history');assert.ok(history);assert.equal(history.querySelectorAll('.follow-revision').length,0);history.open=true;history.dispatchEvent(new h.window.Event('toggle'));
 assert.equal(history.querySelectorAll('.follow-revision').length,1);assert.match(history.textContent,/title:.*Current/);assert.equal(history.querySelector('img'),null);assert.match(history.textContent,/Changes between checks/);
 history.open=false;history.dispatchEvent(new h.window.Event('toggle'));history.open=true;history.dispatchEvent(new h.window.Event('toggle'));assert.equal(history.querySelectorAll('.follow-revision').length,1);
});

test('Creator Continuity displays dated evidence and requires reviewed exact identity before adding destination',async t=>{
 const h=await harness(t,{initial:state({panel:'following'})}),continuity=require('../browser/creator-continuity.cjs'),registry=require('../shared/creator-continuity.v1.json');
 const source={id:'original',identity:'work',name:'Estates',url:registry.migrations[0].from.url,kind:'project',provider:'manual',automatic:false,paused:false,lastSuccess:0,error:'',items:[]};source.continuityNotices=continuity.notices(source,continuity.index(),Date.parse('2026-11-25T00:00:00Z'));
 h.emit('onFollows',{identity:'work',items:[source]});await painted(h,'follow-items');
 const text=h.$('follow-items').textContent;assert.match(text,/SethSaidThat · banned on nexus/);assert.match(text,/Verified source observation/);assert.match(text,/historical evidence/);assert.match(text,/No mod-level relocation declaration was independently verified/);
 const form=h.$('follow-items').querySelector('.migration-confirm'),checkbox=form.querySelector('input'),previous=h.calls.length;h.submit(form);await tick();assert.equal(h.calls.length,previous);
 h.check(checkbox,true);h.submit(form);await tick();const call=h.calls.at(-1);assert.equal(call.name,'follow-migrate');assert.equal(call.value.identity,'work');assert.equal(call.value.id,'original');assert.equal(call.value.migrationId,registry.migrations[0].id);assert.equal(call.value.reviewed,true);assert.match(call.value.token,/^[0-9a-f]{64}$/);
 const evidence=[...h.$('follow-items').querySelectorAll('button')].find(b=>b.textContent==='Open status evidence');evidence.click();await tick();assert.deepEqual(h.calls.at(-1),{name:'follow-evidence',value:{id:'original',identity:'work',url:registry.authors[0].status.evidenceUrl}});
});

test('Creator Continuity import draft survives failure and browser identity switch',async t=>{
 let fail=true;const h=await harness(t,{initial:state({panel:'following'}),command:async name=>{if(name==='follow-import-creators'&&fail)throw new Error('Invalid registry');}});h.emit('onFollows',{identity:'work',items:[]});const form=h.$('creator-registry-form'),input=field(form,'registry');h.input(input,'{"kind":"review me"}');h.emit('onFollows',{identity:'personal',items:[]});h.submit(form);await tick();assert.equal(h.calls.at(-1).value.identity,'work');assert.equal(input.value,'{"kind":"review me"}');assert.match(h.$('notice').textContent,/Invalid registry/);fail=false;h.submit(form);await tick();assert.equal(input.value,'');
});

test('archived destinations remain available to restore and migration undo targets the destination identity',async t=>{
 const h=await harness(t,{initial:state({panel:'following'})}),source={id:'destination',identity:'work',name:'Estates',url:'https://modholdmods.com/g/skyrim-se/mods/11/estates',kind:'project',provider:'modhold-project',automatic:false,paused:true,archived:true,lastSuccess:1,error:'',items:[],migration:{state:'revoked',originalUrl:'https://www.nexusmods.com/skyrimspecialedition/mods/196696'}};
 h.emit('onFollows',{identity:'work',items:[source]});await painted(h,'follow-items');assert.equal(h.$('follow-items').querySelectorAll('article').length,0);h.select(h.$('follow-filter'),'archived');await painted(h,'follow-items');assert.equal(h.$('follow-items').querySelectorAll('article').length,1);assert.match(h.$('follow-items').textContent,/Migration tracking was undone/);const restore=[...h.$('follow-items').querySelectorAll('button')].find(b=>b.textContent==='Restore source');restore.click();await tick();assert.deepEqual(h.calls.at(-1),{name:'follow-change',value:{id:'destination',identity:'work',archived:false}});
});

test('ModHold Following shows independent public metadata and file hashes without download or ban claims',async t=>{
 const h=await harness(t,{initial:state({panel:'following'})});h.emit('onFollows',{identity:'personal',items:[{id:'modhold',identity:'personal',name:'Example',kind:'project',provider:'modhold-project',url:'https://modholdmods.com/g/skyrim-se/mods/12',automatic:false,paused:false,lastSuccess:1000,error:'',coverage:'Missing data does not verify a ban, relocation or its cause.',items:[{id:'file:1',kind:'modhold-file',title:'Example.zip',versionNumber:'1.0',fileKind:'main',sha256:'a'.repeat(64),sizeBytes:42,publishedAt:'',observedAt:1000,read:false}]}]});await painted(h,'follow-items');const content=h.$('follow-items').textContent;assert.match(content,/MODHOLD PUBLIC METADATA/);assert.match(content,/metadata only, not downloaded or verified/);assert.match(content,/does not verify a ban/);assert.equal([...h.$('follow-items').querySelectorAll('button')].some(b=>/download/i.test(b.textContent)),false);
});

test('source continuity reports are attributed, review-only and evidence opens use saved identity-scoped indices',async t=>{
 const {fixture}=require('./fixtures/transition.cjs'),{notices}=require('../browser/follow-transitions.cjs'),r=fixture();const h=await harness(t,{initial:state({panel:'following'})});const entry={id:'source',identity:'personal',name:'Fixture',kind:'creator',provider:'manual',url:r.source_account,automatic:false,paused:false,items:[],transitionNotices:notices([r],150)};h.emit('onFollows',{identity:'personal',items:[entry]});await painted(h,'follow-items');
 assert.match(h.$('follow-items').textContent,/Imported report: banned/);assert.match(h.$('follow-items').textContent,/Not independently verified/);assert.match(h.$('follow-items').textContent,/no automatic switch/);
 const button=[...h.$('follow-items').querySelectorAll('button')].find(b=>b.textContent==='Open provider_notice evidence');button.click();await tick();assert.deepEqual(h.calls.at(-1),{name:'follow-evidence-open',value:{id:'source',identity:'personal',transitionIndex:0,section:'status_evidence',evidenceIndex:0}});
 let input=h.$('follow-items').querySelector('textarea');h.input(input,'{"draft":');h.emit('onFollows',{identity:'personal',items:[entry]});await painted(h,'follow-items');assert.equal(h.$('follow-items').querySelector('textarea').value,'{"draft":');
});

test('split pane chrome keeps independent identity/address commands and explicit position swaps',async t=>{
 const tabs=[{id:'a',title:'Pane A',url:'https://example.com/a',identity:'personal'},{id:'b',title:'Pane B',url:'https://example.com/b',identity:'work'}],geometry={panes:tabs.map((tab,index)=>({tabId:tab.id,toolbar:32,bounds:{x:index*500,y:76,width:494,height:600}})),dividers:[{path:[],axis:'x',ratio:.5,bounds:{x:494,y:76,width:6,height:600},parent:{x:0,y:76,width:1000,height:600}}]};
 const h=await harness(t,{initial:state({tabs,activeId:'a',paneGeometry:geometry,panel:null})});await tick();const bars=h.$('pane-chrome').querySelectorAll('.pane-toolbar');assert.equal(bars.length,2);const first=bars[0],input=first.querySelector('input');h.input(input,'https://example.com/new');input.focus();h.emit('onState',state({tabs:[{...tabs[0],title:'Updated title'},tabs[1]],activeId:'a',paneGeometry:geometry,panel:null}));await tick();assert.equal(h.$('pane-chrome').querySelector('input').value,'https://example.com/new');assert.equal(h.document.activeElement,h.$('pane-chrome').querySelector('input'));
 const identity=h.$('pane-chrome').querySelector('select');h.select(identity,'work');await tick();assert.ok(h.calls.some(c=>c.name==='pane-identity'&&c.value.id==='a'&&c.value.identity==='work'));const divider=h.$('pane-chrome').querySelector('.pane-divider');divider.dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));await tick();assert.ok(h.calls.some(c=>c.name==='pane-resize'&&c.value.ratio===.45));
});

function creatorHubView(identity='work'){
 const creator={id:'author',identity,name:'Creator Example',kind:'creator',provider:'modhold-author',url:'https://modholdmods.com/u/example',automatic:true,paused:false,archived:false,lastSuccess:2000,items:[],creatorIdentity:{key:'modhold:example',provider:'modhold',accountId:'example',handle:'example',name:'Creator Example',profileUrl:'https://modholdmods.com/u/example',evidenceUrl:'https://modholdmods.com/api/v1/mods/12',relation:'Published project author',observedAt:1000}};
 const project={id:'project',identity,name:'Example Adventure',kind:'project',provider:'modhold-project',url:'https://modholdmods.com/g/skyrim-se/mods/12',automatic:true,paused:false,archived:false,lastSuccess:2000,creatorKeys:['modhold:example'],items:[{id:'file:12',title:'Adventure version 2',kind:'modhold-file',fileName:'Example.zip',versionNumber:'2',fileKind:'main',sha256:'a'.repeat(64),sizeBytes:42,url:'https://modholdmods.com/g/skyrim-se/mods/12',publishedAt:'2026-11-16',observedAt:2000,read:false}]};
 return {identity,items:[creator,project],hub:{preferences:{identity,autoFollowDownloads:true,generation:0},creators:[{key:'modhold:example',sourceId:'author',projectIds:['project'],unread:1,projectCount:1,lastActivity:2000}],discoveries:[],stats:{creators:1,projects:1,unread:1,review:0},backfill:null}};
}
test('creator hub renders grouped projects, evidence and exact scoped follow controls with local search/site filters',async t=>{
 const h=await harness(t,{initial:state({panel:'following'})}),view=creatorHubView();h.emit('onFollows',view);await painted(h,'creator-items');assert.equal(h.$('creator-items').hidden,false);assert.equal(h.$('follow-items').hidden,true);assert.equal(h.$('hub-creators').textContent,'1');assert.equal(h.$('hub-unread').textContent,'1');assert.equal(h.$('auto-follow-downloads').checked,true);assert.match(h.$('creator-items').textContent,/Example Adventure/);assert.match(h.$('creator-items').textContent,/Published project author/);assert.equal(h.$('creator-items').querySelector('img'),null);
 const unfollow=[...h.$('creator-items').querySelectorAll('button')].find(button=>button.textContent==='Unfollow');unfollow.click();await tick();assert.deepEqual(h.calls.at(-1),{name:'follow-unfollow',value:{identity:'work',id:'author'}});
 h.input(h.$('follow-search'),'Adventure');await painted(h,'creator-items');assert.equal(h.$('creator-items').querySelectorAll('.creator-card').length,1);h.select(h.$('follow-provider'),'github');await painted(h,'creator-items');assert.equal(h.$('creator-items').querySelectorAll('.creator-card').length,0);
 h.select(h.$('follow-provider'),'all');h.input(h.$('follow-search'),'');h.select(h.$('follow-filter'),'paused');await painted(h,'creator-items');assert.equal(h.$('creator-items').querySelectorAll('.creator-card').length,0);
});
test('auto-follow preference and explicit backfill commands retain displayed identity through a profile switch',async t=>{
 let release;const h=await harness(t,{initial:state({panel:'following'}),command:async name=>{if(name==='follow-settings')return new Promise(resolve=>release=resolve);}});h.emit('onFollows',creatorHubView('work'));h.check(h.$('auto-follow-downloads'),false);await tick();assert.deepEqual(h.calls.at(-1),{name:'follow-settings',value:{identity:'work',automatic:false}});h.emit('onFollows',creatorHubView('personal'));release();await tick();assert.equal(h.$('auto-follow-downloads').checked,true);h.$('creator-backfill').click();await tick();assert.deepEqual(h.calls.at(-1),{name:'follow-backfill',value:{identity:'personal'}});
});
test('creator catalog exposes every new project on demand with a saved-item follow action',async t=>{
 const h=await harness(t,{initial:state({panel:'following'})}),view=creatorHubView();view.items[0].items=Array.from({length:67},(_,i)=>({id:`modhold-project:${100+i}`,kind:'modhold-project',title:`Catalog project ${i}`,url:`https://modholdmods.com/g/skyrim-se/mods/${100+i}`,versionNumber:'1',observedAt:1000+i,read:false}));h.emit('onFollows',view);await painted(h,'creator-items');const catalog=[...h.$('creator-items').querySelectorAll('details')].find(row=>row.querySelector('summary').textContent.includes('Public projects'));assert.ok(catalog);assert.equal(catalog.querySelectorAll('.creator-project-row').length,0);catalog.open=true;catalog.dispatchEvent(new h.window.Event('toggle'));assert.equal(catalog.querySelectorAll('.creator-project-row').length,67);assert.match(catalog.textContent,/not installed mods/);const follow=[...catalog.querySelectorAll('button')].find(button=>button.textContent==='Follow project updates');follow.click();await tick();assert.deepEqual(h.calls.at(-1),{name:'follow-catalog-project',value:{identity:'work',id:'author',itemId:'modhold-project:100'}});
});
test('timeline paints all updates without a cap and single-item read actions remain source/identity-bound',async t=>{
 const h=await harness(t,{initial:state({panel:'following'})}),view=creatorHubView();view.items[1].items=Array.from({length:407},(_,i)=>({id:`version:${i}`,title:`Version ${i}`,url:view.items[1].url,observedAt:1000+i,publishedAt:'',read:false}));h.emit('onFollows',view);h.document.querySelector('.hub-navigation [data-follow-view=updates]').click();await painted(h,'creator-timeline');assert.equal(h.$('creator-timeline').querySelectorAll('article').length,407);h.input(h.$('follow-search'),'Creator Example');await painted(h,'creator-timeline');assert.equal(h.$('creator-timeline').querySelectorAll('article').length,407);const read=[...h.$('creator-timeline').querySelectorAll('button')].find(button=>button.textContent==='Mark read');read.click();await tick();assert.deepEqual(h.calls.at(-1),{name:'follow-item-read',value:{identity:'work',id:'project',itemId:'version:406',read:true}});
});
test('review inbox retains a failed exact-project draft, hides other identity content and never guesses a creator',async t=>{
 const h=await harness(t,{initial:state({panel:'following'}),command:async name=>{if(name==='follow-review-retry')throw new Error('Provider unavailable');}}),view=creatorHubView('work');view.hub.discoveries=[{id:'download:one',identity:'work',title:'Unknown archive',kind:'download',status:'review',message:'Uploader identity is not verified.',createdAt:1000,updatedAt:1000,projectUrl:'',provenance:{pageUrl:'https://www.nexusmods.com/skyrimspecialedition/mods/12',urlChain:[]},busy:false}];view.hub.stats.review=1;h.emit('onFollows',view);h.document.querySelector('.hub-navigation [data-follow-view=review]').click();await painted(h,'creator-review-items');assert.match(h.$('creator-review-items').textContent,/identity is not verified/);const form=h.$('creator-review-items').querySelector('form');h.input(form.querySelector('input'),'https://modholdmods.com/g/skyrim-se/mods/12');h.submit(form);await tick();assert.deepEqual(h.calls.at(-1),{name:'follow-review-retry',value:{identity:'work',discoveryId:'download:one',projectUrl:'https://modholdmods.com/g/skyrim-se/mods/12'}});assert.match(h.$('notice').textContent,/Provider unavailable/);h.emit('onFollows',view);await painted(h,'creator-review-items');assert.equal(h.$('creator-review-items').querySelector('input').value,'https://modholdmods.com/g/skyrim-se/mods/12');h.emit('onFollows',creatorHubView('personal'));assert.equal(h.$('creator-review-items').textContent.includes('Unknown archive'),false);h.emit('onFollows',view);await painted(h,'creator-review-items');assert.equal(h.$('creator-review-items').querySelector('input').value,'https://modholdmods.com/g/skyrim-se/mods/12');
});
test('canonical holds remove the migration start action while preserving source evidence and review text',async t=>{
 const h=await harness(t,{initial:state({panel:'following'})}),continuity=require('../browser/creator-continuity.cjs'),registry=require('../shared/creator-continuity.v1.json');const source={id:'original',identity:'work',name:'Original',url:registry.migrations[0].from.url,kind:'project',provider:'manual',items:[],paused:false,automatic:false,lastSuccess:0};source.continuityNotices=continuity.notices(source,continuity.index(),Date.now());source.continuityNotices[0].migrations[0].hold='Canonical evidence review required: retracted.';h.emit('onFollows',{identity:'work',items:[source]});await painted(h,'follow-items');assert.match(h.$('follow-items').textContent,/Canonical evidence review required: retracted/);assert.equal(h.$('follow-items').querySelector('.migration-confirm'),null);assert.ok([...h.$('follow-items').querySelectorAll('button')].some(button=>button.textContent==='Review original mod'));
});
