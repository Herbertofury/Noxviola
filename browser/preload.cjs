"use strict";
const {contextBridge,ipcRenderer} = require('electron');
function subscribe(channel, callback) {
  if (typeof callback !== 'function') throw new TypeError('An event callback is required.');
  const handler = (_event, value) => callback(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}
contextBridge.exposeInMainWorld('browser', Object.freeze({
  command:(name,value) => ipcRenderer.invoke('command',{name,value}),
  onState:callback => subscribe('state',callback),
  onVault:callback => subscribe('vault',callback),
  onVaultDraft:callback => subscribe('vault-draft',callback),
  onAccounts:callback => subscribe('accounts',callback),
  onExtensions:callback => subscribe('extensions',callback),
  onExtensionPreview:callback => subscribe('extension-preview',callback),
  onDownloads:callback => subscribe('downloads',callback),
  onPermissions:callback => subscribe('permissions',callback),
  onCapabilities:callback => subscribe('capabilities',callback),
  onFollows:callback => subscribe('follows',callback),
  onHistory:callback => subscribe('history',callback),
  onBookmarks:callback => subscribe('bookmarks',callback),
  onWorkspaces:callback => subscribe('workspaces',callback),
  onResources:callback => subscribe('resources',callback),
  onSettingsPreview:callback => subscribe('settings-preview',callback),
  onFindResult:callback => subscribe('find-result',callback),
  onExtensionActions:callback => subscribe('extension-actions',callback),
  onPaneLayout:callback => subscribe('pane-layout',callback),
  onSidebarLayout:callback => subscribe('sidebar-layout',callback),
  onSidebarWebState:callback => subscribe('sidebar-web-state',callback),
  onPasswords:callback => subscribe('passwords',callback),
  onMods:callback => subscribe('mods',callback),
  onMediaChanged:callback => subscribe('media-changed',callback),
  onSidebarExtensionState:callback => subscribe('sidebar-extension-state',callback),
  onNotice:callback => subscribe('notice',callback),
  onAddress:callback => subscribe('focus-address',callback),
  onFind:callback => subscribe('focus-find',callback),
}));
