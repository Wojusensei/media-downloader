// Package cookies 负责从本机浏览器导入 B 站登录 Cookie，或接受手动输入的 SESSDATA。
package cookies

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/browserutils/kooky"
	_ "github.com/browserutils/kooky/browser/chrome"
	_ "github.com/browserutils/kooky/browser/chromium"
	_ "github.com/browserutils/kooky/browser/edge"
	_ "github.com/browserutils/kooky/browser/firefox"
	_ "github.com/browserutils/kooky/browser/safari"
)

// 需要 B 站登录态的 Cookie 字段。
var wanted = []string{"SESSDATA", "bili_jct", "DedeUserID", "buvid3"}

// ImportResult 描述一次浏览器 Cookie 导入的结果。
type ImportResult struct {
	Cookie  string `json:"cookie"`
	Browser string `json:"browser"`
	Profile string `json:"profile"`
}

// browserPriority 决定多浏览器同时登录时优先采用哪个。
var browserPriority = map[string]int{
	"chrome": 4, "edge": 3, "firefox": 2, "safari": 1, "chromium": 0,
}

// ImportFromBrowsers 扫描本机浏览器，返回优先级最高、包含 SESSDATA 的 Cookie 串。
// 返回的错误携带每个浏览器失败的原因，便于在界面上解释。
func ImportFromBrowsers(ctx context.Context) (*ImportResult, error) {
	var results []*ImportResult
	var failures []string

	seq := kooky.TraverseCookies(ctx)
	for cookie, err := range seq {
		if err != nil {
			msg := strings.TrimSpace(err.Error())
			if msg != "" && !contains(failures, msg) {
				failures = append(failures, msg)
			}
			continue
		}
		if cookie == nil || cookie.Value == "" || !strings.Contains(cookie.Domain, "bilibili.com") {
			continue
		}
		if !wantedName(cookie.Name) {
			continue
		}
		browser, profile := browserOf(cookie)
		// 找到同浏览器同 Profile 已有的结果，合并字段。
		var existing *ImportResult
		for _, r := range results {
			if r.Browser == browser && r.Profile == profile {
				existing = r
				break
			}
		}
		if existing == nil {
			existing = &ImportResult{Browser: browser, Profile: profile}
			results = append(results, existing)
		}
		if existing.Cookie == "" {
			existing.Cookie = fmt.Sprintf("%s=%s", cookie.Name, cookie.Value)
		} else if !strings.Contains(existing.Cookie, cookie.Name+"=") {
			existing.Cookie += fmt.Sprintf("; %s=%s", cookie.Name, cookie.Value)
		}
	}

	// 只保留真正带 SESSDATA 的候选，按浏览器优先级与默认 Profile 排序。
	var valid []*ImportResult
	for _, r := range results {
		if strings.Contains(r.Cookie, "SESSDATA=") {
			valid = append(valid, r)
		}
	}
	if len(valid) == 0 {
		if len(failures) > 0 {
			return nil, fmt.Errorf("未在浏览器中找到 B 站登录信息（%s）", strings.Join(failures, "；"))
		}
		return nil, errors.New("未在浏览器中找到 B 站登录信息")
	}
	sort.Slice(valid, func(i, j int) bool {
		bi, bj := browserPriority[valid[i].Browser], browserPriority[valid[j].Browser]
		if bi != bj {
			return bi > bj
		}
		return valid[i].Profile < valid[j].Profile
	})
	return valid[0], nil
}

func wantedName(name string) bool {
	for _, w := range wanted {
		if name == w {
			return true
		}
	}
	return false
}

func browserOf(c *kooky.Cookie) (browser, profile string) {
	browser, profile = "unknown", ""
	if c.Browser != nil {
		browser = strings.ToLower(c.Browser.Browser())
		profile = c.Browser.Profile()
	}
	return browser, profile
}

func contains(list []string, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

// FromManualSESSDATA 把手动粘贴的 SESSDATA 组装为 Cookie 串。
func FromManualSESSDATA(sessdata string) string {
	sessdata = strings.TrimSpace(sessdata)
	if sessdata == "" {
		return ""
	}
	// 容错：用户直接粘贴了完整 Cookie 串的情况。
	if strings.Contains(sessdata, "SESSDATA=") {
		parts := strings.Split(sessdata, ";")
		for _, p := range parts {
			if strings.HasPrefix(strings.TrimSpace(p), "SESSDATA=") {
				return strings.TrimSpace(p)
			}
		}
	}
	return "SESSDATA=" + sessdata
}
