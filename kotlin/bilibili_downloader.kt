/**
 * B站视频下载器 - Kotlin版 DA☆ZE
 * 功能：输入B站视频链接，自动下载：
 *       - 视频文件 (.mp4)
 *       - 音频文件 (.mp3)
 *       - 视频封面 (.jpg) awa
 *       - 有 ffmpeg 时自动合并成完整 mp4 捏
 * 保存位置：downloads/视频BV号_标题/ 文件夹内 呐呐
 *
 * 编译：kotlinc kotlin/bilibili_downloader.kt -include-runtime -d kotlin/bilibili_downloader.jar
 * 运行：java -jar kotlin/bilibili_downloader.jar
 *
 * 依赖：JDK 11+ 与 Kotlin 编译器；ffmpeg 可选，没装的话视频流和音频流分开保存 qwq
 */

import java.io.InputStream
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.time.Duration
import kotlin.system.exitProcess

// 下载根目录 DA☆ZE
private const val DOWNLOAD_ROOT = "downloads"

// 伪装成浏览器，防止被拒绝访问 awa
private const val USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
private const val REFERER = "https://www.bilibili.com/"

// 复用同一个 HttpClient，自动跟随重定向 捏
private val client: HttpClient = HttpClient.newBuilder()
    .followRedirects(HttpClient.Redirect.NORMAL)
    .connectTimeout(Duration.ofSeconds(30))
    .build()

/**
 * 从B站链接中提取 BV 号 DA☆ZE
 */
private fun extractBV(url: String): String? =
    Regex("BV[a-zA-Z0-9]{10}").find(url)?.value

/**
 * 把标题里的非法文件名字符替换成下划线 呐呐
 */
private fun sanitizeTitle(title: String): String =
    title.replace(Regex("[\\\\/:*?\"<>|]"), "_")

/**
 * 从 JSON 文本里抠出字符串字段（演示用，不拉第三方 JSON 库 awa）
 */
private fun jsonString(json: String, key: String): String? =
    Regex("\"$key\":\"(.*?)\"").find(json)?.groupValues?.get(1)

/**
 * 从 JSON 文本里抠出整数字段 捏
 */
private fun jsonLong(json: String, key: String): Long? =
    Regex("\"$key\":(\\d+)").find(json)?.groupValues?.get(1)?.toLong()

/**
 * 发送GET请求，返回响应文本 awa
 */
private fun httpGet(url: String): String {
    val request = HttpRequest.newBuilder(URI.create(url))
        .header("User-Agent", USER_AGENT)
        .header("Referer", REFERER)
        .timeout(Duration.ofSeconds(30))
        .GET()
        .build()

    val response = client.send(request, HttpResponse.BodyHandlers.ofString(Charsets.UTF_8))
    if (response.statusCode() !in 200..299) {
        throw RuntimeException("请求失败: HTTP ${response.statusCode()}")
    }
    return response.body()
}

/**
 * B站API返回的视频信息 呐呐
 */
private data class VideoInfo(val title: String, val cid: Long, val coverUrl: String)

/**
 * 通过B站API获取视频标题、cid和封面地址 awa
 */
private fun getVideoInfo(bv: String): VideoInfo {
    val json = httpGet("https://api.bilibili.com/x/web-interface/view?bvid=$bv")

    if (jsonLong(json, "code") != 0L) {
        throw RuntimeException("获取视频信息失败: ${jsonString(json, "message") ?: "未知错误"}")
    }

    val title = jsonString(json, "title") ?: throw RuntimeException("获取视频信息失败: 标题为空")
    val cid = jsonLong(json, "cid") ?: throw RuntimeException("获取视频信息失败: cid 为空")
    val coverUrl = jsonString(json, "pic") ?: ""
    return VideoInfo(title, cid, coverUrl)
}

/**
 * 在指定区段后找第一个 baseUrl awa
 * 注意：音频流的地址字段同样是 baseUrl，不是 audioUrl 哦 捏
 */
private fun baseUrlAfter(json: String, section: String): String? {
    val sectionIndex = json.indexOf(section)
    if (sectionIndex < 0) return null
    val key = "\"baseUrl\":\""
    val keyIndex = json.indexOf(key, sectionIndex + section.length)
    if (keyIndex < 0) return null
    val start = keyIndex + key.length
    val end = json.indexOf('"', start)
    if (end < 0) return null
    return json.substring(start, end).replace("\\u0026", "&")
}

/**
 * B站API返回的播放地址（DASH流）DA☆ZE
 */
private data class DownloadUrls(val videoUrl: String, val audioUrl: String)

/**
 * 获取视频和音频的DASH流地址 吶
 */
private fun getDownloadUrls(bv: String, cid: Long): DownloadUrls {
    val json = httpGet("https://api.bilibili.com/x/player/playurl?bvid=$bv&cid=$cid&qn=80&fnval=16")

    if (jsonLong(json, "code") != 0L) {
        throw RuntimeException("获取下载地址失败: ${jsonString(json, "message") ?: "未知错误"}")
    }

    val videoUrl = baseUrlAfter(json, "\"video\":[")
        ?: throw RuntimeException("该视频可能不支持DASH流下载 qwq")
    val audioUrl = baseUrlAfter(json, "\"audio\":[")
        ?: throw RuntimeException("该视频可能不支持DASH流下载 qwq")
    return DownloadUrls(videoUrl, audioUrl)
}

/**
 * 为每个视频创建专属文件夹 呐呐
 */
private fun createFolder(bv: String, title: String): Path {
    val folder = Paths.get(DOWNLOAD_ROOT, "${bv}_${sanitizeTitle(title)}")
    Files.createDirectories(folder)
    return folder
}

/**
 * 下载文件并显示进度条 DA☆ZE
 */
private fun downloadFile(url: String, filePath: Path, fileType: String) {
    println("[下载] $fileType 文件中... 捏")

    val request = HttpRequest.newBuilder(URI.create(url))
        .header("User-Agent", USER_AGENT)
        .header("Referer", REFERER) // 必须带这个才能下载视频流 awa
        .timeout(Duration.ofSeconds(30))
        .GET()
        .build()

    val response = client.send(request, HttpResponse.BodyHandlers.ofInputStream())
    if (response.statusCode() !in 200..299) {
        throw RuntimeException("下载失败: HTTP ${response.statusCode()}")
    }

    val totalSize = response.headers().firstValueAsLong("content-length").orElse(0)
    var downloaded = 0L

    response.body().use { input: InputStream ->
        Files.newOutputStream(filePath).use { output ->
            val buffer = ByteArray(1024 * 1024) // 每次读1MB DA☆ZE
            while (true) {
                val n = input.read(buffer)
                if (n <= 0) break
                output.write(buffer, 0, n)
                downloaded += n

                if (totalSize > 0) {
                    val percent = downloaded.toDouble() / totalSize * 100
                    val mbDone = downloaded.toDouble() / (1024 * 1024)
                    val mbTotal = totalSize.toDouble() / (1024 * 1024)
                    print("\r  进度: %.1f%% (%.1fMB / %.1fMB)".format(percent, mbDone, mbTotal))
                    System.out.flush()
                }
            }
        }
    }

    println()
    println("[完成] $fileType 保存成功 DA☆ZE")
}

/**
 * 探测电脑上有没有 ffmpeg 呐呐
 */
private fun hasFfmpeg(): Boolean = try {
    ProcessBuilder("ffmpeg", "-version").redirectErrorStream(true).start().waitFor() == 0
} catch (e: Exception) {
    false
}

/**
 * 用 ffmpeg 把视频流和音频流合并成完整 mp4（如果电脑有 ffmpeg 的话）~~
 * 返回 true 表示合并成功（此时临时文件已删除）
 */
private fun mergeVideoAudio(videoPath: Path, audioPath: Path, outputPath: Path): Boolean {
    if (!hasFfmpeg()) {
        println("[提示] 未检测到 ffmpeg，视频和音频将分开保存 qwq")
        println("       视频文件: $videoPath")
        println("       音频文件: $audioPath")
        return false
    }

    println("[合并] 正在合并视频和音频... awa")
    return try {
        val process = ProcessBuilder(
            "ffmpeg", "-y",
            "-i", videoPath.toString(),
            "-i", audioPath.toString(),
            "-c:v", "copy",
            "-c:a", "aac",
            "-strict", "experimental",
            outputPath.toString()
        ).redirectErrorStream(true).start()

        // 先把输出读干净，避免管道缓冲区塞满卡死 捏
        val output = process.inputStream.bufferedReader().readText()

        if (process.waitFor() == 0) {
            println("[完成] 合并成功！已保存到: $outputPath DA☆ZE")

            // 删除临时文件 qwq
            Files.deleteIfExists(videoPath)
            Files.deleteIfExists(audioPath)
            println("[清理] 已删除临时文件 awa")
            true
        } else {
            val reason = output.lines().lastOrNull { it.isNotBlank() } ?: "未知错误"
            println("[警告] 合并失败: $reason")
            println("       视频和音频已分开保存")
            false
        }
    } catch (e: Exception) {
        println("[警告] 合并失败: ${e.message}")
        println("       视频和音频已分开保存")
        false
    }
}

fun main() {
    println("=".repeat(55))
    println("    B站视频下载器 v1.0 (Kotlin) DA☆ZE")
    println("    下载内容: 视频 + 音频 + 封面 awa")
    println("=".repeat(55))
    println()

    try {
        // 确保下载根目录存在 捏
        Files.createDirectories(Paths.get(DOWNLOAD_ROOT))

        // 用户输入地址 呐呐
        print("请输入B站视频链接: ")
        System.out.flush()
        val url = readlnOrNull()?.trim().orEmpty()
        println()

        // 步骤1: 提取BV号 DA☆ZE
        println("[1/5] 正在识别视频链接...")
        val bv = extractBV(url)
        if (bv == null) {
            println("[失败] 无法识别B站链接！qwq")
            println("       正确格式: https://www.bilibili.com/video/BV1xx411c7mD")
            return
        }
        println("       BV号: $bv DA☆ZE")

        // 步骤2: 获取视频信息 awa
        println("[2/5] 正在获取视频信息...")
        val info = getVideoInfo(bv)
        println("       标题: ${info.title}")
        println("       封面: 已获取 捏")

        // 步骤3: 创建专属文件夹 呐呐
        println("[3/5] 正在创建下载文件夹...")
        val folder = createFolder(bv, info.title)
        println("       文件夹: ${folder.fileName} DA☆ZE")

        // 步骤4: 下载封面 awa
        println("[4/5] 正在下载封面...")
        downloadFile(info.coverUrl, folder.resolve("cover.jpg"), "封面")

        // 步骤5: 获取视频和音频地址并下载 DA☆ZE
        println("[5/5] 正在获取视频和音频地址...")
        val urls = getDownloadUrls(bv, info.cid)

        val videoPath = folder.resolve("video_only.mp4")
        downloadFile(urls.videoUrl, videoPath, "视频流")

        val audioPath = folder.resolve("audio_only.mp3")
        downloadFile(urls.audioUrl, audioPath, "音频流")

        // 尝试用 ffmpeg 合并（没装就分开保存 qwq）
        val outputPath = folder.resolve("${sanitizeTitle(info.title)}.mp4")
        val merged = mergeVideoAudio(videoPath, audioPath, outputPath)

        // 下载完成！DA☆ZE
        println()
        println("=".repeat(55))
        println("    🎉 全部下载完成！DA☆ZE")
        println("    📁 文件夹: $folder")
        println("    📦 包含文件: 捏")
        println("       - cover.jpg (封面) awa")
        if (merged) {
            println("       - ${outputPath.fileName} (合并版) awa")
        } else {
            println("       - video_only.mp4 (纯视频)")
            println("       - audio_only.mp3 (纯音频) 呐呐")
        }
        println("=".repeat(55))
    } catch (e: Exception) {
        println("\n[错误] ${e.message} qwq")
        println("\n可能的原因: ")
        println("  - 视频需要登录才能访问")
        println("  - 网络连接不稳定")
        println("  - B站API暂时抽风 DA☆ZE，绝对不是我们的问题哦")
        exitProcess(1)
    }
}
