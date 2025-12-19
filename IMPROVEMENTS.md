# Cải thiện Project Structure và Performance

## Cấu trúc Folder Mới

### Trước đây:
```
ProjectRB/
├── editor.py (root)
├── processor.py (root)
├── cookies_handler.py (root)
├── downloader_flow.py (root)
├── ffmpeg_tools.py (root)
├── utils_common.py (root)
├── dist/ (build artifacts)
├── build/ (build artifacts)
└── ...
```

### Sau khi cải thiện:
```
ProjectRB/
├── scripts/              # Tất cả Python scripts được tổ chức ở đây
│   ├── __init__.py
│   ├── editor.py
│   ├── processor.py
│   ├── cookies_handler.py
│   ├── downloader_flow.py
│   ├── ffmpeg_tools.py
│   └── utils_common.py
├── renderer/            # React frontend
│   └── src/
├── resources/            # Resources cho build
└── main.js              # Electron main process
```

## Các Cải Thiện Đã Thực Hiện

### 1. Cấu Trúc Folder
- ✅ Tạo folder `scripts/` để tổ chức tất cả Python scripts
- ✅ Di chuyển tất cả Python files vào `scripts/`
- ✅ Cập nhật `main.js` để trỏ đến đúng đường dẫn
- ✅ Cập nhật `package.json` build config

### 2. File Không Cần Thiết
- ✅ Cải thiện `.gitignore` để loại trừ:
  - Build artifacts (`dist/`, `build/`, `renderer/dist/`)
  - Python cache (`__pycache__/`, `*.pyc`)
  - Temporary files (`*.tmp`, `layout-*.json`)
  - IDE files (`.vscode/`, `.idea/`)
  - OS files (`.DS_Store`, `Thumbs.db`)

### 3. Performance Optimization
- ✅ Sử dụng `useMemo` cho `selectedElement` để tránh re-compute không cần thiết
- ✅ Sử dụng `useCallback` cho các event handlers:
  - `handleQueueChange`
  - `handlePauseToggle`
  - `handleRetryFirst`
  - `handleSkipFirst`
  - `captureLayoutData`
- ✅ Tối ưu `captureLayoutData` với `useCallback` và dependencies đúng
- ✅ Giảm console.log trong production (chỉ log trong development mode)

### 4. Stability Improvements
- ✅ Cải thiện error handling trong `main.js`:
  - Try-catch cho file operations
  - Error handling cho stdout/stderr processing
  - Safe cleanup của layout files
- ✅ Process cleanup:
  - Track active processes trong Map
  - Cleanup processes khi app quit
  - Cleanup layout files sau khi process kết thúc
- ✅ Cải thiện parsing của PROGRESS messages với validation

### 5. Code Quality
- ✅ Tổ chức code tốt hơn với folder structure rõ ràng
- ✅ Giảm code duplication
- ✅ Cải thiện maintainability

## Hướng Dẫn Sử Dụng

### Development
```bash
npm start
```

### Build
```bash
npm run build
```

### Cấu trúc Scripts
Tất cả Python scripts nằm trong `scripts/` folder và có thể import lẫn nhau vì chúng ở cùng package.

## Lưu Ý

- Các file trong `dist/`, `build/`, `__pycache__/` sẽ không được commit vào git
- Khi build, `scripts/` sẽ được copy vào `resources/scripts/` và `editor.py` sẽ được copy vào root của resources
- Đảm bảo Python có thể import các modules từ `scripts/` folder

