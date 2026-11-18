'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('miniPlayer',Object.freeze({
  command:(action,value)=>ipcRenderer.invoke('mini-command',{action,value}),
  onState:callback=>ipcRenderer.on('mini-state',(_event,value)=>callback(value)),
}));
