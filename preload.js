const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openImageDialog: () => ipcRenderer.invoke('dialog:openImage'),
  openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDirectory'),
  getTemplates: () => ipcRenderer.invoke('templates:get'),
  saveTemplate: (template) => ipcRenderer.invoke('templates:save', template),
  deleteTemplate: (templateId) => ipcRenderer.invoke('templates:delete', templateId),
  runProcessWithLayout: (args) => ipcRenderer.send('video:runProcessWithLayout', args),
  onProcessLog: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('process:log', listener);
    return () => ipcRenderer.removeListener('process:log', listener);
  },
  
  // Thêm kênh mới để nhận dữ liệu tiến trình
  onProcessProgress: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('process:progress', listener);
    return () => ipcRenderer.removeListener('process:progress', listener);
  },

  showContextMenu: (elementId, elementType) => ipcRenderer.send('show-context-menu', { elementId, elementType }),
  onContextMenuCommand: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('context-menu-command', listener);
    return () => ipcRenderer.removeListener('context-menu-command', listener); 
  },
  getFonts: () => ipcRenderer.invoke('fonts:get'),
  updateCookies: () => ipcRenderer.invoke('cookies:update'),
  onCookieRequired: (callback) => {
    const listener = (_event) => callback();
    ipcRenderer.on('process:cookie-required', listener);
    return () => ipcRenderer.removeListener('process:cookie-required', listener);
  },
});
