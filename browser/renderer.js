'use strict';
// This renderer owns browser chrome only. Websites never receive its preload.
const $ = id => document.getElementById(id);
const api = window.browser;
let currentState = {profiles:[],tabs:[],preferences:{},currentIdentity:'personal',panel:null};
let vaultItems = [], accountItems = [], extensionData = {items:[],profiles:[],busy:false};
let permissionData = {items:[]}, downloadItems = [], capabilityData = null, extensionPreview = null;
let historyData={items:[]},bookmarkData={tree:[]},workspaceData={items:[],groups:[]},resourceData=null,bookmarkFolder=null,extensionActions=[];
let settingsDirty=false,historySettingsDirty=false;
let bookmarkDraftIdentity=null,bookmarkMoveIdentity=null,historyDraftIdentity=null;
const bookmarkSnapshots=new Map();
function retainBookmarkDrafts(){const retained=new Set([bookmarkData.identity,bookmarkDraftIdentity,bookmarkMoveIdentity]);for(const identity of bookmarkSnapshots.keys())if(!retained.has(identity))bookmarkSnapshots.delete(identity);}
let lastProfiles = '', lastSettings = '', lastSaveError = '', addressDirty = false;
const tabNodes = new Map(), groupNodes=new Map(), painting = new WeakMap();
let hideTabPreview = () => {};
let revealedTabKey = '';
function updateWindowOverlay(){
  const overlay=navigator.windowControlsOverlay,rect=overlay?.getTitlebarAreaRect();
  document.body.dataset.windowOverlay=String(Boolean(overlay?.visible));
  document.documentElement.style.setProperty('--caption-reserve',`${overlay?.visible&&rect?Math.max(0,innerWidth-rect.right-8):0}px`);
}
navigator.windowControlsOverlay?.addEventListener('geometrychange',updateWindowOverlay);
window.addEventListener('resize',updateWindowOverlay);updateWindowOverlay();

function announce(message) { $('notice').textContent = String(message || ''); $('notice').title = String(message || ''); }
async function run(name, value) {
  try { return await api.command(name,value); } catch (error) { announce(error.message); return undefined; }
}
async function guarded(control, work) {
  if (control.disabled) return;
  control.disabled = true;
  try { return await work(); } catch (error) { announce(error.message); return undefined; }
  finally { control.disabled = false; if (control.closest('#extensions')) updateExtensionControls(); }
}
function node(tag, text, className) {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = String(text);
  if (className) result.className = className;
  return result;
}
function button(label, action, className) {
  const result = node('button',label,className); result.type = 'button';
  result.onclick = () => guarded(result,action); return result;
}
function action(label, command, value) { return button(label,()=>api.command(command,value)); }
function identityName(id) { return currentState.profiles.find(profile=>profile.id === id)?.name || id; }
function errorMessage(id, text) { $(id).textContent = text || ''; $(id).hidden = !text; }
function setOptions(select, profiles, selected) {
  select.replaceChildren(...profiles.map(profile=>{const option=node('option',profile.name);option.value=profile.id;return option;}));
  if (profiles.some(profile=>profile.id === selected)) select.value = selected;
}
function editForm(form, value, fields) {
  for (const name of fields) form.elements.namedItem(name).value = value[name] || '';
}
function draftFingerprint(form) {
  return JSON.stringify([...form.elements].filter(control=>control.name).map(control=>[control.name,control.value,control.type==='checkbox'?control.checked:null]));
}
async function saveForm(form, name, value, afterSave) {
  if(form.dataset.saving)return;
  const before=draftFingerprint(form), disabled=[...form.elements].map(control=>[control,control.disabled]);
  form.dataset.saving='true';form.setAttribute('aria-busy','true');
  for(const [control] of disabled)control.disabled=true;
  try {
    await api.command(name,value);
    if(draftFingerprint(form)===before)afterSave();else announce('The submitted values were saved. Newer edits remain in the form.');
  } catch(error) {announce(error.message);}
  finally {for(const [control,prior] of disabled)control.disabled=prior;delete form.dataset.saving;form.removeAttribute('aria-busy');}
}
function empty(text) { return node('p',text,'empty'); }
// Render every matching record in interruptible batches. There is no result cap.
function paintList(target, values, render, emptyText) {
  const ticket = {}; painting.set(target,ticket); target.replaceChildren();
  if (!values.length) {target.append(empty(emptyText));target.removeAttribute('aria-busy');return;}
  let index = 0; target.setAttribute('aria-busy','true');
  function step() {
    if (painting.get(target) !== ticket) return;
    const fragment = document.createDocumentFragment(), started = performance.now();
    do { fragment.append(render(values[index++])); } while (index < values.length && performance.now()-started < 8);
    target.append(fragment);
    if (index < values.length) requestAnimationFrame(step); else target.removeAttribute('aria-busy');
  }
  step();
}
function renderTabs(state) {
  const existing = new Set(state.tabs.map(tab=>tab.id));
  for (const [id, wrap] of tabNodes) if (!existing.has(id)) {wrap.remove();tabNodes.delete(id);}
  const activeWorkspace=state.activeWorkspaceId||'default',groups=new Map((workspaceData.groups||[]).map(group=>[group.id,group]));
  const ordered=[],seenGroups=new Set();
  state.tabs.forEach(tab=>{
    let wrap = tabNodes.get(tab.id);
    if (!wrap) {
      wrap = node('div',undefined,'tab'); wrap.dataset.tabId = tab.id;
      const select = action('', 'activate', tab.id), close = action('×','close',tab.id),menu=action('⋯','tab-menu',tab.id);
      select.className='tab-select';close.className='tab-close';menu.className='tab-menu';
      const icon=node('span',undefined,'tab-icon'), title=node('span',undefined,'tab-title'), status=node('span',undefined,'tab-status');
      icon.setAttribute('aria-hidden','true');status.setAttribute('aria-hidden','true');select.append(icon,title,status);
      select.setAttribute('role','tab');wrap.append(select,close,menu);tabNodes.set(tab.id,wrap);
      wrap.oncontextmenu=event=>{event.preventDefault();run('tab-menu',tab.id);};
      wrap.draggable=true;wrap.ondragstart=event=>event.dataTransfer?.setData('application/x-noxviola-tab',tab.id);
      wrap.ondragover=event=>{if([...event.dataTransfer?.types||[]].includes('application/x-noxviola-tab'))event.preventDefault();};
      wrap.ondrop=event=>{event.preventDefault();const moving=event.dataTransfer?.getData('application/x-noxviola-tab'),target=currentState.tabs.find(row=>row.id===wrap.dataset.tabId);if(moving&&target){const peers=currentState.tabs.filter(row=>(row.workspaceId||'default')===(target.workspaceId||'default'));run('tab-move',{id:moving,index:peers.findIndex(row=>row.id===target.id)});}};
    }
    const [select,close] = wrap.children;
    const label = tab.title || 'New tab',status = `${tab.pinned?'⌖ ':''}${tab.muted?'♬̸':tab.audible?'♬':''}`.trim();
    const icon=select.children[0],favicon=typeof tab.favicon==='string'&&/^data:image\/(?:png|x-icon);base64,/.test(tab.favicon)?tab.favicon:'';
    if (icon.dataset.favicon !== favicon) {
      icon.dataset.favicon=favicon; icon.replaceChildren();
      if(favicon){const image=node('img');image.alt='';image.src=favicon;icon.append(image);}
    }
    if (select.children[1].textContent !== label) select.children[1].textContent = label;
    if (select.children[2].textContent !== status) select.children[2].textContent = status;
    wrap.dataset.loading=String(Boolean(tab.loading));
    wrap.dataset.active=String(tab.id === state.activeId);
    select.title = `${identityName(tab.identity)} · ${tab.url}`;
    select.setAttribute('aria-selected',String(tab.id === state.activeId));
    select.setAttribute('aria-label',`${label}, ${identityName(tab.identity)}${tab.pinned?', pinned':''}${tab.muted?', muted':tab.audible?', playing audio':''}${tab.loading?', loading':''}`);
    select.tabIndex = tab.id === state.activeId ? 0 : -1;
    close.setAttribute('aria-label',`Close ${tab.title || 'New tab'}`);
    wrap.children[2].setAttribute('aria-label',`Actions for ${tab.title||'New tab'}`);
    wrap.dataset.pinned=String(Boolean(tab.pinned));
    const group=groups.get(tab.groupId),inWorkspace=(tab.workspaceId||'default')===activeWorkspace;
    wrap.hidden=!inWorkspace||Boolean(group?.collapsed&&tab.id!==state.activeId);
    if(group)wrap.dataset.groupColor=group.color;else delete wrap.dataset.groupColor;
    if(group&&inWorkspace&&!seenGroups.has(group.id)){
      seenGroups.add(group.id);let control=groupNodes.get(group.id);
      if(!control){control=button('',()=>api.command('group-update',{id:group.id,collapsed:!workspaceData.groups.find(row=>row.id===group.id)?.collapsed}),'tab-group');groupNodes.set(group.id,control);}
      control.textContent=`${group.collapsed?'▸':'▾'} ${group.name}`;control.dataset.groupColor=group.color;control.setAttribute('aria-expanded',String(!group.collapsed));ordered.push(control);
    }
    ordered.push(wrap);
  });
  for(const [id,control] of groupNodes)if(!seenGroups.has(id)){control.remove();groupNodes.delete(id);}
  ordered.forEach((control,index)=>{if($('tabs').children[index]!==control)$('tabs').insertBefore(control,$('tabs').children[index]||null);});
  const revealKey=`${activeWorkspace}:${state.activeId}:${state.preferences.tabLayout}`;
  if(revealedTabKey!==revealKey){const selected=tabNodes.get(state.activeId);if(selected&&!selected.hidden){selected.scrollIntoView?.({block:'nearest',inline:'nearest'});revealedTabKey=revealKey;}}
}
function bindTabPreviews() {
  const strip = $('tabs'); let timer = null, current = '';
  const hide = () => {
    clearTimeout(timer); timer = null;
    if (current) {current = ''; void run('tab-preview',{open:false});}
  };
  hideTabPreview = hide;
  const schedule = tab => {
    hide(); if (!tab || tab.hidden || currentState.panel || currentState.closing) return;
    timer = setTimeout(() => {
      if (!tab.isConnected || tab.hidden || currentState.panel || currentState.closing) return;
      const rect = tab.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      current = tab.dataset.tabId;
      void run('tab-preview',{open:true,id:current,position:{x:rect.x,y:rect.y,width:rect.width,height:rect.height,orientation:currentState.preferences.tabLayout==='vertical'?'vertical':'horizontal'}});
    },650);
  };
  strip.addEventListener('pointerover',event=>{const tab=event.target.closest('.tab');if(tab&&!tab.contains(event.relatedTarget))schedule(tab);});
  strip.addEventListener('pointerout',event=>{const tab=event.target.closest('.tab');if(tab&&!tab.contains(event.relatedTarget))hide();});
  strip.addEventListener('focusin',event=>schedule(event.target.closest('.tab')));
  strip.addEventListener('focusout',event=>{const tab=event.target.closest('.tab');if(!tab||!tab.contains(event.relatedTarget))hide();});
  for(const name of ['pointerdown','dragstart','scroll'])strip.addEventListener(name,hide,{passive:true});
  strip.addEventListener('wheel',event=>{if(currentState.preferences.tabLayout!=='vertical'&&strip.scrollWidth>strip.clientWidth&&event.deltaY){strip.scrollLeft+=event.deltaY;event.preventDefault();}},{passive:false});
  window.addEventListener('blur',hide);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')hide();});
}
bindTabPreviews();
const themeMedia=window.matchMedia?.('(prefers-color-scheme: light)');
function applyAppearance(preferences) {
  document.body.dataset.theme=preferences.theme==='system'?(themeMedia?.matches?'light':'dark'):preferences.theme||'dark';
  document.body.dataset.accent=preferences.accent||'violet';document.body.dataset.density=preferences.density||'comfortable';document.body.dataset.tabSearchPosition=preferences.tabSearchPosition||'left';
  document.querySelectorAll('[data-toolbar]').forEach(control=>{control.hidden=preferences.toolbar?.[control.dataset.toolbar]===false;});
  $('bookmarks-bar').hidden=!preferences.showBookmarksBar;
  $('extension-actions').hidden=preferences.toolbar?.extensions===false||!extensionActions.length;
  for(const badge of document.querySelectorAll('.extension-badge'))styleExtensionBadge(badge,JSON.parse(badge.dataset.color));
}
themeMedia?.addEventListener('change',()=>applyAppearance(currentState.preferences));
function renderPreferenceForm(state) {
  const form=$('settings-form'),values={theme:'dark',accent:'violet',density:'comfortable',tabSearchPosition:'left',tabSearchStyle:'detailed',homePage:'about:blank',customSearchURL:'https://duckduckgo.com/?q={searchTerms}',...state.preferences};
  editForm(form,values,['searchEngine','tabLayout','tabSearchPosition','tabSearchStyle','theme','accent','density','homePage','customSearchURL']);
  form.elements.namedItem('showBookmarksBar').checked=Boolean(values.showBookmarksBar);
  form.elements.namedItem('spellcheckEnabled').checked=values.spellcheckEnabled!==false;
  for(const name of ['home','library','extensions','split'])form.elements.namedItem(`toolbar.${name}`).checked=values.toolbar?.[name]!==false;
  $('shortcut-fields').replaceChildren(...(state.shortcuts||[]).map(shortcut=>{
    const label=node('label',shortcut.label),input=node('input');input.name=`shortcut.${shortcut.id}`;input.value=shortcut.accelerator;input.autocomplete='off';input.spellcheck=false;label.append(input);return label;
  }));
}
function renderState(state) {
  const old = currentState; currentState = state;
  if (old.activeWorkspaceId !== state.activeWorkspaceId || old.panel !== state.panel || old.preferences.tabLayout !== state.preferences.tabLayout || state.closing) hideTabPreview();
  const profilesKey = JSON.stringify(state.profiles);
  if (profilesKey !== lastProfiles) {
    setOptions($('identity'),state.profiles,state.currentIdentity);
    setOptions($('account-identity'),state.profiles,$('account-identity').value || state.currentIdentity);
    lastProfiles = profilesKey;
  } else $('identity').value = state.currentIdentity;
  renderTabs(state);
  const active = state.tabs.find(tab=>tab.id === state.activeId);
  if (old.activeId !== state.activeId) addressDirty = false;
  if (!addressDirty) $('address').value = active?.url === 'about:blank' ? '' : active?.url || '';
  $('back').disabled = !state.canBack; $('forward').disabled = !state.canForward;
  $('tabs').setAttribute('aria-orientation',state.preferences.tabLayout === 'vertical' ? 'vertical' : 'horizontal');
  document.body.dataset.tabLayout = state.preferences.tabLayout || 'horizontal';
  document.documentElement.style.setProperty('--chrome-height',`${state.chromeHeight||76}px`);applyAppearance(state.preferences);
  for (const panel of document.querySelectorAll('#workspace > section')) panel.hidden = panel.id !== state.panel;
  $('start').hidden = Boolean(state.panel) || active?.url !== 'about:blank';
  $('workspace').inert = Boolean(state.closing);
  $('retry-save').hidden = !state.saveError;
  if (state.saveError && state.saveError !== lastSaveError) announce(`Session not saved: ${state.saveError}`);
  if (state.closing && !old.closing) announce('Finishing pending work and saving your session…');
  lastSaveError = state.saveError;
  const settingsKey = JSON.stringify(state.preferences);
  if (lastSettings !== settingsKey) {if(!settingsDirty)renderPreferenceForm(state);lastSettings=settingsKey;}
  $('engine-version').textContent = `Noxviola ${state.engine?.appVersion||''} · Electron ${state.engine?.electron || 'unknown'} · Chromium ${state.engine?.chromium || 'unknown'} · ${state.engine?.isPackaged?'Packaged preview':'Development preview'}`;
  document.querySelectorAll('[data-command="restore"]').forEach(control=>{control.disabled=!state.canRestore;});
  if (old.panel !== state.panel) renderPanel(state.panel);
  else if(state.panel==='workspaces')refreshWorkspaceState();
  else if(state.panel==='downloads'&&(old.currentIdentity!==state.currentIdentity||JSON.stringify(old.downloadHistory)!==JSON.stringify(state.downloadHistory)||JSON.stringify(old.profiles)!==profilesKey))renderDownloads();
  if(old.currentIdentity!==state.currentIdentity)renderBookmarksBar();
  renderWorkspaceSelector();
}
function renderPanel(panel) {
  if (panel === 'vault') renderVault();
  else if (panel === 'accounts') renderAccounts();
  else if (panel === 'extensions') renderExtensions();
  else if (panel === 'downloads') renderDownloads();
  else if (panel === 'permissions') renderPermissions();
  else if (panel === 'capabilities') renderCapabilities();
  else if(panel==='history')renderHistory();
  else if(panel==='bookmarks')renderBookmarks();
  else if(panel==='workspaces')renderWorkspaces();
  else if(panel==='resources')renderResources();
}

// IME candidate confirmation/cancellation belongs to the input method, not to
// browser commands. Keep composition state for form submits without key metadata.
const composingInputs = new WeakSet();
for (const id of ['address', 'find', 'identity-name']) {
  const field = $(id);
  field.addEventListener('compositionstart',()=>composingInputs.add(field));
  field.addEventListener('compositionend',()=>composingInputs.delete(field));
  field.addEventListener('blur',()=>composingInputs.delete(field));
}
function composing(event) { return event.isComposing || event.keyCode === 229 || composingInputs.has(event.currentTarget); }
$('address').addEventListener('input',()=>{addressDirty=true;});
$('address').addEventListener('keydown',event=>{
  if (composing(event)) return;
  if (event.key === 'Escape') {addressDirty=false;const tab=currentState.tabs.find(row=>row.id===currentState.activeId);$('address').value=tab?.url === 'about:blank' ? '' : tab?.url || '';}
});
$('navigate').addEventListener('submit',async event=>{
  event.preventDefault(); if (composingInputs.has($('address'))) return; const value=$('address').value;
  try {await api.command('navigate',value);if($('address').value===value)addressDirty=false;} catch(error) {announce(error.message);}
});
document.querySelectorAll('[data-command]').forEach(control=>control.addEventListener('click',()=>guarded(control,()=>api.command(control.dataset.command))));
$('back').onclick=()=>run('back');$('forward').onclick=()=>run('forward');$('find').oninput=()=>run('find',$('find').value);
function showFind(){ $('find-controls').hidden=false;$('find-toggle').setAttribute('aria-expanded','true');$('find').focus();$('find').select(); }
function closeFind(){ $('find').value='';void run('find','');$('find-controls').hidden=true;$('find-toggle').setAttribute('aria-expanded','false');$('find-toggle').focus(); }
$('find-toggle').onclick=()=>{if($('find-controls').hidden)showFind();else closeFind();};
$('find-close').onclick=closeFind;
$('find-previous').onclick=()=>run('find',{query:$('find').value,forward:false,findNext:true});
$('find-next').onclick=()=>run('find',{query:$('find').value,forward:true,findNext:true});
$('find').onkeydown=event=>{if(composing(event))return;if(event.key==='Enter'){event.preventDefault();run('find',{query:$('find').value,forward:!event.shiftKey,findNext:true});}else if(event.key==='Escape'){event.preventDefault();closeFind();}};
api.onFindResult(result=>{$('find-count').textContent=result.matches?`${result.activeMatchOrdinal||0}/${result.matches}`:'';});
$('open-tools').onclick=()=>run('tools');
$('tab-search-toggle').onclick=()=>{const rect=$('tab-search-toggle').getBoundingClientRect();void run('search-tabs',{anchor:{x:rect.x,y:rect.y,width:rect.width,height:rect.height,align:currentState.preferences.tabSearchPosition==='right'?'right':'left'}});};
$('start-search').onclick=()=>{$('address').focus();$('address').select();};
$('identity').onchange=()=>run('identity-switch',$('identity').value);
$('add-identity').onclick=()=>{const field=$('identity-name');field.hidden=!field.hidden;if(!field.hidden)field.focus();};
$('identity-name').onkeydown=async event=>{
  if (composing(event)) return;
  if (event.key === 'Escape') {event.currentTarget.hidden=true;return;}
  if (event.key !== 'Enter' || !event.currentTarget.value.trim()) return;
  const field=event.currentTarget;field.disabled=true;
  try {await api.command('identity-add',field.value);field.value='';field.hidden=true;} catch(error) {announce(error.message);} finally {field.disabled=false;}
};
$('tabs').onkeydown=event=>{
  const vertical=currentState.preferences.tabLayout==='vertical';
  const previous=vertical?'ArrowUp':'ArrowLeft', next=vertical?'ArrowDown':'ArrowRight';
  if (![previous,next,'Home','End'].includes(event.key) || !event.target.matches('[role="tab"]')) return;
  const selectable=currentState.tabs.filter(tab=>!tabNodes.get(tab.id)?.hidden),index=selectable.findIndex(tab=>tab.id===event.target.parentElement.dataset.tabId), count=selectable.length;
  if (!count) return; event.preventDefault();
  const target=event.key==='Home'?0:event.key==='End'?count-1:(index+(event.key===next?1:-1)+count)%count;
  run('activate',selectable[target].id);tabNodes.get(selectable[target].id).firstElementChild.focus();
};
api.onAddress(()=>{$('address').focus();$('address').select();});api.onFind(showFind);api.onNotice(announce);api.onState(renderState);

function resetVaultForm() {$('vault-add').reset();$('vault-add').elements.namedItem('id').value='';$('vault-editor').open=false;}
function renderVault() {
  const query=$('vault-search').value.toLocaleLowerCase();
  const values=vaultItems.filter(item=>(!$('favorites').checked||item.favorite)&&Boolean(item.archived)===$('vault-archived').checked&&
    [item.title,item.url,item.kind,item.group,item.characters,item.notes].join(' ').toLocaleLowerCase().includes(query));
  $('vault-count').textContent=`${values.length.toLocaleString()} matching items · ${vaultItems.length.toLocaleString()} total, including archived`;
  paintList($('vault-items'),values,item=>{
    const card=node('article'), heading=node('h2',item.title), source=node('p',item.url,'source');
    const detail=node('p',[item.kind,item.group,item.characters].filter(Boolean).join(' · '));
    const actions=node('div',undefined,'card-actions');
    actions.append(action('Open source','vault-open',item.id),action(item.favorite?'★ Favorite':'☆ Favorite','vault-star',item.id),
      button('Edit',()=>{editForm($('vault-add'),item,['id','title','url','kind','group','characters','notes']);$('vault-editor').open=true;$('vault-add').elements.namedItem('title').focus();}),
      action(item.archived?'Restore item':'Archive item','vault-archive',item.id));
    card.append(heading,detail,source);if(item.notes)card.append(node('p',item.notes,'notes'));card.append(actions);return card;
  },'No matching library items. Add a reference or change the filters.');
}
api.onVault(data=>{
  vaultItems=data.items;errorMessage('vault-error',data.error);$('vault-recover').hidden=!data.recoveryAvailable;
  $('vault-preview').hidden=!data.preview;
  if(data.preview)$('vault-preview-summary').textContent=`Import review: ${data.preview.total} source items, ${data.preview.added} new items, ${data.preview.skipped} existing items skipped, ${data.preview.remapped} conflicting IDs reassigned. ${vaultItems.length+data.preview.added} items after import. Nothing is written until you apply.`;
  if(data.open)renderVault();
});
api.onVaultDraft(draft=>{resetVaultForm();editForm($('vault-add'),draft,['title','url','kind']);$('vault-editor').open=true;$('vault-add').elements.namedItem('title').focus();});
for(const id of ['vault-search','favorites','vault-archived'])$(id).addEventListener(id==='vault-search'?'input':'change',renderVault);
$('vault-reset').onclick=resetVaultForm;
$('vault-add').onsubmit=async event=>{
  event.preventDefault();const form=event.currentTarget,value=Object.fromEntries(new FormData(form));if(!value.id)delete value.id;
  await saveForm(form,'vault-save',value,resetVaultForm);
};

function resetAccountForm() {$('account-form').reset();$('account-form').elements.namedItem('id').value='';delete $('account-form').dataset.archived;$('account-identity').value=currentState.currentIdentity;}
function renderAccounts() {
  const query=$('account-search').value.toLocaleLowerCase();
  const values=accountItems.filter(item=>($('show-archived').checked||!item.archived)&&[item.label,item.handle,item.origin,identityName(item.identity)].join(' ').toLocaleLowerCase().includes(query));
  paintList($('account-items'),values,item=>{
    const card=node('article'),actions=node('div',undefined,'card-actions');
    card.append(node('h2',item.label),node('p',[item.origin,item.handle].filter(Boolean).join(' · '),'source'),node('p',`${identityName(item.identity)} · ${item.created?'Created':'Not marked created'} · ${item.inPasswordManager?'Password-manager marker set':'No password-manager marker'}${item.archived?' · Archived':''}`));
    const open=action('Open in assigned identity','account-open',item.id);open.disabled=Boolean(item.archived);
    actions.append(open,button('Edit',()=>{
      const form=$('account-form');editForm(form,item,['id','label','handle','origin','identity']);
      for(const key of ['created','inPasswordManager'])form.elements.namedItem(key).checked=Boolean(item[key]);
      form.dataset.archived=String(item.archived);form.elements.namedItem('label').focus();
    }),action(item.archived?'Restore record':'Archive record','account-archive',item.id));card.append(actions);return card;
  },'No matching account metadata. Add a record or change the filters.');
}
api.onAccounts(data=>{accountItems=data.accounts;errorMessage('account-error',data.error);$('account-recover').hidden=!data.recoveryAvailable;if(data.open)renderAccounts();});
$('account-search').oninput=renderAccounts;$('show-archived').onchange=renderAccounts;$('account-reset').onclick=resetAccountForm;
$('account-form').onsubmit=async event=>{
  event.preventDefault();const form=event.currentTarget,value=Object.fromEntries(new FormData(form));if(!value.id)delete value.id;
  for(const name of ['created','inPasswordManager'])value[name]=form.elements.namedItem(name).checked;value.archived=form.dataset.archived==='true';
  await saveForm(form,'account-save',value,resetAccountForm);
};

function permissionText(permissions={}) {
  const lines=[`Required APIs: ${(permissions.required||[]).join(', ')||'none declared'}`,`Required hosts: ${(permissions.hosts||[]).join(', ')||'none declared'}`,
    `Optional APIs: ${(permissions.optional||[]).join(', ')||'none declared'}`,`Optional hosts: ${(permissions.optionalHosts||[]).join(', ')||'none declared'}`];
  for(const script of permissions.contentScripts||[])lines.push(`Content scripts: ${script.matches.join(', ')}${script.excludeMatches?.length?` · excluding ${script.excludeMatches.join(', ')}`:''} · ${script.allFrames?'all frames':'top frame'} · ${script.runAt}`);
  lines.push('Local file access is off.');return lines.join('\n');
}
function compatibilityText(compatibility={}) {
  return [`Functional verification: ${compatibility.functionalVerification||'not-tested'}.`,...(compatibility.issues||[]).map(issue=>`${issue.status}: ${issue.detail}`),compatibility.detection||''].filter(Boolean).join('\n');
}
function updateExtensionControls() {
  for(const id of ['extension-import-directory','extension-import-package','extension-install','extension-cancel','extension-api-profile'])$(id).disabled=Boolean(extensionData.busy);
  $('extension-install').disabled=Boolean(extensionData.busy)||!extensionPreview||!$('extension-accept').checked||
    !$('extension-preview-identities').querySelector('input:checked')||Boolean(extensionPreview.requiresUnsignedImportAcceptance&&!$('extension-unsigned').checked);
}
function showExtensionPreview(preview) {
  extensionPreview=preview;$('extension-preview').hidden=!preview;
  if(!preview){updateExtensionControls();return;}
  $('extension-preview-title').textContent=`${preview.name} · ${preview.version}`;
  $('extension-preview-description').textContent=preview.description||`${preview.format.toUpperCase()} · Manifest V${preview.manifestVersion}`;
  $('extension-preview-permissions').textContent=permissionText(preview.permissions);
  $('extension-preview-compatibility').textContent=compatibilityText(preview.compatibility);
  $('extension-api-profile').value=preview.apiProfileSuggestion==='firefox'?'firefox':'chromium';
  $('extension-preview-provenance').textContent=`Local source: ${preview.provenance.filename}. Publisher not verified. ${preview.files} files, ${bytes(preview.bytes)}. Package SHA-256: ${preview.packageDigest}`;
  $('extension-preview-identities').replaceChildren(...currentState.profiles.map(profile=>{
    const label=node('label'),input=node('input');input.type='checkbox';input.value=profile.id;input.checked=profile.id===currentState.currentIdentity;
    input.onchange=updateExtensionControls;label.append(input,document.createTextNode(profile.name));return label;
  }));
  $('extension-accept').checked=false;$('extension-unsigned').checked=false;
  $('extension-unsigned-label').hidden=!preview.requiresUnsignedImportAcceptance;updateExtensionControls();
}
api.onExtensionPreview(showExtensionPreview);
async function inspectExtension(format) {
  if(extensionPreview){await api.command('extension-preview-cancel',extensionPreview.token);showExtensionPreview(null);}
  await api.command('extension-preview-dialog',format);
}
$('extension-import-directory').onclick=()=>guarded($('extension-import-directory'),()=>inspectExtension('directory'));
$('extension-import-package').onclick=()=>guarded($('extension-import-package'),()=>inspectExtension('package'));
$('extension-accept').onchange=updateExtensionControls;$('extension-unsigned').onchange=updateExtensionControls;
$('extension-cancel').onclick=()=>guarded($('extension-cancel'),async()=>{if(extensionPreview)await api.command('extension-preview-cancel',extensionPreview.token);showExtensionPreview(null);});
$('extension-install').onclick=()=>guarded($('extension-install'),async()=>{
  if(!extensionPreview)throw new Error('Inspect a package first.');
  const identities=[...$('extension-preview-identities').querySelectorAll('input:checked')].map(input=>input.value);
  const item=await api.command('extension-install',{token:extensionPreview.token,identities,permissionsAccepted:$('extension-accept').checked,unsignedImportAccepted:$('extension-unsigned').checked,apiProfile:$('extension-api-profile').value});
  showExtensionPreview(null);
  const failed=item.identities.filter(grant=>grant.status!=='loaded');
  announce(failed.length?`Package installed; ${failed.length} identity runtime(s) not loaded. Review the listed errors.`:'Package loaded in the selected identities. Functional compatibility remains unverified.');
});
function renderExtensions() {
  errorMessage('extension-error',extensionData.error);updateExtensionControls();
  const query=$('extension-search').value.toLocaleLowerCase(), format=$('extension-format').value;
  const values=extensionData.items.filter(item=>(!format||item.format===format)&&[item.name,item.description,item.version].join(' ').toLocaleLowerCase().includes(query));
  $('extension-count').textContent=`${values.length} matching packages · ${extensionData.items.length} installed${extensionData.busy?' · Working…':''}`;
  paintList($('extension-items'),values,item=>{
    const card=node('article'),details=node('details'),summary=node('summary','Permissions, compatibility and source');
    card.append(node('h2',`${item.name} · ${item.version}`),node('p',`${item.format.toUpperCase()} · Manifest V${item.manifestVersion} · Functional compatibility not verified`,'subtle'));
    if(item.description)card.append(node('p',item.description));
    details.append(summary,node('p',`Compatibility behavior: ${item.apiProfile==='firefox'?'Firefox':'Chrome, Edge or Opera'}`),node('pre',permissionText(item.permissions)),node('pre',compatibilityText(item.compatibility)),node('p',`Publisher not verified · Package SHA-256: ${item.packageDigest}`,'source'));card.append(details);
    for(const grant of item.identities){
      const group=node('div',undefined,'identity-grant'),controls=node('div',undefined,'card-actions');
      group.append(node('p',`${identityName(grant.identity)} · ${grant.status}${grant.error?` · ${grant.error}`:''}`));
      const mustStop=grant.status==='disable-failed';
      controls.append(action(mustStop?'Retry disable':grant.enabled?'Disable':'Enable','extension-enable',{id:item.id,identity:grant.identity,enabled:mustStop?false:!grant.enabled}));
      if(grant.enabled&&['load-failed','not-loaded'].includes(grant.status))controls.append(action('Retry load','extension-enable',{id:item.id,identity:grant.identity,enabled:true}));
      if(grant.status==='loaded'){
        if(item.pages?.popup)controls.append(action('Open popup','extension-popup',{id:item.id,identity:grant.identity}));
        if(item.pages?.options)controls.append(action('Options','extension-options',{id:item.id,identity:grant.identity}));
      }
      group.append(controls);card.append(group);
    }
    const available=currentState.profiles.filter(profile=>!item.identities.some(grant=>grant.identity===profile.id));
    if(available.length){
      const group=node('div',undefined,'identity-grant'),select=node('select');select.setAttribute('aria-label',`Additional identity for ${item.name}`);setOptions(select,available,available[0].id);
      const consent=node('label',undefined,'consent'),check=node('input');check.type='checkbox';consent.append(check,document.createTextNode('I accept the displayed permissions for this additional identity.'));
      const authorize=button('Authorize identity',async()=>{if(!check.checked)throw new Error('Review and accept the permissions for this identity.');await api.command('extension-authorize',{id:item.id,identity:select.value,permissionsAccepted:true});});
      authorize.disabled=true;check.onchange=()=>{authorize.disabled=!check.checked||extensionData.busy;};group.append(select,consent,authorize);card.append(group);
    }
    card.append(node('p','Uninstall removes owned code and enrollment. Chromium extension data remains in its original identities.','subtle'),action('Uninstall','extension-uninstall',item.id));
    if(extensionData.busy)card.querySelectorAll('button').forEach(control=>{control.disabled=true;});return card;
  },'No matching extensions. Inspect an authorized local package to begin.');
}
api.onExtensions(data=>{extensionData=data;errorMessage('extension-error',data.error);updateExtensionControls();if(data.open)renderExtensions();});
$('extension-search').oninput=renderExtensions;$('extension-format').onchange=renderExtensions;

function bytes(value) {
  if(!Number.isFinite(value)||value<0)return 'unknown size';
  const units=['B','KiB','MiB','GiB','TiB'];let index=0;while(value>=1024&&index<units.length-1){value/=1024;index++;}
  return `${index?value.toFixed(1):value} ${units[index]}`;
}
function renderDownloads() {
  const history=currentState.downloadHistory||{status:'memory',persistent:false,pendingCount:0},editable=history.persistent&&['new','ready'].includes(history.status);
  const mine=downloadItems.filter(item=>item.identity===currentState.currentIdentity),active=mine.some(item=>!item.terminal);
  errorMessage('download-history-error',history.error);
  $('download-history-status').textContent=!history.persistent?'Transfer records are available for this browser run.':history.pendingCount?`${history.pendingCount} transfer record${history.pendingCount===1?' has':'s have'} changes waiting to be saved.`:editable?'Download history is ready. No unsaved transfer status.':'Download history needs attention. Current transfers remain available.';
  $('download-history-retry').hidden=!history.persistent||history.recoveryAvailable||(!history.error&&!history.pendingCount);
  $('download-history-recover').hidden=!history.recoveryAvailable;
  const clear=$('download-history-clear');clear.textContent=`Clear saved history for ${identityName(currentState.currentIdentity)}`;clear.hidden=!history.persistent;clear.disabled=!editable||active||!mine.length;
  clear.title=active?'Finish or cancel active transfers for this identity first.':'Downloaded files are kept.';
  paintList($('download-items'),[...downloadItems].reverse(),item=>{
    const card=node('article'),actions=node('div',undefined,'card-actions');
    card.append(node('h2',item.filename),node('p',`${identityName(item.identity)} · ${item.state}${item.paused?' · paused':''}`),node('p',`${bytes(item.received)}${item.total>0?` of ${bytes(item.total)}`:''}`));
    if(item.total>0){const progress=node('progress');progress.max=item.total;progress.value=item.received;progress.setAttribute('aria-label',`Download progress for ${item.filename}`);card.append(progress);}
    if(item.path)card.append(node('p',item.path,'source'));if(item.error)card.append(node('p',item.error,'error'));
    if(item.historyPending)card.append(node('p','The latest transfer status is waiting to be saved.','error'));
    else if(item.restored&&item.historySaved)card.append(node('p','Restored from saved download history.','subtle'));
    if(item.state==='completed')actions.append(action('Show in folder','download-action',{id:item.id,action:'reveal'}));
    if(!item.terminal&&item.cancelPending){
      const waiting=node('button','Canceling…');waiting.type='button';waiting.disabled=true;actions.append(waiting);
    }else if(!item.terminal){
      if(item.paused||item.canResume)actions.append(action('Resume','download-action',{id:item.id,action:'resume'}));
      else if(item.state==='progressing')actions.append(action('Pause','download-action',{id:item.id,action:'pause'}));
      actions.append(action('Cancel','download-action',{id:item.id,action:'cancel'}));
    }
    if(item.terminal&&history.persistent){const remove=action('Remove from history','download-history-remove',item.id);remove.disabled=!editable;remove.title='Downloaded files are kept.';actions.append(remove);}
    card.append(actions);return card;
  },'No download records.');
}
api.onDownloads(items=>{downloadItems=items;if(currentState.panel==='downloads')renderDownloads();});
async function downloadHistoryAction(control,name,value){await guarded(control,()=>api.command(name,value));if(currentState.panel==='downloads')renderDownloads();}
$('download-history-clear').onclick=()=>downloadHistoryAction($('download-history-clear'),'download-history-clear',currentState.currentIdentity);
$('download-history-retry').onclick=()=>downloadHistoryAction($('download-history-retry'),'download-history-retry');
$('download-history-recover').onclick=()=>downloadHistoryAction($('download-history-recover'),'download-history-recover');
function renderPermissions() {
  errorMessage('permission-error',permissionData.error);$('permission-recover').hidden=!permissionData.recoveryAvailable;
  $('permission-reset').disabled=!['new','ready'].includes(permissionData.status);
  paintList($('permission-items'),permissionData.items,item=>{
    const card=node('article');card.append(node('h2',item.permission),node('p',`${identityName(item.identity)} · ${item.decision} · ${item.scope==='document'?'this document only':'saved decision'}`),node('p',`Requesting site: ${item.requestingOrigin}`,'source'),node('p',`Embedded by: ${item.embeddingOrigin}`,'source'),action('Forget decision','permission-revoke',item.id));return card;
  },'No saved permission decisions. Supported requests will ask before access is granted.');
}
api.onPermissions(data=>{permissionData=data;if(data.open)renderPermissions();});
$('permission-reset').onclick=()=>guarded($('permission-reset'),()=>api.command('permission-reset',currentState.currentIdentity));
$('settings-form').addEventListener('input',()=>{settingsDirty=true;});$('settings-form').addEventListener('change',()=>{settingsDirty=true;});
$('settings-form').onsubmit=event=>{
  event.preventDefault();const form=event.currentTarget,data=new FormData(form),value={toolbar:{},shortcuts:{}};
  for(const name of ['searchEngine','tabLayout','tabSearchPosition','tabSearchStyle','theme','accent','density','homePage','customSearchURL'])value[name]=data.get(name);
  value.showBookmarksBar=form.elements.namedItem('showBookmarksBar').checked;
  value.spellcheckEnabled=form.elements.namedItem('spellcheckEnabled').checked;
  for(const name of ['home','library','extensions','split'])value.toolbar[name]=form.elements.namedItem(`toolbar.${name}`).checked;
  for(const [key,entry] of data)if(key.startsWith('shortcut.'))value.shortcuts[key.slice(9)]=entry;
  saveForm(form,'settings-save',value,()=>{settingsDirty=false;announce('Preferences saved.');});
};
$('shortcuts-reset').onclick=()=>{settingsDirty=true;for(const shortcut of currentState.shortcuts||[]){const field=$('settings-form').elements.namedItem(`shortcut.${shortcut.id}`);if(field)field.value=shortcut.defaultAccelerator||'';}};
api.onSettingsPreview(preview=>{$('settings-preview').hidden=!preview;$('settings-preview-details').textContent=preview?preview.changes.map(change=>`${change.name}\n  Current: ${JSON.stringify(change.before)}\n  Proposed: ${JSON.stringify(change.after)}`).join('\n\n')||'This preset matches the current preferences.':'';});

function flattenBookmarks(data=bookmarkData) {
  const result=[],pending=[...(data.tree||[])].reverse().map(item=>({item,path:[]}));
  while(pending.length){const {item,path}=pending.pop(),location=[...path,item.title];result.push({...item,path:location.join(' › ')});
    for(const child of [...item.children||[]].reverse())pending.push({item:child,path:location});}
  return result;
}
function folderOptions(select,folders,selected) {
  select.replaceChildren(...folders.filter(item=>item.parentId!==undefined).map(item=>{const option=node('option',item.path);option.value=item.id;return option;}));
  if(folders.some(item=>item.id===selected))select.value=selected;
}
function renderBookmarksBar() {
  const bar=$('bookmarks-bar');bar.hidden=!currentState.preferences.showBookmarksBar;
  if(bookmarkData.identity!==currentState.currentIdentity){bar.replaceChildren();return;}
  const folder=flattenBookmarks().find(item=>item.folderType==='bookmarks-bar');
  bar.replaceChildren(...(folder?.children||[]).map(item=>{
    if(item.type==='separator')return node('span','│','subtle');
    const control=item.type==='folder'?button(`▸ ${item.title}`,()=>{bookmarkFolder=item.id;if(currentState.panel!=='bookmarks')return api.command('bookmarks');renderBookmarks();}):action(item.title||item.url,'bookmark-open',{id:item.id,identity:bookmarkData.identity});
    control.title=item.url||item.title;return control;
  }));
  if(!folder?.children?.length)bar.append(button('Add a bookmark',()=>api.command('bookmark-current')));
}
function resetBookmarkForm() {
  bookmarkDraftIdentity=null;
  retainBookmarkDrafts();
  const form=$('bookmark-form');form.reset();form.elements.namedItem('id').value='';form.elements.namedItem('type').disabled=false;form.elements.namedItem('parentId').disabled=false;
  if(bookmarkFolder)form.elements.namedItem('parentId').value=bookmarkFolder;$('bookmark-editor').open=false;bookmarkTypeChanged();renderBookmarks();
}
function bookmarkTypeChanged() {const form=$('bookmark-form'),website=form.elements.namedItem('type').value==='bookmark';form.elements.namedItem('url').disabled=!website;form.elements.namedItem('url').required=website;}
function renderBookmarks() {
  errorMessage('bookmark-error',bookmarkData.error);$('bookmark-recover').hidden=!bookmarkData.recoveryAvailable;
  $('bookmark-identity').textContent=`Saved websites and folders for ${identityName(bookmarkData.identity||currentState.currentIdentity)}.`;
  const all=flattenBookmarks(),folders=all.filter(item=>item.type==='folder');
  if(!folders.some(item=>item.id===bookmarkFolder))bookmarkFolder=folders.find(item=>item.folderType==='bookmarks-bar')?.id||folders[0]?.id;
  const parent=folders.find(item=>item.id===bookmarkFolder),query=$('bookmark-search').value.toLocaleLowerCase();
  const values=query?all.filter(item=>!item.protected&&[item.title,item.url,...item.tags||[]].join(' ').toLocaleLowerCase().includes(query)):parent?.children||[];
  $('bookmark-location').textContent=query?`${values.length} matching bookmarks and folders`:parent?.path||'No bookmark data available.';
  $('bookmark-up').disabled=!parent?.parentId;$('bookmark-up').onclick=()=>{bookmarkFolder=parent?.parentId;$('bookmark-search').value='';renderBookmarks();};
  const draftOwner=bookmarkDraftIdentity||bookmarkData.identity||currentState.currentIdentity;
  const draftFolders=flattenBookmarks(bookmarkSnapshots.get(draftOwner)||bookmarkData).filter(item=>item.type==='folder');
  const moveFolders=flattenBookmarks(bookmarkSnapshots.get(bookmarkMoveIdentity)||bookmarkData).filter(item=>item.type==='folder');
  folderOptions($('bookmark-parent'),draftFolders,$('bookmark-parent').value||bookmarkFolder);
  folderOptions($('bookmark-move-parent'),moveFolders,$('bookmark-move-parent').value||bookmarkFolder);
  $('bookmark-draft-identity').textContent=`This draft saves in ${identityName(draftOwner)}${draftOwner!==currentState.currentIdentity?' even while you browse another identity':''}.`;
  paintList($('bookmark-items'),values,item=>{
    const card=node('article'),detail=node('div',undefined,'record-details'),actions=node('div',undefined,'card-actions');
    detail.append(node('h2',item.type==='folder'?`Folder · ${item.title}`:item.type==='separator'?'Separator':item.title||item.url));
    if(item.url)detail.append(node('p',item.url,'source'));
    const owner=item.identity||bookmarkData.identity;
    actions.append(item.type==='folder'?button('Open folder',()=>{bookmarkFolder=item.id;$('bookmark-search').value='';renderBookmarks();}):action('Open','bookmark-open',{id:item.id,identity:owner}));
    if(item.type==='separator')actions.firstElementChild.remove();
    if(!item.protected){
      if(item.type!=='separator')actions.append(button('Edit',()=>{
        bookmarkDraftIdentity=owner;
        const form=$('bookmark-form');editForm(form,item,['id','title','url','type','parentId']);form.elements.namedItem('type').disabled=true;form.elements.namedItem('parentId').disabled=true;
        bookmarkTypeChanged();$('bookmark-draft-identity').textContent=`This draft saves in ${identityName(owner)}.`;$('bookmark-editor').open=true;form.elements.namedItem('title').focus();
      }));
      actions.append(button('Move',()=>{bookmarkMoveIdentity=owner;$('bookmark-move-editor').hidden=false;$('bookmark-move-editor').open=true;$('bookmark-move-form').elements.namedItem('id').value=item.id;renderBookmarks();$('bookmark-move-parent').value=item.parentId;}),action('Remove','bookmark-remove',{id:item.id,identity:owner}));
    }
    card.append(detail,actions);return card;
  },'This folder has no matching bookmarks. Add a website or create a folder.');
}
api.onBookmarks(data=>{const changedIdentity=bookmarkData.identity!==data.identity;bookmarkData=data;if(data.identity)bookmarkSnapshots.set(data.identity,data);retainBookmarkDrafts();if(changedIdentity)bookmarkFolder=null;renderBookmarksBar();if(currentState.panel==='bookmarks')renderBookmarks();});
$('bookmark-search').oninput=renderBookmarks;$('bookmark-reset').onclick=resetBookmarkForm;
$('bookmark-add').onclick=()=>{resetBookmarkForm();bookmarkDraftIdentity=bookmarkData.identity||currentState.currentIdentity;renderBookmarks();$('bookmark-editor').open=true;$('bookmark-form').elements.namedItem('title').focus();};
$('bookmark-form').addEventListener('input',()=>{bookmarkDraftIdentity ||= bookmarkData.identity||currentState.currentIdentity;});
$('bookmark-form').addEventListener('change',()=>{bookmarkDraftIdentity ||= bookmarkData.identity||currentState.currentIdentity;});
$('bookmark-form').elements.namedItem('type').onchange=bookmarkTypeChanged;
$('bookmark-form').onsubmit=event=>{
  event.preventDefault();const form=event.currentTarget,id=form.elements.namedItem('id').value,type=form.elements.namedItem('type').value;
  const value={title:form.elements.namedItem('title').value,identity:bookmarkDraftIdentity||bookmarkData.identity||currentState.currentIdentity};if(type==='bookmark')value.url=form.elements.namedItem('url').value;
  if(id)value.id=id;else{value.type=type;value.parentId=form.elements.namedItem('parentId').value;}
  saveForm(form,'bookmark-save',value,resetBookmarkForm);
};
$('bookmark-move-form').onsubmit=event=>{event.preventDefault();const form=event.currentTarget;saveForm(form,'bookmark-move',{...Object.fromEntries(new FormData(form)),identity:bookmarkMoveIdentity||bookmarkData.identity},()=>{$('bookmark-move-editor').hidden=true;bookmarkMoveIdentity=null;retainBookmarkDrafts();});};

function renderHistory() {
  errorMessage('history-error',historyData.error);$('history-recover').hidden=!historyData.recoveryAvailable;
  $('history-identity').textContent=`Visits recorded on this device for ${identityName(historyData.identity||currentState.currentIdentity)}.`;
  $('history-draft-identity').textContent=historySettingsDirty?`Unsaved settings apply to ${identityName(historyDraftIdentity)}.`:`These settings apply to ${identityName(historyData.identity||currentState.currentIdentity)}.`;
  if(!historySettingsDirty){const form=$('history-settings');form.elements.namedItem('recording').checked=historyData.settings?.recording!==false;form.elements.namedItem('retentionDays').value=historyData.settings?.retentionDays??'';}
  const query=$('history-search').value.toLocaleLowerCase(),values=(historyData.items||[]).filter(item=>[item.title,item.url].join(' ').toLocaleLowerCase().includes(query));
  $('history-count').textContent=`${values.length.toLocaleString()} matching pages · ${(historyData.items||[]).length.toLocaleString()} recorded pages`;
  paintList($('history-items'),values,item=>{
    const card=node('article'),details=node('div',undefined,'record-details'),actions=node('div',undefined,'card-actions');
    details.append(node('h2',item.title||item.url),node('p',item.url,'source'),node('p',`${new Date(item.lastVisitTime).toLocaleString()} · ${item.visitCount} visit${item.visitCount===1?'':'s'}`,'subtle'));
    actions.append(action('Open','history-open',{url:item.url,identity:historyData.identity}),action('Remove from history','history-remove',{url:item.url,identity:historyData.identity}));card.append(details,actions);return card;
  },'No matching history. Visit a website with recording enabled, or change the search.');
}
api.onHistory(data=>{historyData=data;if(currentState.panel==='history')renderHistory();});$('history-search').oninput=renderHistory;
$('history-clear').onclick=()=>guarded($('history-clear'),()=>api.command('history-clear',{identity:historyData.identity||currentState.currentIdentity}));
function historyDraftChanged(){historySettingsDirty=true;historyDraftIdentity ||= historyData.identity||currentState.currentIdentity;$('history-draft-identity').textContent=`Unsaved settings apply to ${identityName(historyDraftIdentity)}.`;}
$('history-settings').addEventListener('input',historyDraftChanged);$('history-settings').addEventListener('change',historyDraftChanged);
$('history-settings').onsubmit=event=>{event.preventDefault();const form=event.currentTarget,days=form.elements.namedItem('retentionDays').value;
  saveForm(form,'history-settings',{identity:historyDraftIdentity||historyData.identity||currentState.currentIdentity,recording:form.elements.namedItem('recording').checked,retentionDays:days?Number(days):null},()=>{historySettingsDirty=false;historyDraftIdentity=null;renderHistory();announce('History settings saved.');});};

const workspaceAssignments=new Map();
let workspaceVisibleKey='';
function workspaceKey(){return JSON.stringify([currentState.activeWorkspaceId||'default',currentState.tabs.filter(tab=>(tab.workspaceId||'default')===(currentState.activeWorkspaceId||'default')).map(tab=>tab.id)]);}
function refreshWorkspaceState(){
  if(workspaceVisibleKey!==workspaceKey()){renderWorkspaces();return;}
  const workspaceCounts=new Map(),groupCounts=new Map(),byId=new Map();
  for(const tab of currentState.tabs){const workspace=tab.workspaceId||'default';workspaceCounts.set(workspace,(workspaceCounts.get(workspace)||0)+1);if(tab.groupId)groupCounts.set(tab.groupId,(groupCounts.get(tab.groupId)||0)+1);byId.set(tab.id,tab);}
  const workspaces=new Map((workspaceData.items||[]).map(item=>[item.id,item])),groups=new Map((workspaceData.groups||[]).map(item=>[item.id,item]));
  const workspacesWithGroups=new Set((workspaceData.groups||[]).map(item=>item.workspaceId));
  for(const card of $('workspace-items').querySelectorAll('[data-workspace-id]')){const item=workspaces.get(card.dataset.workspaceId);if(!item)continue;const count=workspaceCounts.get(item.id)||0;
    card.querySelector('.workspace-count').textContent=`${count} tab${count===1?'':'s'}${item.id===(currentState.activeWorkspaceId||'default')?' · Current workspace':''}`;
    card.querySelector('[data-remove-workspace]').disabled=Boolean(item.protected)||count>0||workspacesWithGroups.has(item.id);
  }
  for(const card of $('group-items').querySelectorAll('[data-group-id]')){const item=groups.get(card.dataset.groupId);if(!item)continue;const count=groupCounts.get(item.id)||0;
    card.querySelector('.workspace-count').textContent=`${count} tab${count===1?'':'s'} · ${item.collapsed?'Collapsed':'Expanded'}`;card.querySelector('[data-remove-group]').disabled=count>0;
  }
  for(const card of $('workspace-tabs').querySelectorAll('[data-assignment-tab-id]')){const tab=byId.get(card.dataset.assignmentTabId);if(!tab)continue;
    card.querySelector('h2').textContent=tab.title;card.querySelector('.source').textContent=`${identityName(tab.identity)} · ${tab.url}`;
    const [workspace,group]=card.querySelectorAll('select');workspace.setAttribute('aria-label',`Workspace for ${tab.title}`);group.setAttribute('aria-label',`Group for ${tab.title}`);
    if(!workspaceAssignments.has(tab.id)){workspace.value=tab.workspaceId||'default';group.value=tab.groupId||'';}
    card.querySelector('[data-tab-pin]').textContent=tab.pinned?'Unpin':'Pin';card.querySelector('[data-tab-mute]').textContent=tab.muted?'Unmute':'Mute';
  }
}
function renderWorkspaceSelector() {
  const items=[...workspaceData.items||[]],selected=currentState.activeWorkspaceId||'default';
  if(!items.some(item=>item.id===selected))items.push({id:selected,name:selected==='default'?'Default':'Saved workspace'});
  const signature=JSON.stringify(items.map(item=>[item.id,item.name]));
  if($('workspace-select').dataset.options!==signature){setOptions($('workspace-select'),items,selected);$('workspace-select').dataset.options=signature;}else $('workspace-select').value=selected;
}
$('workspace-select').onchange=()=>run('workspace-switch',$('workspace-select').value);
function resetWorkspaceForm() {$('workspace-form').reset();$('workspace-form').elements.namedItem('id').value='';$('workspace-color').value='purple';}
function resetGroupForm() {$('group-form').reset();$('group-form').elements.namedItem('id').value='';$('group-color').value='grey';}
function renderWorkspaces() {
  workspaceVisibleKey=workspaceKey();
  errorMessage('workspace-error',workspaceData.error);$('workspace-recover').hidden=!workspaceData.recoveryAvailable;
  const activeWorkspace=currentState.activeWorkspaceId||'default',colors=workspaceData.colors||['grey','blue','red','yellow','green','pink','purple','cyan','orange'];
  for(const id of ['workspace-color','group-color'])if($(id).options.length!==colors.length){const selected=$(id).value;$(id).replaceChildren(...colors.map(color=>{const option=node('option',color);option.value=color;return option;}));$(id).value=selected|| (id==='workspace-color'?'purple':'grey');}
  paintList($('workspace-items'),workspaceData.items||[],item=>{
    const card=node('article'),actions=node('div',undefined,'card-actions'),count=currentState.tabs.filter(tab=>(tab.workspaceId||'default')===item.id).length;card.dataset.workspaceId=item.id;
    card.append(node('h2',item.name),node('p',`${count} tab${count===1?'':'s'}${item.id===activeWorkspace?' · Current workspace':''}`,'subtle workspace-count'));
    actions.append(action('Switch','workspace-switch',item.id),button('Edit',()=>editForm($('workspace-form'),item,['id','name','color'])));
    const remove=action('Remove empty workspace','workspace-remove',item.id);remove.dataset.removeWorkspace='';remove.disabled=Boolean(item.protected)||count>0||(workspaceData.groups||[]).some(group=>group.workspaceId===item.id);actions.append(remove);card.append(actions);return card;
  },'Workspaces are unavailable until their saved data is recovered.');
  const groups=(workspaceData.groups||[]).filter(group=>group.workspaceId===activeWorkspace);
  paintList($('group-items'),groups,group=>{
    const card=node('article'),count=currentState.tabs.filter(tab=>tab.groupId===group.id).length,actions=node('div',undefined,'card-actions');card.dataset.groupId=group.id;
    card.append(node('h2',group.name),node('p',`${count} tab${count===1?'':'s'} · ${group.collapsed?'Collapsed':'Expanded'}`,'subtle workspace-count'));
    actions.append(action(group.collapsed?'Expand':'Collapse','group-update',{id:group.id,collapsed:!group.collapsed}),button('Edit',()=>editForm($('group-form'),group,['id','name','color'])));
    const remove=action('Remove empty group','group-remove',group.id);remove.dataset.removeGroup='';remove.disabled=count>0;actions.append(remove);card.append(actions);return card;
  },'Create a group, then assign tabs below.');
  const tabIds=new Set(currentState.tabs.map(tab=>tab.id));for(const id of workspaceAssignments.keys())if(!tabIds.has(id))workspaceAssignments.delete(id);
  paintList($('workspace-tabs'),currentState.tabs.filter(tab=>(tab.workspaceId||'default')===activeWorkspace),tab=>{
    const card=node('article'),details=node('div',undefined,'record-details'),controls=node('div',undefined,'card-actions');card.dataset.assignmentTabId=tab.id;
    details.append(node('h2',tab.title),node('p',`${identityName(tab.identity)} · ${tab.url}`,'source'));
    const workspace=node('select'),group=node('select');workspace.setAttribute('aria-label',`Workspace for ${tab.title}`);group.setAttribute('aria-label',`Group for ${tab.title}`);
    let draft=workspaceAssignments.get(tab.id)||{workspaceId:tab.workspaceId||'default',groupId:tab.groupId||''};setOptions(workspace,workspaceData.items||[],draft.workspaceId);
    const fillGroups=()=>{group.replaceChildren(node('option','No group'));group.firstElementChild.value='';for(const item of workspaceData.groups||[])if(item.workspaceId===workspace.value){const option=node('option',item.name);option.value=item.id;group.append(option);}group.value=draft.groupId;};fillGroups();
    workspace.onchange=()=>{draft={workspaceId:workspace.value,groupId:''};workspaceAssignments.set(tab.id,draft);fillGroups();};group.onchange=()=>{draft={workspaceId:workspace.value,groupId:group.value};workspaceAssignments.set(tab.id,draft);};
    const pin=button(tab.pinned?'Unpin':'Pin',()=>{const current=currentState.tabs.find(item=>item.id===tab.id);if(current)return api.command('tab-pin',{id:tab.id,pinned:!current.pinned});}),mute=button(tab.muted?'Unmute':'Mute',()=>{const current=currentState.tabs.find(item=>item.id===tab.id);if(current)return api.command('tab-mute',{id:tab.id,muted:!current.muted});});pin.dataset.tabPin='';mute.dataset.tabMute='';
    controls.append(workspace,group,button('Apply',async()=>{const submitted=workspaceAssignments.get(tab.id);await api.command('tab-assign',{id:tab.id,workspaceId:workspace.value,groupId:group.value||null});if(workspaceAssignments.get(tab.id)===submitted)workspaceAssignments.delete(tab.id);}),pin,mute);
    card.append(details,controls);return card;
  },'There are no tabs in this workspace.');
}
api.onWorkspaces(data=>{hideTabPreview();workspaceData=data;renderWorkspaceSelector();renderTabs(currentState);if(currentState.panel==='workspaces')renderWorkspaces();});
$('workspace-reset').onclick=resetWorkspaceForm;$('group-reset').onclick=resetGroupForm;
$('workspace-form').onsubmit=event=>{event.preventDefault();const form=event.currentTarget,value=Object.fromEntries(new FormData(form)),editing=Boolean(value.id);if(!editing)delete value.id;saveForm(form,editing?'workspace-update':'workspace-create',value,resetWorkspaceForm);};
$('group-form').onsubmit=event=>{event.preventDefault();const form=event.currentTarget,value=Object.fromEntries(new FormData(form)),editing=Boolean(value.id);if(!editing){delete value.id;value.workspaceId=currentState.activeWorkspaceId||'default';}saveForm(form,editing?'group-update':'group-create',value,resetGroupForm);};

function renderResources() {
  if(!resourceData)return;
  const privateSummary=resourceData.privateBytes==null?`Private memory: ${resourceData.privateBytesAvailability?.reportedProcesses||0} of ${resourceData.processCount} processes reported; total unavailable`:`${bytes(resourceData.privateBytes)} private-memory sum`;
  $('resource-summary').textContent=`${resourceData.processCount} processes · ${bytes(resourceData.workingSetBytes)} working-set sum · ${privateSummary} · ${resourceData.intervalMs===null?'First sample':`${(resourceData.intervalMs/1000).toFixed(1)}-second interval`}`;
  $('resource-caveat').textContent=resourceData.caveat||'';
  paintList($('resource-items'),resourceData.processes||[],process=>{
    const row=node('tr'),owners=(process.owners||[]).map(owner=>`${owner.title}${owner.identity?` · ${identityName(owner.identity)}`:''}`).join('; ');
    row.append(node('td',`${process.name||process.type} · ${process.pid}`),node('td',owners||'Shared browser service'),node('td',process.cpuPercent===null?'Take another sample':`${process.cpuPercent.toFixed(1)}%`),node('td',bytes(process.workingSetBytes)),node('td',process.privateBytes==null?'Not reported':bytes(process.privateBytes)),node('td',process.sandboxed===null?'Not reported':process.sandboxed?'Yes':'No'));return row;
  },'No process information is available.');
}
api.onResources(data=>{resourceData=data;if(currentState.panel==='resources')renderResources();});
$('resource-refresh').onclick=()=>guarded($('resource-refresh'),async()=>{resourceData=await api.command('resource-sample');renderResources();});
function styleExtensionBadge(badge,color) {
  const [r,g,b,a]=color,alpha=a/255,base=document.body.dataset.theme==='light'?[238,231,243]:[51,35,64];
  badge.dataset.color=JSON.stringify(color);badge.style.backgroundColor=`rgba(${r},${g},${b},${alpha})`;
  const linear=[r,g,b].map((value,index)=>{const channel=(value*alpha+base[index]*(1-alpha))/255;return channel<=0.04045?channel/12.92:Math.pow((channel+0.055)/1.055,2.4);});
  badge.style.color=linear[0]*0.2126+linear[1]*0.7152+linear[2]*0.0722>0.179?'#000000':'#ffffff';
}
function extensionIcon(icon) {
  if(!icon?.variants?.length)return null;
  const variants=icon.variants;
  if(!variants.every(item=>Number.isInteger(item.size)&&item.size>0&&Number.isInteger(item.width)&&item.width>0&&Number.isInteger(item.height)&&item.height>0&&/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(item.dataUrl)))return null;
  const img=node('img');img.className='extension-icon';img.width=16;img.height=16;img.alt='';img.decoding='async';
  img.src=(variants.find(item=>item.size>=16)||variants.at(-1)).dataUrl;
  img.srcset=variants.map(item=>`${item.dataUrl} ${item.size/16}x`).join(', ');
  img.onerror=()=>{img.remove();announce('An extension toolbar image could not be displayed.');};return img;
}
api.onExtensionActions(items=>{extensionActions=items;$('extension-actions').replaceChildren(...items.map(item=>{
  const control=action(item.name,'extension-action',{runtimeId:item.runtimeId});control.title=item.title||item.name;control.disabled=item.enabled===false;
  if(item.iconError){control.title+='\n'+item.iconError;control.setAttribute('aria-description',item.iconError);}
  const icon=extensionIcon(item.icon);if(icon)control.prepend(icon);
  if(item.badgeText){const badge=node('span',item.badgeText,'extension-badge');styleExtensionBadge(badge,item.color||[95,99,104,255]);control.append(badge);control.setAttribute('aria-label',`${item.title||item.name}, ${item.badgeText}`);}return control;
}));applyAppearance(currentState.preferences);});

function renderCapabilities() {
  if(!capabilityData)return;
  const query=$('capability-search').value.toLocaleLowerCase(),status=$('capability-status').value;
  const values=capabilityData.capabilities.filter(item=>(!status||item.noxviola.status===status)&&[item.name,item.category,item.behavior,...item.variants.map(variant=>variant.browser),item.nextAction].join(' ').toLocaleLowerCase().includes(query));
  $('capability-coverage').textContent=`Inventory ${capabilityData.inventoryVersion} · ${capabilityData.coverage.statement} Installed Windows browser audit: ${capabilityData.coverage.installedWindowsAudit}.`;
  $('capability-count').textContent=`${values.length} matching capabilities · ${capabilityData.capabilities.length} documented records`;
  const sources=new Map(capabilityData.sources.map(source=>[source.id,source]));
  paintList($('capability-items'),values,item=>{
    const card=node('article'),details=node('details');card.append(node('p',`${item.category} · ${item.noxviola.status}`,'eyebrow'),node('h2',item.name),node('p',item.behavior));
    details.append(node('summary','Variants, acceptance and next work'));
    for(const variant of item.variants){
      details.append(node('h3',variant.browser),node('p',Array.isArray(variant.options)?variant.options.join(' · '):JSON.stringify(variant.options)));
      for(const id of variant.sourceIds||[]){const source=sources.get(id);if(source)details.append(action(source.title,'new',source.url));}
    }
    const tests=node('ul');for(const acceptance of item.acceptanceTests||[])tests.append(node('li',typeof acceptance==='string'?acceptance:JSON.stringify(acceptance)));
    details.append(node('h3','Acceptance'),tests,node('h3','Next work'),node('p',item.nextAction),node('p',`Code owner: ${item.noxviola.codeOwner}`,'subtle'));card.append(details);return card;
  },'No matching capabilities. Change the search or status filter.');
}
api.onCapabilities(data=>{
  capabilityData=data;const selected=$('capability-status').value;
  $('capability-status').replaceChildren(node('option','Every status'));$('capability-status').firstElementChild.value='';
  for(const status of Object.keys(data.statusDefinitions)){const option=node('option',status);option.value=status;$('capability-status').append(option);}
  $('capability-status').value=selected;renderCapabilities();
});
$('capability-search').oninput=renderCapabilities;$('capability-status').onchange=renderCapabilities;
api.command('state').then(renderState).catch(error=>announce(error.message));
