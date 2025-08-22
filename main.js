const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const Store = require('electron-store');
const fontList = require('font-list');
const fs = require('fs');
const os = require('os');

const store = new Store();
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'dist', 'index.html'));
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// Các hàm xử lý IPC không thay đổi
ipcMain.handle('templates:get', () => store.get('templates', []));
ipcMain.handle('templates:save', (event, template) => {
  const templates = store.get('templates', []);
  const existingIndex = templates.findIndex(t => t.id === template.id);
  if (existingIndex > -1) { templates[existingIndex] = template; } else { templates.push(template); }
  store.set('templates', templates);
  return true;
});
ipcMain.handle('templates:delete', (event, templateId) => {
  const templates = store.get('templates', []);
  store.set('templates', templates.filter(t => t.id !== templateId));
  return true;
});
ipcMain.handle('fonts:get', async () => {
  try {
    const fonts = await fontList.getFonts();
    return [...new Set(fonts.map(f => f.replace(/"/g, '')))];
  } catch (err) { return []; }
});
ipcMain.on('show-context-menu', (event, { elementId, elementType }) => {
  const commands = [
    { label: 'Đưa lên trên 1 lớp', click: () => sendCommand('bring-forward', elementId) },
    { label: 'Đưa xuống dưới 1 lớp', click: () => sendCommand('send-backward', elementId) },
  ];
  if (elementType === 'image') {
    commands.push({ type: 'separator' });
    commands.push({ label: 'Xóa ảnh', click: () => sendCommand('delete-element', elementId) });
  }
  function sendCommand(action, id) { event.sender.send('context-menu-command', { action, elementId: id }); }
  Menu.buildFromTemplate(commands).popup({ window: BrowserWindow.fromWebContents(event.sender) });
});
ipcMain.handle('dialog:openImage', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  });
  if (canceled || !filePaths || filePaths.length === 0) { return null; }
  try {
    const filePath = filePaths[0];
    const fileData = fs.readFileSync(filePath);
    const base64Data = fileData.toString('base64');
    const mimeType = `image/${path.extname(filePath).substring(1)}`;
    return `data:${mimeType};base64,${base64Data}`;
  } catch (error) { return null; }
});
ipcMain.handle('dialog:openDirectory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return canceled ? null : filePaths[0];
});
ipcMain.handle('cookies:update', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Chọn file cookies.txt mới', properties: ['openFile'],
    filters: [{ name: 'Text Files', extensions: ['txt'] }]
  });
  if (canceled || !filePaths || filePaths.length === 0) { return { success: false, message: 'Hủy chọn file.' }; }
  try {
    const newCookiePath = filePaths[0];
    const newCookieData = fs.readFileSync(newCookiePath, 'utf8');
    const userDataPath = app.getPath('userData');
    const cookieStoragePath = path.join(userDataPath, 'cookies.txt');
    fs.writeFileSync(cookieStoragePath, newCookieData);
    return { success: true, message: 'Cập nhật cookies thành công!' };
  } catch (error) {
    return { success: false, message: `Lỗi: ${error.message}` };
  }
});

// Hàm xử lý chính
ipcMain.on('video:runProcessWithLayout', (event, { url, parts, partDuration, savePath, layout, encoder }) => {
  const resourcesPath = app.isPackaged ? process.resourcesPath : path.join(__dirname, 'resources');
  const pythonScriptPath = path.join(resourcesPath, 'editor.py');
  const userDataPath = app.getPath('userData');
  const layoutFilePath = path.join(os.tmpdir(), `layout-${Date.now()}.json`);
  fs.writeFileSync(layoutFilePath, JSON.stringify(layout));

  const pythonProcess = spawn('python', [
    pythonScriptPath, '--resources-path', resourcesPath, '--user-data-path', userDataPath,
    '--url', url, '--parts', String(parts), '--save-path', savePath,
    '--part-duration', String(partDuration), '--layout-file', layoutFilePath, '--encoder', encoder
  ], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  
  // Phân loại log và tiến trình
  pythonProcess.stdout.on('data', data => {
    const logLine = data.toString('utf8').trim();
    if (logLine.startsWith('PROGRESS:')) {
      const parts = logLine.split(':');
      const type = parts[1]; // DOWNLOAD hoặc RENDER
      const value = parseFloat(parts[2]);
      mainWindow.webContents.send('process:progress', { type, value });
    } else if (logLine) { // Chỉ gửi nếu log không rỗng
      mainWindow.webContents.send('process:log', logLine);
    }
  });
  
  pythonProcess.stderr.on('data', data => {
    const logLine = data.toString('utf8').trim();
    if (logLine) {
        mainWindow.webContents.send('process:log', `PYTHON_ERROR: ${logLine}`);
    }
  });
  pythonProcess.on('error', err => {
    mainWindow.webContents.send('process:log', `FATAL_ERROR: Không thể khởi chạy Python. ${err.message}`);
  });
  pythonProcess.on('close', code => {
    if (code === 403) {
      mainWindow.webContents.send('process:cookie-required');
    }
    mainWindow.webContents.send('process:log', `--- Tiến trình kết thúc với mã ${code} ---`);
    mainWindow.webContents.send('process:progress', { type: 'DONE', value: 100 }); // Gửi tín hiệu hoàn thành
    if (fs.existsSync(layoutFilePath)) {
      fs.unlinkSync(layoutFilePath);
    }
  });
});
