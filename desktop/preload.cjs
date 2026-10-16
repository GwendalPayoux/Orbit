const { contextBridge, ipcRenderer } = require('electron');
function subscribe(channel, listener) {
  const handler = (_event, value) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}
contextBridge.exposeInMainWorld('orbit', {
  ...Object.fromEntries(['library','scan','scanCancel','icon','add','update','remove','categories','theme','launch'].map(channel => [channel, (...args) => ipcRenderer.invoke(channel, ...args)])),
  saveRoutine: (id,name,ids) => ipcRenderer.invoke('routines:save',id,name,ids),
  deleteRoutine: id => ipcRenderer.invoke('routines:delete',id),
  runRoutine: id => ipcRenderer.invoke('routines:run',id),
  onScanProgress: listener => subscribe('scan:progress',listener),
  onUsage: listener => subscribe('usage:state',listener),
  onUsageError: listener => subscribe('usage:error',listener),
  updateStatus: () => ipcRenderer.invoke('updates:status'),
  checkUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdateStatus: listener => subscribe('updates:state', listener),
  onOpenUpdates: listener => subscribe('updates:open', listener)
});
