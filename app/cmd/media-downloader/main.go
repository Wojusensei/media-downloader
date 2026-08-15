// media-downloader 是一个 B 站视频 / 音频 / 封面下载器，
// 后端在本机启动 HTTP 服务并自动打开浏览器界面。
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"media-downloader/app/internal/bilibili"
	"media-downloader/app/internal/download"
	"media-downloader/app/internal/history"
	"media-downloader/app/internal/platform"
	"media-downloader/app/internal/server"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:0", "监听地址，端口 0 表示自动选择空闲端口")
	noOpen := flag.Bool("no-open", false, "启动后不自动打开浏览器")
	showVersion := flag.Bool("version", false, "打印版本号并退出")
	flag.Parse()

	if *showVersion {
		fmt.Println("media-downloader", server.Version)
		return
	}

	settings, err := server.LoadSettings()
	if err != nil {
		log.Printf("加载设置失败（使用默认值）: %v", err)
	}

	histPath, err := history.DefaultPath()
	if err != nil {
		histPath = filepath.Join(os.TempDir(), "media-downloader-history.json")
	}
	hist, err := history.Open(histPath, 100)
	if err != nil {
		log.Printf("加载历史失败: %v", err)
	}

	cookie, _ := settings.GetCookie()
	client := bilibili.NewClient(cookie)
	manager := download.NewManager(client, platform.FFmpegPath(), hist)
	manager.SetOnSetting(settings.SetSaveDir)

	srv := server.New(server.Options{
		Client:    client,
		Manager:   manager,
		History:   hist,
		SaveDirFn: settings.GetSaveDir,
		SetSaveFn: settings.SetSaveDir,
		CookieFn:  settings.GetCookie,
		SetCookie: settings.SetCookie,
	})

	listener, err := net.Listen("tcp", *addr)
	if err != nil {
		log.Fatalf("无法监听 %s: %v", *addr, err)
	}
	url := fmt.Sprintf("http://%s", listener.Addr().String())

	httpServer := &http.Server{Handler: srv.Handler()}

	fmt.Println()
	fmt.Println("  media-downloader", server.Version)
	fmt.Println("  界面地址:", url)
	fmt.Println("  保存目录:", settings.GetSaveDir())
	fmt.Println("  按 Ctrl+C 退出")
	fmt.Println()

	go func() {
		if err := httpServer.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("服务异常退出: %v", err)
		}
	}()

	if !*noOpen {
		go func() {
			time.Sleep(400 * time.Millisecond)
			if err := platform.OpenBrowser(url); err != nil {
				log.Printf("自动打开浏览器失败，请手动访问 %s", url)
			}
		}()
	}

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(ctx)
	fmt.Println("已退出")
}
