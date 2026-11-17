'use strict';
// Test-only integration helper. The driver supplies its marked, generated
// profile and loopback server; no installed browser/profile data is read.
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {dialog}=require('electron');

async function until(fn,label,timeout=15000){
 const end=performance.now()+timeout;let last;
 while(performance.now()<end){try{const value=await fn();if(value)return value;}catch(error){last=error;}await new Promise(resolve=>setTimeout(resolve,25));}
 throw new Error(`Timed out observing ${label}${last?`: ${last.message}`:''}`);
}
async function installSyntheticMedia(wc,title){
 return wc.executeJavaScript(`(async()=>{
  window.__noxSyntheticAudio?.pause();if(window.__noxSyntheticMediaUrl)URL.revokeObjectURL(window.__noxSyntheticMediaUrl);
  const audio=document.createElement('audio');audio.id='noxviola-synthetic-audio';audio.controls=true;audio.loop=true;audio.muted=true;
  const samples=8000*12,bytes=new Uint8Array(44+samples),data=new DataView(bytes.buffer);
  const text=(offset,value)=>{for(let index=0;index<value.length;index++)bytes[offset+index]=value.charCodeAt(index);};
  text(0,'RIFF');data.setUint32(4,36+samples,true);text(8,'WAVE');text(12,'fmt ');data.setUint32(16,16,true);data.setUint16(20,1,true);data.setUint16(22,1,true);data.setUint32(24,8000,true);data.setUint32(28,8000,true);data.setUint16(32,1,true);data.setUint16(34,8,true);text(36,'data');data.setUint32(40,samples,true);bytes.fill(128,44);
  window.__noxSyntheticMediaUrl=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));audio.src=window.__noxSyntheticMediaUrl;
  const loaded=new Promise((resolve,reject)=>{audio.addEventListener('loadedmetadata',resolve,{once:true});audio.addEventListener('error',()=>reject(new Error(audio.error?.message||'Synthetic WAV failed to load')),{once:true});});
  document.body.append(audio);window.__noxSyntheticAudio=audio;audio.load();await loaded;
  navigator.mediaSession.metadata=new MediaMetadata({title:${JSON.stringify(title)},artist:'Synthetic fixture only',album:'Local generated silence'});
  return {duration:audio.duration,paused:audio.paused,muted:audio.muted};
 })()`);
}
async function clearSyntheticMedia(wc){if(wc&&!wc.isDestroyed())await wc.executeJavaScript("window.__noxSyntheticAudio?.pause();window.__noxSyntheticAudio?.remove();if(window.__noxSyntheticMediaUrl)URL.revokeObjectURL(window.__noxSyntheticMediaUrl);delete window.__noxSyntheticAudio;delete window.__noxSyntheticMediaUrl;true");}

async function withSidebar({window,context,command,state,activate,partitionFor,expected},suffix,run){
 await activate(expected.personalTab);const before=await state(),saved=before.preferences;
 const url=`${context.origin}/sidebar-icon?native-sidebar=${suffix}`,app={id:`native-sidebar-${suffix}`,name:`Synthetic ${suffix}`,url};
 const findView=identity=>window.contentView.children.find(view=>view.webContents&&!view.webContents.isDestroyed()&&view.webContents.session===partitionFor(identity)&&view.webContents.getURL()===url);
 try{
  await command('settings-save',{sidebarApps:[...saved.sidebarApps,app],sidebarVisible:true,sidebarPanelPinned:true});
  if((await state()).preferences.sidebarActive===`app:${app.id}`&&(await state()).preferences.sidebarExpanded)await command('sidebar-close');
  await command('sidebar-select',`app:${app.id}`);const personal=await until(()=>findView(expected.personalIdentity),'synthetic personal website sidebar');
  await until(()=>!personal.webContents.isLoading(),'synthetic personal website loaded');
  return await run({personal,findView,app,url,saved});
 }finally{
  for(const identity of [expected.personalIdentity,expected.secondIdentity]){const view=findView(identity);if(view)await clearSyntheticMedia(view.webContents).catch(()=>{});}
  await command('sidebar-close');await command('settings-save',{sidebarApps:saved.sidebarApps,sidebarVisible:saved.sidebarVisible,sidebarExpanded:saved.sidebarExpanded,sidebarActive:saved.sidebarActive,sidebarPanelPinned:saved.sidebarPanelPinned});await activate(before.activeId);
 }
}

async function exerciseSidebarMedia(options){
 const {command,state,activate,check,expected}=options;
 return check('actual sidebar media plays, pauses, seeks, changes volume and mutes without crossing identity',async()=>withSidebar(options,'media',async({personal,findView,app})=>{
  const title='Noxviola synthetic sidebar media';const loaded=await installSyntheticMedia(personal.webContents,title);assert.equal(loaded.duration,12);assert.equal(loaded.paused,true);
  const list=await command('media-list'),item=list.items.find(item=>item.kind==='sidebar'&&item.title===title);assert.ok(item,'The real media service must discover the actual sidebar audio element');assert.equal(item.identity,expected.personalIdentity);assert.equal(item.muted,true);
  const act=request=>command('media-action',{identity:expected.personalIdentity,...request});
  await act({id:item.id,action:'play'});await until(()=>personal.webContents.executeJavaScript('!window.__noxSyntheticAudio.paused&&window.__noxSyntheticAudio.currentTime>0'),'real sidebar audio playback');
  await act({id:item.id,action:'pause'});assert.equal(await personal.webContents.executeJavaScript('window.__noxSyntheticAudio.paused'),true);
  await act({id:item.id,action:'volume',value:.25});assert.equal(await personal.webContents.executeJavaScript('window.__noxSyntheticAudio.volume'),.25);
  await until(async()=>{const current=await command('media-list');return current.items.find(media=>media.id===item.id)?.seekable.some(range=>range[0]<=3&&range[1]>=3);},'seekable synthetic audio');
  await act({id:item.id,action:'seek',value:3});assert.equal(await personal.webContents.executeJavaScript('window.__noxSyntheticAudio.currentTime'),3);
  await act({id:item.id,action:'unmute'});assert.equal(await personal.webContents.executeJavaScript('window.__noxSyntheticAudio.muted'),false);
  await act({id:item.id,action:'mute'});assert.equal(await personal.webContents.executeJavaScript('window.__noxSyntheticAudio.muted'),true);
  await act({sourceId:item.sourceId,action:'page-mute'});assert.equal(personal.webContents.isAudioMuted(),true);
  await act({sourceId:item.sourceId,action:'page-unmute'});assert.equal(personal.webContents.isAudioMuted(),false);
  await act({id:item.id,action:'unmute'});
  await act({id:item.id,action:'play'});
  await command('sidebar-close');
  assert.equal(await personal.webContents.executeJavaScript('window.__noxSyntheticAudio.paused'),false,'Closing the panel preserves intentional playback of audio with output enabled');
  await activate(expected.secondTab);await command('sidebar-select',`app:${app.id}`);const second=await until(()=>findView(expected.secondIdentity),'work identity website sidebar');assert.notEqual(second.webContents.session,personal.webContents.session);
  const work=await command('media-list');assert.ok(!work.items.some(media=>media.id===item.id),'The work identity cannot enumerate the personal media item');
  await assert.rejects(command('media-action',{identity:expected.secondIdentity,id:item.id,action:'pause'}),/identity|no longer available/i);assert.equal(await personal.webContents.executeJavaScript('window.__noxSyntheticAudio.paused'),false,'A denied foreign control cannot pause the original media');
  await activate(expected.personalTab);await command('sidebar-select',`app:${app.id}`);await act({id:item.id,action:'pause'});
  const result={source:'real sandboxed sidebar WebContents with generated silent WAV',duration:12,actualPlayPause:true,actualSeek:true,actualElementVolumeMute:true,actualWebContentsMute:true,backgroundPlaybackPreserved:true,crossIdentityControlDenied:true,firstIdentity:expected.personalIdentity,secondIdentity:expected.secondIdentity};
  assert.equal((await state()).currentIdentity,expected.personalIdentity);return result;
 }));
}

async function exerciseSidebarNotifications(options){
 const {context,command,activate,check,expected}=options;
 return check('actual sidebar notification consent persists per identity and a granted website notification emits show',async()=>withSidebar(options,'notifications',async({personal,findView,app})=>{
  const initial=await command('permission-list');assert.ok(!initial.some(rule=>rule.permission==='notifications'&&rule.requestingOrigin===context.origin),'The synthetic fixture requires a fresh notification origin');
  const prompts=[];
  async function consent(wc,choice){
   const original=dialog.showMessageBox;let count=0;
   dialog.showMessageBox=async(owner,options)=>{
    const settings=options||owner;
    if(settings.title!=='Site permission'||settings.message!=='Allow notifications?'||!settings.detail?.includes(`Requesting site: ${context.origin}\n`)||!settings.detail?.includes(`Embedded by: ${context.origin}\n`))return original(owner,options);
    const response=settings.buttons?.indexOf(choice);assert.ok(response>=0,'The real permission dialog must present the requested synthetic choice');count++;prompts.push({choice,requestingOrigin:context.origin,webContentsId:wc.id});return {response,checkboxChecked:false};
   };
   try{const result=await wc.executeJavaScript('Notification.requestPermission()',true);assert.equal(count,1,'The canonical native consent path must be exercised exactly once');return result;}finally{dialog.showMessageBox=original;}
  }
  try{
   await activate(expected.secondTab);await command('sidebar-select',`app:${app.id}`);const second=await until(()=>findView(expected.secondIdentity),'work sidebar notification document');await until(()=>!second.webContents.isLoading(),'work notification document loaded');
   assert.equal(await consent(second.webContents,'Block'),'denied');const denied=(await command('permission-list')).find(rule=>rule.permission==='notifications'&&rule.identity===expected.secondIdentity&&rule.requestingOrigin===context.origin);assert.equal(denied?.decision,'block');
   await activate(expected.personalTab);await command('sidebar-select',`app:${app.id}`);
   assert.equal(await consent(personal.webContents,'Always allow'),'granted');const granted=(await command('permission-list')).find(rule=>rule.permission==='notifications'&&rule.identity===expected.personalIdentity&&rule.requestingOrigin===context.origin);assert.equal(granted?.decision,'allow');assert.equal(granted?.scope,'persistent');
   await personal.webContents.executeJavaScript("window.__noxSyntheticNotificationEvents=[];window.__noxSyntheticNotification=new Notification('Noxviola synthetic sidebar notification',{body:'Local generated test only; no personal data',silent:true});window.__noxSyntheticNotification.onshow=()=>window.__noxSyntheticNotificationEvents.push('show');window.__noxSyntheticNotification.onerror=()=>window.__noxSyntheticNotificationEvents.push('error');true");
   const events=await until(async()=>{const events=await personal.webContents.executeJavaScript('window.__noxSyntheticNotificationEvents');if(events.includes('error'))throw new Error('The actual website notification emitted error instead of show');return events.includes('show')?events:null;},'actual website Notification show event',15000);assert.ok(events.includes('show'));
   assert.equal(await second.webContents.executeJavaScript('Notification.permission'),'denied','A persistent grant must not cross identities');
   await command('sidebar-web-unload');await command('sidebar-select',`app:${app.id}`);const reopened=await until(()=>findView(expected.personalIdentity),'reopened notification sidebar document');assert.equal(await reopened.webContents.executeJavaScript('Notification.permission'),'granted','Persistent notification permission survives unloading the sidebar document');
   return {prompts,denialPersisted:true,grantPersisted:true,identityIsolation:true,websiteNotificationShowEvent:true,scope:'The real Chromium website Notification emitted show through the native Windows notification provider. This does not prove a visible toast, user click, service-worker push delivery, or notification suppression settings; native dialog choices were supplied for this synthetic fixture.'};
  }finally{
   const contents=personal.webContents;
   if(contents&&!contents.isDestroyed())await contents.executeJavaScript('window.__noxSyntheticNotification?.close();delete window.__noxSyntheticNotification;delete window.__noxSyntheticNotificationEvents;true').catch(()=>{});
   const rules=await command('permission-list');for(const rule of rules.filter(rule=>rule.permission==='notifications'&&rule.requestingOrigin===context.origin&&[expected.personalIdentity,expected.secondIdentity].includes(rule.identity)))await command('permission-revoke',rule.id);
  }
 }));
}
module.exports={exerciseSidebarMedia,exerciseSidebarNotifications,installSyntheticMedia};
