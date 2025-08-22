import sys, os, subprocess, json, re, argparse, urllib.request, shutil, base64

def get_executable_path(name, resources_path):
    executable_name = name if sys.platform != 'win32' else f"{name}.exe"
    return os.path.join(resources_path, executable_name)

def get_font_path(resources_path):
    assets_dir = os.path.join(resources_path, "assets")
    if not os.path.isdir(assets_dir):
        raise FileNotFoundError("PYTHON_ERROR: Không tìm thấy thư mục 'assets'. Vui lòng tạo và thêm file font .ttf vào.")
    for file in os.listdir(assets_dir):
        if file.lower().endswith('.ttf'):
            return os.path.join(assets_dir, file)
    raise FileNotFoundError("PYTHON_ERROR: Không tìm thấy file font (.ttf) nào trong thư mục 'assets'.")

def sanitize_filename(name):
    return re.sub(r'[\\/*?:"<>|]', "", name)

def hex_to_ffmpeg_color(hex_color, alpha='ff'):
    try:
        hex_color = hex_color.lstrip('#')
        if len(hex_color) != 6: raise ValueError
        return f"0x{hex_color}{alpha}"
    except:
        return "0xFFFFFFFF"

def run_command_with_live_output(cmd):
    process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace')
    
    output = []
    for line in iter(process.stdout.readline, ''):
        trimmed_line = line.strip()
        
        is_download_progress = trimmed_line.startswith('[download]') and '%' in trimmed_line
        is_ffmpeg_progress = trimmed_line.startswith('frame=')
        is_error = 'ERROR' in trimmed_line.upper()

        if is_download_progress or is_ffmpeg_progress:
            print(trimmed_line, end='\r', flush=True)
        elif is_error:
            print(trimmed_line, flush=True)
            
        output.append(trimmed_line)
    
    print("", flush=True)
    
    process.wait()
    if process.returncode != 0:
        full_log = '\n'.join(output)
        print(f"Full log on error:\n{full_log}", flush=True)
        raise subprocess.CalledProcessError(process.returncode, cmd, output=full_log)
    
    return '\n'.join(output)

def fetch_video_metadata(url, yt_dlp_path, cookies_path):
    cmd = [yt_dlp_path, "-j", "--no-playlist", url]
    if os.path.exists(cookies_path):
        cmd += ["--cookies", cookies_path]
    process = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
    
    if process.returncode != 0:
        raise Exception(f"yt-dlp lỗi với mã {process.returncode}:\n{process.stderr}\n{process.stdout}")
    
    try:
        return json.loads(process.stdout)
    except json.JSONDecodeError:
        raise Exception(f"Lỗi parse JSON từ yt-dlp. Đầu ra:\n{process.stdout}")


def download_main_video(url, yt_dlp_path, ffmpeg_path, dest_path, cookies_path):
    format_string = "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
    cmd = [
        yt_dlp_path,
        "--ffmpeg-location", ffmpeg_path,
        "-f", format_string,
        "--merge-output-format", "mp4",
        # Fix 1: Ra lệnh cho ffmpeg bỏ qua metadata
        "--ppa", "ffmpeg:-map_metadata -1",
        # Fix 2 (Mới): Ra lệnh trực tiếp cho yt-dlp cũng không nhúng metadata
        "--no-embed-metadata",
        "-o", dest_path,
        url
    ]
    if os.path.exists(cookies_path):
        cmd += ["--cookies", cookies_path]
    
    run_command_with_live_output(cmd)

def download_thumbnail(thumbnail_url, dest_path):
    urllib.request.urlretrieve(thumbnail_url, dest_path)
    if not os.path.exists(dest_path):
        raise FileNotFoundError("Không tải được thumbnail")

def build_ffmpeg_filter(layout, input_map, start, duration, text_item, font_path, part_num):
    layout.sort(key=lambda x: int(x.get('zIndex', 0)))
    filters, last_stream = ["color=s=720x1280:c=black[canvas]"], "canvas"
    overlay_count = 0
    
    for item in layout:
        if item['type'] == 'text' or item['id'] not in input_map:
            continue
        input_index, w, h, x, y = input_map[item['id']], item['width'], item['height'], item['x'], item['y']
        scaled_stream, output_stream = f"s{overlay_count}", f"bg{overlay_count + 1}"
        scale_filter = f"scale={w}:{h},setsar=1"
        if item['type'] == 'video':
            filters.append(f"[{input_index}:v]trim=start={start}:duration={duration},setpts=PTS-STARTPTS,{scale_filter}[{scaled_stream}]")
        else:
            filters.append(f"[{input_index}:v]{scale_filter}[{scaled_stream}]")
        filters.append(f"[{last_stream}][{scaled_stream}]overlay={x}:{y}[{output_stream}]")
        last_stream, overlay_count = output_stream, overlay_count + 1

    if text_item:
        style = text_item.get("textStyle", {})
        font_size = style.get("fontSize", 70)
        font_color = hex_to_ffmpeg_color(style.get("fontColor", "#FFFFFF"))
        border_w = style.get("outlineWidth", 2)
        border_color = hex_to_ffmpeg_color(style.get("outlineColor", "#000000"))
        shadow_color = hex_to_ffmpeg_color(style.get("shadowColor", "#000000"), "80")
        shadow_x = style.get("shadowDepth", 2)
        shadow_y = style.get("shadowDepth", 2)
        
        text_x = text_item['x'] + (text_item['width'] / 2)
        text_y = text_item['y'] + (text_item['height'] / 2)
        
        escaped_font_path = font_path.replace('\\', '/').replace(':', '\\:')

        drawtext_filter = (
            f"drawtext="
            f"fontfile='{escaped_font_path}':"
            f"text='Part {part_num}':"
            f"fontsize={font_size}:"
            f"fontcolor={font_color}:"
            f"x={text_x}-(text_w/2):"
            f"y={text_y}-(text_h/2):"
            f"borderw={border_w}:"
            f"bordercolor={border_color}:"
            f"shadowcolor={shadow_color}:"
            f"shadowx={shadow_x}:"
            f"shadowy={shadow_y}"
        )
        
        filters.append(f"[{last_stream}]{drawtext_filter}[final_v]")
        last_stream = "final_v"
    
    if last_stream != "final_v":
        filters.append(f"[{last_stream}]copy[final_v]")

    filters.append(f"[0:a]atrim=start={start}:duration={duration},asetpts=PTS-STARTPTS[final_a]")
    return ";".join(filters), "final_v"

def process_video(url, num_parts, save_path, part_duration, layout_file, encoder, resources_path, user_data_path):
    with open(layout_file, 'r', encoding='utf-8') as f:
        layout = json.load(f)
    
    output_dir = save_path or os.path.join(resources_path, "output")
    temp_dir = os.path.join(resources_path, "temp_files")
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(temp_dir, exist_ok=True)

    yt_dlp_path = get_executable_path("yt-dlp", resources_path)
    ffmpeg_path = get_executable_path("ffmpeg", resources_path)
    font_path = get_font_path(resources_path)
    user_cookie_path = os.path.join(user_data_path, 'cookies.txt')
    default_cookie_path = os.path.join(resources_path, "cookies.txt")
    cookies_path_to_use = user_cookie_path if os.path.exists(user_cookie_path) else default_cookie_path

    try:
        print("STATUS: Lấy thông tin video...", flush=True)
        video_info = fetch_video_metadata(url, yt_dlp_path, cookies_path_to_use)
        title, video_id, thumbnail_url, total_duration = video_info['title'], video_info['id'], video_info['thumbnail'], video_info.get('duration', 0)
        if not total_duration: raise Exception("Không lấy được thông tin thời lượng video.")
        sanitized_title = sanitize_filename(title)
        if part_duration <= 0: part_duration = total_duration / num_parts
        
        print("STATUS: Tải video chính...", flush=True)
        main_video_path = os.path.join(temp_dir, f"{video_id}.mp4")
        if not os.path.exists(main_video_path):
             download_main_video(url, yt_dlp_path, ffmpeg_path, main_video_path, cookies_path_to_use)
        
        print("STATUS: Tải thumbnail...", flush=True)
        thumbnail_path = os.path.join(temp_dir, f"{video_id}_thumb.jpg")
        if not os.path.exists(thumbnail_path):
            download_thumbnail(thumbnail_url, thumbnail_path)
        
        text_item = next((item for item in layout if item['type'] == 'text'), None)
        actual_num_parts = min(num_parts, int(total_duration // part_duration))
        
        for i in range(actual_num_parts):
            part_num = i + 1
            start_time = i * part_duration
            if start_time >= total_duration: break
            
            output_path = os.path.join(output_dir, f"{sanitized_title}_Part_{part_num}.mp4")
            print(f"STATUS: Render Part {part_num}/{actual_num_parts}...", flush=True)
            
            cmd = [ffmpeg_path, '-y', '-i', main_video_path, '-i', thumbnail_path]
            input_map = {'video-placeholder': 0, 'thumbnail-placeholder': 1}
            
            image_index = 2
            for item in layout:
                if item['type'] == 'image' and item['source'] and item['source'].startswith('data:image'):
                    try:
                        header, encoded = item['source'].split(',', 1)
                        image_format = header.split(';')[0].split('/')[1]
                        image_data = base64.b64decode(encoded)
                        temp_image_path = os.path.join(temp_dir, f"temp_img_{item['id']}.{image_format}")
                        with open(temp_image_path, 'wb') as img_f:
                            img_f.write(image_data)
                        cmd += ['-i', temp_image_path]
                        input_map[item['id']] = image_index
                        image_index += 1
                    except Exception as e:
                        print(f"Warning: Không thể xử lý ảnh {item['id']}: {e}")

            filter_complex, final_video_stream = build_ffmpeg_filter(layout, input_map, start_time, part_duration, text_item, font_path, part_num)
            
            cmd += ['-filter_complex', filter_complex, '-map', f'[{final_video_stream}]', '-map', '[final_a]']
            
            if encoder == 'libx264':
                cmd += ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23']
            else:
                cmd += ['-c:v', encoder, '-preset', 'p7', '-cq', '23']
                
            cmd += ['-c:a', 'aac', '-b:a', '192k', '-r', '30', '-shortest', output_path]
            
            run_command_with_live_output(cmd)

            print(f"RESULT:{output_path}", flush=True)
        
        print("STATUS: Hoàn tất tất cả các phần!", flush=True)

    except Exception as e:
        print(f"PYTHON_ERROR: {e}", file=sys.stderr, flush=True)
        sys.exit(1)
    finally:
        print("STATUS: Dọn dẹp file tạm...", flush=True)
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Video Processing Script")
    parser.add_argument('--resources-path', required=True)
    parser.add_argument('--user-data-path', required=True)
    parser.add_argument('--url', type=str, required=True)
    parser.add_argument('--layout-file', type=str, required=True)
    parser.add_argument('--parts', type=int, default=1)
    parser.add_argument('--save-path', type=str, default="")
    parser.add_argument('--part-duration', type=int, default=0)
    parser.add_argument('--encoder', type=str, default='libx264')
    
    args = parser.parse_args()
    
    process_video(
        args.url, 
        args.parts, 
        args.save_path,
        args.part_duration, 
        args.layout_file, 
        args.encoder, 
        args.resources_path,
        args.user_data_path
    )
