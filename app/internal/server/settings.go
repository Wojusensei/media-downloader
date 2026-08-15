package server

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"

	"media-downloader/app/internal/platform"
)

// Settings 是持久化到磁盘的用户设置。
type Settings struct {
	mu           sync.Mutex
	path         string
	SaveDir      string `json:"saveDir"`
	Cookie       string `json:"cookie,omitempty"`
	CookieSource string `json:"cookieSource,omitempty"`
}

// LoadSettings 从配置目录加载设置；文件不存在时使用默认值。
func LoadSettings() (*Settings, error) {
	dir, err := platform.ConfigDir()
	if err != nil {
		return nil, err
	}
	s := &Settings{
		path:    filepath.Join(dir, "settings.json"),
		SaveDir: platform.DefaultDownloadDir(),
	}
	data, err := os.ReadFile(s.path)
	if err == nil && len(data) > 0 {
		var stored Settings
		if json.Unmarshal(data, &stored) == nil {
			if stored.SaveDir != "" {
				s.SaveDir = stored.SaveDir
			}
			s.Cookie = stored.Cookie
			s.CookieSource = stored.CookieSource
		}
	}
	return s, nil
}

// GetSaveDir 读取默认保存目录。
func (s *Settings) GetSaveDir() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.SaveDir
}

// SetSaveDir 更新并落盘。
func (s *Settings) SetSaveDir(dir string) {
	if dir == "" {
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.SaveDir == dir {
		return
	}
	s.SaveDir = dir
	s.save()
}

// GetCookie 读取 Cookie 与来源。
func (s *Settings) GetCookie() (string, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.Cookie, s.CookieSource
}

// SetCookie 更新 Cookie 并落盘。
func (s *Settings) SetCookie(cookie, source string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Cookie = cookie
	s.CookieSource = source
	s.save()
}

func (s *Settings) save() {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(s.path, data, 0o600)
}
