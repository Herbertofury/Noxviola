'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('browser',{command:(name,value)=>ipcRenderer.invoke('command',{name,value}),onAccounts:fn=>ipcRenderer.on('accounts',(_,data)=>fn(data)),onVault:fn=>ipcRenderer.on('vault',(_,data)=>fn(data)),onState:fn=>ipcRenderer.on('state',(_,data)=>fn(data)),onNotice:fn=>ipcRenderer.on('notice',(_,data)=>fn(data)),onAddress:fn=>ipcRenderer.on('focus-address',()=>fn()),onFind:fn=>ipcRenderer.on('focus-find',()=>fn())});
