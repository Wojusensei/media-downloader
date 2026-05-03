// B站视频下载器 - Go版 DA☆ZE
// 功能：输入B站视频链接，自动下载：
//       - 视频文件 (.mp4)
//       - 音频文件 (.mp3)
//       - 视频封面 (.jpg) awa
// 保存位置：downloads/视频BV号_标题/ 文件夹内 捏
//
// 运行方法：
//   go run go/bilibili_downloader.go

package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// B站API返回的视频信息 呐呐
type BiliVideoInfo struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    struct {
		Title string `json:"title"`
		Cid   int    `json:"cid"`
		Pic   string `json:"pic"`
	} `json:"data"`
}

// B站API返回的播放地址（DASH流）awa
type BiliPlayUrl struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    struct {
		Dash struct {
			Video []struct {
				BaseUrl string `json:"baseUrl"`
			} `json:"video"`
			Audio []struct {
				BaseUrl string `json:"audioUrl"`
			} `json:"audio"`
		} `json:"dash"`
	} `json:"data"`
}

// 下载根目录 DA☆ZE
var downloadRoot = "downloads"

// 伪装成浏览器，防止被拒绝访问 awa
var headers = map[string]string{
	"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
	"Referer":    "https://www.bilibili.com/",
}

func main() {
	fmt.Println(strings.Repeat("=", 55))
	fmt.Println("    B站视频下载器 v1.0 (Go) DA☆ZE")
	fmt.Println("    下载内容: 视频 + 音频 + 封面 awa")
	fmt.Println(strings.Repeat("=", 55))
	fmt.Println()

	// 确保下载根目录存在 捏
	os.MkdirAll(downloadRoot, 0755)

	// 用户输入地址 呐呐
	fmt.Print("请输入B站视频链接: ")
	var url string
	fmt.Scanln(&url)
	fmt.Println()

	// 步骤1: 提取BV号 DA☆ZE
	fmt.Println("[1/5] 正在识别视频链接...")
	bv := extractBV(url)
	if bv == "" {
		fmt.Println("[失败] 无法识别B站链接！qwq")
		fmt.Println("       正确格式: https://www.bilibili.com/video/BV1xx411c7mD")
		return
	}
	fmt.Printf("       BV号: %s DA☆ZE\n", bv)

	// 步骤2: 获取视频信息 awa
	fmt.Println("[2/5] 正在获取视频信息...")
	title, cid, coverUrl := getVideoInfo(bv)
	fmt.Printf("       标题: %s\n", title)
	fmt.Println("       封面: 已获取 捏")

	// 步骤3: 创建专属文件夹 呐呐
	fmt.Println("[3/5] 正在创建下载文件夹...")
	folder := createFolder(bv, title)
	fmt.Printf("       文件夹: %s DA☆ZE\n", filepath.Base(folder))

	// 步骤4: 下载封面 awa
	fmt.Println("[4/5] 正在下载封面...")
	coverPath := filepath.Join(folder, "cover.jpg")
	downloadFile(coverUrl, coverPath, "封面")

	// 步骤5: 获取视频和音频地址并下载 DA☆ZE
	fmt.Println("[5/5] 正在获取视频和音频地址...")
	videoUrl, audioUrl := getDownloadUrls(bv, cid)

	videoPath := filepath.Join(folder, "video_only.mp4")
	downloadFile(videoUrl, videoPath, "视频流")

	audioPath := filepath.Join(folder, "audio_only.mp3")
	downloadFile(audioUrl, audioPath, "音频流")

	// 下载完成！DA☆ZE
	fmt.Println()
	fmt.Println(strings.Repeat("=", 55))
	fmt.Println("    🎉 全部下载完成！DA☆ZE")
	fmt.Printf("    📁 文件夹: %s\n", folder)
	fmt.Println("    📦 包含文件: 捏")
	fmt.Println("       - cover.jpg (封面) awa")
	fmt.Println("       - video_only.mp4 (纯视频)")
	fmt.Println("       - audio_only.mp3 (纯音频) 呐呐")
	fmt.Println(strings.Repeat("=", 55))
}

// extractBV 从B站链接中提取 BV 号 DA☆ZE
func extractBV(url string) string {
	re := regexp.MustCompile(`BV[a-zA-Z0-9]{10}`)
	return re.FindString(url)
}

// getVideoInfo 通过B站API获取视频信息 awa
func getVideoInfo(bv string) (string, int, string) {
	apiUrl := fmt.Sprintf("https://api.bilibili.com/x/web-interface/view?bvid=%s", bv)
	body := httpGet(apiUrl)

	var info BiliVideoInfo
	json.Unmarshal(body, &info)

	if info.Code != 0 {
		fmt.Printf("[错误] 获取失败: %s qwq\n", info.Message)
		os.Exit(1)
	}

	return info.Data.Title, info.Data.Cid, info.Data.Pic
}

// getDownloadUrls 获取视频和音频的DASH流地址 捏
func getDownloadUrls(bv string, cid int) (string, string) {
	apiUrl := fmt.Sprintf("https://api.bilibili.com/x/player/playurl?bvid=%s&cid=%d&qn=80&fnval=16", bv, cid)
	body := httpGet(apiUrl)

	var playData BiliPlayUrl
	json.Unmarshal(body, &playData)

	if playData.Code != 0 {
		fmt.Printf("[错误] 获取下载地址失败: %s qwq\n", playData.Message)
		os.Exit(1)
	}

	if len(playData.Data.Dash.Video) == 0 || len(playData.Data.Dash.Audio) == 0 {
		fmt.Println("[错误] 该视频可能不支持DASH流下载 qwq")
		os.Exit(1)
	}

	return playData.Data.Dash.Video[0].BaseUrl, playData.Data.Dash.Audio[0].BaseUrl
}

// createFolder 为每个视频创建专属文件夹 呐呐
func createFolder(bv, title string) string {
	re := regexp.MustCompile(`[\\/:*?"<>|]`)
	safeTitle := re.ReplaceAllString(title, "_")
	folderName := fmt.Sprintf("%s_%s", bv, safeTitle)
	folderPath := filepath.Join(downloadRoot, folderName)
	os.MkdirAll(folderPath, 0755)
	return folderPath
}

// httpGet 发送HTTP GET请求 awa
func httpGet(url string) []byte {
	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		fmt.Printf("[错误] 创建请求失败: %s qwq\n", err)
		os.Exit(1)
	}

	for key, value := range headers {
		req.Header.Set(key, value)
	}

	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("[错误] 请求失败: %s qwq\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("[错误] 读取响应失败: %s qwq\n", err)
		os.Exit(1)
	}

	return body
}

// downloadFile 下载文件并显示进度条 DA☆ZE
func downloadFile(url, filePath, fileType string) {
	fmt.Printf("[下载] %s 文件中... 捏\n", fileType)

	client := &http.Client{Timeout: 60 * time.Minute}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		fmt.Printf("[错误] 创建下载请求失败: %s qwq\n", err)
		return
	}

	for key, value := range headers {
		req.Header.Set(key, value)
	}
	req.Header.Set("Referer", "https://www.bilibili.com/") // 必须带这个才能下载视频流 awa

	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("[错误] 下载失败: %s qwq\n", err)
		return
	}
	defer resp.Body.Close()

	file, err := os.Create(filePath)
	if err != nil {
		fmt.Printf("[错误] 创建文件失败: %s qwq\n", err)
		return
	}
	defer file.Close()

	totalSize := resp.ContentLength
	downloaded := int64(0)
	buf := make([]byte, 1024*1024) // 每次读1MB DA☆ZE

	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			file.Write(buf[:n])
			downloaded += int64(n)

			if totalSize > 0 {
				percent := float64(downloaded) / float64(totalSize) * 100
				mbDone := float64(downloaded) / (1024 * 1024)
				mbTotal := float64(totalSize) / (1024 * 1024)
				fmt.Printf("\r  进度: %.1f%% (%.1fMB / %.1fMB)", percent, mbDone, mbTotal)
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			fmt.Printf("\n[错误] 读取数据失败: %s qwq\n", readErr)
			return
		}
	}

	fmt.Printf("\n[完成] %s 保存成功 DA☆ZE\n", fileType)
}