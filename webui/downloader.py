import requests
import re
import os
import json
import shutil
import tempfile
import sqlite3
import struct
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

def get_legacy_video_url(bv, cid, qn=127):
    """获取传统流（包含声音）的视频地址"""
    api = "https://api.bilibili.com/x/player/playurl"
    params = {"bvid": bv, "cid": cid, "qn": qn, "fnval": 1}
    r = requests.get(api, params=params, headers=HEADERS, timeout=30)
    data = r.json()
    if data["code"] == 0:
        durl = data["data"].get("durl")
        if durl and len(durl) > 0:
            return durl[0]["url"]
    raise Exception(f"获取传统视频流失败: {data.get('message', '未知错误')}")

def get_dash_audio_url(bv, cid, qn=127):
    """获取 DASH 流中的音频地址（可能失败）"""
    api = "https://api.bilibili.com/x/player/playurl"
    params = {"bvid": bv, "cid": cid, "qn": qn, "fnval": 16}
    r = requests.get(api, params=params, headers=HEADERS, timeout=30)
    data = r.json()
    if data["code"] == 0:
        dash = data["data"].get("dash")
        if dash and dash.get("audio"):
            return dash["audio"][0]["baseUrl"]
    return None

def download_file(url, path, callback=None):
    """下载文件，失败时抛出异常"""
    for i in range(3):
        try:
            resp = requests.get(url, headers=HEADERS, stream=True, timeout=60)
            resp.raise_for_status()
            total = int(resp.headers.get('content-length', 0))
            downloaded = 0
            with open(path, 'wb') as f:
                for chunk in resp.iter_content(1024*1024):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        if callback and total > 0:
                            callback(downloaded, total)
            if callback and total == 0:
                callback(1, 1)
            return
        except Exception as e:
            if i == 2:
                raise Exception(f"下载失败 (重试3次后): {str(e)}")
            continue

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
    import platform
    system = platform.system()

    browsers = []

    if system == "Windows":
        edge_base = os.path.join(os.getenv('LOCALAPPDATA', ''),
                                 'Microsoft', 'Edge', 'User Data')
        for profile in ['Default', 'Profile 1', 'Profile 2']:
            path = os.path.join(edge_base, profile, 'Network', 'Cookies')
            if os.path.exists(path):
                browsers.append({'name': f'Edge ({profile})', 'cookie_path': path, 'host_key': '.bilibili.com'})

    if system == "Windows":
        chrome_base = os.path.join(os.getenv('LOCALAPPDATA', ''),
                                   'Google', 'Chrome', 'User Data')
        for profile in ['Default', 'Profile 1', 'Profile 2']:
            path = os.path.join(chrome_base, profile, 'Network', 'Cookies')
            if os.path.exists(path):
                browsers.append({'name': f'Chrome ({profile})', 'cookie_path': path, 'host_key': '.bilibili.com'})

    if system == "Windows":
        firefox_base = os.path.join(os.getenv('APPDATA', ''), 'Mozilla', 'Firefox', 'Profiles')
    elif system == "Darwin":
        firefox_base = os.path.expanduser('~/Library/Application Support/Firefox/Profiles')
    else:
        firefox_base = os.path.expanduser('~/.mozilla/firefox')

    if os.path.exists(firefox_base):
        for profile in os.listdir(firefox_base):
            if profile.endswith('.default-release') or profile.endswith('.default'):
                path = os.path.join(firefox_base, profile, 'cookies.sqlite')
                if os.path.exists(path):
                    browsers.append({'name': f'Firefox ({profile})', 'cookie_path': path, 'host_key': 'bilibili.com'})

    for browser in browsers:
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                dest = os.path.join(tmpdir, 'cookies.db')
                shutil.copy2(browser['cookie_path'], dest)

                conn = sqlite3.connect(f'file:{dest}?immutable=1', uri=True)
                cursor = conn.cursor()

                cookies = {}
                if 'Firefox' in browser['name']:
                    cursor.execute(
                        "SELECT name, value FROM moz_cookies WHERE host LIKE '%bilibili.com' AND name IN ('SESSDATA', 'bili_jct', 'DedeUserID', 'buvid3')"
                    )
                    for name, value in cursor.fetchall():
                        cookies[name] = value
                else:
                    for name in ['SESSDATA', 'bili_jct', 'DedeUserID', 'buvid3']:
                        cursor.execute(
                            "SELECT value, encrypted_value FROM cookies WHERE host_key = ? AND name = ?",
                            (browser['host_key'], name)
                        )
                        row = cursor.fetchone()
                        if row:
                            value, encrypted = row
                            if value:
                                cookies[name] = value
                            elif encrypted:
                                try:
                                    import win32crypt
                                    decrypted = win32crypt.CryptUnprotectData(encrypted, None, None, None, 0)[1].decode('utf-8')
                                    cookies[name] = decrypted
                                except:
                                    pass

                conn.close()

                if 'SESSDATA' in cookies:
                    parts = [f"{k}={v}" for k, v in cookies.items()]
                    full_cookie = '; '.join(parts)
                    print(f"[DEBUG] 成功从 {browser['name']} 提取到 Cookie")
                    return full_cookie

        except Exception as e:
            print(f"[DEBUG] 从 {browser['name']} 提取 Cookie 失败: {e}")
            continue

    return None

def try_login_with_browser() -> bool:
    auto_cookie = get_auto_cookie()
    if auto_cookie:
        set_cookie(auto_cookie)
        print("[INFO] 已自动应用浏览器 Cookie")
        return True
    print("[INFO] 未找到浏览器登录信息，将以游客模式下载")
    return False

def get_mp4_duration(filepath: str) -> Optional[float]:
    try:
        with open(filepath, 'rb') as f:
            data = f.read(1024 * 1024)
            moov_idx = data.find(b'moov')
            if moov_idx == -1:
                f.seek(0, os.SEEK_END)
                fsize = f.tell()
                f.seek(max(0, fsize - 1024 * 1024))
                data = f.read(1024 * 1024)
                moov_idx = data.find(b'moov')
                if moov_idx == -1:
                    return None
            mvhd_idx = data.find(b'mvhd', moov_idx, moov_idx + 1024)
            if mvhd_idx == -1:
                return None
            mvhd_start = mvhd_idx + 8
            version = data[mvhd_start]
            if version == 0:
                timescale = struct.unpack_from('>I', data, mvhd_start + 1 + 3 + 4 + 4)[0]
                duration = struct.unpack_from('>I', data, mvhd_start + 1 + 3 + 4 + 4 + 4)[0]
            elif version == 1:
                timescale = struct.unpack_from('>I', data, mvhd_start + 1 + 3 + 8 + 8)[0]
                duration = struct.unpack_from('>Q', data, mvhd_start + 1 + 3 + 8 + 8 + 4)[0]
            else:
                return None
            if timescale == 0:
                return None
            return duration / timescale
    except Exception as e:
        print(f"[DEBUG] 解析视频时长失败: {e}")
        return None

def download_cover_to_base64(url: str) -> Optional[str]:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        import base64
        b64 = base64.b64encode(resp.content).decode('utf-8')
        content_type = resp.headers.get('Content-Type', 'image/jpeg')
        return f"data:{content_type};base64,{b64}"
    except:
        return None