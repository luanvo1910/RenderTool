const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Tìm thư mục site-packages của Python
function findPythonSitePackages() {
  const methods = [
    // Method 1: Thử python -m pip show yt-dlp để lấy location
    () => {
      try {
        const result = execSync('python -m pip show yt-dlp', { encoding: 'utf-8' });
        const locationMatch = result.match(/Location:\s*(.+)/);
        if (locationMatch) {
          return locationMatch[1].trim();
        }
      } catch (e) {}
      return null;
    },
    // Method 2: Thử py -m pip show yt-dlp
    () => {
      try {
        const result = execSync('py -m pip show yt-dlp', { encoding: 'utf-8' });
        const locationMatch = result.match(/Location:\s*(.+)/);
        if (locationMatch) {
          return locationMatch[1].trim();
        }
      } catch (e) {}
      return null;
    },
    // Method 3: Thử python -c "import site; print(site.getsitepackages()[0])"
    () => {
      try {
        const result = execSync('python -c "import site; print(site.getsitepackages()[0])"', { encoding: 'utf-8' }).trim();
        return result;
      } catch (e) {
        return null;
      }
    },
    // Method 4: Thử py -c "import site; print(site.getsitepackages()[0])"
    () => {
      try {
        const result = execSync('py -c "import site; print(site.getsitepackages()[0])"', { encoding: 'utf-8' }).trim();
        return result;
      } catch (e) {
        return null;
      }
    },
    // Method 5: Thử python -c "import yt_dlp; print(yt_dlp.__file__)"
    () => {
      try {
        const result = execSync('python -c "import yt_dlp; import os; print(os.path.dirname(yt_dlp.__file__))"', { encoding: 'utf-8' }).trim();
        return result;
      } catch (e) {
        return null;
      }
    },
    // Method 6: Thử py -c "import yt_dlp; print(yt_dlp.__file__)"
    () => {
      try {
        const result = execSync('py -c "import yt_dlp; import os; print(os.path.dirname(yt_dlp.__file__))"', { encoding: 'utf-8' }).trim();
        return result;
      } catch (e) {
        return null;
      }
    }
  ];

  for (const method of methods) {
    try {
      const result = method();
      if (result && fs.existsSync(result)) {
        console.log(`Tìm thấy site-packages tại: ${result}`);
        return result;
      }
    } catch (e) {
      // Tiếp tục thử method tiếp theo
    }
  }

  return null;
}

// Copy yt_dlp vào resources
function copyYtDlp() {
  const sitePackages = findPythonSitePackages();
  if (!sitePackages) {
    console.error('Không thể tìm thấy Python site-packages. Vui lòng đảm bảo Python và yt-dlp đã được cài đặt.');
    console.error('Chạy: pip install yt-dlp');
    process.exit(1);
  }

  const ytDlpSource = path.join(sitePackages, 'yt_dlp');
  const ytDlpDest = path.join(__dirname, 'resources', 'yt_dlp');

  console.log(`Đang tìm yt_dlp tại: ${ytDlpSource}`);

  if (!fs.existsSync(ytDlpSource)) {
    console.error(`Không tìm thấy yt_dlp tại: ${ytDlpSource}`);
    console.error('Vui lòng cài đặt: pip install yt-dlp');
    process.exit(1);
  }

  // Xóa thư mục cũ nếu có
  if (fs.existsSync(ytDlpDest)) {
    console.log('Đang xóa thư mục yt_dlp cũ...');
    fs.rmSync(ytDlpDest, { recursive: true, force: true });
  }

  // Copy toàn bộ thư mục yt_dlp
  console.log('Đang copy yt_dlp...');
  fs.cpSync(ytDlpSource, ytDlpDest, { recursive: true });
  console.log(`✓ Đã copy yt_dlp từ ${ytDlpSource} vào ${ytDlpDest}`);
}

copyYtDlp();
