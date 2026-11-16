'use strict';
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {BrowserWindow}=require('electron');
async function until(fn,label){const end=performance.now()+15000;let last;while(performance.now()<end){try{const value=await fn();if(value)return value;}catch(error){last=error;}await new Promise(resolve=>setTimeout(resolve,20));}throw new Error(`Timed out observing ${label}${last?`: ${last.message}`:''}`);}
async function exerciseSidebar({window,context,command,state,activate,partitionFor,check,expected}){
 await check('sidebar opens canonical history and bookmarks and isolates real website panels by identity',async()=>{
  await activate(expected.personalTab);const before=await state(),saved=before.preferences,bookmark=await command('bookmark-current');
  if(!saved.sidebarVisible)await command('sidebar-toggle');
  if(saved.sidebarRailExpanded)await command('sidebar-rail-expand');
  await window.webContents.executeJavaScript("document.getElementById('sidebar-rail-expand').click()");
  await until(async()=>{const s=await state();return s.preferences.sidebarRailExpanded&&s.sidebarGeometry.rail===200;},'expanded sidebar launcher');
  assert.equal(await window.webContents.executeJavaScript("document.getElementById('sidebar-rail-expand').getAttribute('aria-pressed')"),'true');
  await command('sidebar-select','history');
  await until(()=>window.webContents.executeJavaScript("document.querySelector('#sidebar-title').textContent==='History'&&document.querySelector('#sidebar-panel').getBoundingClientRect().width>0"),'history sidebar');
  await command('settings-save',{tabLayout:'vertical',sidebarSide:'right'});if(!(await state()).splitId)await command('split');
  const split=await until(async()=>{const s=await state();return s.splitId&&s.sidebarGeometry.panel===s.preferences.sidebarWidth?s:null;},'expanded launcher beside vertical tabs and split pages');
  const pages=window.contentView.children.filter(view=>view.webContents&&!view.webContents.isDestroyed()&&view.getVisible()&&view.getBounds().y===split.chromeHeight+32&&/^https?:/.test(view.webContents.getURL())).map(view=>view.getBounds()).sort((a,b)=>a.x-b.x);
  assert.equal(pages.length,2);assert.equal(pages[0].x,split.sidebarGeometry.pageX);assert.equal(pages[0].width+pages[1].width+6,split.sidebarGeometry.pageWidth);assert.equal(pages[1].x-pages[0].x-pages[0].width,6,'Real divider gap must remain available to the shell');assert.deepEqual(pages,split.paneGeometry.panes.map(p=>p.content).sort((a,b)=>a.x-b.x));assert.equal(pages[1].x+pages[1].width,split.sidebarGeometry.panelX);
  await command('split');await command('settings-save',{tabLayout:saved.tabLayout,sidebarSide:saved.sidebarSide});
  const history=await command('sidebar-data');assert.equal(history.identity,expected.personalIdentity);assert.ok(history.items.some(item=>item.url===before.tabs.find(tab=>tab.id===expected.personalTab).url));
  await command('sidebar-select','bookmarks');await until(()=>window.webContents.executeJavaScript(`document.querySelector('#sidebar-items').textContent.includes(${JSON.stringify(bookmark.title)})`),'real bookmark in the sidebar');
  const url=`${context.origin}/sidebar-icon?sidebar=isolated`,app={id:'native-sidebar-fixture',name:'Synthetic sidebar fixture',url};
  await command('settings-save',{sidebarApps:[...saved.sidebarApps,app],sidebarSide:'right',sidebarWidth:300});await command('sidebar-select',`app:${app.id}`);
  const findView=identity=>window.contentView.children.find(view=>view.webContents&&!view.webContents.isDestroyed()&&view.webContents.session===partitionFor(identity)&&view.webContents.getURL()===url);
  const personal=await until(()=>findView(expected.personalIdentity),'personal sidebar document');assert.equal(personal.webContents.getLastWebPreferences().sandbox,true);assert.equal(personal.webContents.getLastWebPreferences().nodeIntegration,false);
  await until(()=>window.webContents.executeJavaScript("document.querySelector('[data-app-id=native-sidebar-fixture] img')?.src.startsWith('data:image/png;base64,')"),'real sidebar favicon in the launcher');
  await personal.webContents.executeJavaScript("localStorage.setItem('noxviola-sidebar-fixture','personal')");
  await personal.webContents.executeJavaScript(`window.sidebarMessage='';window.addEventListener('message',e=>{window.sidebarMessage=e.data});window.open(${JSON.stringify(`${context.origin}/page?sidebar-popup=personal`)},'_blank','width=480,height=600');true`,true);
  const popup=await until(()=>BrowserWindow.getAllWindows().find(w=>w!==window&&!w.isDestroyed()&&w.webContents.getURL().includes('sidebar-popup=personal')),'sidebar sign-in popup');
  assert.equal(popup.webContents.session,partitionFor(expected.personalIdentity));assert.equal(popup.webContents.getLastWebPreferences().sandbox,true);assert.equal(popup.webContents.getLastWebPreferences().nodeIntegration,false);
  assert.equal(await popup.webContents.executeJavaScript("localStorage.getItem('noxviola-sidebar-fixture')"),'personal');assert.match(popup.getTitle(),new RegExp(context.origin.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  const titleChanged=new Promise(resolve=>popup.once('page-title-updated',resolve));await popup.webContents.executeJavaScript("document.title='Fake trusted browser';true");await titleChanged;assert.ok(!popup.getTitle().includes('Fake trusted browser'),'popup origin title cannot be replaced by page title');
  await popup.webContents.executeJavaScript("window.opener.postMessage('popup-returned',location.origin)");await until(()=>personal.webContents.executeJavaScript("window.sidebarMessage==='popup-returned'"),'popup opener message');popup.close();
  await activate(expected.secondTab);const second=await until(()=>findView(expected.secondIdentity),'second identity sidebar document');assert.notEqual(second.webContents.session,personal.webContents.session);assert.equal(await second.webContents.executeJavaScript("localStorage.getItem('noxviola-sidebar-fixture')"),null);assert.equal(personal.getVisible(),false);
  await second.webContents.executeJavaScript(`const child=window.open('about:blank','_blank');child.location=${JSON.stringify(`${context.origin}/page?sidebar-popup=second`)};true`,true);
  const secondPopup=await until(()=>BrowserWindow.getAllWindows().find(w=>w!==window&&!w.isDestroyed()&&w.webContents.getURL().includes('sidebar-popup=second')),'second identity sidebar popup');assert.equal(secondPopup.webContents.session,partitionFor(expected.secondIdentity));assert.equal(await secondPopup.webContents.executeJavaScript("localStorage.getItem('noxviola-sidebar-fixture')"),null);
  await command('sidebar-web-unload');await until(()=>secondPopup.isDestroyed(),'popup closed with unloaded sidebar');await command('sidebar-select',`app:${app.id}`);await until(()=>findView(expected.secondIdentity),'reopened sidebar after unload');
  for(let i=0;i<4;i++)await command('sidebar-select',`app:${app.id}`);
  await until(async()=>{const s=await state();return s.preferences.sidebarExpanded&&s.sidebarGeometry.panel===300;},'the sidebar after rapid reversible toggles');
  await command('sidebar-width',380);await until(async()=>(await state()).sidebarGeometry.panel===380,'resized sidebar');
  await command('sidebar-close');await command('settings-save',{sidebarApps:saved.sidebarApps,sidebarActive:saved.sidebarActive,sidebarSide:saved.sidebarSide,sidebarWidth:saved.sidebarWidth,sidebarVisible:saved.sidebarVisible,sidebarExpanded:saved.sidebarExpanded,sidebarRailExpanded:saved.sidebarRailExpanded,tabLayout:saved.tabLayout});
  await command('bookmark-remove',{identity:expected.personalIdentity,id:bookmark.id});await activate(before.activeId);
 });
}
module.exports={exerciseSidebar};
