package cookies

import "testing"

func TestFromManualSESSDATA(t *testing.T) {
	if got := FromManualSESSDATA("abc%2F123"); got != "SESSDATA=abc%2F123" {
		t.Fatalf("got %q", got)
	}
	full := "buvid3=xx; SESSDATA=secret; bili_jct=yy"
	if got := FromManualSESSDATA(full); got != "SESSDATA=secret" {
		t.Fatalf("完整 Cookie 串应只提取 SESSDATA，got %q", got)
	}
	if got := FromManualSESSDATA("  "); got != "" {
		t.Fatalf("空输入应返回空串，got %q", got)
	}
}
