import os
import shutil
import subprocess
import sys
import urllib.request
import json


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
    print("STATUS: Bắt đầu quá trình tải...", flush=True)
    print(f"STATUS: Bắt đầu xử lý URL: {url}", flush=True)
    print(f"STATUS: Sẽ lưu file vào: {output_path}", flush=True)

    yt_dlp_exe_path = os.path.abspath(os.path.join(resources_path, "yt-dlp.exe"))
    if not os.path.exists(yt_dlp_exe_path):
        raise FileNotFoundError("Thiếu file thực thi yt-dlp.exe.")
    yt_dlp_exe_path = update_ytdlp(yt_dlp_exe_path)

    node_path, node_prepend = ensure_node_runtime()
    if node_path:
        print(f"STATUS: Đã sẵn sàng JS runtime cho yt-dlp: {node_path}", flush=True)
    else:
        print(
            "WARNING: Thiếu Node.js, một số định dạng YouTube có thể bị bỏ qua "
            "(challenge solving có thể kém ổn định hơn).",
            flush=True,
        )

    command = [
        yt_dlp_exe_path,
        "--impersonate",
        "chrome",
        "--no-update",  # tắt cảnh báo cập nhật trong output
        "--downloader",
        "native",
        "--concurrent-fragments",
        "5",
        "--retries",
        "10",
        "--fragment-retries",
        "10",
        "--remote-components",
        "ejs:github",
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
                "--windows-filenames",
            ]
        )
    else:
        # Giống DownloadTool: luôn chọn "best" với fallback mềm,
        # không lock cứng 720p/1080p để tránh lỗi requested format is not available.
        format_selection = (
            "bestvideo[height>=720]+bestaudio[asr>=44100]/"
            "bestvideo[height>=480]+bestaudio[asr>=44100]/"
            "best[height>=720]/best[height>=480]/"
            "bestvideo+bestaudio/best/-18/-36/-17/-5"
        )
        command.extend(
            [
                "-f",
                format_selection,
                "--format-sort",
                "+height:+tbr:+codec",
                "--merge-output-format",
                "mp4",
                "-o",
                output_path,
                "--ffmpeg-location",
                resources_path,
                "--windows-filenames",
            ]
        )

    if no_playlist:
        command.append("--no-playlist")
    if download_thumbnail:
        # Chỉ tải thumbnail, không embed để tránh lỗi làm fail toàn bộ.
        command.extend(["--write-thumbnail"])
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
        print("SUCCESS: Tải và xử lý file thành công!", flush=True)
        if not os.path.exists(output_path):
            raise FileNotFoundError("Không tìm thấy file đầu ra sau khi tải.")
        return output_path

    print(f"ERROR: Quá trình thất bại với mã lỗi {process.returncode}.", flush=True)
    output_text = "\n".join(output_lines).lower()

    # Một số lỗi thường gặp cần giải thích rõ hơn
    has_only_images = "only images are available" in output_text
    has_format_error = "requested format is not available" in output_text
    has_challenge_failed = "challenge solving failed" in output_text

    if has_only_images or (has_format_error and "images" in output_text):
        print(
            "\n⚠️  Video này chỉ có thumbnail hoặc không có định dạng video/audio phù hợp để tải.",
            flush=True,
        )
        if has_challenge_failed:
            print(
                "⚠️  Có thể do YouTube chặn (challenge solving failed). "
                "Khuyến nghị cài Node.js hoặc Deno và/hoặc dùng cookies.",
                flush=True,
            )
        print(
            "💡 Video có thể bị giới hạn độ tuổi/khu vực, ở trạng thái riêng tư "
            "hoặc URL không trỏ đến video hợp lệ.",
            flush=True,
        )
    elif has_format_error:
        print(
            "\n⚠️  yt-dlp báo 'requested format is not available'. "
            "Ứng dụng đã thử nhiều định dạng (1080p/720p/480p/best) nhưng đều không phù hợp.",
            flush=True,
        )

    if ("sign in" in output_text and "bot" in output_text) or (
        "from-browser" in output_text and "cookies" in output_text
    ) or ("authentication" in output_text and "required" in output_text):
        if not cookies_path:
            print(
                "\nGỢI Ý: Video này có thể yêu cầu cookies để xác thực.\n"
                "Hãy thử thêm file cookies.txt trong ứng dụng và tải lại.",
                flush=True,
            )
        else:
            print(
                "\n⚠️  Cookies hiện tại có thể không đủ quyền hoặc đã hết hạn.\n"
                "💡 Hãy export cookies.txt mới từ trình duyệt đã đăng nhập và cập nhật lại trong ứng dụng.",
                flush=True,
            )

    raise RuntimeError(f"Tải video thất bại (mã {process.returncode}).")


def fetch_video_metadata_with_ytdlp(url, resources_path, cookies_path=None):
    """
    Lấy metadata video bằng yt-dlp.exe (CLI) thay vì thư viện Python.
    Trả về dict JSON giống yt-dlp --dump-single-json.
    """
    print("STATUS: Đang lấy metadata video (yt-dlp)...", flush=True)

    yt_dlp_exe_path = os.path.abspath(os.path.join(resources_path, "yt-dlp.exe"))
    if not os.path.exists(yt_dlp_exe_path):
        raise FileNotFoundError("Thiếu file thực thi yt-dlp.exe.")

    yt_dlp_exe_path = update_ytdlp(yt_dlp_exe_path)

    node_path, node_prepend = ensure_node_runtime()
    if node_path:
        print(f"STATUS: Đã sẵn sàng JS runtime: {node_path}", flush=True)
    else:
        print(
            "WARNING: Thiếu Node.js, một số video có thể khó lấy metadata (challenge solving).",
            flush=True,
        )

    command = [
        yt_dlp_exe_path,
        "--ignore-config",  # bỏ qua mọi cấu hình yt-dlp toàn cục của máy client
        "--dump-single-json",
        "--no-warnings",
        "--skip-download",
        "--no-update",
        "--impersonate",
        "chrome",
        "--downloader",
        "native",
        "--concurrent-fragments",
        "5",
        "--retries",
        "5",
        "--fragment-retries",
        "5",
        "--force-ipv4",
        "--remote-components",
        "ejs:github",
        # Giống DownloadTool: thử nhiều client YouTube để giả lập nhiều loại thiết bị
        "--extractor-args",
        "youtube:player_client=ios,tv_embedded,web_embedded,web,android",
    ]

    if cookies_path and os.path.exists(cookies_path):
        print(f"STATUS: Sử dụng file cookies từ: {cookies_path}", flush=True)
        command.extend(["--cookies", cookies_path])

    command.append(url)

    print("STATUS: Đang thực thi yt-dlp để lấy metadata...", flush=True)
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
            # Ghi log ra ngoài để UI vẫn thấy được diễn tiến
            print(line, flush=True)
            output_lines.append(line)
    process.wait()

    full_output = "\n".join(output_lines)

    if process.returncode != 0:
        lower_output = full_output.lower()
        if "http error 403" in lower_output or "forbidden" in lower_output:
            raise Exception(
                "Video yêu cầu cookies hoặc bị YouTube chặn (HTTP 403). "
                "Vui lòng cập nhật cookies.txt (đúng định dạng Netscape) từ trình duyệt đã đăng nhập."
            )
        if "requested format is not available" in lower_output:
            raise Exception(
                "yt-dlp báo 'requested format is not available' khi lấy metadata. "
                "Điều này thường do cấu hình yt-dlp toàn cục trên máy client hoặc video không có format hợp lệ."
            )
        raise Exception(f"Lỗi tải metadata (mã {process.returncode}): {full_output}")

    # yt-dlp với --dump-single-json thường chỉ in ra một JSON duy nhất,
    # nhưng để an toàn ta sẽ tìm từ ký tự '{' đầu tiên.
    json_start = full_output.find("{")
    if json_start == -1:
        raise Exception("Không nhận được metadata JSON hợp lệ từ yt-dlp.")

    json_str = full_output[json_start:]
    try:
        return json.loads(json_str)
    except json.JSONDecodeError as exc:
        raise Exception(f"Lỗi parse metadata JSON từ yt-dlp: {exc}")

