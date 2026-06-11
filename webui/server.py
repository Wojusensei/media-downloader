import requests
import http.server
import json
import urllib.parse
import os
import sys
import webbrowser
import traceback
import threading

from downloader import (
    extract_bv, get_video_info, get_available_qualities,
    get_legacy_video_url, get_dash_audio_url, download_file, safe_name,
    load_history, save_history, try_login_with_browser, set_cookie,
    get_auto_cookie, get_mp4_duration, download_cover_to_base64
)

PORT = 8765

if getattr(sys, 'frozen', False):
    ROOT = sys._MEIPASS
else:
    ROOT = os.path.dirname(os.path.abspath(__file__))

download_progress = {}

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        params = urllib.parse.parse_qs(parsed.query)

        if path == "/api/info":
            self.handle_info(params)
        elif path == "/api/qualities":
            self.handle_qualities(params)
        elif path == "/api/history":
            self.handle_get_history()
        elif path == "/api/history/delete":
            self.handle_delete_history(params)
        elif path == "/api/progress":
            self.handle_progress(params)
        elif path == "/api/auto-login":
            self.handle_auto_login()
        elif path == "/" or path == "":
            self.path = "/index.html"
            super().do_GET()
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/download":
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)
            self.handle_download_post(data)
        elif path == "/api/select-folder":
            self.handle_select_folder()
        else:
            self.send_error(404)

    def handle_auto_login(self):
        cookie = get_auto_cookie()
        if cookie:
            set_cookie(cookie)
            self.send_json({"ok": True, "message": "已成功获取浏览器登录信息"})
        else:
            self.send_json({"ok": False, "error": "未能自动获取，请确保浏览器中已登录B站，并暂时关闭浏览器后重试"})

    def handle_info(self, params):
        url = params.get("url", [""])[0]
        if not url:
            self.send_json({"ok": False, "error": "请提供视频链接"})
            return

        bv = extract_bv(url)
        if not bv:
            self.send_json({"ok": False, "error": f"无法识别链接中的BV号: {url}"})
            return
        try:
            if not try_login_with_browser():
                print("[INFO] 自动提取 Cookie 失败，尝试手动 Cookie（如果有）")
            info = get_video_info(bv)
            cover_base64 = download_cover_to_base64(info["cover"])
            self.send_json({
                "ok": True,
                "bv": bv,
                **info,
                "cover_base64": cover_base64 or info["cover"]
            })
        except Exception as e:
            print(f"[ERROR] get_video_info failed: {e}")
            traceback.print_exc()
            self.send_json({"ok": False, "error": f"获取视频信息失败: {e}"})

    def handle_qualities(self, params):
        bv = params.get("bv", [""])[0]
        cid = params.get("cid", ["0"])[0]
        if not bv or not cid:
            self.send_json({"ok": False, "error": "参数缺失"})
            return
        try:
            qualities = get_available_qualities(bv, int(cid))
            self.send_json({"ok": True, "qualities": qualities})
        except Exception as e:
            self.send_json({"ok": False, "error": str(e)})

    def handle_progress(self, params):
        task_id = params.get("task_id", [""])[0]
        if task_id and task_id in download_progress:
            self.send_json({"ok": True, "progress": download_progress[task_id]})
        else:
            self.send_json({"ok": False, "error": "未找到下载任务"})

    def handle_download_post(self, data):
        url = data.get("url", "")
        qn = data.get("qn", 127)
        types = data.get("types", ["video", "audio", "cover"])
        save_path = data.get("save_path", os.path.join(os.getcwd(), "downloads"))
        manual_cookie = data.get("manual_cookie", "")

        bv = extract_bv(url)
        if not bv:
            self.send_json({"ok": False, "error": f"无法识别链接中的BV号: {url}"})
            return

        task_id = f"{bv}_{int(__import__('time').time())}"

        def do_download():
            try:
                # 自动登录
                auto_success = try_login_with_browser()
                if not auto_success and manual_cookie:
                    print("[INFO] 使用手动输入的 Cookie")
                    set_cookie(manual_cookie)
                    auto_success = True
                elif not auto_success:
                    print("[INFO] 未获取到任何登录信息，以游客模式下载")

                info = get_video_info(bv)
                title = info["title"]
                cid = info["cid"]
                cover = info["cover"]
                original_duration = info["duration"]

                folder = os.path.join(save_path, f"{bv}_{safe_name(title)}")
                os.makedirs(folder, exist_ok=True)

                results = []

                # 下载封面
                if "cover" in types:
                    cover_path = os.path.join(folder, "cover.jpg")
                    download_file(cover, cover_path, lambda d,t: download_progress.update({task_id: {"cover": d/t}}))
                    results.append("cover")

                video_path = ""
                video_downloaded = False

                # 下载视频（传统流，一定有声音）
                if "video" in types:
                    video_url = get_legacy_video_url(bv, cid, qn)
                    video_path = os.path.join(folder, "video.mp4")
                    download_file(video_url, video_path, lambda d,t: download_progress.update({task_id: {"video": d/t}}))
                    results.append("video")
                    video_downloaded = True

                # 下载独立音频（尝试 DASH 流）
                if "audio" in types:
                    audio_url = get_dash_audio_url(bv, cid, qn)
                    if audio_url:
                        audio_path = os.path.join(folder, "audio.mp3")
                        download_file(audio_url, audio_path, lambda d,t: download_progress.update({task_id: {"audio": d/t}}))
                        results.append("audio")
                    else:
                        print("[WARN] 无法获取独立音频流，可能该视频不支持分离音频")
                        results.append("audio (not available)")

                # 完整性检测：仅当提供了登录信息且视频时长 > 60秒才检查
                if video_downloaded and auto_success and original_duration > 60:
                    actual_duration = get_mp4_duration(video_path)
                    if actual_duration is not None:
                        print(f"[INFO] 原视频时长: {original_duration}s, 下载后时长: {actual_duration}s")
                        if actual_duration < original_duration * 0.9:
                            download_progress[task_id] = {
                                "status": "partial",
                                "folder": folder,
                                "title": title,
                                "message": "您的B站账号可能没有购买该视频或开通大会员，无法下载完整视频。"
                            }
                            return
                    else:
                        file_size_mb = os.path.getsize(video_path) / (1024 * 1024)
                        if file_size_mb < 50:
                            download_progress[task_id] = {
                                "status": "partial",
                                "folder": folder,
                                "title": title,
                                "message": "您的B站账号可能没有购买该视频或开通大会员，无法下载完整视频。"
                            }
                            return

                history_item = {"bv": bv, "title": title, "time": __import__('datetime').datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "folder": folder}
                save_history(history_item)
                download_progress[task_id] = {"status": "complete", "folder": folder, "title": title}
            except Exception as e:
                print(f"[ERROR] download failed: {e}")
                traceback.print_exc()
                download_progress[task_id] = {"status": "error", "error": str(e)}

        threading.Thread(target=do_download, daemon=True).start()
        self.send_json({"ok": True, "task_id": task_id, "message": "下载任务已启动"})

    def handle_get_history(self):
        history = load_history()
        self.send_json({"ok": True, "history": history})

    def handle_delete_history(self, params):
        index = int(params.get("index", ["-1"])[0])
        history = load_history()
        if 0 <= index < len(history):
            history.pop(index)
            with open("history.json", "w", encoding="utf-8") as f:
                json.dump(history, f, ensure_ascii=False, indent=2)
            self.send_json({"ok": True})
        else:
            self.send_json({"ok": False, "error": "无效索引"})

    def handle_select_folder(self):
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        folder = filedialog.askdirectory(title="选择下载文件夹")
        root.destroy()
        if folder:
            self.send_json({"ok": True, "folder": folder})
        else:
            self.send_json({"ok": False, "error": "未选择文件夹"})

    def send_json(self, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass

def start_server():
    server = http.server.HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Server running at http://localhost:{PORT}")
    webbrowser.open(f"http://localhost:{PORT}")
    server.serve_forever()

if __name__ == "__main__":
    start_server()