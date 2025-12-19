import sys

from utils_common import ensure_yt_dlp


def export_cookies_from_edge(output_path: str):
    """Đọc cookies từ Edge bằng yt-dlp và export sang file Netscape format."""
    if sys.platform != "win32":
        raise Exception("Chức năng này chỉ hỗ trợ Windows")
    if not ensure_yt_dlp():
        raise Exception("Không thể cài đặt yt-dlp")

    import yt_dlp

    test_url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    ydl_opts = {"cookiesfrombrowser": ("edge",), "quiet": True, "no_warnings": True}

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                ydl.extract_info(test_url, download=False)
            except Exception:
                pass
            cookie_jar = ydl.cookiejar
            if not cookie_jar or len(cookie_jar) == 0:
                raise Exception(
                    "Không tìm thấy cookies nào trong Edge. "
                    "Hãy đảm bảo đã đăng nhập YouTube và Edge đã được đóng/mở lại."
                )

            cookie_count = 0
            with open(output_path, "w", encoding="utf-8") as f:
                f.write("# Netscape HTTP Cookie File\n")
                f.write("# https://curl.haxx.se/rfc/cookie_spec.html\n")
                f.write("# This is a generated file! Do not edit.\n\n")
                for cookie in cookie_jar:
                    try:
                        domain = cookie.domain
                        if not domain:
                            continue
                        domain_specified = "TRUE" if domain.startswith(".") else "FALSE"
                        path = cookie.path if cookie.path else "/"
                        secure = "TRUE" if cookie.secure else "FALSE"
                        expires = int(cookie.expires) if cookie.expires else 0
                        name = cookie.name
                        value = cookie.value
                        if not name:
                            continue
                        f.write(
                            f"{domain}\t{domain_specified}\t{path}\t{secure}\t"
                            f"{expires}\t{name}\t{value}\n"
                        )
                        cookie_count += 1
                    except Exception:
                        continue

            if cookie_count == 0:
                raise Exception(
                    "Không tìm thấy cookies hợp lệ nào trong Edge. "
                    "Hãy đảm bảo bạn đã đăng nhập YouTube trên Edge."
                )
            print(f"STATUS: Đã export {cookie_count} cookies từ Edge", flush=True)
            return True
    except yt_dlp.utils.DownloadError as e:
        error_str = str(e)
        if "dpapi" in error_str.lower() or "decrypt" in error_str.lower():
            raise Exception(
                "Không thể giải mã cookies từ Edge (lỗi DPAPI).\n"
                "Đóng Edge và thử lại hoặc xuất cookies.txt thủ công."
            )
        raise Exception(f"Không thể đọc cookies từ Edge. Lỗi: {e}")
    except Exception as e:
        raise Exception(f"Lỗi khi đọc cookies từ Edge: {e}")

