'use strict';
// The native popup is intercepted only to inspect and invoke its real items;
// pointer/keyboard input, production IPC and tab changes run in Electron.
const assert=require('node:assert/strict');
const {Menu}=require('electron');
const {performance}=require('node:perf_hooks');
async function until(fn,label){const end=performance.now()+15000;let last;while(performance.now()<end){try{const value=await fn();if(value)return value;}catch(error){last=error;}await new Promise(resolve=>setTimeout(resolve,20));}throw new Error(`Timed out observing ${label}${last?`: ${last.message}`:''}`);}
async function exerciseTabContext({window,context,command,state,check}){
 await check('tab context menu targets the requested tab through pointer and keyboard input',async()=>{
  const initial=await state(),menus=[],original=Menu.prototype.popup,created=[];let group;
  Menu.prototype.popup=function(options){menus.push({menu:this,options});};
  async function openMenu(id,keyboard=false){
   const rect=await window.webContents.executeJavaScript(`(()=>{const tab=[...document.querySelectorAll('.tab')].find(el=>el.dataset.tabId===${JSON.stringify(id)});if(!tab)return null;tab.scrollIntoView({block:'nearest',inline:'nearest'});const r=tab.getBoundingClientRect();if(${keyboard})tab.querySelector('[role="tab"]').focus();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
   assert.ok(rect,'The requested tab must be rendered');const before=menus.length;window.focus();window.webContents.focus();
   if(keyboard){window.webContents.sendInputEvent({type:'keyDown',keyCode:'F10',modifiers:['shift']});window.webContents.sendInputEvent({type:'keyUp',keyCode:'F10',modifiers:['shift']});}
   else{window.webContents.sendInputEvent({type:'mouseDown',x:rect.x,y:rect.y,button:'right',clickCount:1});window.webContents.sendInputEvent({type:'mouseUp',x:rect.x,y:rect.y,button:'right',clickCount:1});}
   const captured=await until(()=>menus[before],'native tab menu');await new Promise(resolve=>setTimeout(resolve,150));assert.equal(menus.length,before+1,'One input opens exactly one context menu');return captured.menu;
  }
  try{
   const one=await command('new',`${context.origin}/page?tab-menu=one`),two=await command('new',`${context.origin}/page?tab-menu=two`);created.push(one,two);
   const source=await until(()=>window.contentView.children.find(view=>view.webContents&&!view.webContents.isDestroyed()&&view.webContents.getURL()===`${context.origin}/page?tab-menu=one`),'inactive source tab');
   await until(()=>window.webContents.executeJavaScript(`Boolean(document.querySelector('[data-tab-id="${one}"] .tab-close'))`),'tab close button');
   const shape=await window.webContents.executeJavaScript(`(()=>{const tab=document.querySelector('[data-tab-id="${one}"]');return {buttons:tab.querySelectorAll('button').length,ellipsis:!!tab.querySelector('.tab-menu')};})()`);assert.deepEqual(shape,{buttons:2,ellipsis:false});
   let menu=await openMenu(one);assert.deepEqual(menu.items.filter(item=>item.label).map(item=>item.label),['Reload tab','Duplicate tab','Pin tab','Mute tab','Move left / up','Move right / down','Move to workspace','Move to group','Close tab']);
   let reloaded=false;source.webContents.once('did-start-loading',()=>{reloaded=true;});menu.items.find(item=>item.label==='Reload tab').click();await until(()=>reloaded,'background tab reload');assert.equal((await state()).activeId,two,'Reload must not activate the target tab');
   menu=await openMenu(one);menu.items.find(item=>item.label==='Duplicate tab').click();const duplicate=await until(async()=>{const s=await state();return s.tabs.find(tab=>tab.id!==one&&tab.url===`${context.origin}/page?tab-menu=one`);},'duplicate of the targeted tab');created.push(duplicate.id);assert.equal(duplicate.identity,(await state()).tabs.find(tab=>tab.id===one).identity);
   group=await command('group-create',{workspaceId:initial.activeWorkspaceId,name:'Synthetic context group',color:'blue'});menu=await openMenu(one,true);
   const submenu=menu.items.find(item=>item.label==='Move to group');assert.equal(submenu.enabled,true);submenu.submenu.items.find(item=>item.label==='Synthetic context group').click();await until(async()=>(await state()).tabs.find(tab=>tab.id===one)?.groupId===group.id,'target tab group assignment');
   menu=await openMenu(one);menu.items.find(item=>item.label==='Pin tab').click();await until(async()=>(await state()).tabs.find(tab=>tab.id===one)?.pinned,'target tab pinned');
   menu=await openMenu(one);menu.items.find(item=>item.label==='Mute tab').click();await until(async()=>(await state()).tabs.find(tab=>tab.id===one)?.muted,'target tab muted');
  }finally{
   Menu.prototype.popup=original;
   await command('activate',initial.activeId);for(const id of created)await command('close',id);if(group)await command('group-remove',group.id);
  }
 });
}
module.exports={exerciseTabContext};
