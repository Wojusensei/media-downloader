// Package history 维护下载历史的 JSON 持久化存储。
package history

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Entry 是一条下载历史。
type Entry struct {
	ID        string `json:"id"`
	BVID      string `json:"bvid"`
	Title     string `json:"title"`
	Cover     string `json:"cover"`
	Owner     string `json:"owner"`
	Kind      string `json:"kind"`
	Path      string `json:"path"`
	CreatedAt int64  `json:"createdAt"`
}

// Store 是线程安全的历史存储。
type Store struct {
	mu      sync.RWMutex
	path    string
	entries []Entry
	max     int
}

// DefaultPath 返回历史文件路径。
func DefaultPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "media-downloader", "history.json"), nil
}

// Open 加载（或初始化）历史存储，max<=0 时默认 100 条。
func Open(path string, max int) (*Store, error) {
	if max <= 0 {
		max = 100
	}
	s := &Store{path: path, max: max}
	data, err := os.ReadFile(path)
	if err == nil && len(data) > 0 {
		_ = json.Unmarshal(data, &s.entries)
	} else if !os.IsNotExist(err) && err != nil {
		return nil, err
	}
	if s.entries == nil {
		s.entries = []Entry{}
	}
	return s, nil
}

// Add 追加一条历史（新→旧），立即落盘。
func (s *Store) Add(raw any) {
	fields, ok := raw.(map[string]any)
	if !ok {
		return
	}
	get := func(k string) string {
		if v, ok := fields[k].(string); ok {
			return v
		}
		return ""
	}
	ts := time.Now().UnixMilli()
	e := Entry{
		ID:        fmt.Sprint(ts),
		BVID:      get("bvid"),
		Title:     get("title"),
		Cover:     get("cover"),
		Owner:     get("owner"),
		Kind:      get("kind"),
		Path:      get("path"),
		CreatedAt: time.Now().Unix(),
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.entries = append([]Entry{e}, s.entries...)
	if len(s.entries) > s.max {
		s.entries = s.entries[:s.max]
	}
	s.saveLocked()
}

// List 返回历史副本。
func (s *Store) List() []Entry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Entry, len(s.entries))
	copy(out, s.entries)
	return out
}

// Delete 按 ID 删除一条。
func (s *Store) Delete(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, e := range s.entries {
		if e.ID == id {
			s.entries = append(s.entries[:i], s.entries[i+1:]...)
			break
		}
	}
	s.saveLocked()
}

// Clear 清空历史。
func (s *Store) Clear() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.entries = []Entry{}
	s.saveLocked()
}

func (s *Store) saveLocked() {
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return
	}
	data, err := json.MarshalIndent(s.entries, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(s.path, data, 0o644)
}
