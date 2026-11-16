'use strict';
const path = require('node:path');

// A sandboxed child window is used because website WebContentsViews cover the
// shell below the toolbar. Only this exact window may invoke its narrow API.
function createTabSearch({BrowserWindow,screen,ipcMain,root,getWindow,getData,selectTab,closeTab,restoreTab}) {
  let popup = null;
  function dismiss(){if(popup&&!popup.isDestroyed())popup.close();}
  function position(parent, anchor) {
    const bounds=parent.getContentBounds(),work=screen.getDisplayMatching(bounds).workArea,width=Math.min(390,work.width),data=getData();
    const desired=105+(data.style==='compact'?34:48)*(data.tabs.length+data.closed.length)+(data.closed.length?24:0);
    const height=Math.min(530,work.height,Math.max(180,desired));
    const valid=anchor&&['x','y','width','height'].every(key=>Number.isFinite(anchor[key])&&Math.abs(anchor[key])<100000);
    const requestedX=valid?bounds.x+anchor.x+(anchor.align==='right'?anchor.width-width:0):bounds.x+8,requestedY=valid?bounds.y+anchor.y+anchor.height+3:bounds.y+38;
    return {x:Math.round(Math.max(work.x,Math.min(requestedX,work.x+work.width-width))),y:Math.round(Math.max(work.y,Math.min(requestedY,work.y+work.height-height))),width,height};
  }
  function show(anchor){
    const parent=getWindow();if(!parent||parent.isDestroyed())return;
    if(popup&&!popup.isDestroyed()){dismiss();return;}
    const child=new BrowserWindow({...position(parent,anchor),parent,show:false,frame:false,resizable:false,skipTaskbar:true,backgroundColor:'#17131d',
      webPreferences:{preload:path.join(root,'tab-search-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true}});
    popup=child;child.webContents.setWindowOpenHandler(()=>({action:'deny'}));child.webContents.on('will-navigate',e=>e.preventDefault());
    child.on('blur',()=>{if(!child.isDestroyed())child.close();});child.on('closed',()=>{if(popup===child)popup=null;});
    child.once('ready-to-show',()=>{if(popup===child&&!parent.isDestroyed()){child.show();child.focus();}});
    child.loadFile(path.join(root,'tab-search.html')).catch(()=>{if(!child.isDestroyed())child.close();});
  }
  function update(){if(popup&&!popup.isDestroyed()&&!popup.webContents.isLoading())popup.webContents.send('tab-search-update',getData());}
  async function command(event,payload){
    if(!popup||popup.isDestroyed()||event.sender!==popup.webContents||event.senderFrame!==popup.webContents.mainFrame)throw new Error('Untrusted tab search request.');
    if(!payload||typeof payload.name!=='string')throw new Error('Invalid tab search request.');
    if(payload.name==='state')return getData();
    if(payload.name==='dismiss'){dismiss();return;}
    if(payload.name==='activate'){if(typeof payload.value!=='string')throw new Error('Invalid tab.');const result=selectTab(payload.value);dismiss();return result;}
    if(payload.name==='close'){if(typeof payload.value!=='string')throw new Error('Invalid tab.');closeTab(payload.value);update();return;}
    if(payload.name==='restore'){if(typeof payload.value!=='string')throw new Error('Invalid closed tab.');const result=restoreTab(payload.value);dismiss();return result;}
    throw new Error('Unknown tab search action.');
  }
  ipcMain.handle('tab-search-command',command);
  function destroy(){dismiss();ipcMain.removeHandler('tab-search-command');}
  return {show,update,dismiss,destroy};
}
module.exports={createTabSearch};
