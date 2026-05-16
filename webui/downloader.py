import requests
import re
import os
import json

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://www.bilibili.com/",
}

def extract_bv(url):
    m = re.search(r'BV[a-zA-Z0-9]{10}', url)
    return m.group(0) if m else None

def get_video_info(bv):
    api = f"https://api.bilibili.com/x/web-interface/view?bvid={bv}"
    r = requests.get(api, headers=HEADERS)
    data = r.json()
    if data["code"] != 0:
        raise Exception(data["message"])
    return {
        "title": data["data"]["title"],
        "cid": data["data"]["cid"],
        "cover": data["data"]["pic"],
        "duration": data["data"]["duration"],
        "owner": data["data"]["owner"]["name"]
    }

def get_available_qualities(bv, cid):
    api = "https://api.bilibili.com/x/player/playurl"
    params = {"bvid": bv, "cid": cid, "qn": 127, "fnval": 16}
    r = requests.get(api, params=params, headers=HEADERS)
    data = r.json()
    if data["code"] != 0:
        raise Exception(data["message"])

    accept_quality = data["data"].get("accept_quality", [])
    accept_description = data["data"].get("accept_description", [])
    qualities = []
    for i, qn in enumerate(accept_quality):
        qualities.append({"qn": qn, "desc": accept_description[i] if i < len(accept_description) else str(qn)})
    qualities.append({"qn": 127, "desc": "最高画质 (无损)"})
    return qualities

def get_download_urls(bv, cid, qn=127):
    api = "https://api.bilibili.com/x/player/playurl"
    params = {"bvid": bv, "cid": cid, "qn": qn, "fnval": 16}
    r = requests.get(api, params=params, headers=HEADERS)
    data = r.json()
    if data["code"] != 0:
        raise Exception(data["message"])
    dash = data["data"]["dash"]
    video_url = dash["video"][0]["baseUrl"]
    audio_url = dash["audio"][0]["baseUrl"]
    return video_url, audio_url

def download_file(url, path, callback=None):
    resp = requests.get(url, headers=HEADERS, stream=True)
    total = int(resp.headers.get('content-length', 0))
    downloaded = 0
    with open(path, 'wb') as f:
        for chunk in resp.iter_content(1024*1024):
            if chunk:
                f.write(chunk)
                downloaded += len(chunk)
                if callback and total > 0:
                    callback(downloaded, total)

def safe_name(s):
    return re.sub(r'[\\/:*?"<>|]', '_', s)

def load_history(path="history.json"):
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

def save_history(item, path="history.json"):
    history = load_history(path)
    history.insert(0, item)
    if len(history) > 20:
        history = history[:20]
    with open(path, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)