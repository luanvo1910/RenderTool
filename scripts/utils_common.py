import io
import os
import re
import subprocess
import sys


def ensure_yt_dlp() -> bool:
    """Install yt-dlp if missing (quiet) and keep stdout/stderr UTF-8 safe."""
    try:
        import yt_dlp  # noqa: F401
        return True
    except ImportError:
        print("STATUS: Đang cài đặt yt-dlp...", flush=True)
        try:
            subprocess.check_call(
                [sys.executable, "-m", "pip", "install", "--quiet", "--upgrade", "yt-dlp"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
            )
            print("STATUS: Đã cài đặt yt-dlp thành công!", flush=True)
            import yt_dlp  # noqa: F401
            return True
        except Exception as exc:  # broad: log any failure
            print(
                "PYTHON_ERROR: Không thể cài đặt yt-dlp. "
                "Vui lòng cài đặt thủ công bằng lệnh: pip install yt-dlp "
                f"({exc})",
                file=sys.stderr,
                flush=True,
            )
            return False


def normalize_stdio_to_utf8():
    """Force stdout/stderr to UTF-8 to avoid mojibake on Windows."""
    if sys.stdout.encoding != "utf-8":
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
    if sys.stderr.encoding != "utf-8":
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")
    if sys.platform == "win32":
        os.environ["PYTHONIOENCODING"] = "utf-8"
        os.environ["PYTHONUTF8"] = "1"
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def patch_popen_utf8():
    """Ensure subprocess text output defaults to UTF-8."""
    _original_popen = subprocess.Popen

    class UTF8Popen(_original_popen):  # type: ignore
        def __init__(self, *args, **kwargs):
            if (kwargs.get("text") or kwargs.get("universal_newlines")) and "encoding" not in kwargs:
                kwargs["encoding"] = "utf-8"
                kwargs["errors"] = "replace"
            super().__init__(*args, **kwargs)

    subprocess.Popen = UTF8Popen  # type: ignore


def get_executable_path(name: str, resources_path: str) -> str:
    executable_name = name if sys.platform != "win32" else f"{name}.exe"
    return os.path.join(resources_path, executable_name)


def sanitize_filename(name: str) -> str:
    return re.sub(r'[\\/*?:"<>|]', "", name)


def hex_to_ffmpeg_color(hex_color: str, alpha: str = "ff") -> str:
    try:
        hex_color = hex_color.lstrip("#")
        if len(hex_color) != 6:
            raise ValueError
        return f"0x{hex_color}{alpha}"
    except Exception:
        return "0xFFFFFFFF"


def ffmpeg_safe_path(path: str) -> str:
    path = path.replace("\\", "/")
    if sys.platform == "win32":
        return path.replace(":", "\\:")
    return path


def validate_netscape_cookie_file(file_path: str):
    """Kiểm tra file cookies.txt có đúng format Netscape hay không."""
    if not os.path.exists(file_path):
        return False, "File không tồn tại"
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        if len(lines) == 0:
            return False, "File rỗng"
        has_header = False
        for line in lines[:5]:
            if "Netscape" in line or "cookie" in line.lower():
                has_header = True
                break
        valid_cookie_lines = 0
        invalid_lines = []
        for i, line in enumerate(lines, 1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) == 7:
                valid_cookie_lines += 1
            else:
                if len(parts) == 1 and ";" in line:
                    invalid_lines.append(f"Dòng {i}: Format HTTP cookie string (sai)")
                elif len(line) > 500:
                    invalid_lines.append(f"Dòng {i}: Dòng quá dài (có thể nhiều cookies bị nối)")
        if valid_cookie_lines == 0 and invalid_lines:
            return False, f"File không đúng format Netscape. {invalid_lines[0]}"
        if invalid_lines and valid_cookie_lines == 0:
            return False, f"File không đúng format Netscape. {invalid_lines[0]}"
        return True, f"File hợp lệ với {valid_cookie_lines} cookies"
    except Exception as exc:
        return False, f"Lỗi khi đọc file: {exc}"

