import http.server
import json
import urllib.parse
import os
import threading
import webbrowser

from downloader import (
    extract_bv, get_video_info, get_available_qualities,
    get_download_urls, download_file, safe_name,
    load_history, save_history
)

PORT = 8765
ROOT = os.path.dirname(os.path.abspath(__file__))

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
        elif path == "/api/download":
            self.handle_download(params)
        elif path == "/api/progress":
            self.handle_progress(params)
        elif path == "/api/history":
            self.handle_get_history()
        elif path == "/api/history/delete":
            self.handle_delete_history(params)
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

    def handle_info(self, params):
        url = params.get("url", [""])[0]
        bv = extract_bv(url)
        if not bv:
            self.send_json({"ok": False, "error": "无法识别B站链接"})
            return
        try:
            info = get_video_info(bv)
            self.send_json({"ok": True, "bv": bv, **info})
        except Exception as e:
            self.send_json({"ok": False, "error": str(e)})

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

    def handle_download(self, params):
        self.send_json({"ok": False, "error": "请使用 POST 方法"})

    def handle_download_post(self, data):
        url = data.get("url", "")
        qn = data.get("qn", 127)
        types = data.get("types", ["video", "audio", "cover"])
        save_path = data.get("save_path", os.path.join(os.getcwd(), "downloads"))

        bv = extract_bv(url)
        if not bv:
            self.send_json({"ok": False, "error": "无法识别B站链接"})
            return

        try:
            info = get_video_info(bv)
            title = info["title"]
            cid = info["cid"]
            cover = info["cover"]

            folder = os.path.join(save_path, f"{bv}_{safe_name(title)}")
            os.makedirs(folder, exist_ok=True)

            results = []

            if "cover" in types:
                cover_path = os.path.join(folder, "cover.jpg")
                download_file(cover, cover_path)
                results.append("cover")

            if "video" in types or "audio" in types:
                vurl, aurl = get_download_urls(bv, cid, qn)
                if "video" in types:
                    video_path = os.path.join(folder, "video_only.mp4")
                    download_file(vurl, video_path)
                    results.append("video")
                if "audio" in types:
                    audio_path = os.path.join(folder, "audio_only.mp3")
                    download_file(aurl, audio_path)
                    results.append("audio")

            history_item = {
                "bv": bv,
                "title": title,
                "time": __import__('datetime').datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "folder": folder
            }
            save_history(history_item)

            self.send_json({"ok": True, "results": results, "folder": folder, "title": title})
        except Exception as e:
            self.send_json({"ok": False, "error": str(e)})

    def handle_progress(self, params):
        self.send_json({"ok": True, "progress": 0})

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