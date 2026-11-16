'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('tabSearch',Object.freeze({
  command:(name,value)=>ipcRenderer.invoke('tab-search-command',{name,value}),
  onUpdate:callback=>{if(typeof callback!=='function')throw new TypeError('Callback required');ipcRenderer.on('tab-search-update',(_event,value)=>callback(value));}
}));
