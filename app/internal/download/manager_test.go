package download

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSafeName(t *testing.T) {
	cases := []struct{ in, want string }{
		{`video: <test>/\ok?`, "video test ok"},
		{"正常标题", "正常标题"},
		{"  多  余  空白  ", "多 余 空白"},
		{"结尾点.", "结尾点"},
	}
	for _, c := range cases {
		if got := SafeName(c.in); got != c.want {
			t.Errorf("SafeName(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestUniquePath(t *testing.T) {
	dir := t.TempDir()
	first := filepath.Join(dir, "a.txt")
	os.WriteFile(first, []byte("x"), 0o644)
	second := UniquePath(first)
	if second != filepath.Join(dir, "a (1).txt") {
		t.Fatalf("got %q", second)
	}
	os.WriteFile(second, []byte("x"), 0o644)
	third := UniquePath(first)
	if third != filepath.Join(dir, "a (2).txt") {
		t.Fatalf("got %q", third)
	}
	if UniquePath(filepath.Join(dir, "b.txt")) != filepath.Join(dir, "b.txt") {
		t.Fatal("不存在的文件不应被改名")
	}
}
