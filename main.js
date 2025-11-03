const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const Store = require('electron-store');
const fs = require('fs');
const os = require('os');
const { autoUpdater } = require('electron-updater');

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

app.whenReady().then(() => {
  createWindow();
  if (!app.isPackaged) {
    console.log('Update check skipped in development mode.');
  } else {
    autoUpdater.checkForUpdatesAndNotify();
  }
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// --- CÁC HÀM XỬ LÝ IPC ---
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
    const resourcesPath = app.isPackaged ? process.resourcesPath : __dirname;
    const fontsDir = app.isPackaged 
      ? path.join(resourcesPath, 'assets') // Build: [app.res]/assets
      : path.join(resourcesPath, 'resources', 'assets'); // Dev: [project]/resources/assets

    const readFontAsDataUrl = (filePath, mimeType) => {
      try {
        const fileData = fs.readFileSync(filePath);
        const base64Data = fileData.toString('base64');
        return `data:${mimeType};base64,${base64Data}`;
      } catch (e) {
        console.error(`Lỗi khi đọc file font: ${filePath}`, e);
        return null;
      }
    };
    
    const defaultFontPath = path.join(fontsDir, 'arial.ttf');
    const defaultFonts = [{ 
      name: 'Arial (Mặc định)', 
      file: 'arial.ttf', 
      dataUrl: readFontAsDataUrl(defaultFontPath, 'font/ttf')
    }];

    if (!fs.existsSync(fontsDir)) {
        console.error(`Không tìm thấy thư mục font tại: ${fontsDir}`);
        return defaultFonts.filter(f => f.dataUrl); 
    }

    const fontFiles = fs.readdirSync(fontsDir);
    const fontList = fontFiles
      .filter(file => file.toLowerCase().endsWith('.ttf') || file.toLowerCase().endsWith('.otf'))
      .map(file => {
          let name = path.parse(file).name;
          name = name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' ');
          
          const fullPath = path.join(fontsDir, file);
          const mimeType = file.endsWith('.ttf') ? 'font/ttf' : 'font/otf';
          
          return { 
            name: name, 
            file: file, 
            dataUrl: readFontAsDataUrl(fullPath, mimeType)
          };
      });
    
    const allFonts = [...defaultFonts, ...fontList].filter(f => f.dataUrl); 
    const uniqueFonts = Array.from(new Map(allFonts.map(font => [font.file, font])).values());
    
    return uniqueFonts;

  } catch (err) {
    console.error("Lỗi nghiêm trọng khi đọc thư mục font:", err);
    return []; 
  }
});

ipcMain.on('show-context-menu', (event, { elementId, elementType }) => {
    const commands = [
      { label: 'Đưa lên trên 1 lớp', click: () => sendCommand('bring-forward', elementId) },
      { label: 'Đưa xuống dưới 1 lớp', click: () => sendCommand('send-backward', elementId) },
    ];
    if (elementType === 'image' || (elementType === 'text' && elementId !== 'text-placeholder')) {
      commands.push({ type: 'separator' });
      commands.push({ label: 'Xóa đối tượng', click: () => sendCommand('delete-element', elementId) });
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
  if (canceled || !filePaths || filePaths.length === 0) {
    return { success: false, message: 'Hủy chọn file.' };
  }
  try {
    const selectedCookiePath = filePaths[0];
    const userDataPath = app.getPath('userData');
    const finalCookiePath = path.join(userDataPath, 'cookies.txt');
    fs.copyFileSync(selectedCookiePath, finalCookiePath);
    return { success: true, message: `Cập nhật cookies thành công! File đã được lưu tại: ${finalCookiePath}` };
  } catch (error) {
    return { success: false, message: `Lỗi khi sao chép file cookies: ${error.message}` };
  }
});

ipcMain.on('video:runProcessWithLayout', (event, { url, parts, partDuration, savePath, layout, encoder }) => {
    
    const resourcesPath = app.isPackaged ? process.resourcesPath : __dirname;
    const pythonScriptPath = app.isPackaged
      ? path.join(resourcesPath, 'editor.py') 
      : path.join(resourcesPath, 'editor.py');
    const resourcesPathForPython = app.isPackaged
      ? process.resourcesPath
      : path.join(__dirname, 'resources'); 
      
    const userDataPath = app.getPath('userData');
    const layoutFilePath = path.join(os.tmpdir(), `layout-${Date.now()}.json`);
    fs.writeFileSync(layoutFilePath, JSON.stringify(layout));
  
    const args = [
      pythonScriptPath, '--resources-path', resourcesPathForPython, '--user-data-path', userDataPath,
      '--url', url, '--parts', String(parts), '--save-path', savePath,
      '--part-duration', String(partDuration), '--layout-file', layoutFilePath, '--encoder', encoder
    ];

    // <<< SỬA LỖI: Dùng 'py' thay vì 'python' >>>
    const commandToRun = 'py';

    const pythonProcess = spawn(commandToRun, args, { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    
    pythonProcess.stdout.on('data', data => {
      const lines = data.toString('utf8').split(/(\r\n|\n|\r)/);
      for (const line of lines) {
        const logLine = line.trim();
        if (!logLine) continue;
  
        if (logLine.startsWith('PROGRESS:')) {
          const parts = logLine.split(':');
          const type = parts[1];
          const value = parseFloat(parts[2]);
          mainWindow.webContents.send('process:progress', { type, value });
        } else {
          mainWindow.webContents.send('process:log', logLine);
        }
      }
    });
    
    pythonProcess.stderr.on('data', data => {
      const logLine = data.toString('utf8').trim();
      if (logLine) {
          mainWindow.webContents.send('process:log', `PYTHON_ERROR: ${logLine}`);
      }
    });
    pythonProcess.on('error', err => {
      mainWindow.webContents.send('process:log', `FATAL_ERROR: Không thể khởi chạy Python (lỗi spawn). Hãy chắc chắn Python đã được cài đặt và thêm vào PATH hệ thống.`);
    });
    pythonProcess.on('close', code => {
      if (code === 403) {
        mainWindow.webContents.send('process:cookie-required');
      }
      mainWindow.webContents.send('process:log', `--- Tiến trình kết thúc với mã ${code} ---`);
      mainWindow.webContents.send('process:progress', { type: 'DONE', value: 100 });
      if (fs.existsSync(layoutFilePath)) {
        fs.unlinkSync(layoutFilePath);
      }
    });
});