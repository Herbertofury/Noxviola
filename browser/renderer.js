'use strict';
// This renderer owns browser chrome only. Websites never receive its preload.
const $ = id => document.getElementById(id);
const api = window.browser;
let currentState = {profiles:[],tabs:[],preferences:{},currentIdentity:'personal',panel:null};
let vaultItems = [], accountItems = [], extensionData = {items:[],profiles:[],busy:false};
let permissionData = {items:[]}, downloadItems = [], capabilityData = null, extensionPreview = null;
let lastProfiles = '', lastSettings = '', lastSaveError = '', addressDirty = false;
const tabNodes = new Map(), painting = new WeakMap();

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
  state.tabs.forEach((tab,index)=>{
    let wrap = tabNodes.get(tab.id);
    if (!wrap) {
      wrap = node('div',undefined,'tab'); wrap.dataset.tabId = tab.id;
      const select = action('', 'activate', tab.id), close = action('×','close',tab.id);
      select.setAttribute('role','tab'); wrap.append(select,close); tabNodes.set(tab.id,wrap);
    }
    const [select,close] = wrap.children;
    const label = `${tab.loading ? '◌ ' : ''}${tab.title || 'New tab'}`;
    if (select.textContent !== label) select.textContent = label;
    select.title = `${identityName(tab.identity)} · ${tab.url}`;
    select.setAttribute('aria-selected',String(tab.id === state.activeId));
    select.setAttribute('aria-label',`${tab.title || 'New tab'}, ${identityName(tab.identity)}`);
    select.tabIndex = tab.id === state.activeId ? 0 : -1;
    close.setAttribute('aria-label',`Close ${tab.title || 'New tab'}`);
    if ($('tabs').children[index] !== wrap) $('tabs').insertBefore(wrap,$('tabs').children[index] || null);
  });
}
function renderState(state) {
  const old = currentState; currentState = state;
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
  for (const panel of document.querySelectorAll('#workspace > section')) panel.hidden = panel.id !== state.panel;
  $('start').hidden = Boolean(state.panel) || active?.url !== 'about:blank';
  $('workspace').inert = Boolean(state.closing);
  $('retry-save').hidden = !state.saveError;
  if (state.saveError && state.saveError !== lastSaveError) announce(`Session not saved: ${state.saveError}`);
  if (state.closing && !old.closing) announce('Finishing pending work and saving your session…');
  lastSaveError = state.saveError;
  const settingsKey = JSON.stringify(state.preferences);
  if (lastSettings !== settingsKey) {editForm($('settings-form'),state.preferences,['searchEngine','tabLayout']);lastSettings = settingsKey;}
  $('engine-version').textContent = `Electron ${state.engine?.electron || 'unknown'} · Chromium ${state.engine?.chromium || 'unknown'} · Experimental preview`;
  document.querySelectorAll('[data-command="restore"]').forEach(control=>{control.disabled=!state.canRestore;});
  if (old.panel !== state.panel) renderPanel(state.panel);
}
function renderPanel(panel) {
  if (panel === 'vault') renderVault();
  else if (panel === 'accounts') renderAccounts();
  else if (panel === 'extensions') renderExtensions();
  else if (panel === 'downloads') renderDownloads();
  else if (panel === 'permissions') renderPermissions();
  else if (panel === 'capabilities') renderCapabilities();
}

$('address').addEventListener('input',()=>{addressDirty=true;});
$('address').addEventListener('keydown',event=>{
  if (event.key === 'Escape') {addressDirty=false;const tab=currentState.tabs.find(row=>row.id===currentState.activeId);$('address').value=tab?.url === 'about:blank' ? '' : tab?.url || '';}
});
$('navigate').addEventListener('submit',async event=>{
  event.preventDefault(); const value=$('address').value;
  try {await api.command('navigate',value);if($('address').value===value)addressDirty=false;} catch(error) {announce(error.message);}
});
document.querySelectorAll('[data-command]').forEach(control=>control.addEventListener('click',()=>guarded(control,()=>api.command(control.dataset.command))));
$('back').onclick=()=>run('back');$('forward').onclick=()=>run('forward');$('find').oninput=()=>run('find',$('find').value);
$('open-tools').onclick=()=>run('tools');
$('start-search').onclick=()=>{$('address').focus();$('address').select();};
$('identity').onchange=()=>run('identity-switch',$('identity').value);
$('add-identity').onclick=()=>{const field=$('identity-name');field.hidden=!field.hidden;if(!field.hidden)field.focus();};
$('identity-name').onkeydown=async event=>{
  if (event.key === 'Escape') {event.currentTarget.hidden=true;return;}
  if (event.key !== 'Enter' || !event.currentTarget.value.trim()) return;
  const field=event.currentTarget;field.disabled=true;
  try {await api.command('identity-add',field.value);field.value='';field.hidden=true;} catch(error) {announce(error.message);} finally {field.disabled=false;}
};
$('tabs').onkeydown=event=>{
  const vertical=currentState.preferences.tabLayout==='vertical';
  const previous=vertical?'ArrowUp':'ArrowLeft', next=vertical?'ArrowDown':'ArrowRight';
  if (![previous,next,'Home','End'].includes(event.key) || !event.target.matches('[role="tab"]')) return;
  const index=currentState.tabs.findIndex(tab=>tab.id===event.target.parentElement.dataset.tabId), count=currentState.tabs.length;
  if (!count) return; event.preventDefault();
  const target=event.key==='Home'?0:event.key==='End'?count-1:(index+(event.key===next?1:-1)+count)%count;
  run('activate',currentState.tabs[target].id);tabNodes.get(currentState.tabs[target].id).firstElementChild.focus();
};
api.onAddress(()=>{$('address').focus();$('address').select();});api.onFind(()=>$('find').focus());api.onNotice(announce);api.onState(renderState);

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
  for(const id of ['extension-import-directory','extension-import-package','extension-install','extension-cancel'])$(id).disabled=Boolean(extensionData.busy);
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
  const item=await api.command('extension-install',{token:extensionPreview.token,identities,permissionsAccepted:$('extension-accept').checked,unsignedImportAccepted:$('extension-unsigned').checked});
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
    details.append(summary,node('pre',permissionText(item.permissions)),node('pre',compatibilityText(item.compatibility)),node('p',`Publisher not verified · Package SHA-256: ${item.packageDigest}`,'source'));card.append(details);
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
  paintList($('download-items'),[...downloadItems].reverse(),item=>{
    const card=node('article'),actions=node('div',undefined,'card-actions');
    card.append(node('h2',item.filename),node('p',`${identityName(item.identity)} · ${item.state}${item.paused?' · paused':''}`),node('p',`${bytes(item.received)}${item.total>0?` of ${bytes(item.total)}`:''}`));
    if(item.total>0){const progress=node('progress');progress.max=item.total;progress.value=item.received;progress.setAttribute('aria-label',`Download progress for ${item.filename}`);card.append(progress);}
    if(item.path)card.append(node('p',item.path,'source'));if(item.error)card.append(node('p',item.error,'error'));
    if(item.state==='completed')actions.append(action('Show in folder','download-action',{id:item.id,action:'reveal'}));
    if(!item.terminal){
      if(item.paused||item.canResume)actions.append(action('Resume','download-action',{id:item.id,action:'resume'}));
      else if(item.state==='progressing')actions.append(action('Pause','download-action',{id:item.id,action:'pause'}));
      actions.append(action('Cancel','download-action',{id:item.id,action:'cancel'}));
    }
    card.append(actions);return card;
  },'No transfers in this browser run.');
}
api.onDownloads(items=>{downloadItems=items;if(currentState.panel==='downloads')renderDownloads();});
function renderPermissions() {
  errorMessage('permission-error',permissionData.error);$('permission-recover').hidden=!permissionData.recoveryAvailable;
  $('permission-reset').disabled=!['new','ready'].includes(permissionData.status);
  paintList($('permission-items'),permissionData.items,item=>{
    const card=node('article');card.append(node('h2',item.permission),node('p',`${identityName(item.identity)} · ${item.decision} · ${item.scope==='document'?'this document only':'saved decision'}`),node('p',`Requesting site: ${item.requestingOrigin}`,'source'),node('p',`Embedded by: ${item.embeddingOrigin}`,'source'),action('Forget decision','permission-revoke',item.id));return card;
  },'No saved permission decisions. Supported requests will ask before access is granted.');
}
api.onPermissions(data=>{permissionData=data;if(data.open)renderPermissions();});
$('permission-reset').onclick=()=>guarded($('permission-reset'),()=>api.command('permission-reset',currentState.currentIdentity));
$('settings-form').onsubmit=event=>{event.preventDefault();const form=event.currentTarget;saveForm(form,'settings-save',Object.fromEntries(new FormData(form)),()=>announce('Preferences saved.'));};

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
