const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Tìm thư mục site-packages của Python
function findPythonSitePackages() {
  try {
    // Thử tìm bằng python -c
    const result = execSync('python -c "import site; print(site.getsitepackages()[0])"', { encoding: 'utf-8' }).trim();
    return result;
  } catch (e) {
    try {
      // Thử py -c
      const result = execSync('py -c "import site; print(site.getsitepackages()[0])"', { encoding: 'utf-8' }).trim();
      return result;
    } catch (e2) {
      console.error('Không tìm thấy Python site-packages');
      return null;
    }
  }
}

// Copy yt_dlp vào resources
function copyYtDlp() {
  const sitePackages = findPythonSitePackages();
  if (!sitePackages) {
    console.error('Không thể tìm thấy yt_dlp. Vui lòng cài đặt: pip install yt-dlp');
    process.exit(1);
  }

  const ytDlpSource = path.join(sitePackages, 'yt_dlp');
  const ytDlpDest = path.join(__dirname, 'resources', 'yt_dlp');

  if (!fs.existsSync(ytDlpSource)) {
    console.error('Không tìm thấy yt_dlp trong site-packages. Vui lòng cài đặt: pip install yt-dlp');
    process.exit(1);
  }

  // Xóa thư mục cũ nếu có
  if (fs.existsSync(ytDlpDest)) {
    fs.rmSync(ytDlpDest, { recursive: true, force: true });
  }

  // Copy toàn bộ thư mục yt_dlp
  fs.cpSync(ytDlpSource, ytDlpDest, { recursive: true });
  console.log(`Đã copy yt_dlp từ ${ytDlpSource} vào ${ytDlpDest}`);
}

copyYtDlp();
