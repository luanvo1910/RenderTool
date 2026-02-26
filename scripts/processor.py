import json
import math
import os
import sys

from cookies_handler import export_cookies_from_edge
from downloader_flow import download_video_with_ytdlp, fetch_video_metadata_with_ytdlp
from ffmpeg_tools import (
    build_ffmpeg_filter,
    download_thumbnail,
    run_command_with_live_output,
    save_base64_image_to_temp,
)
from utils_common import (
    ensure_yt_dlp,
    get_executable_path,
    sanitize_filename,
    validate_netscape_cookie_file,
)


def fetch_video_metadata(url, cookies_path, resources_path):
    """
    Wrapper dùng yt-dlp.exe (CLI) để lấy metadata, 
    tái sử dụng logic từ downloader_flow cho giống DownloadTool.
    """
    return fetch_video_metadata_with_ytdlp(url, resources_path, cookies_path)


def process_video(url, num_parts, save_path, part_duration, layout_file, encoder, resources_path, user_data_path):
    if not ensure_yt_dlp():
        raise Exception("Không thể chuẩn bị yt-dlp")
    with open(layout_file, "r", encoding="utf-8") as f:
        layout = json.load(f)

    output_dir = save_path or os.path.join(user_data_path, "output")
    temp_dir = os.path.join(user_data_path, "temp_files")
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(temp_dir, exist_ok=True)

    ffmpeg_path = get_executable_path("ffmpeg", resources_path)
    user_cookie_path = os.path.join(user_data_path, "cookies.txt")
    cookies_path_to_use = ""
    if os.path.exists(user_cookie_path):
        is_valid, validation_msg = validate_netscape_cookie_file(user_cookie_path)
        if is_valid:
            cookies_path_to_use = user_cookie_path
        else:
            print(f"WARNING: File cookies.txt không đúng format Netscape: {validation_msg}", flush=True)
            print(
                "WARNING: Sẽ bỏ qua file cookies.txt. Nếu video yêu cầu cookies, hãy cung cấp cookies.txt đúng định dạng.",
                flush=True,
            )

    try:
        print("STATUS: Lấy thông tin video...", flush=True)
        video_info = fetch_video_metadata(url, cookies_path_to_use, resources_path)
        title = video_info["title"]
        video_id = video_info["id"]
        thumbnail_url = video_info["thumbnail"]
        total_duration = video_info.get("duration", 0)
        if not total_duration:
            raise Exception("Could not get video duration.")
        sanitized_title = sanitize_filename(title)

        try:
            part_duration = float(part_duration)
        except ValueError:
            part_duration = 0.0
        if part_duration <= 0:
            actual_num_parts = num_parts
            part_duration = total_duration / num_parts
        else:
            total_parts_by_duration = math.ceil(total_duration / part_duration)
            actual_num_parts = min(num_parts, total_parts_by_duration)
        actual_num_parts = int(actual_num_parts)

        print("STATUS: Tải video chính (theo downloader)...", flush=True)
        main_video_path = os.path.join(temp_dir, f"{video_id}.mp4")
        if not os.path.exists(main_video_path):
            download_video_with_ytdlp(
                url=url,
                output_path=main_video_path,
                resources_path=resources_path,
                cookies_path=cookies_path_to_use,
                quality="best",
                download_format="video",
                download_thumbnail=False,
                no_playlist=True,
            )

        print("STATUS: Tải thumbnail...", flush=True)
        thumbnail_path = os.path.join(temp_dir, f"{video_id}_thumb.jpg")
        if not os.path.exists(thumbnail_path):
            download_thumbnail(thumbnail_url, thumbnail_path)

        for i in range(actual_num_parts):
            part_num = i + 1
            start_time = i * part_duration
            output_path = os.path.join(output_dir, f"{sanitized_title}_Part_{part_num}.mp4")
            print(f"STATUS: Render Part {part_num}/{actual_num_parts}...", flush=True)
            cmd = [
                ffmpeg_path,
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                main_video_path,
                "-i",
                thumbnail_path,
            ]
            input_map = {"video-placeholder": 0, "thumbnail-placeholder": 1}
            image_index = 2
            for item in layout:
                if item["type"] == "image" and item["source"] and item["source"].startswith("data:image"):
                    try:
                        image_index = save_base64_image_to_temp(item, temp_dir, image_index, cmd, input_map)
                    except Exception as e:
                        print(f"Warning: Could not process image {item['id']}: {e}")

            filter_complex, final_video_stream = build_ffmpeg_filter(
                layout, input_map, start_time, part_duration, part_num, resources_path
            )
            cmd += ["-filter_complex", filter_complex, "-map", f"[{final_video_stream}]", "-map", "[final_a]"]
            if "nvenc" in encoder:
                cmd += ["-c:v", encoder, "-preset", "p5", "-cq", "23", "-b:v", "0"]
            elif "amf" in encoder:
                cmd += ["-c:v", encoder, "-quality", "balanced", "-qp", "23"]
            elif "qsv" in encoder:
                cmd += ["-c:v", encoder, "-preset", "medium", "-global_quality", "23"]
            else:
                cmd += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-threads", "4"]
            cmd += ["-c:a", "aac", "-b:a", "192k", "-r", "30", "-shortest", output_path]
            print(f"STATUS: Khởi tạo FFMPEG cho Part {part_num} (có thể mất vài phút)...", flush=True)
            run_command_with_live_output(cmd, total_duration=part_duration)
            print(f"RESULT:{output_path}", flush=True)

        print("STATUS: Hoàn tất tất cả các phần!", flush=True)
        print("LINK_SUCCESS", flush=True)
    except Exception as e:
        error_msg = str(e)
        print(f"PYTHON_ERROR: {error_msg}", file=sys.stderr, flush=True)
        print(f"LINK_ERROR: {error_msg}", flush=True)
    finally:
        print("STATUS: Dọn dẹp file tạm...", flush=True)
        if os.path.exists(temp_dir):
            try:
                import shutil

                shutil.rmtree(temp_dir)
            except Exception as e:
                print(f"WARNING: Không thể xóa thư mục tạm: {e}", flush=True)

