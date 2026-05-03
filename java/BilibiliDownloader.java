/**
 * B站视频下载器 - Java版
 * 下载内容：视频(.mp4) + 音频(.mp3) + 封面(.jpg)
 * 保存位置：downloads/BV号_标题/  一w一
 *
 * 编译：javac -encoding UTF-8 java/BilibiliDownloader.java
 * 运行：java -cp java BilibiliDownloader
 */

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Scanner;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class BilibiliDownloader {

    private static final String DOWNLOAD_ROOT = "downloads";
    private static final String USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

    /**
     * 从网址中提取BV号 一w一
     */
    private static String extractBV(String url) {
        Pattern pattern = Pattern.compile("BV[a-zA-Z0-9]{10}");
        Matcher matcher = pattern.matcher(url);
        return matcher.find() ? matcher.group() : null;
    }

    /**
     * 发送GET请求，返回响应字符串
     */
    private static String httpGet(String urlStr) throws Exception {
        // 修复URL中的转义字符 一w一
        urlStr = urlStr.replace("\\u0026", "&");

        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        conn.setRequestProperty("User-Agent", USER_AGENT);
        conn.setRequestProperty("Referer", "https://www.bilibili.com/");
        conn.setConnectTimeout(30000);
        conn.setReadTimeout(30000);
        conn.setInstanceFollowRedirects(false);

        int status = conn.getResponseCode();
        if (status == 301 || status == 302) {
            String location = conn.getHeaderField("Location");
            conn.disconnect();
            if (location != null) {
                return httpGet(location);
            }
        }

        BufferedReader reader = new BufferedReader(
            new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8)
        );
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            sb.append(line);
        }
        reader.close();
        conn.disconnect();
        return sb.toString();
    }

    /**
     * 获取视频信息 一w一
     */
    private static VideoInfo getVideoInfo(String bv) throws Exception {
        String apiUrl = "https://api.bilibili.com/x/web-interface/view?bvid=" + bv;
        String json = httpGet(apiUrl);

        String title = extractJsonString(json, "\"title\":\"", "\"");
        String pic = extractJsonString(json, "\"pic\":\"", "\"");
        long cid = extractJsonLong(json, "\"cid\":");

        if (title == null) {
            System.out.println("[错误] 获取视频信息失败");
            System.exit(1);
        }

        return new VideoInfo(title, cid, pic);
    }

    /**
     * 获取DASH流下载地址 一w一
     */
    private static DownloadUrls getDownloadUrls(String bv, long cid) throws Exception {
        String apiUrl = "https://api.bilibili.com/x/player/playurl?bvid=" + bv
            + "&cid=" + cid + "&qn=80&fnval=16";
        String json = httpGet(apiUrl);

        String videoUrl = extractJsonStringAfterKey(json, "\"video\":[", "\"baseUrl\":\"", "\"");
        String audioUrl = extractJsonStringAfterKey(json, "\"audio\":[", "\"baseUrl\":\"", "\"");

        if (videoUrl == null || audioUrl == null) {
            System.out.println("[错误] 获取下载地址失败");
            System.exit(1);
        }

        // 修复转义字符
        videoUrl = videoUrl.replace("\\u0026", "&");
        audioUrl = audioUrl.replace("\\u0026", "&");

        return new DownloadUrls(videoUrl, audioUrl);
    }

    /**
     * 创建文件夹 一w一
     */
    private static String createFolder(String bv, String title) {
        String safeTitle = title.replaceAll("[\\\\/:*?\"<>|]", "_");
        String folderName = bv + "_" + safeTitle;
        File folder = new File(DOWNLOAD_ROOT, folderName);
        if (!folder.exists()) {
            folder.mkdirs();
        }
        return folder.getAbsolutePath();
    }

    /**
     * 下载文件并显示进度 一w一
     */
    private static void downloadFile(String urlStr, String filePath, String fileType) throws Exception {
        System.out.printf("[%s] 下载中...\n", fileType);

        // 修复URL中的转义字符
        urlStr = urlStr.replace("\\u0026", "&");

        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("GET");
        conn.setRequestProperty("User-Agent", USER_AGENT);
        conn.setRequestProperty("Referer", "https://www.bilibili.com/");
        conn.setConnectTimeout(60000);
        conn.setReadTimeout(60000);
        conn.setInstanceFollowRedirects(false);

        int status = conn.getResponseCode();
        if (status == 301 || status == 302) {
            String location = conn.getHeaderField("Location");
            conn.disconnect();
            if (location != null) {
                downloadFile(location, filePath, fileType);
            }
            return;
        }

        long totalSize = conn.getContentLengthLong();
        InputStream in = conn.getInputStream();
        FileOutputStream out = new FileOutputStream(filePath);

        byte[] buffer = new byte[1024 * 1024];
        int bytesRead;
        long downloaded = 0;

        while ((bytesRead = in.read(buffer)) != -1) {
            out.write(buffer, 0, bytesRead);
            downloaded += bytesRead;

            if (totalSize > 0) {
                double percent = (double) downloaded / totalSize * 100;
                double mbDone = (double) downloaded / (1024 * 1024);
                double mbTotal = (double) totalSize / (1024 * 1024);
                System.out.printf("\r[%s] %.1f%% (%.1fMB / %.1fMB)", fileType, percent, mbDone, mbTotal);
            }
        }

        out.close();
        in.close();
        conn.disconnect();

        System.out.printf("\n[%s] 完成\n", fileType);
    }

    // ==================== JSON解析 一w一 ====================

    private static String extractJsonString(String json, String key, String endDelim) {
        int keyIndex = json.indexOf(key);
        if (keyIndex == -1) return null;
        int start = keyIndex + key.length();
        int end = json.indexOf(endDelim, start);
        if (end == -1) return null;
        return json.substring(start, end);
    }

    private static String extractJsonStringAfterKey(String json, String after, String key, String endDelim) {
        int afterIndex = json.indexOf(after);
        if (afterIndex == -1) return null;
        int keyIndex = json.indexOf(key, afterIndex + after.length());
        if (keyIndex == -1) return null;
        int start = keyIndex + key.length();
        int end = json.indexOf(endDelim, start);
        if (end == -1) return null;
        return json.substring(start, end);
    }

    private static long extractJsonLong(String json, String key) {
        int keyIndex = json.indexOf(key);
        if (keyIndex == -1) return 0;
        int start = keyIndex + key.length();
        int end = start;
        while (end < json.length() && Character.isDigit(json.charAt(end))) {
            end++;
        }
        if (end == start) return 0;
        return Long.parseLong(json.substring(start, end));
    }

    // ==================== 数据类 ====================

    static class VideoInfo {
        String title;
        long cid;
        String coverUrl;
        VideoInfo(String title, long cid, String coverUrl) {
            this.title = title;
            this.cid = cid;
            this.coverUrl = coverUrl;
        }
    }

    static class DownloadUrls {
        String videoUrl;
        String audioUrl;
        DownloadUrls(String videoUrl, String audioUrl) {
            this.videoUrl = videoUrl;
            this.audioUrl = audioUrl;
        }
    }

    // ==================== 主程序 ====================

    public static void main(String[] args) {
        System.out.println("=".repeat(55));
        System.out.println("    B站视频下载器 v1.0 (Java)");
        System.out.println("=".repeat(55));
        System.out.println();

        File downloadDir = new File(DOWNLOAD_ROOT);
        if (!downloadDir.exists()) {
            downloadDir.mkdirs();
        }

        Scanner scanner = new Scanner(System.in, StandardCharsets.UTF_8);
        System.out.print("请输入B站视频链接: ");
        String url = scanner.nextLine().trim();
        scanner.close();
        System.out.println();

        try {
            String bv = extractBV(url);
            if (bv == null) {
                System.out.println("[失败] 无法识别B站链接");
                return;
            }
            System.out.printf("BV号: %s\n", bv);

            System.out.println("正在获取视频信息...");
            VideoInfo info = getVideoInfo(bv);
            System.out.printf("标题: %s\n", info.title);

            String folder = createFolder(bv, info.title);

            System.out.println("正在下载封面...");
            downloadFile(info.coverUrl, folder + File.separator + "cover.jpg", "封面");

            System.out.println("正在获取下载地址...");
            DownloadUrls urls = getDownloadUrls(bv, info.cid);

            downloadFile(urls.videoUrl, folder + File.separator + "video_only.mp4", "视频流");
            downloadFile(urls.audioUrl, folder + File.separator + "audio_only.mp3", "音频流");

            System.out.println();
            System.out.println("=".repeat(55));
            System.out.println("    下载完成 DA☆ZE");
            System.out.printf("    文件夹: %s\n", folder);
            System.out.println("       cover.jpg");
            System.out.println("       video_only.mp4");
            System.out.println("       audio_only.mp3");
            System.out.println("=".repeat(55));

        } catch (Exception e) {
            System.out.println("[错误] " + e.getMessage());
        }
    }
}