// Preload for the plugin management window only.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('plugins', {
  list: () => ipcRenderer.invoke('plugins:list'),
  install: (id) => ipcRenderer.invoke('plugins:install', id),
  update: (id) => ipcRenderer.invoke('plugins:update', id),
  uninstall: (id) => ipcRenderer.invoke('plugins:uninstall', id),
  start: (id) => ipcRenderer.invoke('plugins:start', id),
  stop: (id) => ipcRenderer.invoke('plugins:stop', id),
  open: (id) => ipcRenderer.invoke('plugins:open', id),
  openFolder: () => ipcRenderer.invoke('plugins:open-folder'),
});
