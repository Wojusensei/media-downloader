package download

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestSafeName(t *testing.T) {
	cases := []struct{ in, want string }{
		{`video: <test>/\ok?`, "video test ok"},
		{"正常标题", "正常标题"},
		{"  多  余  空白  ", "多 余 空白"},
		{"结尾点.", "结尾点"},
	}
	for _, c := range cases {
		if got := SafeName(c.in); got != c.want {
			t.Errorf("SafeName(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestUniquePath(t *testing.T) {
	dir := t.TempDir()
	first := filepath.Join(dir, "a.txt")
	os.WriteFile(first, []byte("x"), 0o644)
	second := UniquePath(first)
	if second != filepath.Join(dir, "a (1).txt") {
		t.Fatalf("got %q", second)
	}
	os.WriteFile(second, []byte("x"), 0o644)
	third := UniquePath(first)
	if third != filepath.Join(dir, "a (2).txt") {
		t.Fatalf("got %q", third)
	}
	if UniquePath(filepath.Join(dir, "b.txt")) != filepath.Join(dir, "b.txt") {
		t.Fatal("不存在的文件不应被改名")
	}
}

// TestFetchFileStallWatchdog 模拟被静默掐断的连接：服务器声明了大文件却只发
// 一小段就挂起。读超时看门狗应当在 stallTimeout 内判死并返回错误，
// 而不是让任务永久停在"下载中/解析中"。
func TestFetchFileStallWatchdog(t *testing.T) {
	old := stallTimeout
	stallTimeout = 300 * time.Millisecond
	defer func() { stallTimeout = old }()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "1048576")
		w.Write([]byte("hello"))
		if f, ok := w.(http.Flusher); ok {
			f.Flush() // 先把响应头和一小段数据发出去，让客户端进入读 body 阶段
		}
		select { // 模拟连接僵死：不再发数据也不结束
		case <-r.Context().Done():
		case <-time.After(10 * time.Second): // 兜底，避免断连探测失败时泄漏 handler
		}
	}))
	defer srv.Close()

	out := filepath.Join(t.TempDir(), "video.m4s")
	start := time.Now()
	err := fetchFile(context.Background(), srv.Client(), []string{srv.URL}, out, http.Header{}, nil)
	elapsed := time.Since(start)

	if err == nil {
		t.Fatal("僵死连接应当报错，实际下载成功")
	}
	if !strings.Contains(err.Error(), "僵死") {
		t.Fatalf("错误应说明连接僵死，实际: %v", err)
	}
	// 3 次重试 × 看门狗 300ms + 退避 1s+2s + 连接拆除开销，应远低于 10s；
	// 关键在于"有界止损"，而不是永远挂在下载中。
	if elapsed > 10*time.Second {
		t.Fatalf("僵死止损太慢: %v", elapsed)
	}
	if _, statErr := os.Stat(out + ".part"); statErr == nil {
		t.Fatal("失败后不应留下 .part 临时文件")
	}
}
