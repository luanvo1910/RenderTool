# Hướng Dẫn Dọn Dẹp Files Không Cần Thiết

## Các File Có Thể Xóa An Toàn

### 1. Files Duplicate ở Root (đã có trong resources/)
Các file này đã có trong `resources/` và sẽ được copy khi build:

```powershell
# Xóa các executable files
Remove-Item -Path ffmpeg.exe,ffplay.exe,ffprobe.exe,yt-dlp.exe -ErrorAction SilentlyContinue

# Xóa các DLL files
Remove-Item -Path avcodec-62.dll,avdevice-62.dll,avfilter-11.dll,avformat-62.dll,avutil-60.dll -ErrorAction SilentlyContinue
Remove-Item -Path swresample-6.dll,swscale-9.dll -ErrorAction SilentlyContinue

# Xóa icon và assets duplicate
Remove-Item -Path icon.ico -ErrorAction SilentlyContinue
Remove-Item -Path assets -Recurse -Force -ErrorAction SilentlyContinue
```

### 2. File Editor.py Cũ trong Resources
File `resources/editor.py` là file cũ và sẽ được tự động tạo khi build từ `scripts/editor.py`:

```powershell
# Có thể xóa an toàn vì sẽ được tạo lại khi build
Remove-Item -Path resources/editor.py -ErrorAction SilentlyContinue
```

### 3. Build Artifacts (đã được ignore trong .gitignore)
Các folder này sẽ tự động được tạo lại khi build:

```powershell
# Xóa build artifacts (nếu muốn)
Remove-Item -Path dist,build -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path renderer/dist -Recurse -Force -ErrorAction SilentlyContinue
```

### 4. Python Cache
```powershell
# Xóa Python cache
Remove-Item -Path __pycache__ -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path . -Recurse -Filter "__pycache__" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
```

## Lưu Ý

- **KHÔNG xóa** các file trong `resources/` ngoại trừ `editor.py` (file cũ)
- **KHÔNG xóa** các file trong `scripts/`
- **KHÔNG xóa** các file trong `renderer/src/`
- Các file trong `dist/`, `build/` sẽ tự động được tạo lại khi build

## Script Tự Động

Bạn có thể chạy script sau để tự động xóa các file không cần thiết:

```powershell
# Chạy script cleanup
.\cleanup.ps1
```

