package bilibili

import "testing"

func TestExtractBV(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"https://www.bilibili.com/video/BV1GJ411x7h7?spm_id_from=333", "BV1GJ411x7h7"},
		{"BV1GJ411x7h7", "BV1GJ411x7h7"},
		{"看看这个 b23.tv/BV1xx411c7mD 分享", "BV1xx411c7mD"},
		{"https://www.bilibili.com/video/av170001", ""},
		{"BV123", ""},
		{"", ""},
	}
	for _, c := range cases {
		if got := ExtractBV(c.in); got != c.want {
			t.Errorf("ExtractBV(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func makeStreams() *DASHStreams {
	return &DASHStreams{
		Videos: []dashStream{
			{ID: 32, BaseURL: "hevc480", Bandwidth: 400_000, Codecs: "hev1.1.6.L120.90"},
			{ID: 32, BaseURL: "avc480", Bandwidth: 500_000, Codecs: "avc1.64001f"},
			{ID: 16, BaseURL: "avc360", Bandwidth: 200_000, Codecs: "avc1.64001e"},
		},
		Audios: []dashStream{
			{ID: 30216, BaseURL: "a64", Bandwidth: 64_000},
			{ID: 30280, BaseURL: "a132", Bandwidth: 132_000},
		},
	}
}

func TestPickVideoStreamPrefersAVC(t *testing.T) {
	d := makeStreams()
	s := d.PickVideoStream(32)
	if s == nil || s.BaseURL != "avc480" {
		t.Fatalf("want avc480, got %+v", s)
	}
}

func TestPickVideoStreamFallback(t *testing.T) {
	d := makeStreams()
	s := d.PickVideoStream(120) // 不存在的档位
	if s == nil || s.BaseURL != "avc480" {
		t.Fatalf("fallback 应取 AVC 码率最高，got %+v", s)
	}
}

func TestPickAudioStream(t *testing.T) {
	d := makeStreams()
	if s := d.PickAudioStream(0); s == nil || s.ID != 30280 {
		t.Fatalf("默认应取码率最高，got %+v", s)
	}
	if s := d.PickAudioStream(30216); s == nil || s.ID != 30216 {
		t.Fatalf("应按 id 精确匹配，got %+v", s)
	}
	if s := d.PickAudioStream(9999); s != nil {
		t.Fatalf("不存在的 id 应回退最高码率，got %+v", s)
	}
}
