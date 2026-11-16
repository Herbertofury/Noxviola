'use strict';
const {contextBridge, ipcRenderer} = require('electron');
// Acknowledge only after the new title/image state has been painted into the
// preview document. The main process authenticates sender and request token.
contextBridge.exposeInMainWorld('preview', Object.freeze({
  onData: callback => {
    if (typeof callback !== 'function') throw new TypeError('A callback is required');
    ipcRenderer.on('tab-preview-data', (_event, data) => {
      callback(data);
      ipcRenderer.send('tab-preview-rendered', data?.token);
    });
  },
}));
