import os
import shutil
import subprocess
import sys
import urllib.request


def get_user_ytdlp_path():
    appdata = os.getenv("APPDATA")
    if not appdata:
        return None
    ytdlp_dir = os.path.join(appdata, "RedbiVideoDownloader")
    os.makedirs(ytdlp_dir, exist_ok=True)
    return os.path.join(ytdlp_dir, "yt-dlp.exe")


def download_latest_ytdlp(dest_path):
    try:
        print("STATUS: Đang tải phiên bản mới nhất của yt-dlp...")
        url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
        with urllib.request.urlopen(url, timeout=30) as response:
            with open(dest_path, "wb") as f:
                shutil.copyfileobj(response, f)
        return True
    except Exception as e:
        print(f"ERROR: Không thể tải yt-dlp mới: {e}")
        return False


def get_user_node_dir():
    base = os.getenv("LOCALAPPDATA") or os.getenv("APPDATA")
    if not base:
        return None
    node_dir = os.path.join(base, "RedbiVideoDownloader", "nodejs")
    os.makedirs(node_dir, exist_ok=True)
    return node_dir


def download_node_runtime(dest_dir):
    url = "https://nodejs.org/dist/latest/win-x64/node.exe"
    dest_path = os.path.join(dest_dir, "node.exe")
    try:
        print("STATUS: Không tìm thấy Node.js. Đang tải Node.js portable (~30MB)...")
        with urllib.request.urlopen(url, timeout=60) as response:
            with open(dest_path, "wb") as f:
                shutil.copyfileobj(response, f)
        print(f"STATUS: Đã tải Node.js vào: {dest_path}")
        return dest_path
    except Exception as exc:
        print(f"WARNING: Tải Node.js thất bại: {exc}")
        return None


def ensure_node_runtime():
    existing_node = shutil.which("node")
    if existing_node:
        return existing_node, None
    node_dir = get_user_node_dir()
    if not node_dir:
        print("WARNING: Không xác định được thư mục người dùng để lưu Node.js.")
        return None, None
    portable_node = os.path.join(node_dir, "node.exe")
    if os.path.exists(portable_node):
        return portable_node, node_dir
    downloaded = download_node_runtime(node_dir)
    if downloaded:
        return downloaded, node_dir
    return None, None


def update_ytdlp(yt_dlp_exe_path):
    print("STATUS: Đang kiểm tra và cập nhật yt-dlp...")
    try:
        update_process = subprocess.Popen(
            [yt_dlp_exe_path, "-U"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        output_lines = []
        for line in iter(update_process.stdout.readline, ""):
            line = line.strip()
            if line:
                print(line, flush=True)
                output_lines.append(line)
        update_process.wait()
        if update_process.returncode == 0:
            print("STATUS: yt-dlp đã được cập nhật thành công tại vị trí gốc.")
            return yt_dlp_exe_path
        output_text = "\n".join(output_lines)
        if "administrator" in output_text.lower() or "permission" in output_text.lower():
            print("WARNING: Không có quyền cập nhật tại vị trí gốc. Đang thử tải về thư mục người dùng...")
        else:
            print(
                f"WARNING: Cập nhật thất bại với mã lỗi {update_process.returncode}. "
                "Đang thử tải về thư mục người dùng..."
            )
    except Exception as e:
        print(f"WARNING: Lỗi khi cố gắng cập nhật yt-dlp: {e}. Đang thử tải về thư mục người dùng...")

    user_ytdlp_path = get_user_ytdlp_path()
    if user_ytdlp_path and download_latest_ytdlp(user_ytdlp_path):
        print("STATUS: Đã tải phiên bản mới nhất của yt-dlp vào thư mục người dùng.")
        return user_ytdlp_path

    print("WARNING: Không thể cập nhật yt-dlp. Sẽ sử dụng phiên bản hiện có.")
    return yt_dlp_exe_path


def download_video_with_ytdlp(
    url,
    output_path,
    resources_path,
    cookies_path=None,
    quality="best",
    download_format="video",
    download_thumbnail=False,
    no_playlist=True,
):
    """Tải video bằng yt-dlp.exe (theo luồng downloader cũ) và trả về đường dẫn file."""
    print("STATUS: Bắt đầu quá trình tải...")
    print(f"STATUS: Bắt đầu xử lý URL: {url}")
    print(f"STATUS: Sẽ lưu file vào: {output_path}")

    yt_dlp_exe_path = os.path.abspath(os.path.join(resources_path, "yt-dlp.exe"))
    if not os.path.exists(yt_dlp_exe_path):
        raise FileNotFoundError("Thiếu file thực thi yt-dlp.exe.")
    yt_dlp_exe_path = update_ytdlp(yt_dlp_exe_path)

    node_path, node_prepend = ensure_node_runtime()
    if node_path:
        print(f"STATUS: Đã sẵn sàng JS runtime: {node_path}")
    else:
        print("WARNING: Thiếu Node.js, một số định dạng YouTube có thể bị bỏ qua.")

    command = [
        yt_dlp_exe_path,
        "--impersonate",
        "chrome",
        "--no-update",
        "--concurrent-fragments",
        "5",
        "--retries",
        "10",
        "--fragment-retries",
        "10",
    ]
    if node_path:
        command.extend(["--js-runtimes", "node"])

    if download_format.lower() == "mp3":
        command.extend(
            [
                "-f",
                "bestaudio",
                "--extract-audio",
                "--audio-format",
                "mp3",
                "--audio-quality",
                "0",
                "-o",
                output_path,
                "--ffmpeg-location",
                resources_path,
                "--restrict-filenames",
            ]
        )
    else:
        if quality == "1080p":
            format_selection = "bestvideo[height<=1080]+bestaudio/best[height<=1080]"
        elif quality == "720p":
            format_selection = "bestvideo[height<=720]+bestaudio/best[height<=720]"
        else:
            format_selection = "bestvideo+bestaudio/best"
        command.extend(
            [
                "-f",
                format_selection,
                "--merge-output-format",
                "mp4",
                "-o",
                output_path,
                "--ffmpeg-location",
                resources_path,
                "--restrict-filenames",
            ]
        )

    if no_playlist:
        command.append("--no-playlist")
    if download_thumbnail:
        command.extend(["--write-thumbnail", "--embed-thumbnail"])
    if cookies_path and os.path.exists(cookies_path):
        print(f"STATUS: Sử dụng file cookies từ: {cookies_path}")
        command.extend(["--cookies", cookies_path])
    command.append(url)

    print("STATUS: Đang thực thi yt-dlp...", flush=True)
    env = os.environ.copy()
    if node_prepend:
        env["PATH"] = f"{node_prepend}{os.pathsep}{env.get('PATH', '')}"
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        env=env,
    )
    output_lines = []
    for line in iter(process.stdout.readline, ""):
        line = line.strip()
        if line:
            print(line, flush=True)
            output_lines.append(line)
    process.wait()

    if process.returncode == 0:
        print("SUCCESS: Tải và xử lý file thành công!")
        if not os.path.exists(output_path):
            raise FileNotFoundError("Không tìm thấy file đầu ra sau khi tải.")
        return output_path

    print(f"ERROR: Quá trình thất bại với mã lỗi {process.returncode}.")
    output_text = "\n".join(output_lines).lower()
    if ("sign in" in output_text and "bot" in output_text) or (
        "from-browser" in output_text and "cookies" in output_text
    ) or ("authentication" in output_text and "required" in output_text):
        if not cookies_path:
            print(
                "\nGỢI Ý: Video này có thể yêu cầu cookies để xác thực.\n"
                "Hãy thử thêm file cookies.txt trong ứng dụng và tải lại."
            )
    raise RuntimeError(f"Tải video thất bại (mã {process.returncode}).")

