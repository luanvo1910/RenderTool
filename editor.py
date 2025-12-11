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
import math
import sqlite3
import tempfile
import shutil as shutil_module

# --- TỰ ĐỘNG CÀI ĐẶT yt-dlp NẾU THIẾU ---
def ensure_yt_dlp():
    """Tự động cài đặt yt-dlp nếu chưa có"""
    try:
        import yt_dlp
        return True
    except ImportError:
        print("STATUS: Đang cài đặt yt-dlp...", flush=True)
        try:
            # Cài đặt yt-dlp bằng pip
            subprocess.check_call([
                sys.executable, '-m', 'pip', 'install', '--quiet', '--upgrade', 'yt-dlp'
            ], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            print("STATUS: Đã cài đặt yt-dlp thành công!", flush=True)
            # Import lại sau khi cài đặt
            import yt_dlp
            return True
        except subprocess.CalledProcessError as e:
            print(f"PYTHON_ERROR: Không thể cài đặt yt-dlp. Vui lòng cài đặt thủ công bằng lệnh: pip install yt-dlp", file=sys.stderr, flush=True)
            return False
        except Exception as e:
            print(f"PYTHON_ERROR: Lỗi khi cài đặt yt-dlp: {e}", file=sys.stderr, flush=True)
            return False

if sys.stdout.encoding != 'utf-8': sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
if sys.stderr.encoding != 'utf-8': sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')


if sys.platform == 'win32':
    os.environ['PYTHONIOENCODING'] = 'utf-8'
    os.environ['PYTHONUTF8'] = '1'
    # Đảm bảo console output dùng UTF-8 trên Windows
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# --- PATCH subprocess.Popen để luôn dùng UTF-8 encoding ---
# Fix quan trọng: yt-dlp gọi subprocess internally mà không set encoding
_original_popen = subprocess.Popen
class UTF8Popen(_original_popen):
    def __init__(self, *args, **kwargs):
        # Nếu text=True hoặc universal_newlines=True nhưng không có encoding
        if (kwargs.get('text') or kwargs.get('universal_newlines')) and 'encoding' not in kwargs:
            kwargs['encoding'] = 'utf-8'
            kwargs['errors'] = 'replace'  # Ignore các ký tự không decode được
        super().__init__(*args, **kwargs)
subprocess.Popen = UTF8Popen

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

# --- HÀM ĐỌC COOKIES TỪ EDGE VÀ EXPORT SANG FILE ---
def export_cookies_from_edge(output_path):
    """Đọc cookies từ Microsoft Edge và export sang file cookies.txt (Netscape format)"""
    if sys.platform != 'win32':
        raise Exception("Chức năng này chỉ hỗ trợ Windows")
    
    try:
        # Thử sử dụng browser_cookie3 nếu có
        try:
            import browser_cookie3
        except ImportError:
            # Nếu không có browser_cookie3, thử cài đặt
            print("STATUS: Đang cài đặt browser_cookie3 để đọc cookies từ Edge...", flush=True)
            try:
                subprocess.check_call([
                    sys.executable, '-m', 'pip', 'install', '--quiet', 'browser_cookie3'
                ], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
                import browser_cookie3
            except Exception as e:
                raise Exception(f"Không thể cài đặt browser_cookie3: {e}")
        
        # Đọc cookies từ Edge (không giới hạn domain để lấy tất cả cookies)
        try:
            cookies = browser_cookie3.load(browser_name='edge')
        except Exception as e:
            raise Exception(f"Không thể đọc cookies từ Edge: {e}")
        
        # Chuyển đổi sang format Netscape
        cookie_count = 0
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write("# Netscape HTTP Cookie File\n")
            f.write("# https://curl.haxx.se/rfc/cookie_spec.html\n")
            f.write("# This is a generated file! Do not edit.\n\n")
            
            for cookie in cookies:
                try:
                    domain = cookie.domain
                    domain_specified = 'TRUE' if domain.startswith('.') else 'FALSE'
                    path = cookie.path or '/'
                    secure = 'TRUE' if cookie.secure else 'FALSE'
                    expires = int(cookie.expires) if cookie.expires else 0
                    name = cookie.name
                    value = cookie.value
                    
                    f.write(f"{domain}\t{domain_specified}\t{path}\t{secure}\t{expires}\t{name}\t{value}\n")
                    cookie_count += 1
                except Exception:
                    continue  # Bỏ qua cookie lỗi
        
        if cookie_count == 0:
            raise Exception("Không tìm thấy cookies nào trong Edge")
        
        return True
    except Exception as e:
        raise Exception(f"Lỗi khi đọc cookies từ Edge: {e}")

# --- LOGIC TẢI XUỐNG BẰNG THƯ VIỆN YT-DLP ---
# Lưu ý: yt_dlp sẽ được import sau khi setup path trong __main__

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

def fetch_video_metadata(url, cookies_path, use_browser_cookies=False):
    ydl_opts = {
        'quiet': True, 
        'no_warnings': True, 
        'noplaylist': True,
        'encoding': 'utf-8',  # Force UTF-8 encoding
    }
    # Ưu tiên sử dụng cookies từ browser nếu được yêu cầu
    if use_browser_cookies and sys.platform == 'win32':
        try:
            ydl_opts['cookiesfrombrowser'] = ('edge',)
        except Exception:
            pass  # Fallback to file cookies if browser cookies fail
    if cookies_path and os.path.exists(cookies_path): 
        ydl_opts['cookiefile'] = cookies_path
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl: return ydl.extract_info(url, download=False)
    except yt_dlp.utils.DownloadError as e:
        if 'HTTP Error 403' in str(e):
            print(f"PYTHON_ERROR: Video yêu cầu cookies. {e}", file=sys.stderr, flush=True)
            raise Exception(f"Video yêu cầu cookies: {e}")
        print(f"PYTHON_ERROR: {e}", file=sys.stderr, flush=True)
        raise Exception(f"Lỗi tải metadata: {e}")
    except Exception as e:
        # Bắt các lỗi encoding khác
        print(f"PYTHON_ERROR: {e}", file=sys.stderr, flush=True)
        raise Exception(f"Lỗi không xác định: {e}")

def download_main_video(url, ffmpeg_path, dest_path, cookies_path, use_browser_cookies=False):
    output_template = os.path.splitext(dest_path)[0]
    
    ydl_opts = {
        'format': 'bestvideo+bestaudio/best', 
        'merge_output_format': 'mp4',
        'outtmpl': f'{output_template}.%(ext)s',
        'ffmpeg_location': os.path.dirname(ffmpeg_path),
        'progress_hooks': [ytdlp_progress_hook], 
        'concurrent_fragments': 10, 
        'noplaylist': True,
        'quiet': True, # Tắt log % download
        'no_warnings': True, # Tắt log cảnh báo
        'encoding': 'utf-8',  # Force UTF-8 encoding
    }
    
    # Ưu tiên sử dụng cookies từ browser nếu được yêu cầu
    if use_browser_cookies and sys.platform == 'win32':
        try:
            ydl_opts['cookiesfrombrowser'] = ('edge',)
        except Exception:
            pass  # Fallback to file cookies if browser cookies fail
    if cookies_path and os.path.exists(cookies_path): 
        ydl_opts['cookiefile'] = cookies_path
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl: ydl.download([url])
        final_dest_path_with_ext = f"{output_template}.mp4"
        if os.path.exists(final_dest_path_with_ext) and final_dest_path_with_ext != dest_path:
             os.rename(final_dest_path_with_ext, dest_path)
    except yt_dlp.utils.DownloadError as e:
        if 'HTTP Error 403' in str(e):
            print(f"PYTHON_ERROR: Video yêu cầu cookies. {e}", file=sys.stderr, flush=True)
            raise Exception(f"Video yêu cầu cookies: {e}")
        print(f"PYTHON_ERROR: {e}", file=sys.stderr, flush=True)
        raise Exception(f"Lỗi tải video: {e}")
    except Exception as e:
        # Bắt các lỗi encoding khác
        print(f"PYTHON_ERROR: {e}", file=sys.stderr, flush=True)
        raise Exception(f"Lỗi không xác định khi tải video: {e}")

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
        
        input_index = input_map.get(item['id'])
        w = item.get('width', 720) 
        h = item.get('height', 1280)
        x = item.get('x', 0) 
        y = item.get('y', 0) 
        
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

        text_x_base = item.get('x', 0)
        text_w_base = item.get('width', 720) 
        text_y_base = item.get('y', 0)
        text_h_base = item.get('height', 100)
        
        text_x = (text_x_base or 0) + ((text_w_base or 720) / 2)
        text_y = (text_y_base or 0) + ((text_h_base or 100) / 2)

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

    # =================================================================
    # <<< SỬA LỖI TẠI ĐÂY: Sử dụng user_data_path cho TOÀN BỘ >>>
    # =================================================================
    
    # Đảm bảo output_dir dùng user_data_path nếu save_path rỗng
    output_dir = save_path or os.path.join(user_data_path, "output")
    
    # Đảm bảo temp_dir LUÔN dùng user_data_path
    temp_dir = os.path.join(user_data_path, "temp_files")
    
    # Tạo các thư mục an toàn này
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(temp_dir, exist_ok=True) # Dòng 158 cũ bây giờ đã an toàn
    
    # =================================================================
    
    ffmpeg_path = get_executable_path("ffmpeg", resources_path)
    user_cookie_path = os.path.join(user_data_path, 'cookies.txt')
    cookies_path_to_use = user_cookie_path if os.path.exists(user_cookie_path) else ""
    
    # Tự động sử dụng cookies từ Edge nếu không có file cookies.txt và đang chạy trên Windows
    use_browser_cookies = False
    if not cookies_path_to_use and sys.platform == 'win32':
        use_browser_cookies = True
        print("STATUS: Không tìm thấy cookies.txt, đang thử đọc cookies từ Microsoft Edge...", flush=True)

    try:
        print("STATUS: Lấy thông tin video...", flush=True)
        video_info = fetch_video_metadata(url, cookies_path_to_use, use_browser_cookies)
        
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
            total_parts_by_duration = math.ceil(total_duration / part_duration)
            actual_num_parts = min(num_parts, total_parts_by_duration)
        
        actual_num_parts = int(actual_num_parts)
        
        print("STATUS: Tải video chính...", flush=True)
        # Sửa: file tạm phải nằm trong temp_dir an toàn
        main_video_path = os.path.join(temp_dir, f"{video_id}.mp4")
        if not os.path.exists(main_video_path):
             download_main_video(url, ffmpeg_path, main_video_path, cookies_path_to_use, use_browser_cookies)
        
        print("STATUS: Tải thumbnail...", flush=True)
        # Sửa: file tạm phải nằm trong temp_dir an toàn
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
                        # Sửa: file tạm phải nằm trong temp_dir an toàn
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
        print("LINK_SUCCESS", flush=True)  # Đánh dấu link thành công
    except Exception as e:
        error_msg = str(e)
        print(f"PYTHON_ERROR: {error_msg}", file=sys.stderr, flush=True)
        print(f"LINK_ERROR: {error_msg}", flush=True)  # Đánh dấu link lỗi
    finally:
        print("STATUS: Dọn dẹp file tạm...", flush=True)
        if os.path.exists(temp_dir): 
            try:
                shutil.rmtree(temp_dir)
            except Exception as e:
                print(f"WARNING: Không thể xóa thư mục tạm: {e}", flush=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Video Processing Script")
    parser.add_argument('--resources-path', required=False)
    parser.add_argument('--user-data-path', required=False)
    parser.add_argument('--url', type=str, required=False)
    parser.add_argument('--layout-file', type=str, required=False)
    parser.add_argument('--parts', type=int, default=1)
    parser.add_argument('--save-path', type=str, default="")
    parser.add_argument('--part-duration', type=str, default="0")
    parser.add_argument('--encoder', type=str, default='libx264')
    parser.add_argument('--export-cookies', type=str, required=False, help='Export cookies from Edge to specified file path')
    args = parser.parse_args()
    
    # Nếu có --export-cookies, chỉ export cookies và thoát
    if args.export_cookies:
        try:
            export_cookies_from_edge(args.export_cookies)
            print(f"SUCCESS: Đã export cookies từ Edge sang {args.export_cookies}", flush=True)
            sys.exit(0)
        except Exception as e:
            print(f"ERROR: {e}", file=sys.stderr, flush=True)
            sys.exit(1)
    
    # Kiểm tra các tham số bắt buộc cho xử lý video
    if not all([args.resources_path, args.user_data_path, args.url, args.layout_file]):
        parser.error("Các tham số --resources-path, --user-data-path, --url, và --layout-file là bắt buộc khi không dùng --export-cookies")
    
    # Tự động cài đặt yt-dlp nếu chưa có
    if not ensure_yt_dlp():
        sys.exit(1)
    
    # Import yt_dlp (đã được cài đặt hoặc đã có sẵn)
    import yt_dlp
    
    try:
        process_video(args.url, args.parts, args.save_path, args.part_duration, args.layout_file, args.encoder, args.resources_path, args.user_data_path)
        sys.exit(0)  # Thành công
    except Exception as e:
        # Lỗi đã được xử lý trong process_video, chỉ cần exit với code lỗi
        sys.exit(1)  # Lỗi