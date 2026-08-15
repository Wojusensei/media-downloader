// Package server 提供 HTTP API、SSE 事件流与嵌入式前端静态资源。
package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"net/url"
	"path"
	"strings"
	"sync"
	"time"

	"media-downloader/app/internal/bilibili"
	"media-downloader/app/internal/cookies"
	"media-downloader/app/internal/download"
	"media-downloader/app/internal/history"
	"media-downloader/app/internal/platform"
	web "media-downloader/app/web"
)

// Version 是应用版本号。
const Version = "4.0.0"

// Options 聚合服务端依赖。
type Options struct {
	Client    *bilibili.Client
	Manager   *download.Manager
	History   *history.Store
	SaveDirFn func() string
	SetSaveFn func(dir string)
	CookieFn  func() (string, string) // cookie, source
	SetCookie func(cookie, source string)
}

// Server 是 HTTP 服务。
type Server struct {
	opt Options

	loginMu   sync.Mutex
	loginAt   time.Time
	loginLast *bilibili.LoginStatus
}

// New 创建服务。
func New(opt Options) *Server {
	return &Server{opt: opt}
}

// Handler 组装全部路由。
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/system", s.handleSystem)
	mux.HandleFunc("POST /api/parse", s.handleParse)
	mux.HandleFunc("GET /api/cover", s.handleCover)
	mux.HandleFunc("POST /api/download", s.handleDownload)
	mux.HandleFunc("GET /api/events", s.handleEvents)
	mux.HandleFunc("POST /api/tasks/{id}/cancel", s.handleCancel)
	mux.HandleFunc("POST /api/tasks/clear", s.handleClear)
	mux.HandleFunc("GET /api/history", s.handleHistory)
	mux.HandleFunc("DELETE /api/history/{id}", s.handleHistoryDelete)
	mux.HandleFunc("POST /api/history/clear", s.handleHistoryClear)
	mux.HandleFunc("POST /api/cookies/browser", s.handleCookieBrowser)
	mux.HandleFunc("POST /api/cookies/manual", s.handleCookieManual)
	mux.HandleFunc("DELETE /api/cookies", s.handleCookieClear)
	mux.HandleFunc("POST /api/dialog/folder", s.handleDialogFolder)
	mux.HandleFunc("POST /api/path/check", s.handlePathCheck)

	mux.Handle("/", s.staticHandler())

	return mux
}

// ---- 通用助手 ----

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}

func readJSON(r *http.Request, v any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	if err := dec.Decode(v); err != nil {
		return fmt.Errorf("请求体解析失败: %w", err)
	}
	return nil
}

// ---- 系统信息 ----

func (s *Server) loginStatus(ctx context.Context) *bilibili.LoginStatus {
	cookie, _ := s.opt.CookieFn()
	if cookie == "" {
		return &bilibili.LoginStatus{}
	}
	s.loginMu.Lock()
	defer s.loginMu.Unlock()
	if s.loginLast != nil && time.Since(s.loginAt) < 30*time.Second {
		return s.loginLast
	}
	st, err := s.opt.Client.CheckLogin(ctx)
	if err != nil || st == nil {
		if st == nil {
			st = &bilibili.LoginStatus{}
		}
	}
	s.loginLast, s.loginAt = st, time.Now()
	return st
}

func (s *Server) handleSystem(w http.ResponseWriter, r *http.Request) {
	ffmpeg := ""
	if p := platform.FFmpegPath(); p != "" {
		ffmpeg = "available"
	}
	cookie, source := s.opt.CookieFn()
	writeJSON(w, http.StatusOK, map[string]any{
		"version":      Version,
		"platform":     platform.OS(),
		"ffmpeg":       ffmpeg != "",
		"saveDir":      s.opt.SaveDirFn(),
		"cookieSource": source,
		"hasCookie":    cookie != "",
		"login":        s.loginStatus(r.Context()),
	})
}

// ---- 解析 ----

func (s *Server) handleParse(w http.ResponseWriter, r *http.Request) {
	var req struct {
		URL string `json:"url"`
	}
	if err := readJSON(r, &req); err != nil {
		writeErr(w, 400, err)
		return
	}
	bv := bilibili.ExtractBV(req.URL)
	if bv == "" {
		writeErr(w, 400, errors.New("没有从输入中识别到 BV 号，请检查链接"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	info, err := s.opt.Client.GetVideoInfo(ctx, bv)
	if err != nil {
		writeErr(w, 502, err)
		return
	}

	login := s.loginStatus(ctx)
	var qualities []bilibili.Quality
	var audioQ []bilibili.AudioQuality
	if _, q, a, _, err := s.opt.Client.GetDASHStreams(ctx, bv, info.CID, 0); err == nil {
		qualities, audioQ = q, a
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"video":          info,
		"qualities":      qualities,
		"audioQualities": audioQ,
		"loggedIn":       login.LoggedIn,
		"vip":            login.VIP,
	})
}

// handleCover 代理封面图，规避跨域与防盗链。
func (s *Server) handleCover(w http.ResponseWriter, r *http.Request) {
	raw := r.URL.Query().Get("url")
	u, err := url.Parse(raw)
	if err != nil || !strings.HasSuffix(u.Host, "hdslb.com") {
		writeErr(w, 400, errors.New("不允许的图片地址"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if err != nil {
		writeErr(w, 400, err)
		return
	}
	req.Header = s.opt.Client.DownloadHeaders()
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		writeErr(w, 502, err)
		return
	}
	defer resp.Body.Close()
	w.Header().Set("Cache-Control", "public, max-age=86400")
	w.Header().Set("Content-Type", resp.Header.Get("Content-Type"))
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

// ---- 下载 ----

func (s *Server) handleDownload(w http.ResponseWriter, r *http.Request) {
	var req struct {
		URL         string `json:"url"`
		BVID        string `json:"bvid"`
		Page        int    `json:"page"`
		Type        string `json:"type"`
		QN          int    `json:"qn"`
		AudioID     int    `json:"audioId"`
		AudioFormat string `json:"audioFormat"`
		SaveDir     string `json:"saveDir"`
	}
	if err := readJSON(r, &req); err != nil {
		writeErr(w, 400, err)
		return
	}
	if req.BVID == "" {
		req.BVID = bilibili.ExtractBV(req.URL)
	}
	if req.BVID == "" {
		writeErr(w, 400, errors.New("没有识别到 BV 号"))
		return
	}
	switch req.Type {
	case "video", "audio", "cover":
	default:
		writeErr(w, 400, fmt.Errorf("不支持的下载类型: %q", req.Type))
		return
	}
	if req.Page < 1 {
		req.Page = 1
	}
	if req.SaveDir == "" {
		req.SaveDir = s.opt.SaveDirFn()
	}
	if err := platform.CheckDir(req.SaveDir); err != nil {
		writeErr(w, 400, fmt.Errorf("保存目录不可用: %w", err))
		return
	}

	task, err := s.opt.Manager.Enqueue(&download.Task{
		Type:        req.Type,
		BVID:        req.BVID,
		Page:        req.Page,
		QN:          req.QN,
		AudioID:     req.AudioID,
		AudioFormat: req.AudioFormat,
		SaveDir:     req.SaveDir,
	})
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"task": task})
}

func (s *Server) handleCancel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !s.opt.Manager.Cancel(id) {
		writeErr(w, 404, errors.New("任务不存在或已结束"))
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleClear(w http.ResponseWriter, r *http.Request) {
	s.opt.Manager.ClearFinished()
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ---- SSE ----

func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeErr(w, 500, errors.New("当前连接不支持流式推送"))
		return
	}
	w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	// 先发一份任务快照。
	for _, t := range s.opt.Manager.Snapshot() {
		writeSSE(w, "task", t)
	}
	if h := s.opt.History; h != nil {
		writeSSE(w, "history", h.List())
	}
	flusher.Flush()

	sub := s.opt.Manager.Subscribe()
	defer s.opt.Manager.Unsubscribe(sub)

	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-heartbeat.C:
			fmt.Fprint(w, ": ping\n\n")
			flusher.Flush()
		case ev, ok := <-sub.Ch():
			if !ok {
				return
			}
			writeSSE(w, ev.Type, ev)
			flusher.Flush()
		}
	}
}

func writeSSE(w io.Writer, event string, data any) {
	payload, err := json.Marshal(data)
	if err != nil {
		return
	}
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, payload)
}

// ---- 历史 ----

func (s *Server) handleHistory(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"items": s.opt.History.List()})
}

func (s *Server) handleHistoryDelete(w http.ResponseWriter, r *http.Request) {
	s.opt.History.Delete(r.PathValue("id"))
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleHistoryClear(w http.ResponseWriter, r *http.Request) {
	s.opt.History.Clear()
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ---- Cookie ----

func (s *Server) handleCookieBrowser(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()
	result, err := cookies.ImportFromBrowsers(ctx)
	if err != nil {
		writeErr(w, 422, err)
		return
	}
	s.opt.SetCookie(result.Cookie, "browser")
	s.loginMu.Lock()
	s.loginLast, s.loginAt = nil, time.Time{}
	s.loginMu.Unlock()
	login, _ := s.opt.Client.CheckLogin(ctx)
	writeJSON(w, http.StatusOK, map[string]any{
		"browser": result.Browser,
		"profile": result.Profile,
		"login":   login,
	})
}

func (s *Server) handleCookieManual(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SESSDATA string `json:"sessdata"`
	}
	if err := readJSON(r, &req); err != nil {
		writeErr(w, 400, err)
		return
	}
	cookie := cookies.FromManualSESSDATA(req.SESSDATA)
	if cookie == "" {
		writeErr(w, 400, errors.New("SESSDATA 不能为空"))
		return
	}
	s.opt.SetCookie(cookie, "manual")
	s.loginMu.Lock()
	s.loginLast, s.loginAt = nil, time.Time{}
	s.loginMu.Unlock()
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	login, err := s.opt.Client.CheckLogin(ctx)
	if err != nil {
		writeErr(w, 502, fmt.Errorf("Cookie 校验失败: %w", err))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"login": login})
}

func (s *Server) handleCookieClear(w http.ResponseWriter, r *http.Request) {
	s.opt.SetCookie("", "none")
	s.loginMu.Lock()
	s.loginLast, s.loginAt = nil, time.Time{}
	s.loginMu.Unlock()
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ---- 系统对话框 / 路径 ----

func (s *Server) handleDialogFolder(w http.ResponseWriter, r *http.Request) {
	dir, err := platform.PickFolder()
	if err != nil {
		writeErr(w, 500, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"path": dir})
}

func (s *Server) handlePathCheck(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Dir string `json:"dir"`
	}
	if err := readJSON(r, &req); err != nil {
		writeErr(w, 400, err)
		return
	}
	if err := platform.CheckDir(req.Dir); err != nil {
		writeJSON(w, 200, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true})
}

// ---- 静态资源 ----

func (s *Server) staticHandler() http.Handler {
	sub, err := fs.Sub(web.DistFS, "dist")
	if err != nil {
		log.Fatalf("嵌入的前端资源不可用: %v", err)
	}
	fileServer := http.FileServer(http.FS(sub))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := path.Clean(strings.TrimPrefix(r.URL.Path, "/"))
		if p == "" || p == "." {
			p = "index.html"
		}
		st, err := fs.Stat(sub, p)
		if err != nil || st.IsDir() {
			// SPA 回退到 index.html。
			r.URL.Path = "/"
		}
		fileServer.ServeHTTP(w, r)
	})
}
