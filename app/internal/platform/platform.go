// Package platform 封装跨平台差异：默认目录、唤起浏览器、原生文件夹选择、ffmpeg 探测。
package platform

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// OS 返回当前系统标识（darwin / windows / linux）。
func OS() string { return runtime.GOOS }

// DefaultDownloadDir 返回默认下载目录 ~/Downloads/media-downloader。
func DefaultDownloadDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		home, _ = os.Getwd()
	}
	return filepath.Join(home, "Downloads", "media-downloader")
}

// ConfigDir 返回配置目录（含创建）。
func ConfigDir() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	dir = filepath.Join(dir, "media-downloader")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	return dir, nil
}

// OpenBrowser 用系统默认浏览器打开 URL。
func OpenBrowser(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	return cmd.Start()
}

// PickFolder 弹出系统原生文件夹选择框；用户取消时返回 ("", nil)。
func PickFolder() (string, error) {
	switch runtime.GOOS {
	case "darwin":
		return pickFolderDarwin()
	case "windows":
		return pickFolderWindows()
	default:
		return "", errors.New("当前系统不支持图形化目录选择，请直接输入路径")
	}
}

func pickFolderDarwin() (string, error) {
	script := `POSIX path of (choose folder with prompt "选择保存位置" default location (path to downloads folder))`
	out, err := exec.Command("osascript", "-e", script).Output()
	if err != nil {
		if strings.Contains(err.Error(), "User canceled") || strings.Contains(string(out), "User canceled") {
			return "", nil
		}
		return "", fmt.Errorf("无法打开目录选择: %w", err)
	}
	return strings.TrimSpace(string(out)), nil
}

func pickFolderWindows() (string, error) {
	script := `
Add-Type -AssemblyName System.Windows.Forms | Out-Null
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '选择保存位置'
$dialog.ShowNewFolderButton = $true
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dialog.SelectedPath
}
`
	out, err := exec.Command("powershell", "-NoProfile", "-STA", "-Command", script).Output()
	if err != nil {
		return "", fmt.Errorf("无法打开目录选择: %w", err)
	}
	path := strings.TrimSpace(string(out))
	if path == "" {
		return "", nil
	}
	return path, nil
}

// FFmpegPath 探测可用的 ffmpeg，找不到返回空串。
func FFmpegPath() string {
	if p, err := exec.LookPath("ffmpeg"); err == nil {
		return p
	}
	candidates := []string{
		"/opt/homebrew/bin/ffmpeg",
		"/usr/local/bin/ffmpeg",
		filepath.Join(os.Getenv("LOCALAPPDATA"), "Microsoft", "WinGet", "Links", "ffmpeg.exe"),
	}
	for _, c := range candidates {
		if c == "" {
			continue
		}
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			return c
		}
	}
	return ""
}

// CheckDir 校验目录是否可用（不存在则尝试创建）。
func CheckDir(dir string) error {
	if dir == "" {
		return errors.New("路径为空")
	}
	if st, err := os.Stat(dir); err == nil {
		if !st.IsDir() {
			return fmt.Errorf("%s 不是目录", dir)
		}
		return nil
	}
	return os.MkdirAll(dir, 0o755)
}
