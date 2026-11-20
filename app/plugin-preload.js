// Preload for the local plugin management window only.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('plugins', {
  getLinkState: () => ipcRenderer.invoke('plugins:get-link-state'),
  installLink: () => ipcRenderer.invoke('plugins:install-link'),
  updateLink: () => ipcRenderer.invoke('plugins:update-link'),
  uninstallLink: () => ipcRenderer.invoke('plugins:uninstall-link'),
  startLink: () => ipcRenderer.invoke('plugins:start-link'),
  stopLink: () => ipcRenderer.invoke('plugins:stop-link'),
  openLinkWindow: () => ipcRenderer.invoke('plugins:open-link-window'),
});
