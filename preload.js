const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  weather: () => ipcRenderer.invoke('weather:get'),
  refreshWeather: () => ipcRenderer.invoke('weather:refresh'),
  searchCities: name => ipcRenderer.invoke('weather:search', name),
  configureWeather: config => ipcRenderer.invoke('weather:configure', config),
  onWeather: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('weather:changed', listener);
    return () => ipcRenderer.removeListener('weather:changed', listener);
  },
  weather: () => ipcRenderer.invoke('weather:get'),
  refreshWeather: () => ipcRenderer.invoke('weather:refresh'),
  searchCities: name => ipcRenderer.invoke('weather:search', name),
  configureWeather: config => ipcRenderer.invoke('weather:configure', config),
  onWeather: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('weather:changed', listener);
    return () => ipcRenderer.removeListener('weather:changed', listener);
  },
  loadTodos: () => ipcRenderer.invoke('todos:load'),
  saveTodos: todos => ipcRenderer.invoke('todos:save', todos),
  loadCourses: () => ipcRenderer.invoke('courses:load'),
  saveCourses: state => ipcRenderer.invoke('courses:save', state),
  importCourseFile: () => ipcRenderer.invoke('courses:import-file'),
  exportTodos: () => ipcRenderer.invoke('todos:export'),
  importTodos: () => ipcRenderer.invoke('todos:import'),
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
  toggleTop: () => ipcRenderer.invoke('window:toggle-top'),
  windowState: () => ipcRenderer.invoke('window:state'),
  togglePet: () => ipcRenderer.invoke('pet:toggle'),
  petState: () => ipcRenderer.invoke('pet:state'),
  notifyFocusDone: label => ipcRenderer.send('focus:done', label),
  setFocusMode: active => ipcRenderer.send('pet:focus', active === true),
  setTheme: name => ipcRenderer.send('theme:changed', name),
  petAction: kind => ipcRenderer.send('pet:action', kind),
  onReminded: callback => {
    const listener = (_event, ids) => callback(ids);
    ipcRenderer.on('todos:reminded', listener);
    return () => ipcRenderer.removeListener('todos:reminded', listener);
  },
  onCoursesReminded: callback => {
    const listener = (_event, ids) => callback(ids);
    ipcRenderer.on('courses:reminded', listener);
    return () => ipcRenderer.removeListener('courses:reminded', listener);
  },
  onCourseOpenDate: callback => {
    const listener = (_event, date) => callback(date);
    ipcRenderer.on('courses:open-date', listener);
    return () => ipcRenderer.removeListener('courses:open-date', listener);
  },
  onPetChanged: callback => {
    const listener = (_event, enabled) => callback(enabled);
    ipcRenderer.on('pet:changed', listener);
    return () => ipcRenderer.removeListener('pet:changed', listener);
  }
});
