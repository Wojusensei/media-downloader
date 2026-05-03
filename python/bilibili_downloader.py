"""
B站视频下载器 - Python版 DA☆ZE
功能：输入B站视频链接，自动下载：
      - 视频文件 (.mp4)
      - 音频文件 (.mp3)
      - 视频封面 (.jpg)
保存位置：downloads/视频BV号/ 文件夹内 awa
"""

import requests
import re
import os
import json
import subprocess

# ==================== 配置区 ====================
# 苦苦下载根目录 qwq
DOWNLOAD_ROOT = os.path.join(os.getcwd(), "downloads")

# 伪装成浏览器，防止被网站拒绝访问捏
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://www.bilibili.com/",
}
# ===============================================

def create_folder(bv, title):
    """为每个视频创建专属文件夹，名称为：BV号_标题"""
    safe_title = re.sub(r'[\\/:*?"<>|]', '_', title)
    folder_name = f"{bv}_{safe_title}"
    folder_path = os.path.join(DOWNLOAD_ROOT, folder_name)
    
    if not os.path.exists(folder_path):
        os.makedirs(folder_path)
        print(f"[OK] 已创建下载文件夹: {folder_name} awa")
    
    return folder_path

def extract_bv_number(url):
    """从B站链接中提取 BV 号 DA☆ZE"""
    result = re.search(r'BV[a-zA-Z0-9]{10}', url)
    if result:
        return result.group(0)
    return None

def get_video_info(bv):
    """通过B站API获取视频标题、cid和封面地址~~"""
    api_url = f"https://api.bilibili.com/x/web-interface/view?bvid={bv}"
    resp = requests.get(api_url, headers=HEADERS)
    data = resp.json()
    
    if data["code"] != 0:
        raise Exception(f"获取视频信息失败qwq: {data['message']} qwq")
    
    title = data["data"]["title"]
    cid = data["data"]["cid"]
    cover_url = data["data"]["pic"]  # 封面图片地址 DA☆ZE
    
    return title, cid, cover_url

def get_download_urls(bv, cid):
    """获取视频和音频的下载地址 awa"""
    api_url = "https://api.bilibili.com/x/player/playurl"
    params = {
        "bvid": bv,
        "cid": cid,
        "qn": 80,       # 画质：80=1080P DA☆ZE
        "fnval": 16,     # 16=获取DASH流（视频和音频分离）
    }
    resp = requests.get(api_url, params=params, headers=HEADERS)
    data = resp.json()
    
    if data["code"] != 0:
        raise Exception(f"获取下载地址失败: {data['message']} awa")
    
    # 从DASH流中提取最高画质视频和最高音质音频呐呐
    dash = data["data"]["dash"]
    
    # 挑最好的视频流（第一个就是最高画质）DA☆ZE
    video_url = dash["video"][0]["baseUrl"]
    
    # 挑最好的音频流呐呐
    audio_url = dash["audio"][0]["baseUrl"]
    
    return video_url, audio_url

def download_file(url, file_path, file_type):
    """下载文件并显示进度条~~"""
    print(f"[下载] {file_type} 文件中... awa")
    
    resp = requests.get(url, headers=HEADERS, stream=True)
    total_size = int(resp.headers.get('content-length', 0))
    downloaded = 0
    
    with open(file_path, 'wb') as f:
        for chunk in resp.iter_content(chunk_size=1024 * 1024):
            if chunk:
                f.write(chunk)
                downloaded += len(chunk)
                if total_size > 0:
                    percent = downloaded / total_size * 100
                    mb_done = downloaded / (1024 * 1024)
                    mb_total = total_size / (1024 * 1024)
                    print(f"\r  进度: {percent:.1f}% ({mb_done:.1f}MB / {mb_total:.1f}MB)", end="")
    
    print()
    print(f"[完成] {file_type} 保存成功 DA☆ZE")
    return file_path

def merge_video_audio(video_path, audio_path, output_path):
    """用 ffmpeg 合并视频和音频（如果电脑有 ffmpeg 的话）~~"""
    try:
        print("[合并] 正在合并视频和音频... awa")
        cmd = [
            "ffmpeg", "-i", video_path, "-i", audio_path,
            "-c:v", "copy", "-c:a", "aac", "-strict", "experimental",
            output_path, "-y"
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        print(f"[完成] 合并成功！已保存到: {output_path} DA☆ZE")
        
        # 删除临时文件 qwq
        os.remove(video_path)
        os.remove(audio_path)
        print("[清理] 已删除临时文件 awa")
        
        return output_path
    except FileNotFoundError:
        print("[提示] 未检测到 ffmpeg，视频和音频将分开保存 qwq")
        print(f"       视频文件: {video_path}")
        print(f"       音频文件: {audio_path}")
        return video_path
    except Exception as e:
        print(f"[警告] 合并失败: {e} ")
        print(f"       视频和音频已分开保存 ")
        return video_path

# ==================== 主程序 ====================
def main():
    print("=" * 55)
    print("    B站视频下载器 v2.0 (Python) DA☆ZE")
    print("    下载内容: 视频 + 音频 + 封面 awa")
    print("=" * 55)
    print()
    
    # 确保根下载目录存在 qwq
    if not os.path.exists(DOWNLOAD_ROOT):
        os.makedirs(DOWNLOAD_ROOT)
    
    # 获取用户输入 DA☆ZE
    url = input("请输入B站视频链接: ").strip()
    print()
    
    try:
        # 步骤1: 提取BV号 awa
        print("[1/5] 正在识别视频链接... ")
        bv = extract_bv_number(url)
        if not bv:
            print("[失败] 无法识别B站链接！qwq")
            print("       正确格式: https://www.bilibili.com/video/BV1xx411c7mD")
            return
        print(f"       BV号: {bv} DA☆ZE")
        
        # 步骤2: 获取视频信息
        print("[2/5] 正在获取视频信息... ")
        title, cid, cover_url = get_video_info(bv)
        print(f"       标题: {title} ")
        print(f"       封面: 已获取 DA☆ZE")
        
        # 步骤3: 创建专属文件夹
        print("[3/5] 正在创建下载文件夹... ")
        folder = create_folder(bv, title)
        
        # 步骤4: 下载封面
        print("[4/5] 正在下载封面... awa")
        cover_path = os.path.join(folder, "cover.jpg")
        download_file(cover_url, cover_path, "封面")
        
        # 步骤5: 获取视频和音频地址
        print("[5/5] 正在获取视频和音频地址... DA☆ZE")
        video_url, audio_url = get_download_urls(bv, cid)
        
        # 下载视频流
        video_path = os.path.join(folder, "video_only.mp4")
        download_file(video_url, video_path, "视频流")
        
        # 下载音频流
        audio_path = os.path.join(folder, "audio_only.mp3")
        download_file(audio_url, audio_path, "音频流")
        
        # 尝试合并
        final_path = os.path.join(folder, f"{title}.mp4")
        final_path = re.sub(r'[\\/:*?"<>|]', '_', final_path)
        merge_video_audio(video_path, audio_path, final_path)
        
        print()
        print("=" * 55)
        print("    🎉 全部下载完成！DA☆ZE")
        print(f"    📁 文件夹: {folder}")
        print("    📦 包含文件:")
        print(f"       - cover.jpg (封面) awa")
        print(f"       - video_only.mp4 (纯视频) qwq")
        print(f"       - audio_only.mp3 (纯音频) DA☆ZE")
        print(f"       - {os.path.basename(final_path)} (合并版) awa")
        print("=" * 55)
        
    except Exception as e:
        print(f"\n[错误] {e} qwq")
        print("\n可能的原因: ")
        print("  - 视频需要登录才能访问")
        print("  - 网络连接不稳定")
        print("  - B站API暂时抽风 DA☆ZE，绝对不是我们的问题哦")

if __name__ == "__main__":
    main()