const { app, BrowserWindow, ipcMain, dialog, Menu, nativeImage } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const Store = require('electron-store');
const fs = require('fs');
const os = require('os');
const { autoUpdater } = require('electron-updater');

const store = new Store();
let mainWindow;
let cachedFonts = null;

function sendUpdateMessage(channel, ...args) {
  if (mainWindow) {
    mainWindow.webContents.send(channel, ...args);
  }
}

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

async function loadFonts() {
  try {
    const resourcesPath = app.isPackaged ? process.resourcesPath : __dirname;
    const fontsDir = app.isPackaged 
      ? path.join(resourcesPath, 'assets')
      : path.join(resourcesPath, 'resources', 'assets');

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
        cachedFonts = defaultFonts.filter(f => f.dataUrl);
        return cachedFonts;
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
    
    cachedFonts = uniqueFonts;
    return cachedFonts;

  } catch (err) {
    console.error("Lỗi nghiêm trọng khi đọc thư mục font:", err);
    cachedFonts = [];
    return []; 
  }
}

app.whenReady().then(() => {
  // Dùng chung một thư mục userData cố định cho cả dev và bản build
  const fixedUserDataPath = path.join(app.getPath('appData'), 'RedbiVideoDownloader');
  app.setPath('userData', fixedUserDataPath);

  createWindow();
  loadFonts();
  if (!app.isPackaged) {
    console.log('Update check skipped in development mode.');
  } else {
    autoUpdater.checkForUpdates();
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
  if (cachedFonts) {
    return cachedFonts;
  }
  return await loadFonts();
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
    
    const image = nativeImage.createFromBuffer(fileData);
    const size = image.getSize(); 

    const base64Data = fileData.toString('base64');
    const mimeType = `image/${path.extname(filePath).substring(1)}`;
    
    return {
      dataUrl: `data:${mimeType};base64,${base64Data}`,
      width: size.width,
      height: size.height
    };
  } catch (error) { 
    console.error("Lỗi đọc ảnh:", error);
    return null; 
  }
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

ipcMain.handle('cookies:import-from-edge', async () => {
  if (process.platform !== 'win32') {
    return { success: false, message: 'Chức năng này chỉ hỗ trợ Windows' };
  }
  
  try {
    const resourcesPath = app.isPackaged ? process.resourcesPath : __dirname;
    const pythonScriptPath = app.isPackaged
      ? path.join(resourcesPath, 'scripts', 'editor.py')
      : path.join(__dirname, 'scripts', 'editor.py');
    
    const userDataPath = app.getPath('userData');
    const finalCookiePath = path.join(userDataPath, 'cookies.txt');
    
    const commandToRun = 'py';
    const args = [pythonScriptPath, '--export-cookies', finalCookiePath];
    
    return new Promise((resolve) => {
      const pythonProcess = spawn(commandToRun, args, {
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1',
          PYTHONLEGACYWINDOWSSTDIO: '0'
        }
      });
      
      let stdout = '';
      let stderr = '';
      
      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString('utf8');
      });
      
      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString('utf8');
      });
      
      pythonProcess.on('close', (code) => {
        if (code === 0 && stdout.includes('SUCCESS:')) {
          resolve({ success: true, message: `Đã import cookies từ Microsoft Edge thành công! File đã được lưu tại: ${finalCookiePath}` });
        } else {
          const errorMsg = stderr || stdout || 'Lỗi không xác định';
          resolve({ success: false, message: `Lỗi khi import cookies từ Edge: ${errorMsg}` });
        }
      });
      
      pythonProcess.on('error', (err) => {
        resolve({ success: false, message: `Không thể khởi chạy Python: ${err.message}` });
      });
    });
  } catch (error) {
    return { success: false, message: `Lỗi: ${error.message}` };
  }
});


// Store active processes for cleanup
const activeProcesses = new Map();

ipcMain.on('video:runProcessWithLayout', (event, { url, parts, partDuration, savePath, layout, encoder }) => {
    const resourcesPath = app.isPackaged ? process.resourcesPath : __dirname;
    
    const pythonScriptPath = app.isPackaged
      ? path.join(resourcesPath, 'scripts', 'editor.py')
      : path.join(__dirname, 'scripts', 'editor.py'); 
      
    const resourcesPathForPython = app.isPackaged
      ? process.resourcesPath
      : path.join(__dirname, 'resources'); 
      
    const userDataPath = app.getPath('userData');
    const layoutFilePath = path.join(os.tmpdir(), `layout-${Date.now()}.json`);
    
    try {
      fs.writeFileSync(layoutFilePath, JSON.stringify(layout));
    } catch (error) {
      sendUpdateMessage('process:log', `FATAL_ERROR: Không thể tạo file layout. ${error.message}`);
      return;
    }
  
    const args = [
      pythonScriptPath, '--resources-path', resourcesPathForPython, '--user-data-path', userDataPath,
      '--url', url, '--parts', String(parts), '--save-path', savePath,
      '--part-duration', String(partDuration), '--layout-file', layoutFilePath, '--encoder', encoder
    ];

    const commandToRun = 'py';

    let pythonProcess;
    try {
      pythonProcess = spawn(commandToRun, args, { 
        env: { 
          ...process.env, 
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1',
          PYTHONLEGACYWINDOWSSTDIO: '0'
        } 
      });
      
      // Store process for cleanup
      const processId = Date.now();
      activeProcesses.set(processId, { process: pythonProcess, layoutFile: layoutFilePath });
      
      pythonProcess.stdout.on('data', (data) => {
        try {
          const lines = data.toString('utf8').split(/(\r\n|\n|\r)/);
          for (const line of lines) {
            const logLine = line.trim();
            if (!logLine) continue;
            if (logLine.startsWith('PROGRESS:')) {
              const parts = line.split(':');
              if (parts.length >= 3) {
                sendUpdateMessage('process:progress', { 
                  type: parts[1] || 'unknown', 
                  value: parseFloat(parts[2]) || 0 
                });
              }
            } else {
              sendUpdateMessage('process:log', logLine);
            }
          }
        } catch (error) {
          console.error('Error processing stdout:', error);
        }
      });
      
      pythonProcess.stderr.on('data', (data) => {
        try {
          sendUpdateMessage('process:log', `PYTHON_ERROR: ${data.toString('utf8').trim()}`);
        } catch (error) {
          console.error('Error processing stderr:', error);
        }
      });
      
      pythonProcess.on('error', (err) => {
        sendUpdateMessage('process:log', `FATAL_ERROR: Không thể khởi chạy Python. ${err.message}`);
        activeProcesses.delete(processId);
        cleanupLayoutFile(layoutFilePath);
      });
      
      pythonProcess.on('close', (code) => {
        activeProcesses.delete(processId);
        if (code === 403) {
          sendUpdateMessage('process:cookie-required');
        }
        // Gửi thông báo kết thúc với exit code để frontend biết là lỗi hay thành công
        const statusMsg = code === 0 
          ? '--- Tiến trình kết thúc thành công ---' 
          : `--- Tiến trình kết thúc với mã ${code} (lỗi) ---`;
        sendUpdateMessage('process:log', statusMsg);
        sendUpdateMessage('process:progress', { type: 'DONE', value: 100 });
        cleanupLayoutFile(layoutFilePath);
      });
    } catch (error) {
      sendUpdateMessage('process:log', `FATAL_ERROR: Không thể khởi chạy process. ${error.message}`);
      cleanupLayoutFile(layoutFilePath);
    }
});

function cleanupLayoutFile(layoutFilePath) {
  try {
    if (fs.existsSync(layoutFilePath)) {
      fs.unlinkSync(layoutFilePath);
    }
  } catch (error) {
    console.error('Error cleaning up layout file:', error);
  }
}

// Cleanup processes on app quit
app.on('before-quit', () => {
  activeProcesses.forEach(({ process: proc }) => {
    try {
      if (proc && !proc.killed) {
        proc.kill();
      }
    } catch (error) {
      console.error('Error killing process:', error);
    }
  });
  activeProcesses.clear();
});


// --- Xử lý Auto-Update thủ công ---
autoUpdater.on('update-available', (info) => {
  sendUpdateMessage('update:available', info);
});
autoUpdater.on('update-not-available', (info) => {
  sendUpdateMessage('update:message', 'Bạn đang dùng phiên bản mới nhất.');
});
autoUpdater.on('download-progress', (progressObj) => {
  sendUpdateMessage('update:progress', progressObj.percent);
});
autoUpdater.on('update-downloaded', (info) => {
  sendUpdateMessage('update:downloaded', info);
});
autoUpdater.on('error', (err) => {
  sendUpdateMessage('update:message', `Lỗi cập nhật: ${err.message}`);
});

ipcMain.on('updater:start-download', () => {
  autoUpdater.downloadUpdate();
});
ipcMain.on('updater:quit-and-install', () => {
  autoUpdater.quitAndInstall();
});