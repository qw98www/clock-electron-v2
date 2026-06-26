const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApi', {
  getState: () => ipcRenderer.invoke('state:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  startTimer: () => ipcRenderer.invoke('timer:start'),
  pauseTimer: () => ipcRenderer.invoke('timer:pause'),
  skipTimer: () => ipcRenderer.invoke('timer:skip'),
  endBreakNow: () => ipcRenderer.invoke('break:endNow'),
  getAssetPath: (filename) => ipcRenderer.invoke('asset:getPath', filename),
  onStateUpdate: (cb) => {
    const listener = (_event, nextState) => cb(nextState);
    ipcRenderer.on('state:update', listener);
    return () => ipcRenderer.removeListener('state:update', listener);
  },
});
