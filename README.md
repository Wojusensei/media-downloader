# Media Downloader

发行版本：
[![下载](https://img.shields.io/badge/⬇️%20下载-Windows%20v3.3-FB7299?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/Wojusensei/media-downloader/releases/tag/v3.3)

仓库里的文件是多语言版本的爬虫工具史山代码集合，功能是输入B站的视频url自动下载视频、音频和封面
♿️啊不过因为cookie的原因下载不了付费资源♿️


## 支持的平台
- [x] Bilibili (B站)

## 下载内容
- 视频文件 (.mp4)
- 音频文件 (.mp3)
- 视频封面 (.jpg)

## 语言列表

| 语言 | 运行方式 
| Python | `python python/bilibili_downloader.py` 
| JavaScript | `node javascript/bilibili_downloader.js` 
| Go | `go run go/bilibili_downloader.go` |备注：暂时缺少MP3下载方式呐呐，bug修不好
| Java | `javac -encoding UTF-8 java/BilibiliDownloader.java && java -cp java BilibiliDownloader`
| C | `c/bilibili_downloader.exe`
| C++ | `cpp/bilibili_downloader.exe`

## 下载位置
所有文件保存在 `downloads/` 文件夹中，每个视频独立一个子文件夹(可自选)

## 注意事项
- Go 版本暂不支持音频下载qwq私密马赛
- C / C++ 版本需要 Windows 环境运行 exe捏

## 谁拉的史
投诉请骚扰 https://github.com/Wojusensei
QQ 3442006415

## 预告
新增webui等
