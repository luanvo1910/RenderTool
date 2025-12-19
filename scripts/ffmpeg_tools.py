import base64
import os
import re
import threading
import urllib.request

from utils_common import ffmpeg_safe_path, hex_to_ffmpeg_color


def run_command_with_live_output(cmd, total_duration=None):
    """Chạy lệnh ffmpeg và phát progress qua stdout."""
    import subprocess
    import sys

    creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=creationflags,
    )
    stdout_output, stderr_output = [], []
    ffmpeg_time_regex = re.compile(r"time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})")

    def stream_reader(stream, output_list, is_stderr=False):
        for line in iter(stream.readline, ""):
            trimmed_line = line.strip()
            output_list.append(trimmed_line)
            if total_duration and is_stderr:
                match = ffmpeg_time_regex.search(trimmed_line)
                if match:
                    h, m, s, ms = map(int, match.groups())
                    current_time_seconds = h * 3600 + m * 60 + s + ms / 100
                    percent = min(100, (current_time_seconds / total_duration) * 100)
                    print(f"PROGRESS:RENDER:{percent:.2f}", flush=True)
                    continue
            if trimmed_line and not is_stderr:
                print(trimmed_line, flush=True)

    stdout_thread = threading.Thread(target=stream_reader, args=(process.stdout, stdout_output))
    stderr_thread = threading.Thread(target=stream_reader, args=(process.stderr, stderr_output, True))
    stdout_thread.start()
    stderr_thread.start()
    stdout_thread.join()
    stderr_thread.join()
    process.wait()

    if process.returncode != 0:
        for line in stderr_output:
            if line:
                print(f"FFMPEG_ERROR: {line}", flush=True)
        raise subprocess.CalledProcessError(
            process.returncode,
            cmd,
            output="\n".join(stdout_output),
            stderr="\n".join(stderr_output),
        )


def download_thumbnail(thumbnail_url, dest_path):
    urllib.request.urlretrieve(thumbnail_url, dest_path)
    if not os.path.exists(dest_path):
        raise FileNotFoundError("Could not download thumbnail")


def build_ffmpeg_filter(layout, input_map, start, duration, part_num, resources_path):
    """Generate ffmpeg filter_complex for overlay + text."""
    layout.sort(key=lambda x: int(x.get("zIndex", 0)))
    filters, last_stream = ["color=s=720x1280:c=black[canvas]"], "canvas"
    overlay_count = 0

    for item in layout:
        if item.get("type") == "text" or item.get("id") not in input_map:
            continue
        input_index = input_map.get(item["id"])
        w = item.get("width", 720)
        h = item.get("height", 1280)
        x = item.get("x", 0)
        y = item.get("y", 0)
        scaled_stream, output_stream = f"s{overlay_count}", f"bg{overlay_count + 1}"
        scale_filter = f"scale={w}:{h},setsar=1"
        if item["type"] == "video":
            filters.append(
                f"[{input_index}:v]trim=start={start}:duration={duration},"
                f"setpts=PTS-STARTPTS,{scale_filter}[{scaled_stream}]"
            )
        else:
            filters.append(f"[{input_index}:v]{scale_filter}[{scaled_stream}]")
        filters.append(f"[{last_stream}][{scaled_stream}]overlay={x}:{y}[{output_stream}]")
        last_stream, overlay_count = output_stream, overlay_count + 1

    for item in layout:
        if item.get("type") != "text":
            continue
        style = item.get("textStyle", {})
        content = item.get("content", " ")
        text_to_draw = f"Part {part_num}" if item.get("id") == "text-placeholder" else str(content)
        text_to_draw = text_to_draw.replace("'", "’").replace(":", "\\:").replace("%", "\\%")
        font_size = style.get("fontSize", 70)
        font_color = hex_to_ffmpeg_color(style.get("fontColor", "#FFFFFF"))
        border_w = style.get("outlineWidth", 2)
        border_color = hex_to_ffmpeg_color(style.get("outlineColor", "#000000"))
        shadow_color = hex_to_ffmpeg_color(style.get("shadowColor", "#000000"), "80")
        shadow_x = style.get("shadowDepth", 2)
        shadow_y = style.get("shadowDepth", 2)
        font_family_name = style.get("fontFamily", "arial.ttf").replace("'", "").replace(":", "\\:")

        text_x_base = item.get("x", 0)
        text_w_base = item.get("width", 720)
        text_y_base = item.get("y", 0)
        text_h_base = item.get("height", 100)
        text_x = (text_x_base or 0) + ((text_w_base or 720) / 2)
        text_y = (text_y_base or 0) + ((text_h_base or 100) / 2)

        box_color_hex = style.get("boxColor", "#000000")
        box_opacity = style.get("boxOpacity", 0.5)
        box_padding = style.get("boxPadding", 10)
        box_opacity_hex = format(int(box_opacity * 255), "x").zfill(2)
        box_color_ffmpeg = hex_to_ffmpeg_color(box_color_hex, box_opacity_hex)
        font_filename = font_family_name if font_family_name else "arial.ttf"
        font_file_path = os.path.join(resources_path, "assets", font_filename)
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
        output_stream = f"txt{overlay_count}"
        filters.append(f"[{last_stream}]{drawtext_filter}[{output_stream}]")
        last_stream = output_stream
        overlay_count += 1

    if last_stream != "canvas":
        filters.append(f"[{last_stream}]copy[final_v]")
    else:
        filters.append("[canvas]copy[final_v]")
    filters.append(f"[0:a]atrim=start={start}:duration={duration},asetpts=PTS-STARTPTS[final_a]")
    return ";".join(filters), "final_v"


def save_base64_image_to_temp(item, temp_dir, image_index, cmd, input_map):
    """Decode base64 image and append to ffmpeg input map."""
    header, encoded = item["source"].split(",", 1)
    image_format = header.split(";")[0].split("/")[1]
    image_data = base64.b64decode(encoded)
    temp_image_path = os.path.join(temp_dir, f"temp_img_{item['id']}.{image_format}")
    with open(temp_image_path, "wb") as img_f:
        img_f.write(image_data)
    cmd += ["-i", temp_image_path]
    input_map[item["id"]] = image_index
    return image_index + 1

