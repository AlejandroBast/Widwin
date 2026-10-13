const { contextBridge, ipcRenderer } = require('electron');

const call = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);

contextBridge.exposeInMainWorld('api', {
  list: call('widgets:list'),
  templates: call('widgets:templates'),
  create: call('widgets:create'),
  importHtml: call('widgets:import'),
  getHtml: call('widgets:get-html'),
  saveHtml: call('widgets:save-html'),
  update: call('widgets:update'),
  edit: call('widgets:edit'),
  reload: call('widgets:reload'),
  remove: call('widgets:delete'),
  openFolder: call('widgets:open-folder'),
  getAutostart: call('app:get-autostart'),
  setAutostart: call('app:set-autostart'),
  onChanged: (cb) => ipcRenderer.on('widgets:changed', () => cb()),
});
