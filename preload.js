const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // --- Các hàm cũ (không đổi) ---
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

  // <<< THÊM MỚI: Các hàm cho Auto-Update >>>
  onUpdateMessage: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('update:message', listener);
    return () => ipcRenderer.removeListener('update:message', listener);
  },
  onUpdateAvailable: (callback) => {
    const listener = (_event, info) => callback(info);
    ipcRenderer.on('update:available', listener);
    return () => ipcRenderer.removeListener('update:available', listener);
  },
  onUpdateProgress: (callback) => {
    const listener = (_event, percent) => callback(percent);
    ipcRenderer.on('update:progress', listener);
    return () => ipcRenderer.removeListener('update:progress', listener);
  },
  onUpdateDownloaded: (callback) => {
    const listener = (_event, info) => callback(info);
    ipcRenderer.on('update:downloaded', listener);
    return () => ipcRenderer.removeListener('update:downloaded', listener);
  },
  startDownload: () => ipcRenderer.send('updater:start-download'),
  quitAndInstall: () => ipcRenderer.send('updater:quit-and-install'),
});