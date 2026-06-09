import requests
import re
import os
import json
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
    # 尝试 DASH 流
    api = "https://api.bilibili.com/x/player/playurl"
    params = {"bvid": bv, "cid": cid, "qn": qn, "fnval": 16}
    r = requests.get(api, params=params, headers=HEADERS, timeout=30)
    data = r.json()
    if data["code"] == 0:
        dash = data["data"].get("dash")
        if dash and dash.get("video") and dash.get("audio"):
            video_url = dash["video"][0]["baseUrl"]
            audio_url = dash["audio"][0]["baseUrl"]
            return video_url, audio_url, False

    # 回退传统流
    params["fnval"] = 1
    r = requests.get(api, params=params, headers=HEADERS, timeout=30)
    data = r.json()
    if data["code"] == 0:
        durl = data["data"].get("durl")
        if durl and len(durl) > 0:
            video_url = durl[0]["url"]
            return video_url, video_url, True

    raise Exception(f"获取下载地址失败 (错误码 {data.get('code', '未知')}): {data.get('message', '无详细错误信息')}")

def download_file(url, path, progress_callback=None):
    """下载文件，支持进度回调"""
    resp = requests.get(url, headers=HEADERS, stream=True, timeout=60)
    total = int(resp.headers.get('content-length', 0))
    downloaded = 0
    with open(path, 'wb') as f:
        for chunk in resp.iter_content(1024*1024):
            if chunk:
                f.write(chunk)
                downloaded += len(chunk)
                if progress_callback and total > 0:
                    progress_callback(downloaded, total)
    if progress_callback and total == 0:
        progress_callback(1, 1)  # 文件大小为0时直接显示完成

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
    """
    从 Edge 和 Chrome 的本地存储中提取 B站 Cookie。
    使用更稳定的方法：直接读取浏览器加密存储的 Cookies 文件，
    然后用 Windows DPAPI 解密（仅限 Windows 系统）。
    如果解密失败，回退到手动解析未加密的 Cookie。
    """
    import platform
    import subprocess
    import tempfile
    import shutil
    import sqlite3

    if platform.system() != "Windows":
        return None

    browsers = [
        {
            'name': 'Edge',
            'paths': [
                os.path.join(os.getenv('LOCALAPPDATA', ''),
                             'Microsoft', 'Edge', 'User Data', 'Default', 'Network', 'Cookies'),
                os.path.join(os.getenv('LOCALAPPDATA', ''),
                             'Microsoft', 'Edge', 'User Data', 'Profile 1', 'Network', 'Cookies'),
            ]
        },
        {
            'name': 'Chrome',
            'paths': [
                os.path.join(os.getenv('LOCALAPPDATA', ''),
                             'Google', 'Chrome', 'User Data', 'Default', 'Network', 'Cookies'),
                os.path.join(os.getenv('LOCALAPPDATA', ''),
                             'Google', 'Chrome', 'User Data', 'Profile 1', 'Network', 'Cookies'),
            ]
        }
    ]

    for browser in browsers:
        for cookie_path in browser['paths']:
            if not os.path.exists(cookie_path):
                continue
            try:
                with tempfile.TemporaryDirectory() as tmpdir:
                    dest = os.path.join(tmpdir, 'cookies.db')
                    shutil.copy2(cookie_path, dest)

                    conn = sqlite3.connect(f'file:{dest}?immutable=1', uri=True)
                    cursor = conn.cursor()

                    # 查询所有必要的 Cookie
                    cookies = {}
                    for name in ['SESSDATA', 'bili_jct', 'DedeUserID', 'buvid3']:
                        cursor.execute(
                            "SELECT value, encrypted_value FROM cookies WHERE host_key LIKE '%bilibili.com' AND name = ?",
                            (name,)
                        )
                        row = cursor.fetchone()
                        if row:
                            value, encrypted = row
                            if value:
                                cookies[name] = value
                            elif encrypted:
                                # 尝试用 Windows DPAPI 解密
                                try:
                                    import win32crypt
                                    decrypted = win32crypt.CryptUnprotectData(encrypted, None, None, None, 0)[1].decode('utf-8')
                                    cookies[name] = decrypted
                                except:
                                    pass

                    conn.close()

                    if 'SESSDATA' in cookies:
                        cookie_parts = [f"{k}={v}" for k, v in cookies.items()]
                        return '; '.join(cookie_parts)
            except Exception as e:
                print(f"[DEBUG] Cookie extraction error for {browser['name']}: {e}")
                continue

    return None

def try_login_with_browser() -> bool:
    auto_cookie = get_auto_cookie()
    if auto_cookie:
        set_cookie(auto_cookie)
        return True
    return False