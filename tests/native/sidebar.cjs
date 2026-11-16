'use strict';
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
async function until(fn,label){const end=performance.now()+15000;let last;while(performance.now()<end){try{const value=await fn();if(value)return value;}catch(error){last=error;}await new Promise(resolve=>setTimeout(resolve,20));}throw new Error(`Timed out observing ${label}${last?`: ${last.message}`:''}`);}
async function exerciseSidebar({window,context,command,state,activate,partitionFor,check,expected}){
 await check('sidebar opens canonical history and bookmarks and isolates real website panels by identity',async()=>{
  await activate(expected.personalTab);const before=await state(),saved=before.preferences,bookmark=await command('bookmark-current');
  await command('sidebar-select','history');
  await until(()=>window.webContents.executeJavaScript("document.querySelector('#sidebar-title').textContent==='History'&&document.querySelector('#sidebar-panel').getBoundingClientRect().width>0"),'history sidebar');
  const history=await command('sidebar-data');assert.equal(history.identity,expected.personalIdentity);assert.ok(history.items.some(item=>item.url===before.tabs.find(tab=>tab.id===expected.personalTab).url));
  await command('sidebar-select','bookmarks');await until(()=>window.webContents.executeJavaScript(`document.querySelector('#sidebar-items').textContent.includes(${JSON.stringify(bookmark.title)})`),'real bookmark in the sidebar');
  const url=`${context.origin}/page?sidebar=isolated`,app={id:'native-sidebar-fixture',name:'Synthetic sidebar fixture',url};
  await command('settings-save',{sidebarApps:[...saved.sidebarApps,app],sidebarSide:'right',sidebarWidth:300});await command('sidebar-select',`app:${app.id}`);
  const findView=identity=>window.contentView.children.find(view=>view.webContents&&!view.webContents.isDestroyed()&&view.webContents.session===partitionFor(identity)&&view.webContents.getURL()===url);
  const personal=await until(()=>findView(expected.personalIdentity),'personal sidebar document');assert.equal(personal.webContents.getLastWebPreferences().sandbox,true);assert.equal(personal.webContents.getLastWebPreferences().nodeIntegration,false);
  await personal.webContents.executeJavaScript("localStorage.setItem('noxviola-sidebar-fixture','personal')");
  await activate(expected.secondTab);const second=await until(()=>findView(expected.secondIdentity),'second identity sidebar document');assert.notEqual(second.webContents.session,personal.webContents.session);assert.equal(await second.webContents.executeJavaScript("localStorage.getItem('noxviola-sidebar-fixture')"),null);assert.equal(personal.getVisible(),false);
  for(let i=0;i<4;i++)await command('sidebar-select',`app:${app.id}`);
  await until(async()=>{const s=await state();return s.preferences.sidebarExpanded&&s.sidebarGeometry.panel===300;},'the sidebar after rapid reversible toggles');
  await command('sidebar-width',380);await until(async()=>(await state()).sidebarGeometry.panel===380,'resized sidebar');
  await command('sidebar-close');await command('settings-save',{sidebarApps:saved.sidebarApps,sidebarActive:saved.sidebarActive,sidebarSide:saved.sidebarSide,sidebarWidth:saved.sidebarWidth,sidebarVisible:saved.sidebarVisible,sidebarExpanded:saved.sidebarExpanded});
  await command('bookmark-remove',{identity:expected.personalIdentity,id:bookmark.id});await activate(before.activeId);
 });
}
module.exports={exerciseSidebar};
