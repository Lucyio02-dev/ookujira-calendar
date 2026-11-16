const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('petApi', {
  weather: () => ipcRenderer.invoke('weather:get'),
  refreshWeather: () => ipcRenderer.invoke('weather:refresh'),
  searchCities: name => ipcRenderer.invoke('weather:search', name),
  configureWeather: config => ipcRenderer.invoke('weather:configure', config),
  onWeather: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('weather:changed', listener);
    return () => ipcRenderer.removeListener('weather:changed', listener);
  },
  cursor: () => ipcRenderer.invoke('pet:cursor'),
  startDrag: () => ipcRenderer.invoke('pet:drag-start'),
  updateDrag: () => ipcRenderer.invoke('pet:drag-update'),
  finishDrag: () => ipcRenderer.invoke('pet:drag-finish'),
  beginDrag: () => ipcRenderer.invoke('pet:begin-drag'),
  moveTo: (x, y) => ipcRenderer.send('pet:move-to', { x, y }),
  endDrag: () => ipcRenderer.send('pet:end-drag'),
  setIgnore: ignore => ipcRenderer.send('pet:set-ignore', ignore),
  menu: () => ipcRenderer.send('pet:menu'),
  openCalendar: () => ipcRenderer.send('pet:open-calendar'),
  onCommand: callback => { const listener = (_event, kind) => callback(kind); ipcRenderer.on('pet:command', listener); return () => ipcRenderer.removeListener('pet:command', listener); },
  onFocus: callback => {
    const listener = (_event, active) => callback(active);
    ipcRenderer.on('pet:focus', listener);
    return () => ipcRenderer.removeListener('pet:focus', listener);
  },
  onAction: callback => {
    const listener = (_event, kind) => callback(kind);
    ipcRenderer.on('pet:action', listener);
    return () => ipcRenderer.removeListener('pet:action', listener);
  },
  onTheme: callback => {
    const listener = (_event, name) => callback(name);
    ipcRenderer.on('pet:theme', listener);
    return () => ipcRenderer.removeListener('pet:theme', listener);
  },
  onReminded: callback => {
    const listener = (_event, titles) => callback(titles);
    ipcRenderer.on('pet:reminded', listener);
    return () => ipcRenderer.removeListener('pet:reminded', listener);
  }
});
