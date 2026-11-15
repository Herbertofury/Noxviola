'use strict';
// Browser lifecycle adapted from Herbertofury/Enderloom main.js (GPL-3.0-only).
const {app,BrowserWindow,WebContentsView,ipcMain,session,dialog,Menu}=require('electron');
const path=require('node:path');
const crypto=require('node:crypto');
const {address,httpUrl,readState,saveState}=require('./state.cjs');
let profiles=[{id:'personal',name:'Personal'}],currentIdentity='personal';
const configuredSessions=new Set();
let downloadHandler;
function identitySession(id){const partition=`persist:noxviola-identity-${id}`;const s=session.fromPartition(partition);if(!configuredSessions.has(partition)){s.setPermissionCheckHandler(()=>false);s.setPermissionRequestHandler((_w,_p,cb)=>cb(false));if(downloadHandler)s.on('will-download',downloadHandler);configuredSessions.add(partition);}return s;}
let win,tabs=[],activeId,closed=[],saveTimer,sessionFile,live,splitId=null;
const HEIGHT=112;
const vaultStore=require('./vault.cjs');let vaultFile,vault=[],vaultOpen=false;
function publishVault(){win.webContents.send('vault',{items:vault,open:vaultOpen});}
const snapshot=()=>({version:1,profiles,activeId,tabs:tabs.map(({id,url,title,identity})=>({id,url,title,identity}))});
function persist(){if(sessionFile)saveState(sessionFile,snapshot());}
function publish(){if(win&&!win.isDestroyed())win.webContents.send('state',{...snapshot(),currentIdentity,splitId,tabs:tabs.map(({id,url,title,identity,loading,view})=>({id,url,title,identity,loading:loading||false,live:!!view})),canBack:active()?.view?.webContents.navigationHistory.canGoBack()||false,canForward:active()?.view?.webContents.navigationHistory.canGoForward()||false});clearTimeout(saveTimer);saveTimer=setTimeout(persist,200);}
function active(){return tabs.find(t=>t.id===activeId);}
function layout(){if(!win)return;const [width,height]=win.getContentSize();const visible=[activeId,splitId].filter((id,i,a)=>id&&a.indexOf(id)===i);for(const t of tabs){if(!t.view)continue;const i=visible.indexOf(t.id);t.view.setVisible(i>=0&&!vaultOpen);if(i>=0)t.view.setBounds({x:visible.length===2?Math.floor(width/2)*i:0,y:HEIGHT,width:visible.length===2?Math.floor(width/2):width,height:Math.max(0,height-HEIGHT)});}}
function ensureView(t){
 if(t.view)return t.view;
 const view=new WebContentsView({webPreferences:{session:identitySession(t.identity),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,spellcheck:true}});t.view=view;win.contentView.addChildView(view);
 const wc=view.webContents;
 wc.setWindowOpenHandler(({url})=>{if(httpUrl(url))newTab(url,t.identity);return {action:'deny'};});
 wc.on('will-navigate',(event,url)=>{if(!httpUrl(url))event.preventDefault();});
 wc.on('will-redirect',(event,url)=>{if(!httpUrl(url))event.preventDefault();});
 wc.on('page-title-updated',(_,title)=>{t.title=title;publish();});
 wc.on('did-start-loading',()=>{t.loading=true;publish();});
 wc.on('did-stop-loading',()=>{t.loading=false;t.url=httpUrl(wc.getURL())||t.url;publish();});
 wc.on('did-navigate',(_,url)=>{t.url=url;publish();});wc.on('did-navigate-in-page',(_,url)=>{t.url=url;publish();});
 wc.on('render-process-gone',(_,details)=>{win.webContents.send('notice',`Tab stopped (${details.reason}). Reload to recover.`);});
 wc.on('did-fail-load',(_,code,description,url,main)=>{if(main&&code!==-3)win.webContents.send('notice',`Could not load ${url}: ${description}`);});
 wc.on('context-menu',(_,params)=>{Menu.buildFromTemplate([{role:'copy',enabled:!!params.selectionText},{role:'paste',enabled:params.isEditable},{label:'Reload',click:()=>wc.reload()},{label:'Open link in new tab',enabled:!!httpUrl(params.linkURL),click:()=>newTab(params.linkURL,t.identity)}]).popup({window:win});});
 layout();wc.loadURL(t.url).catch(()=>{});return view;
}
function activate(id){const t=tabs.find(t=>t.id===id);if(!t)return;activeId=id;currentIdentity=t.identity;if(splitId===id)splitId=null;ensureView(t);layout();publish();}
function newTab(url='https://www.google.com/',identity=currentIdentity){const target=address(url);if(!target)return;const t={id:crypto.randomUUID(),url:target,title:'New tab',identity};tabs.push(t);activate(t.id);}
function closeTab(id){const i=tabs.findIndex(t=>t.id===id);if(i<0)return;const [t]=tabs.splice(i,1);closed.push({url:t.url,title:t.title,identity:t.identity});if(t.view){win.contentView.removeChildView(t.view);t.view.webContents.close();}if(splitId===id)splitId=null;if(!tabs.length)newTab();else if(activeId===id)activate(tabs[Math.min(i,tabs.length-1)].id);else{layout();publish();}}
function trusted(event){return win&&!win.isDestroyed()&&event.sender===win.webContents&&event.senderFrame===win.webContents.mainFrame;}
async function command(event,{name,value}={}){
 if(!trusted(event))throw new Error('Untrusted browser command');
 const wc=active()?.view?.webContents;
 switch(name){
 case 'identity-add':{const name=String(value||'').trim();if(name){const p={id:crypto.randomUUID(),name};profiles.push(p);currentIdentity=p.id;newTab();}break;}
 case 'identity-switch':{if(profiles.some(p=>p.id===value)){currentIdentity=value;const t=tabs.find(x=>x.identity===value);if(t)activate(t.id);else newTab();}break;}
 case 'vault':vaultOpen=!vaultOpen;layout();publishVault();break;
 case 'vault-add':{const item=vaultStore.normalize({...value,id:crypto.randomUUID()});const updated=[...vault,item];vaultStore.save(vaultFile,updated);vault=updated;publishVault();break;}
 case 'vault-star':{const updated=vault.map(x=>x.id===value?{...x,favorite:!x.favorite}:x);vaultStore.save(vaultFile,updated);vault=updated;publishVault();break;}
 case 'vault-open':{const item=vault.find(x=>x.id===value);if(item){vaultOpen=false;publishVault();newTab(item.url);}break;}
 case 'vault-export':{const out=await dialog.showSaveDialog(win,{defaultPath:'noxviola-vault.json',filters:[{name:'JSON',extensions:['json']}]});if(!out.canceled&&out.filePath){vaultStore.save(out.filePath,vault);win.webContents.send('notice','Private vault exported to your selected file. No cloud upload.');}break;}
 case 'new':newTab();break;case 'activate':activate(value);break;case 'close':closeTab(value);break;
 case 'navigate':{const url=address(value);if(!url)throw new Error('Only HTTP(S) addresses are supported');if(active()){active().url=url;ensureView(active()).webContents.loadURL(url).catch(()=>{});publish();}break;}
 case 'back':if(wc?.navigationHistory.canGoBack())wc.navigationHistory.goBack();break;
 case 'forward':if(wc?.navigationHistory.canGoForward())wc.navigationHistory.goForward();break;
 case 'reload':wc?.reload();break;case 'stop':wc?.stop();break;
 case 'restore':{const t=closed.pop();if(t){currentIdentity=t.identity;newTab(t.url);};break;}
 case 'split':{if(splitId)splitId=null;else{const other=tabs.find(t=>t.id!==activeId);if(other){splitId=other.id;ensureView(other);}}layout();publish();break;}
 case 'find':if(value)wc?.findInPage(String(value));else wc?.stopFindInPage('clearSelection');break;
 case 'zoom-in':if(wc)wc.setZoomLevel(wc.getZoomLevel()+0.5);break;case 'zoom-out':if(wc)wc.setZoomLevel(wc.getZoomLevel()-0.5);break;
 default:throw new Error('Unknown command');
 }
}
if(!app.requestSingleInstanceLock())app.quit();else app.whenReady().then(()=>{
 app.setAppUserModelId('org.noxviola.browser');vaultFile=path.join(app.getPath('userData'),'private-vault.json');try{vault=vaultStore.load(vaultFile);}catch(e){dialog.showErrorBox('Vault needs recovery','Existing data was not overwritten. Restore private-vault.json.previous before retrying.');app.quit();return;}sessionFile=path.join(app.getPath('userData'),'browser-session.json');live=session.fromPartition('persist:noxviola-browser');
 live.setPermissionCheckHandler(()=>false);live.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 downloadHandler=async(event,item)=>{item.pause();const result=await dialog.showSaveDialog(win,{defaultPath:path.join(app.getPath('downloads'),path.basename(item.getFilename()))});if(result.canceled||!result.filePath){item.cancel();return;}item.setSavePath(result.filePath);item.resume();item.on('updated',()=>win?.webContents.send('notice',`Downloading ${item.getFilename()}: ${item.getReceivedBytes()} / ${item.getTotalBytes()} bytes`));item.once('done',(_,state)=>win?.webContents.send('notice',`${item.getFilename()}: ${state}`));};
 win=new BrowserWindow({title:'Noxviola',width:1320,height:860,minWidth:640,minHeight:420,backgroundColor:'#171122',webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
 win.loadFile(path.join(__dirname,'index.html'));win.on('resize',layout);
 const restored=readState(sessionFile);tabs=restored.tabs;profiles=restored.profiles;activeId=restored.activeId;
 win.webContents.on('did-finish-load',()=>{if(tabs.length)activate(activeId||tabs[0].id);else newTab();});
 win.on('close',()=>{clearTimeout(saveTimer);persist();});ipcMain.handle('command',command);
 const menu=Menu.buildFromTemplate([{label:'Browser',submenu:[{label:'New tab',accelerator:'CmdOrCtrl+T',click:()=>newTab()},{label:'Close tab',accelerator:'CmdOrCtrl+W',click:()=>closeTab(activeId)},{label:'Reopen closed tab',accelerator:'CmdOrCtrl+Shift+T',click:()=>{const t=closed.pop();if(t){currentIdentity=t.identity;newTab(t.url);};}},{label:'Address',accelerator:'CmdOrCtrl+L',click:()=>win.webContents.send('focus-address')},{label:'Find',accelerator:'CmdOrCtrl+F',click:()=>win.webContents.send('focus-find')},{role:'quit'}]}]);Menu.setApplicationMenu(menu);
});
app.on('second-instance',()=>{win?.show();win?.focus();});app.on('window-all-closed',()=>app.quit());
