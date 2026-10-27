import argparse
import sys

from cookies_handler import export_cookies_from_edge
from processor import process_local_video, process_video
from utils_common import ensure_yt_dlp, normalize_stdio_to_utf8, patch_popen_utf8


def main():
    normalize_stdio_to_utf8()
    patch_popen_utf8()

    parser = argparse.ArgumentParser(description="Video Processing Script")
    parser.add_argument("--export-cookies", type=str, required=False, help="Export cookies from Edge to specified file path")
    parser.add_argument("--resources-path", required=False)
    parser.add_argument("--user-data-path", required=False)
    parser.add_argument("--url", type=str, required=False, default="")
    parser.add_argument("--layout-file", type=str, required=False, default="")
    parser.add_argument("--parts", type=int, default=1)
    parser.add_argument("--save-path", type=str, default="")
    parser.add_argument("--part-duration", type=str, default="0")
    parser.add_argument("--encoder", type=str, default="libx264")
    parser.add_argument("--source", type=str, default="link", choices=["link", "local"])
    parser.add_argument("--video-path", type=str, default="")
    parser.add_argument("--thumbnail-path", type=str, default="")
    args = parser.parse_args()
    
    if args.export_cookies:
        try:
            export_cookies_from_edge(args.export_cookies)
            print(f"SUCCESS: Đã export cookies từ Edge sang {args.export_cookies}", flush=True)
            sys.exit(0)
        except Exception as e:
            print(f"ERROR: {e}", file=sys.stderr, flush=True)
            sys.exit(1)

    if not args.resources_path or not args.user_data_path or not args.layout_file:
        print("LINK_ERROR: Thiếu tham số xử lý video.", flush=True)
        sys.exit(1)

    if args.source == "local":
        if not args.video_path or not args.thumbnail_path:
            print("LINK_ERROR: Chưa chọn video hoặc ảnh thumbnail trên máy.", flush=True)
            sys.exit(1)
        try:
            process_local_video(
                args.video_path,
                args.thumbnail_path,
                args.parts,
                args.save_path,
                args.part_duration,
                args.layout_file,
                args.encoder,
                args.resources_path,
                args.user_data_path,
            )
            sys.exit(0)
        except Exception:
            sys.exit(1)
    
    if not args.url:
        print("LINK_ERROR: Chưa có link video.", flush=True)
        sys.exit(1)
    if not ensure_yt_dlp():
        sys.exit(1)
    try:
        process_video(
            args.url,
            args.parts,
            args.save_path,
            args.part_duration,
            args.layout_file,
            args.encoder,
            args.resources_path,
            args.user_data_path,
        )
        sys.exit(0)
    except Exception:
        sys.exit(1)


if __name__ == "__main__":
    main()