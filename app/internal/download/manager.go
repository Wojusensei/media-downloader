// Package download 实现下载任务管理：任务状态机、并发控制、进度事件与 ffmpeg 合并。
package download

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"media-downloader/app/internal/bilibili"
)

// 任务状态。
const (
	StateResolving  = "resolving"
	StateDownloading = "downloading"
	StateMerging    = "merging"
	StateDone       = "done"
	StateError      = "error"
	StateCanceled   = "canceled"
)

// Task 是一个下载任务的全部状态。
type Task struct {
	ID          string  `json:"id"`
	Type        string  `json:"type"` // video | audio | cover
	Title       string  `json:"title"`
	BVID        string  `json:"bvid"`
	Page        int     `json:"page"`
	QN          int     `json:"qn"`
	AudioID     int     `json:"audioId"`
	AudioFormat string  `json:"audioFormat"` // m4a | mp3
	SaveDir     string  `json:"saveDir"`
	State       string  `json:"state"`
	Detail      string  `json:"detail"` // 当前阶段的人话描述
	Received    int64   `json:"received"`
	Total       int64   `json:"total"`
	Speed       float64 `json:"speed"` // bytes/s
	FinalPath   string  `json:"finalPath"`
	Error       string  `json:"error"`
	CreatedAt   int64   `json:"createdAt"`
	FinishedAt  int64   `json:"finishedAt"`

	cancel context.CancelFunc
	// speed 计速
	lastReceived int64
	lastAt       time.Time
}

// Event 是推送给前端的事件。
type Event struct {
	Type   string      `json:"type"` // task | toast
	Task   *Task       `json:"task,omitempty"`
	Level  string      `json:"level,omitempty"`
	Body   string      `json:"body,omitempty"`
}

// Subscriber 收到事件即转发（SSE）。
type Subscriber struct {
	ch     chan Event
	closed chan struct{}
	once   sync.Once
}

func (s *Subscriber) Ch() <-chan Event { return s.ch }
func (s *Subscriber) Close() {
	s.once.Do(func() {
		close(s.closed)
	})
}

// Manager 管理全部下载任务与事件订阅。
type Manager struct {
	mu    sync.RWMutex
	tasks []*Task
	subs  map[*Subscriber]struct{}

	client    *bilibili.Client
	ffmpeg    string // 可为空
	history   HistorySink
	onSetting func(dir string) // 保存默认下载目录回调，可为 nil

	dlClient *http.Client
	sema     chan struct{}
	wg       sync.WaitGroup
}

// HistorySink 由 history 包实现：任务成功后落库。
type HistorySink interface {
	Add(entry any)
}

// NewManager 创建任务管理器。ffmpegPath 为空表示 ffmpeg 不可用。
func NewManager(client *bilibili.Client, ffmpegPath string, history HistorySink) *Manager {
	return &Manager{
		client: client,
		ffmpeg: ffmpegPath,
		history: history,
		dlClient: &http.Client{
			Timeout: 0, // 下载大文件不设总超时，由传输层控制
			Transport: &http.Transport{
				MaxIdleConns:        8,
				MaxConnsPerHost:     4,
				IdleConnTimeout:     60 * time.Second,
				TLSHandshakeTimeout: 10 * time.Second,
			},
		},
		sema: make(chan struct{}, 2), // 最多同时 2 个任务
		subs: make(map[*Subscriber]struct{}),
	}
}

// SetOnSetting 注册"记住下载目录"回调。
func (m *Manager) SetOnSetting(fn func(dir string)) { m.onSetting = fn }

// Subscribe 订阅事件流；返回的 Subscriber 必须在使用完毕后 Close。
func (m *Manager) Subscribe() *Subscriber {
	s := &Subscriber{ch: make(chan Event, 256), closed: make(chan struct{})}
	m.mu.Lock()
	m.subs[s] = struct{}{}
	m.mu.Unlock()
	return s
}

// Unsubscribe 注销一个订阅者。
func (m *Manager) Unsubscribe(s *Subscriber) {
	m.mu.Lock()
	delete(m.subs, s)
	m.mu.Unlock()
	s.Close()
}

func (m *Manager) publish(e Event) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for s := range m.subs {
		select {
		case s.ch <- e:
		default: // 订阅者跟不上就丢弃，SSE 重连时会拿到快照
		}
	}
}

func (m *Manager) publishTask(t *Task) {
	m.publish(Event{Type: "task", Task: t})
}

func (m *Manager) toast(level, body string) {
	m.publish(Event{Type: "toast", Level: level, Body: body})
}

// Snapshot 返回任务列表（新→旧）。
func (m *Manager) Snapshot() []*Task {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]*Task, len(m.tasks))
	copy(out, m.tasks)
	return out
}

func newID() string {
	var b [6]byte
	rand.Read(b[:])
	return hex.EncodeToString(b[:]) + fmt.Sprint(time.Now().UnixMilli()%100000)
}

var unsafeChars = regexp.MustCompile(`[\\/:*?"<>|\r\n\t]`)
var spaceRuns = regexp.MustCompile(`\s{2,}`)

// SafeName 生成安全的跨平台文件名。
func SafeName(s string) string {
	s = strings.TrimSpace(s)
	s = unsafeChars.ReplaceAllString(s, " ")
	s = spaceRuns.ReplaceAllString(s, " ")
	if len(s) > 120 {
		s = s[:120]
	}
	return strings.Trim(s, ". ")
}

// Enqueue 注册并启动一个下载任务。
func (m *Manager) Enqueue(t *Task) (*Task, error) {
	if t == nil || t.BVID == "" {
		return nil, fmt.Errorf("缺少视频信息")
	}
	if t.ID == "" {
		t.ID = newID()
	}
	if t.CreatedAt == 0 {
		t.CreatedAt = time.Now().Unix()
	}
	if t.State == "" {
		t.State = StateResolving
	}
	ctx, cancel := context.WithCancel(context.Background())
	t.cancel = cancel

	m.mu.Lock()
	m.tasks = append([]*Task{t}, m.tasks...)
	if len(m.tasks) > 100 {
		m.tasks = m.tasks[:100]
	}
	m.mu.Unlock()
	m.publishTask(t)

	m.wg.Add(1)
	go m.run(ctx, t)
	return t, nil
}

// Cancel 取消一个任务。
func (m *Manager) Cancel(id string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, t := range m.tasks {
		if t.ID == id && (t.State == StateResolving || t.State == StateDownloading || t.State == StateMerging) {
			t.cancel()
			return true
		}
	}
	return false
}

// ClearFinished 清除已完成/失败/取消的任务。
func (m *Manager) ClearFinished() {
	m.mu.Lock()
	kept := m.tasks[:0]
	for _, t := range m.tasks {
		if t.State == StateDone || t.State == StateError || t.State == StateCanceled {
			continue
		}
		kept = append(kept, t)
	}
	m.tasks = kept
	m.mu.Unlock()
	m.publish(Event{Type: "tasks-reset"})
}

// Wait 等待所有任务结束（测试用）。
func (m *Manager) Wait() { m.wg.Wait() }

func (t *Task) setProgress(received, total int64) {
	now := time.Now()
	if !t.lastAt.IsZero() && now.After(t.lastAt) {
		dt := now.Sub(t.lastAt).Seconds()
		if dt >= 0.5 {
			t.Speed = float64(received-t.lastReceived) / dt
			t.lastReceived = received
			t.lastAt = now
		}
	} else if t.lastAt.IsZero() {
		t.lastAt = now
		t.lastReceived = received
	}
	t.Received = received
	t.Total = total
}

func (m *Manager) run(ctx context.Context, t *Task) {
	defer m.wg.Done()
	select {
	case m.sema <- struct{}{}:
		defer func() { <-m.sema }()
	case <-ctx.Done():
		t.State = StateCanceled
		t.FinishedAt = time.Now().Unix()
		m.publishTask(t)
		return
	}

	err := m.execute(ctx, t)
	t.FinishedAt = time.Now().Unix()
	if err != nil {
		if ctx.Err() != nil || strings.Contains(err.Error(), "context canceled") {
			t.State = StateCanceled
			t.Detail = "已取消"
		} else {
			t.State = StateError
			t.Error = err.Error()
			t.Detail = "失败"
		}
	} else {
		t.State = StateDone
		t.Detail = "完成"
		t.Speed = 0
	}
	m.publishTask(t)
}

func (m *Manager) execute(ctx context.Context, t *Task) error {
	t.State = StateResolving
	t.Detail = "解析视频信息"
	m.publishTask(t)

	info, err := m.client.GetVideoInfo(ctx, t.BVID)
	if err != nil {
		return err
	}
	t.Title = info.Title

	cid := info.CID
	pageTitle := ""
	if t.Page > 1 && t.Page <= len(info.Pages) {
		p := info.Pages[t.Page-1]
		cid = p.CID
		pageTitle = p.Title
	}

	if err := os.MkdirAll(t.SaveDir, 0o755); err != nil {
		return fmt.Errorf("创建下载目录失败: %w", err)
	}
	if m.onSetting != nil {
		m.onSetting(t.SaveDir)
	}

	base := SafeName(info.Title)
	if pageTitle != "" && SafeName(pageTitle) != base {
		base = fmt.Sprintf("%s - P%d %s", base, t.Page, SafeName(pageTitle))
	}

	switch t.Type {
	case "video":
		return m.downloadVideo(ctx, t, info, cid, base)
	case "audio":
		return m.downloadAudio(ctx, t, cid, base)
	case "cover":
		return m.downloadCover(ctx, t, info, base)
	default:
		return fmt.Errorf("未知的下载类型: %s", t.Type)
	}
}

func (m *Manager) downloadVideo(ctx context.Context, t *Task, info *bilibili.VideoInfo, cid int64, base string) error {
	headers := m.client.DownloadHeaders()

	if m.ffmpeg != "" {
		t.Detail = "获取高画质流"
		m.publishTask(t)
		streams, _, _, _, err := m.client.GetDASHStreams(ctx, t.BVID, cid, t.QN)
		if err == nil && streams != nil {
			video := streams.PickVideoStream(t.QN)
			audio := streams.PickAudioStream(0)
			if video != nil && audio != nil {
				tmpDir, err := os.MkdirTemp("", "md-dash-*")
				if err != nil {
					return err
				}
				defer os.RemoveAll(tmpDir)

				t.Detail = "下载视频流"
				t.Received, t.Total, t.Speed = 0, 0, 0
				m.publishTask(t)
				videoFile := filepath.Join(tmpDir, "video.m4s")
				if err := fetchFile(ctx, m.dlClient, video.URLCandidates(), videoFile, headers, func(r, tot int64) {
					t.setProgress(r, tot)
					m.publishTask(t)
				}); err != nil {
					return err
				}

				t.Detail = "下载音频流"
				t.Received, t.Total, t.Speed, t.lastReceived, t.lastAt = 0, 0, 0, 0, time.Time{}
				m.publishTask(t)
				audioFile := filepath.Join(tmpDir, "audio.m4s")
				if err := fetchFile(ctx, m.dlClient, audio.URLCandidates(), audioFile, headers, func(r, tot int64) {
					t.setProgress(r, tot)
					m.publishTask(t)
				}); err != nil {
					return err
				}

				t.Detail = "合并音视频"
				t.State = StateMerging
				m.publishTask(t)
				out := UniquePath(filepath.Join(t.SaveDir, base+".mp4"))
				if err := mergeWithFFmpeg(ctx, m.ffmpeg, videoFile, audioFile, out); err != nil {
					os.Remove(out)
					return err
				}
				t.FinalPath = out
				m.recordHistory(t, info, "视频")
				return nil
			}
		}
		// DASH 失败时回退传统流。
		t.Detail = "回退到传统流"
		m.publishTask(t)
	}

	stream, err := m.client.GetLegacyStream(ctx, t.BVID, cid, t.QN)
	if err != nil {
		return err
	}
	out := UniquePath(filepath.Join(t.SaveDir, base+".mp4"))
	t.Detail = "下载视频（含声音）"
	t.Received, t.Total = 0, stream.Size
	m.publishTask(t)
	if err := fetchFile(ctx, m.dlClient, []string{stream.URL}, out, headers, func(r, tot int64) {
		t.setProgress(r, tot)
		m.publishTask(t)
	}); err != nil {
		return err
	}
	t.FinalPath = out
	m.recordHistory(t, info, "视频")
	return nil
}

func (m *Manager) downloadAudio(ctx context.Context, t *Task, cid int64, base string) error {
	headers := m.client.DownloadHeaders()
	t.Detail = "获取音频流"
	m.publishTask(t)

	streams, _, _, _, err := m.client.GetDASHStreams(ctx, t.BVID, cid, 0)
	if err != nil {
		return err
	}
	audio := streams.PickAudioStream(t.AudioID)
	if audio == nil {
		return fmt.Errorf("未找到可用的音频流")
	}

	ext := "m4a"
	if t.AudioFormat == "mp3" && m.ffmpeg != "" {
		ext = "mp3"
	}
	out := UniquePath(filepath.Join(t.SaveDir, base+"."+ext))

	t.Detail = "下载音频"
	t.Received, t.Total, t.Speed, t.lastReceived, t.lastAt = 0, 0, 0, 0, time.Time{}
	m.publishTask(t)
	tmpDir, err := os.MkdirTemp("", "md-audio-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tmpDir)
	src := filepath.Join(tmpDir, "audio.m4s")
	if err := fetchFile(ctx, m.dlClient, audio.URLCandidates(), src, headers, func(r, tot int64) {
		t.setProgress(r, tot)
		m.publishTask(t)
	}); err != nil {
		return err
	}

	if ext == "mp3" {
		t.Detail = "转码 MP3"
		t.State = StateMerging
		m.publishTask(t)
		if err := transcodeToMP3(ctx, m.ffmpeg, src, out); err != nil {
			os.Remove(out)
			return err
		}
	} else if err := os.Rename(src, out); err != nil {
		return err
	}

	if t.AudioFormat == "mp3" && m.ffmpeg == "" {
		m.toast("info", "未检测到 ffmpeg，音频已保存为 M4A 格式")
	}
	t.FinalPath = out
	return nil
}

func (m *Manager) downloadCover(ctx context.Context, t *Task, info *bilibili.VideoInfo, base string) error {
	out := UniquePath(filepath.Join(t.SaveDir, base+"（封面）.jpg"))
	t.Detail = "下载封面"
	t.Received, t.Total = 0, 0
	m.publishTask(t)
	if err := fetchFile(ctx, m.dlClient, []string{info.Cover}, out, m.client.DownloadHeaders(), func(r, tot int64) {
		t.setProgress(r, tot)
		m.publishTask(t)
	}); err != nil {
		return err
	}
	t.FinalPath = out
	m.recordHistory(t, info, "封面")
	return nil
}

func (m *Manager) recordHistory(t *Task, info *bilibili.VideoInfo, kind string) {
	if m.history == nil {
		return
	}
	m.history.Add(map[string]any{
		"bvid":      t.BVID,
		"title":     info.Title,
		"cover":     info.Cover,
		"owner":     info.Owner,
		"kind":      kind,
		"path":      t.FinalPath,
		"createdAt": time.Now().Unix(),
	})
}

// execCommand 是 exec.CommandContext 的薄封装，便于测试替换。
var execCommand = exec.CommandContext
