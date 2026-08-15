package download

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// fetchFile 从候选 URL 中依次尝试下载到 path（先写 .part 临时文件，成功后原子改名）。
// progress 在下载过程中被节流调用。headers 为 B 站 CDN 要求的请求头。
func fetchFile(ctx context.Context, client *http.Client, urls []string, path string, headers http.Header, progress func(received, total int64)) error {
	var lastErr error
	for _, u := range urls {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		err := fetchOne(ctx, client, u, path, headers, progress)
		if err == nil {
			return nil
		}
		if errors.Is(err, context.Canceled) {
			return err
		}
		lastErr = err
	}
	if lastErr == nil {
		lastErr = errors.New("没有可用的下载地址")
	}
	return fmt.Errorf("下载失败: %w", lastErr)
}

func fetchOne(ctx context.Context, client *http.Client, u, path string, headers http.Header, progress func(received, total int64)) error {
	const maxRetries = 3
	var lastErr error
	for attempt := 0; attempt < maxRetries; attempt++ {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		err := fetchOnce(ctx, client, u, path, headers, progress)
		if err == nil {
			return nil
		}
		if errors.Is(err, context.Canceled) {
			return err
		}
		lastErr = err
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Duration(attempt+1) * time.Second):
		}
	}
	return lastErr
}

func fetchOnce(ctx context.Context, client *http.Client, u, path string, headers http.Header, progress func(received, total int64)) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return err
	}
	req.Header = headers.Clone()
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("CDN 返回 %d", resp.StatusCode)
	}

	total := resp.ContentLength
	partPath := path + ".part"
	f, err := os.Create(partPath)
	if err != nil {
		return err
	}

	var received int64
	buf := make([]byte, 256*1024)
	var lastTick time.Time
	for {
		n, rerr := resp.Body.Read(buf)
		if n > 0 {
			if _, werr := f.Write(buf[:n]); werr != nil {
				f.Close()
				os.Remove(partPath)
				return werr
			}
			received += int64(n)
			now := time.Now()
			if now.Sub(lastTick) > 100*time.Millisecond {
				lastTick = now
				if progress != nil {
					progress(received, total)
				}
			}
		}
		if rerr != nil {
			f.Close()
			if errors.Is(rerr, io.EOF) {
				if err := os.Rename(partPath, path); err != nil {
					os.Remove(partPath)
					return err
				}
				if progress != nil {
					progress(received, total)
				}
				return nil
			}
			os.Remove(partPath)
			return rerr
		}
		if ctx.Err() != nil {
			f.Close()
			os.Remove(partPath)
			return ctx.Err()
		}
	}
}

// mergeWithFFmpeg 用 ffmpeg 把 DASH 视频流和音频流合并为 mp4。
func mergeWithFFmpeg(ctx context.Context, ffmpegPath, videoPath, audioPath, outPath string) error {
	return runFFmpeg(ctx, ffmpegPath, []string{
		"-y",
		"-i", videoPath,
		"-i", audioPath,
		"-c", "copy",
		"-movflags", "+faststart",
		outPath,
	})
}

// transcodeToMP3 用 ffmpeg 把音频流转码为 mp3。
func transcodeToMP3(ctx context.Context, ffmpegPath, inPath, outPath string) error {
	return runFFmpeg(ctx, ffmpegPath, []string{
		"-y",
		"-i", inPath,
		"-codec:a", "libmp3lame",
		"-q:a", "2",
		outPath,
	})
}

// runFFmpeg 执行 ffmpeg，把输出收集到错误信息里。
func runFFmpeg(ctx context.Context, ffmpegPath string, args []string) error {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()
	cmd := execCommand(ctx, ffmpegPath, args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		tail := string(out)
		if len(tail) > 500 {
			tail = tail[len(tail)-500:]
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return fmt.Errorf("ffmpeg 失败: %s", strings.TrimSpace(tail))
	}
	return nil
}

// UniquePath 避免（同目录同名）文件覆盖：存在时追加 " (1)"、" (2)"…
func UniquePath(path string) string {
	if _, err := os.Stat(path); err != nil {
		return path
	}
	ext := filepath.Ext(path)
	base := strings.TrimSuffix(path, ext)
	for i := 1; ; i++ {
		candidate := fmt.Sprintf("%s (%d)%s", base, i, ext)
		if _, err := os.Stat(candidate); err != nil {
			return candidate
		}
	}
}
