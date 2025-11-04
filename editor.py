import sys
import os
import subprocess
import json
import re
import argparse
import urllib.request
import shutil
import base64
import io
import threading
import yt_dlp 
import math

# --- BẢN VÁ LỖI UTF-8 ---
if sys.stdout.encoding != 'utf-8': sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
if sys.stderr.encoding != 'utf-8': sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# --- CÁC HÀM TIỆN ÍCH ---
def get_executable_path(name, resources_path):
    executable_name = name if sys.platform != 'win32' else f"{name}.exe"
    return os.path.join(resources_path, executable_name)

def sanitize_filename(name):
    return re.sub(r'[\\/*?:"<>|]', "", name)

def hex_to_ffmpeg_color(hex_color, alpha='ff'):
    try:
        hex_color = hex_color.lstrip('#')
        if len(hex_color) != 6: raise ValueError
        return f"0x{hex_color}{alpha}"
    except:
        return "0xFFFFFFFF"

def ffmpeg_safe_path(path):
    path = path.replace("\\", "/")
    if sys.platform == "win32":
        return path.replace(":", "\\:")
    return path

# --- LOGIC TẢI XUỐNG BẰNG THƯ VIỆN YT-DLP ---
def ytdlp_progress_hook(d):
    # Gửi % download (đã bị App.jsx ẩn đi)
    if d['status'] == 'downloading':
        try:
            percent_str = d.get('_percent_str', '0.0%').replace('%','').strip()
            percent = float(percent_str)
            print(f"PROGRESS:DOWNLOAD:{percent}", flush=True)
        except (ValueError, TypeError): pass
    elif d['status'] == 'finished':
        print("PROGRESS:DOWNLOAD:100", flush=True)

def fetch_video_metadata(url, cookies_path):
    ydl_opts = {'quiet': True, 'no_warnings': True, 'noplaylist': True}
    if cookies_path and os.path.exists(cookies_path): ydl_opts['cookiefile'] = cookies_path
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl: return ydl.extract_info(url, download=False)
    except yt_dlp.utils.DownloadError as e:
        if 'HTTP Error 403' in str(e): sys.exit(403)
        print(f"PYTHON_ERROR: {e}", file=sys.stderr, flush=True)
        sys.exit(1)

def download_main_video(url, ffmpeg_path, dest_path, cookies_path):
    output_template = os.path.splitext(dest_path)[0]
    
    ydl_opts = {
        'format': 'bestvideo+bestaudio/best', 'merge_output_format': 'mp4',
        'outtmpl': f'{output_template}.%(ext)s',
        'ffmpeg_location': os.path.dirname(ffmpeg_path),
        'progress_hooks': [ytdlp_progress_hook], 
        'concurrent_fragments': 10, 
        'noplaylist': True,
        'quiet': True, # Tắt log % download
        'no_warnings': True, # Tắt log cảnh báo
    }
    
    if cookies_path and os.path.exists(cookies_path): ydl_opts['cookiefile'] = cookies_path
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl: ydl.download([url])
        final_dest_path_with_ext = f"{output_template}.mp4"
        if os.path.exists(final_dest_path_with_ext) and final_dest_path_with_ext != dest_path:
             os.rename(final_dest_path_with_ext, dest_path)
    except yt_dlp.utils.DownloadError as e:
        if 'HTTP Error 403' in str(e): sys.exit(403)
        print(f"PYTHON_ERROR: {e}", file=sys.stderr, flush=True)
        sys.exit(1)

# --- CÁC HÀM XỬ LÝ FFMPEG ---
def run_command_with_live_output(cmd, total_duration=None):
    creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
    process = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        encoding='utf-8', errors='replace', creationflags=creationflags
    )
    stdout_output, stderr_output = [], []
    ffmpeg_time_regex = re.compile(r"time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})")
    
    def stream_reader(stream, output_list, is_stderr=False):
        for line in iter(stream.readline, ''):
            trimmed_line = line.strip()
            output_list.append(trimmed_line)
            
            if total_duration and is_stderr:
                match = ffmpeg_time_regex.search(trimmed_line)
                if match:
                    h, m, s, ms = map(int, match.groups())
                    current_time_seconds = h * 3600 + m * 60 + s + ms / 100
                    percent = min(100, (current_time_seconds / total_duration) * 100)
                    print(f"PROGRESS:RENDER:{'%.2f' % percent}", flush=True)
                    continue
            
            if trimmed_line and not is_stderr: 
                print(trimmed_line, flush=True)
                
    stdout_thread = threading.Thread(target=stream_reader, args=(process.stdout, stdout_output))
    stderr_thread = threading.Thread(target=stream_reader, args=(process.stderr, stderr_output, True))
    stdout_thread.start(); stderr_thread.start(); stdout_thread.join(); stderr_thread.join()
    process.wait()
    
    if process.returncode != 0:
        for line in stderr_output:
            if line: print(f"FFMPEG_ERROR: {line}", flush=True)
        raise subprocess.CalledProcessError(process.returncode, cmd, output='\n'.join(stdout_output), stderr='\n'.join(stderr_output))

def download_thumbnail(thumbnail_url, dest_path):
    urllib.request.urlretrieve(thumbnail_url, dest_path)
    if not os.path.exists(dest_path): raise FileNotFoundError("Could not download thumbnail")

def build_ffmpeg_filter(layout, input_map, start, duration, part_num, resources_path):
    layout.sort(key=lambda x: int(x.get('zIndex', 0)))
    filters, last_stream = ["color=s=720x1280:c=black[canvas]"], "canvas"
    overlay_count = 0
    
    for item in layout:
        if item.get('type') == 'text' or item.get('id') not in input_map: continue
        input_index, w, h, x, y = input_map[item['id']], item['width'], item['height'], item['x'], item['y']
        scaled_stream, output_stream = f"s{overlay_count}", f"bg{overlay_count + 1}"
        scale_filter = f"scale={w}:{h},setsar=1"
        if item['type'] == 'video': filters.append(f"[{input_index}:v]trim=start={start}:duration={duration},setpts=PTS-STARTPTS,{scale_filter}[{scaled_stream}]")
        else: filters.append(f"[{input_index}:v]{scale_filter}[{scaled_stream}]")
        filters.append(f"[{last_stream}][{scaled_stream}]overlay={x}:{y}[{output_stream}]")
        last_stream, overlay_count = output_stream, overlay_count + 1
    
    for item in layout:
      if item.get('type') == 'text':
        style = item.get("textStyle", {}); content = item.get("content", " ")
        text_to_draw = f"Part {part_num}" if item.get('id') == 'text-placeholder' else str(content)
        text_to_draw = text_to_draw.replace("'", "’").replace(":", "\\:").replace("%", "\\%")
        font_size = style.get("fontSize", 70); font_color = hex_to_ffmpeg_color(style.get("fontColor", "#FFFFFF"))
        border_w = style.get("outlineWidth", 2); border_color = hex_to_ffmpeg_color(style.get("outlineColor", "#000000"))
        shadow_color = hex_to_ffmpeg_color(style.get("shadowColor", "#000000"), "80")
        shadow_x = style.get("shadowDepth", 2); shadow_y = style.get("shadowDepth", 2)
        font_family_name = style.get("fontFamily", "arial.ttf").replace("'", "").replace(":", "\\:")
        text_x = item['x'] + (item['width'] / 2); text_y = item['y'] + (item['height'] / 2)
        box_color_hex = style.get("boxColor", "#000000")
        box_opacity = style.get("boxOpacity", 0.5) 
        box_padding = style.get("boxPadding", 10) 
        box_opacity_hex = format(int(box_opacity * 255), 'x').zfill(2)
        box_color_ffmpeg = hex_to_ffmpeg_color(box_color_hex, box_opacity_hex)
        font_filename = font_family_name if font_family_name else "arial.ttf"
        font_file_path = os.path.join(resources_path, 'assets', font_filename)
        safe_font_file_path = ffmpeg_safe_path(font_file_path)

        drawtext_filter = (
            f"drawtext="
            f"fontfile='{safe_font_file_path}':" 
            f"text='{text_to_draw}':"
            f"fontsize={font_size}:"
            f"fontcolor={font_color}:"
            f"x={text_x}-(text_w/2):"
            f"y={text_y}-(text_h/2):"
            f"borderw={border_w}:"
            f"bordercolor={border_color}:"
            f"shadowcolor={shadow_color}:"
            f"shadowx={shadow_x}:"
            f"shadowy={shadow_y}:"
            f"box=1:"
            f"boxcolor={box_color_ffmpeg}:"
            f"boxborderw={box_padding}"
        )
        
        output_stream = f"txt{overlay_count}"; filters.append(f"[{last_stream}]{drawtext_filter}[{output_stream}]")
        last_stream = output_stream; overlay_count += 1
        
    if last_stream != "canvas": filters.append(f"[{last_stream}]copy[final_v]")
    else: filters.append(f"[canvas]copy[final_v]")
    filters.append(f"[0:a]atrim=start={start}:duration={duration},asetpts=PTS-STARTPTS[final_a]")
    return ";".join(filters), "final_v"

def process_video(url, num_parts, save_path, part_duration, layout_file, encoder, resources_path, user_data_path):
    with open(layout_file, 'r', encoding='utf-8') as f: layout = json.load(f)
    output_dir = save_path or os.path.join(user_data_path, "output")
    temp_dir = os.path.join(user_data_path, "temp_files")
    os.makedirs(output_dir, exist_ok=True); os.makedirs(temp_dir, exist_ok=True)
    
    ffmpeg_path = get_executable_path("ffmpeg", resources_path)
    user_cookie_path = os.path.join(user_data_path, 'cookies.txt')
    cookies_path_to_use = user_cookie_path if os.path.exists(user_cookie_path) else ""

    try:
        print("STATUS: Lấy thông tin video...", flush=True)
        video_info = fetch_video_metadata(url, cookies_path_to_use)
        
        title, video_id, thumbnail_url, total_duration = video_info['title'], video_info['id'], video_info['thumbnail'], video_info.get('duration', 0)
        if not total_duration: raise Exception("Could not get video duration.")
        sanitized_title = sanitize_filename(title)
        
        try:
            part_duration = float(part_duration)
        except ValueError:
            part_duration = 0.0

        if part_duration <= 0: 
            actual_num_parts = num_parts
            part_duration = total_duration / num_parts 
        else:
            actual_num_parts = min(num_parts, math.floor(total_duration / part_duration))
        
        print("STATUS: Tải video chính...", flush=True)
        main_video_path = os.path.join(temp_dir, f"{video_id}.mp4")
        if not os.path.exists(main_video_path):
             download_main_video(url, ffmpeg_path, main_video_path, cookies_path_to_use)
        
        print("STATUS: Tải thumbnail...", flush=True)
        thumbnail_path = os.path.join(temp_dir, f"{video_id}_thumb.jpg")
        if not os.path.exists(thumbnail_path): download_thumbnail(thumbnail_url, thumbnail_path)
        
        for i in range(actual_num_parts):
            part_num = i + 1; start_time = i * part_duration
            
            output_path = os.path.join(output_dir, f"{sanitized_title}_Part_{part_num}.mp4")
            print(f"STATUS: Render Part {part_num}/{actual_num_parts}...", flush=True)
            
            cmd = [
                ffmpeg_path, '-y', 
                '-hide_banner', 
                '-loglevel', 'error', 
                '-i', main_video_path, 
                '-i', thumbnail_path
            ]
            
            input_map = {'video-placeholder': 0, 'thumbnail-placeholder': 1}; image_index = 2
            for item in layout:
                if item['type'] == 'image' and item['source'] and item['source'].startswith('data:image'):
                    try:
                        header, encoded = item['source'].split(',', 1); image_format = header.split(';')[0].split('/')[1]
                        image_data = base64.b64decode(encoded)
                        temp_image_path = os.path.join(temp_dir, f"temp_img_{item['id']}.{image_format}")
                        with open(temp_image_path, 'wb') as img_f: img_f.write(image_data)
                        cmd += ['-i', temp_image_path]; input_map[item['id']] = image_index; image_index += 1
                    except Exception as e: print(f"Warning: Could not process image {item['id']}: {e}")
            
            filter_complex, final_video_stream = build_ffmpeg_filter(layout, input_map, start_time, part_duration, part_num, resources_path)
            
            cmd += ['-filter_complex', filter_complex, '-map', f'[{final_video_stream}]', '-map', '[final_a]']
            if 'nvenc' in encoder: cmd += ['-c:v', encoder, '-preset', 'p5', '-cq', '23', '-b:v', '0']
            elif 'amf' in encoder: cmd += ['-c:v', encoder, '-quality', 'balanced', '-qp', '23']
            elif 'qsv' in encoder: cmd += ['-c:v', encoder, '-preset', 'medium', '-global_quality', '23']
            else: cmd += ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-threads', '4']
            cmd += ['-c:a', 'aac', '-b:a', '192k', '-r', '30', '-shortest', output_path]
            print(f"STATUS: Khởi tạo FFMPEG cho Part {part_num} (có thể mất vài phút)...", flush=True)
            
            run_command_with_live_output(cmd, total_duration=part_duration)
            print(f"RESULT:{output_path}", flush=True)
        print("STATUS: Hoàn tất tất cả các phần!", flush=True)
    except Exception as e:
        print(f"PYTHON_ERROR: {e}", file=sys.stderr, flush=True)
    finally:
        print("STATUS: Dọn dẹp file tạm...", flush=True)
        if os.path.exists(temp_dir): 
            try:
                shutil.rmtree(temp_dir)
            except Exception as e:
                print(f"WARNING: Không thể xóa thư mục tạm: {e}", flush=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Video Processing Script")
    parser.add_argument('--resources-path', required=True)
    parser.add_argument('--user-data-path', required=True)
    parser.add_argument('--url', type=str, required=True)
    parser.add_argument('--layout-file', type=str, required=True)
    parser.add_argument('--parts', type=int, default=1)
    parser.add_argument('--save-path', type=str, default="")
    parser.add_argument('--part-duration', type=str, default="0")
    parser.add_argument('--encoder', type=str, default='libx264')
    args = parser.parse_args()
    
    process_video(args.url, args.parts, args.save_path, args.part_duration, args.layout_file, args.encoder, args.resources_path, args.user_data_path)