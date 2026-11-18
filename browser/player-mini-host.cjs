'use strict';

const path=require('node:path');
function createMiniHost({BrowserWindow,screen,onDismiss}){
  let surface=null,loaded=false,latest=null,position=null,disposed=false;
  function update(data){
    latest=data;
    const show=!disposed&&data?.visible&&data.mode==='floating';
    if(!show){
      if(surface&&!surface.isDestroyed()){
        position=surface.getPosition();
        const old=surface;surface=null;old.destroy();
      }
      return;
    }
    if(surface&&!surface.isDestroyed()){
      if(loaded)surface.webContents.send('mini-state',data);
      return;
    }
    const {workArea}=screen.getDisplayNearestPoint(position?{x:position[0],y:position[1]}:screen.getCursorScreenPoint());
    const width=340,height=124;
    const x=Math.max(workArea.x,Math.min(position?.[0]??workArea.x+workArea.width-width-24,workArea.x+workArea.width-width));
    const y=Math.max(workArea.y,Math.min(position?.[1]??workArea.y+workArea.height-height-28,workArea.y+workArea.height-height));
    const mini=new BrowserWindow({width,height,x,y,show:false,frame:false,resizable:false,alwaysOnTop:true,skipTaskbar:true,
      autoHideMenuBar:true,title:'Noxviola Mini Player',backgroundColor:'#15101a',
      webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,preload:path.join(__dirname,'player-mini-preload.cjs')}});
    surface=mini;loaded=false;
    mini.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    mini.webContents.on('will-navigate',event=>event.preventDefault());
    mini.webContents.on('did-finish-load',()=>{
      if(surface!==mini)return;
      loaded=true;mini.webContents.send('mini-state',latest);
      mini.showInactive();
      mini.setAlwaysOnTop(true,process.platform==='win32'?'pop-up-menu':'floating');
    });
    mini.on('close',()=>{position=mini.getPosition();});
    mini.on('closed',()=>{
      if(surface!==mini)return;
      surface=null;loaded=false;onDismiss();
    });
    void mini.loadFile(path.join(__dirname,'player-mini.html')).catch(()=>{if(!mini.isDestroyed())mini.close();});
  }
  const accepts=event=>!!surface&&!surface.isDestroyed()&&event.sender===surface.webContents&&event.senderFrame===surface.webContents.mainFrame;
  const close=()=>{disposed=true;update(null);};
  return {update,accepts,close,state:()=>latest};
}
module.exports={createMiniHost};
