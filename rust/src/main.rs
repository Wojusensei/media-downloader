// B站视频下载器 - Rust版 DA☆ZE
// 功能：输入B站视频链接，自动下载：
//       - 视频文件 (.mp4)
//       - 音频文件 (.mp3)
//       - 视频封面 (.jpg) awa
//       - 有 ffmpeg 时自动合并成完整 mp4 捏
// 保存位置：downloads/视频BV号_标题/ 文件夹内 呐呐
//
// 运行方法（在仓库根目录）：
//   cargo run --release --manifest-path rust/Cargo.toml
//
// 依赖：Rust 工具链；ffmpeg 可选，没装的话视频流和音频流分开保存 qwq

use serde::Deserialize;
use std::fs::{self, File};
use std::io::{self, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

// 下载根目录 DA☆ZE
const DOWNLOAD_ROOT: &str = "downloads";

// 伪装成浏览器，防止被拒绝访问 awa
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const REFERER: &str = "https://www.bilibili.com/";

// B站API返回的视频信息 呐呐
#[derive(Deserialize)]
struct BiliVideoInfo {
    code: i64,
    #[serde(default)]
    message: String,
    data: Option<VideoData>,
}

#[derive(Deserialize)]
struct VideoData {
    title: String,
    cid: i64,
    pic: String,
}

// B站API返回的播放地址（DASH流）awa
// 注意：音频流的地址字段同样叫 baseUrl
// （隔壁 Go 版把音频字段写成了 audioUrl，MP3 一直下不下来，就是 README 里那个修不好的 bug qwq）
#[derive(Deserialize)]
struct BiliPlayUrl {
    code: i64,
    #[serde(default)]
    message: String,
    data: Option<PlayData>,
}

#[derive(Deserialize)]
struct PlayData {
    dash: Option<Dash>,
}

#[derive(Deserialize)]
struct Dash {
    #[serde(default)]
    video: Vec<Stream>,
    #[serde(default)]
    audio: Vec<Stream>,
}

#[derive(Deserialize)]
struct Stream {
    #[serde(rename = "baseUrl", default)]
    base_url: String,
}

fn main() {
    println!("{}", "=".repeat(55));
    println!("    B站视频下载器 v1.0 (Rust) DA☆ZE");
    println!("    下载内容: 视频 + 音频 + 封面 awa");
    println!("{}", "=".repeat(55));
    println!();

    if let Err(e) = run() {
        println!("\n[错误] {e} qwq");
        println!("\n可能的原因: ");
        println!("  - 视频需要登录才能访问");
        println!("  - 网络连接不稳定");
        println!("  - B站API暂时抽风 DA☆ZE，绝对不是我们的问题哦");
        std::process::exit(1);
    }
}

fn run() -> Result<(), String> {
    // 确保下载根目录存在 捏
    fs::create_dir_all(DOWNLOAD_ROOT).map_err(|e| format!("创建下载目录失败: {e}"))?;

    // 用户输入地址 呐呐
    print!("请输入B站视频链接: ");
    let _ = io::stdout().flush();
    let url = read_input();
    println!();

    // 步骤1: 提取BV号 DA☆ZE
    println!("[1/5] 正在识别视频链接...");
    let Some(bv) = extract_bv(&url) else {
        println!("[失败] 无法识别B站链接！qwq");
        println!("       正确格式: https://www.bilibili.com/video/BV1xx411c7mD");
        return Ok(());
    };
    println!("       BV号: {bv} DA☆ZE");

    // 步骤2: 获取视频信息 awa
    println!("[2/5] 正在获取视频信息...");
    let (title, cid, cover_url) = get_video_info(&bv)?;
    println!("       标题: {title}");
    println!("       封面: 已获取 捏");

    // 步骤3: 创建专属文件夹 呐呐
    println!("[3/5] 正在创建下载文件夹...");
    let safe_title = sanitize_title(&title);
    let folder = create_folder(&bv, &safe_title)?;
    println!(
        "       文件夹: {} DA☆ZE",
        folder.file_name().unwrap_or_default().to_string_lossy()
    );

    // 步骤4: 下载封面 awa
    println!("[4/5] 正在下载封面...");
    let cover_path = folder.join("cover.jpg");
    download_file(&cover_url, &cover_path, "封面")?;

    // 步骤5: 获取视频和音频地址并下载 DA☆ZE
    println!("[5/5] 正在获取视频和音频地址...");
    let (video_url, audio_url) = get_download_urls(&bv, cid)?;

    let video_path = folder.join("video_only.mp4");
    download_file(&video_url, &video_path, "视频流")?;

    let audio_path = folder.join("audio_only.mp3");
    download_file(&audio_url, &audio_path, "音频流")?;

    // 尝试用 ffmpeg 合并（没装就分开保存 qwq）
    let output_path = folder.join(format!("{safe_title}.mp4"));
    let merged = merge_video_audio(&video_path, &audio_path, &output_path);

    // 下载完成！DA☆ZE
    println!();
    println!("{}", "=".repeat(55));
    println!("    🎉 全部下载完成！DA☆ZE");
    println!("    📁 文件夹: {}", folder.display());
    println!("    📦 包含文件: 捏");
    println!("       - cover.jpg (封面) awa");
    if merged {
        println!(
            "       - {} (合并版) awa",
            output_path.file_name().unwrap_or_default().to_string_lossy()
        );
    } else {
        println!("       - video_only.mp4 (纯视频)");
        println!("       - audio_only.mp3 (纯音频) 呐呐");
    }
    println!("{}", "=".repeat(55));
    Ok(())
}

// read_input 读一行用户输入并去掉首尾空白 呐呐
fn read_input() -> String {
    let mut line = String::new();
    let _ = io::stdin().read_line(&mut line);
    line.trim().to_string()
}

// extract_bv 从B站链接中提取 BV 号 DA☆ZE
// 等价于正则 BV[a-zA-Z0-9]{10}，取第一处匹配，就不用多拉一个 regex 依赖了
fn extract_bv(url: &str) -> Option<String> {
    let bytes = url.as_bytes();
    let pos = bytes.windows(12).position(|w| {
        w[0] == b'B' && w[1] == b'V' && w[2..].iter().all(|c| c.is_ascii_alphanumeric())
    })?;
    Some(url[pos..pos + 12].to_string())
}

// sanitize_title 把标题里的非法文件名字符替换成下划线 捏
fn sanitize_title(title: &str) -> String {
    title
        .chars()
        .map(|c| if "\\/:*?\"<>|".contains(c) { '_' } else { c })
        .collect()
}

// get_video_info 通过B站API获取视频标题、cid和封面地址 awa
fn get_video_info(bv: &str) -> Result<(String, i64, String), String> {
    let api_url = format!("https://api.bilibili.com/x/web-interface/view?bvid={bv}");
    let info: BiliVideoInfo = http_get_json(&api_url)?;

    if info.code != 0 {
        return Err(format!("获取视频信息失败: {}", info.message));
    }
    let data = info.data.ok_or("获取视频信息失败: 返回数据为空")?;
    Ok((data.title, data.cid, data.pic))
}

// get_download_urls 获取视频和音频的DASH流地址 捏
fn get_download_urls(bv: &str, cid: i64) -> Result<(String, String), String> {
    let api_url = format!(
        "https://api.bilibili.com/x/player/playurl?bvid={bv}&cid={cid}&qn=80&fnval=16"
    );
    let play: BiliPlayUrl = http_get_json(&api_url)?;

    if play.code != 0 {
        return Err(format!("获取下载地址失败: {}", play.message));
    }

    let dash = play
        .data
        .and_then(|d| d.dash)
        .ok_or("该视频可能不支持DASH流下载 qwq")?;

    match (dash.video.first(), dash.audio.first()) {
        (Some(v), Some(a)) if !v.base_url.is_empty() && !a.base_url.is_empty() => {
            Ok((v.base_url.clone(), a.base_url.clone()))
        }
        _ => Err("该视频可能不支持DASH流下载 qwq".to_string()),
    }
}

// create_folder 为每个视频创建专属文件夹 呐呐
fn create_folder(bv: &str, safe_title: &str) -> Result<PathBuf, String> {
    let folder_path = Path::new(DOWNLOAD_ROOT).join(format!("{bv}_{safe_title}"));
    fs::create_dir_all(&folder_path).map_err(|e| format!("创建文件夹失败: {e}"))?;
    Ok(folder_path)
}

// http_get_json 带浏览器头的 GET 请求，返回解析好的 JSON awa
fn http_get_json<T: serde::de::DeserializeOwned>(url: &str) -> Result<T, String> {
    let resp = ureq::get(url)
        .set("User-Agent", USER_AGENT)
        .set("Referer", REFERER)
        .timeout(Duration::from_secs(30))
        .call()
        .map_err(|e| format!("请求失败: {e}"))?;

    resp.into_json::<T>()
        .map_err(|e| format!("解析响应失败: {e}"))
}

// download_file 下载文件并显示进度条 DA☆ZE
fn download_file(url: &str, file_path: &Path, file_type: &str) -> Result<(), String> {
    println!("[下载] {file_type} 文件中... 捏");

    let resp = ureq::get(url)
        .set("User-Agent", USER_AGENT)
        .set("Referer", REFERER) // 必须带这个才能下载视频流 awa
        .timeout(Duration::from_secs(60 * 60))
        .call()
        .map_err(|e| format!("下载失败: {e}"))?;

    let total_size: u64 = resp
        .header("Content-Length")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);

    let file = File::create(file_path).map_err(|e| format!("创建文件失败: {e}"))?;
    let mut writer = BufWriter::new(file);
    let mut reader = resp.into_reader();

    let mut buf = vec![0u8; 1024 * 1024]; // 每次读1MB DA☆ZE
    let mut downloaded: u64 = 0;

    loop {
        let n = reader
            .read(&mut buf)
            .map_err(|e| format!("读取数据失败: {e}"))?;
        if n == 0 {
            break;
        }
        writer
            .write_all(&buf[..n])
            .map_err(|e| format!("写入文件失败: {e}"))?;
        downloaded += n as u64;

        if total_size > 0 {
            let percent = downloaded as f64 / total_size as f64 * 100.0;
            print!(
                "\r  进度: {percent:.1}% ({:.1}MB / {:.1}MB)",
                downloaded as f64 / (1024.0 * 1024.0),
                total_size as f64 / (1024.0 * 1024.0)
            );
            let _ = io::stdout().flush();
        }
    }
    writer.flush().map_err(|e| format!("写入文件失败: {e}"))?;

    println!();
    println!("[完成] {file_type} 保存成功 DA☆ZE");
    Ok(())
}

// has_ffmpeg 探测电脑上有没有 ffmpeg 呐呐
fn has_ffmpeg() -> bool {
    Command::new("ffmpeg")
        .arg("-version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

// merge_video_audio 用 ffmpeg 把视频流和音频流合并成完整 mp4（如果电脑有 ffmpeg 的话）~~
// 返回 true 表示合并成功（此时临时文件已删除）
fn merge_video_audio(video_path: &Path, audio_path: &Path, output_path: &Path) -> bool {
    if !has_ffmpeg() {
        println!("[提示] 未检测到 ffmpeg，视频和音频将分开保存 qwq");
        println!("       视频文件: {}", video_path.display());
        println!("       音频文件: {}", audio_path.display());
        return false;
    }

    println!("[合并] 正在合并视频和音频... awa");
    let video = video_path.to_string_lossy().to_string();
    let audio = audio_path.to_string_lossy().to_string();
    let output = output_path.to_string_lossy().to_string();

    let result = Command::new("ffmpeg")
        .args([
            "-y",
            "-i", &video,
            "-i", &audio,
            "-c:v", "copy",
            "-c:a", "aac",
            "-strict", "experimental",
            &output,
        ])
        .output();

    match result {
        Ok(o) if o.status.success() => {
            println!("[完成] 合并成功！已保存到: {} DA☆ZE", output_path.display());

            // 删除临时文件 qwq
            let _ = fs::remove_file(video_path);
            let _ = fs::remove_file(audio_path);
            println!("[清理] 已删除临时文件 awa");
            true
        }
        Ok(o) => {
            let reason = String::from_utf8_lossy(&o.stderr)
                .lines()
                .last()
                .unwrap_or("未知错误")
                .to_string();
            println!("[警告] 合并失败: {reason}");
            println!("       视频和音频已分开保存");
            false
        }
        Err(e) => {
            println!("[警告] 合并失败: {e}");
            println!("       视频和音频已分开保存");
            false
        }
    }
}
