// Preload for LOCAL windows only (wizard / agent). The Muse web window never loads this.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('link', {
  getSettings: () => ipcRenderer.invoke('link:get-settings'),
  getStatus: () => ipcRenderer.invoke('link:get-status'),
  getVersion: () => ipcRenderer.invoke('link:get-version'),
  saveSettings: (patch) => ipcRenderer.invoke('link:save-settings', patch),
  runSetup: () => ipcRenderer.invoke('link:run-setup'),
  runRevoke: () => ipcRenderer.invoke('link:run-revoke'),
  openTailscale: () => ipcRenderer.invoke('link:open-tailscale'),
  openExternal: (url) => ipcRenderer.invoke('link:open-external', url),
  openBaseFolder: () => ipcRenderer.invoke('link:open-base-folder'),
  setupLog: () => ipcRenderer.invoke('link:setup-log'),
  finishSetup: () => ipcRenderer.invoke('link:finish-setup'),
  quitApp: () => ipcRenderer.invoke('link:quit'),
});
