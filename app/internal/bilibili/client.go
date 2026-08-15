// Package bilibili 封装 B 站公开接口的访问：视频信息、播放地址（传统流与 DASH）、封面代理。
package bilibili

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

const (
	userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
	referer   = "https://www.bilibili.com/"

	apiView    = "https://api.bilibili.com/x/web-interface/view"
	apiPlayURL = "https://api.bilibili.com/x/player/playurl"
)

// 常见 DASH 音质档位的展示名，未收录的档位回退为码率描述。
var audioQualityNames = map[int]string{
	30216: "64K 标准音质",
	30232: "192K 高品音质",
	30280: "132K 较高音质",
	30250: "杜比全景声",
	30251: "Hi-Res 无损音质",
}

// Client 是 B 站 API 客户端，可在设置 Cookie 后并发使用。
type Client struct {
	mu     sync.RWMutex
	cookie string

	hc *http.Client
}

// NewClient 创建一个客户端，cookie 可为空（游客模式）。
func NewClient(cookie string) *Client {
	return &Client{
		cookie: strings.TrimSpace(cookie),
		hc: &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig:     &tls.Config{MinVersion: tls.VersionTLS12},
				MaxIdleConns:        16,
				IdleConnTimeout:     90 * time.Second,
				TLSHandshakeTimeout: 10 * time.Second,
			},
		},
	}
}

// SetCookie 更新 Cookie（空串表示游客模式）。
func (c *Client) SetCookie(cookie string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.cookie = strings.TrimSpace(cookie)
}

// Cookie 返回当前 Cookie。
func (c *Client) Cookie() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.cookie
}

func (c *Client) headers() http.Header {
	h := http.Header{}
	h.Set("User-Agent", userAgent)
	h.Set("Referer", referer)
	h.Set("Origin", "https://www.bilibili.com")
	h.Set("Accept", "application/json, text/plain, */*")
	h.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
	c.mu.RLock()
	if c.cookie != "" {
		h.Set("Cookie", c.cookie)
	}
	c.mu.RUnlock()
	return h
}

// DownloadHeaders 返回下载 CDN 资源所需的请求头。
func (c *Client) DownloadHeaders() http.Header {
	return c.headers()
}

var bvRe = regexp.MustCompile(`BV[0-9A-Za-z]{10}`)

// ExtractBV 从任意输入中提取 BV 号，失败返回空串。
func ExtractBV(s string) string {
	if s == "" {
		return ""
	}
	m := bvRe.FindString(strings.TrimSpace(s))
	return m
}

func (c *Client) getJSON(ctx context.Context, api string, query url.Values, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, api+"?"+query.Encode(), nil)
	if err != nil {
		return err
	}
	req.Header = c.headers()
	resp, err := c.hc.Do(req)
	if err != nil {
		return fmt.Errorf("网络请求失败: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return fmt.Errorf("读取响应失败: %w", err)
	}
	var envelope struct {
		Code    int             `json:"code"`
		Message string          `json:"message"`
		Data    json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		return fmt.Errorf("响应解析失败: %w", err)
	}
	if envelope.Code != 0 {
		return fmt.Errorf("B站接口错误: %s", envelope.Message)
	}
	if len(envelope.Data) == 0 {
		return errors.New("B站接口返回空数据")
	}
	return json.Unmarshal(envelope.Data, out)
}

// GetVideoInfo 获取视频信息（标题、CID、封面、分 P 等）。
func (c *Client) GetVideoInfo(ctx context.Context, bvid string) (*VideoInfo, error) {
	var raw viewData
	q := url.Values{"bvid": {bvid}}
	if err := c.getJSON(ctx, apiView, q, &raw); err != nil {
		return nil, err
	}
	info := &VideoInfo{
		BVID:            raw.BVID,
		Title:           raw.Title,
		CID:             raw.CID,
		Cover:           raw.Pic,
		Duration:        raw.Duration,
		Owner:           raw.Owner.Name,
		IsUpInteractive: raw.Rights.IsUpInteractive,
	}
	for _, p := range raw.Pages {
		info.Pages = append(info.Pages, Page{CID: p.CID, Index: p.Page, Title: p.Part})
	}
	return info, nil
}

// LegacyStream 是一条自带音频的传统 MP4/FLV 流。
type LegacyStream struct {
	URL  string
	Size int64
}

// GetLegacyStream 获取传统流（有声音，无需 ffmpeg 合并，但画质有限）。
func (c *Client) GetLegacyStream(ctx context.Context, bvid string, cid int64, qn int) (*LegacyStream, error) {
	var data playURLData
	q := url.Values{
		"bvid":  {bvid},
		"cid":   {fmt.Sprint(cid)},
		"qn":    {fmt.Sprint(qn)},
		"fnval": {"1"},
	}
	if err := c.getJSON(ctx, apiPlayURL, q, &data); err != nil {
		return nil, err
	}
	if len(data.Durl) == 0 || data.Durl[0].URL == "" {
		return nil, errors.New("未获取到传统视频流（可能需要大会员或视频不支持该清晰度）")
	}
	return &LegacyStream{URL: data.Durl[0].URL, Size: data.Durl[0].Size}, nil
}

// DASHStreamPair 是一组 DASH 视频流/音频流的候选列表。
type DASHStreams struct {
	Videos []dashStream
	Audios []dashStream
}

// GetDASHStreams 获取 DASH 流信息，包含画质档位列表与音频档位列表。
func (c *Client) GetDASHStreams(ctx context.Context, bvid string, cid int64, qn int) (*DASHStreams, []Quality, []AudioQuality, bool, error) {
	var data playURLData
	q := url.Values{
		"bvid":  {bvid},
		"cid":   {fmt.Sprint(cid)},
		"qn":    {"127"},
		"fnval": {"16"},
	}
	if qn > 0 {
		q.Set("qn", fmt.Sprint(qn))
	}
	if err := c.getJSON(ctx, apiPlayURL, q, &data); err != nil {
		return nil, nil, nil, false, err
	}
	d := &DASHStreams{Videos: data.Dash.Video, Audios: data.Dash.Audio}
	d.Audios = append(d.Audios, data.Dash.Dolby.Audio...)
	if data.Dash.Flac != nil && data.Dash.Flac.Audio != nil {
		d.Audios = append(d.Audios, *data.Dash.Flac.Audio)
	}

	var qualities []Quality
	seen := map[int]bool{}
	for i, qn := range data.AcceptQuality {
		if seen[qn] {
			continue
		}
		seen[qn] = true
		desc := fmt.Sprintf("qn=%d", qn)
		if i < len(data.AcceptDescription) && data.AcceptDescription[i] != "" {
			desc = data.AcceptDescription[i]
		}
		qualities = append(qualities, Quality{QN: qn, Desc: desc})
	}

	var audioQ []AudioQuality
	seenA := map[int]bool{}
	for _, a := range d.Audios {
		if seenA[a.ID] {
			continue
		}
		seenA[a.ID] = true
		desc, ok := audioQualityNames[a.ID]
		if !ok {
			desc = fmt.Sprintf("%d kbps", a.Bandwidth/1000)
		}
		audioQ = append(audioQ, AudioQuality{ID: a.ID, Desc: desc, Bandwidth: a.Bandwidth})
	}

	vip := data.Timer.IsVip
	return d, qualities, audioQ, vip, nil
}

// PickVideoStream 按 qn 挑选最合适的 DASH 视频流（同档位取码率最高，兼顾 AVC 优先保证兼容性）。
func (d *DASHStreams) PickVideoStream(qn int) *dashStream {
	var best *dashStream
	for i := range d.Videos {
		s := &d.Videos[i]
		if s.ID != qn {
			continue
		}
		avc := strings.Contains(s.Codecs, "avc")
		if best == nil ||
			(avc && !strings.Contains(best.Codecs, "avc")) ||
			(avc == strings.Contains(best.Codecs, "avc") && s.Bandwidth > best.Bandwidth) {
			best = s
		}
	}
	if best == nil {
		// 找不到精确档位时在全部流里选码率最高且优先 AVC 的（兼容性最好）。
		for i := range d.Videos {
			s := &d.Videos[i]
			if s.BaseURL == "" {
				continue
			}
			if best == nil {
				best = s
				continue
			}
			sAVC, bAVC := strings.Contains(s.Codecs, "avc"), strings.Contains(best.Codecs, "avc")
			if sAVC != bAVC {
				if sAVC {
					best = s
				}
				continue
			}
			if s.Bandwidth > best.Bandwidth {
				best = s
			}
		}
	}
	return best
}

// PickAudioStream 按音频档位 id 挑选音频流，id<=0 时取码率最高的一条。
func (d *DASHStreams) PickAudioStream(id int) *dashStream {
	var best *dashStream
	for i := range d.Audios {
		s := &d.Audios[i]
		if id > 0 && s.ID != id {
			continue
		}
		if best == nil || s.Bandwidth > best.Bandwidth {
			best = s
		}
	}
	return best
}

// URLCandidates 返回一条流的主备地址。
func (s *dashStream) URLCandidates() []string {
	if s == nil || s.BaseURL == "" {
		return nil
	}
	return append([]string{s.BaseURL}, s.BackupURL...)
}
