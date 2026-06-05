import requests
import re
import os
import json
import shutil
import tempfile
import sqlite3
from typing import Optional

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://www.bilibili.com/",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Origin": "https://www.bilibili.com",
}

def set_cookie(cookie_str=""):
    if cookie_str:
        HEADERS["Cookie"] = cookie_str
    else:
        HEADERS.pop("Cookie", None)

def extract_bv(url):
    if not url:
        return None
    url = url.strip()
    m = re.search(r'/video/(BV[a-zA-Z0-9]{10})', url)
    if m:
        return m.group(1)
    m = re.search(r'(?:^|/|\?|&)(BV[a-zA-Z0-9]{10})(?:/|\?|&|$)', url)
    if m:
        return m.group(1)
    idx = url.find('BV')
    if idx != -1 and idx + 12 <= len(url):
        candidate = url[idx:idx+12]
        if re.match(r'BV[a-zA-Z0-9]{10}', candidate):
            return candidate
    return None

def get_video_info(bv):
    api = f"https://api.bilibili.com/x/web-interface/view?bvid={bv}"
    r = requests.get(api, headers=HEADERS, timeout=30)
    data = r.json()
    if data["code"] != 0:
        raise Exception(f"{data['message']}")
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
    r = requests.get(api, params=params, headers=HEADERS, timeout=30)
    data = r.json()
    if data["code"] != 0:
        raise Exception(f"{data['message']}")
    accept_quality = data["data"].get("accept_quality", [])
    accept_description = data["data"].get("accept_description", [])
    qualities = []
    for i, qn in enumerate(accept_quality):
        qualities.append({"qn": qn, "desc": accept_description[i] if i < len(accept_description) else str(qn)})
    qualities.append({"qn": 127, "desc": "最高画质 (无损)"})
    return qualities

def get_download_urls(bv, cid, qn=127):
    # 首先尝试 DASH 流
    api = "https://api.bilibili.com/x/player/playurl"
    params = {"bvid": bv, "cid": cid, "qn": qn, "fnval": 16}
    r = requests.get(api, params=params, headers=HEADERS, timeout=30)
    data = r.json()
    if data["code"] == 0:
        dash = data["data"].get("dash")
        if dash:
            video_url = dash["video"][0]["baseUrl"]
            audio_url = dash["audio"][0]["baseUrl"]
            return video_url, audio_url

    # DASH 流失败，尝试传统单文件流（mp4/flv）
    params["fnval"] = 1  # 普通视频流
    r = requests.get(api, params=params, headers=HEADERS, timeout=30)
    data = r.json()
    if data["code"] == 0:
        durl = data["data"].get("durl")
        if durl and len(durl) > 0:
            video_url = durl[0]["url"]
            # 传统流音视频合一，但为了兼容我们返回同样的视频链接作为音频链接，上层调用会判断
            return video_url, video_url  # 音频链接同样返回视频链接，实际下载音频时会被跳过

    raise Exception(f"获取下载地址失败 (错误码 {data.get('code', '未知')}): {data.get('message', '无详细错误信息')}")

def download_file(url, path, callback=None):
    resp = requests.get(url, headers=HEADERS, stream=True, timeout=60)
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

def get_auto_cookie() -> Optional[str]:
    """从主流浏览器中自动提取 B站 SESSDATA Cookie"""
    import platform

    system = platform.system()
    browsers = []

    # Edge (Chromium)
    if system == "Windows":
        browsers.append({
            'name': 'Edge',
            'cookie_path': os.path.join(os.getenv('LOCALAPPDATA', ''),
                                        'Microsoft', 'Edge', 'User Data', 'Default', 'Cookies'),
            'host_key': '.bilibili.com'
        })
    elif system == "Darwin":  # macOS
        browsers.append({
            'name': 'Edge',
            'cookie_path': os.path.expanduser('~/Library/Application Support/Microsoft Edge/Default/Cookies'),
            'host_key': '.bilibili.com'
        })
    elif system == "Linux":
        browsers.append({
            'name': 'Edge',
            'cookie_path': os.path.expanduser('~/.config/microsoft-edge/Default/Cookies'),
            'host_key': '.bilibili.com'
        })

    # Chrome
    if system == "Windows":
        browsers.append({
            'name': 'Chrome',
            'cookie_path': os.path.join(os.getenv('LOCALAPPDATA', ''),
                                        'Google', 'Chrome', 'User Data', 'Default', 'Cookies'),
            'host_key': '.bilibili.com'
        })
    elif system == "Darwin":
        browsers.append({
            'name': 'Chrome',
            'cookie_path': os.path.expanduser('~/Library/Application Support/Google/Chrome/Default/Cookies'),
            'host_key': '.bilibili.com'
        })
    elif system == "Linux":
        browsers.append({
            'name': 'Chrome',
            'cookie_path': os.path.expanduser('~/.config/google-chrome/Default/Cookies'),
            'host_key': '.bilibili.com'
        })

    # Firefox (需要特殊处理，因为其 Cookie 存储在 SQLite 数据库中，但结构不同)
    # 暂时跳过 Firefox，因为读取其 cookie 需要额外的库

    for browser in browsers:
        try:
            cookie_file = browser['cookie_path']
            if not os.path.exists(cookie_file):
                # 尝试其他 Profile 目录（如 Profile 1, Profile 2）
                base_dir = os.path.dirname(cookie_file)
                if os.path.exists(base_dir):
                    for item in os.listdir(base_dir):
                        if item.startswith('Profile'):
                            alt_path = os.path.join(base_dir, item, 'Cookies')
                            if os.path.exists(alt_path):
                                cookie_file = alt_path
                                break

            if not os.path.exists(cookie_file):
                continue

            with tempfile.TemporaryDirectory() as tmpdir:
                dest = os.path.join(tmpdir, 'cookies.db')
                shutil.copy2(cookie_file, dest)

                conn = sqlite3.connect(f'file:{dest}?immutable=1', uri=True)
                cursor = conn.cursor()

                # 尝试多种 host_key 格式
                for host in [browser['host_key'], 'bilibili.com', '.bilibili.com', 'www.bilibili.com']:
                    cursor.execute(
                        "SELECT value FROM cookies WHERE host_key = ? AND name = 'SESSDATA'",
                        (host,)
                    )
                    row = cursor.fetchone()
                    if row and row[0]:
                        conn.close()
                        return row[0]

                conn.close()
        except Exception:
            continue

    return None

def try_login_with_browser() -> bool:
    auto_cookie = get_auto_cookie()
    if auto_cookie:
        set_cookie(auto_cookie)
        return True
    return False