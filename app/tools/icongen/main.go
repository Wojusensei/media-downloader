// icongen 用纯 Go 绘制应用图标，生成 macOS ICNS、Windows ICO 与多尺寸 PNG。
// 设计母题：B 站粉蓝渐变圆角方块 + 小电视轮廓 + 下载箭头，与界面 Logo 一致。
package main

import (
	"flag"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"math"
	"os"
	"path/filepath"
)

// ---------- 几何工具 ----------

type vec struct{ x, y float64 }

func sub(a, b vec) vec      { return vec{a.x - b.x, a.y - b.y} }
func dot(a, b vec) float64  { return a.x*b.x + a.y*b.y }
func lenV(a vec) float64    { return math.Hypot(a.x, a.y) }
func scaleV(a vec, s float64) vec { return vec{a.x * s, a.y * s} }

// segDist 返回点到线段的最短距离（胶囊）。
func segDist(p, a, b vec) float64 {
	pa, ba := sub(p, a), sub(b, a)
	t := math.Max(0, math.Min(1, dot(pa, ba)/dot(ba, ba)))
	return lenV(sub(p, vec{a.x + ba.x*t, a.y + ba.y*t}))
}

// roundRectSD 是圆角矩形的带符号距离（内侧为负）。
func roundRectSD(p, center vec, half, radius float64) float64 {
	q := vec{math.Abs(p.x-center.x) - half + radius, math.Abs(p.y-center.y) - half + radius}
	return lenV(vec{math.Max(q.x, 0), math.Max(q.y, 0)}) + math.Min(math.Max(q.x, q.y), 0) - radius
}

// ---------- 主绘制 ----------

const design = 64.0 // 设计坐标（与 favicon/Logo 相同的 64 视口）

type layer func(p vec, s float64) (color.RGBA, float64) // 返回颜色与覆盖 alpha

func mixOver(dst color.RGBA, src color.RGBA) color.RGBA {
	a := float64(src.A) / 255
	return color.RGBA{
		R: uint8(float64(src.R)*a + float64(dst.R)*(1-a)),
		G: uint8(float64(src.G)*a + float64(dst.G)*(1-a)),
		B: uint8(float64(src.B)*a + float64(dst.B)*(1-a)),
		A: uint8(math.Max(float64(src.A), float64(dst.A)*1)),
	}
}

// render 以 renderSize 绘制图标。
func render(renderSize int) *image.RGBA {
	s := float64(renderSize) / design
	img := image.NewRGBA(image.Rect(0, 0, renderSize, renderSize))

	pink := color.RGBA{R: 251, G: 114, B: 153, A: 255}
	blue := color.RGBA{R: 0, G: 174, B: 236, A: 255}
	violet := color.RGBA{R: 123, G: 108, B: 246, A: 255}
	white := color.RGBA{R: 255, G: 255, B: 255, A: 255}

	grad := func(t float64) color.RGBA {
		// 135 度对角线渐变：粉 → 紫 → 蓝
		var c1, c2 color.RGBA
		var k float64
		if t < 0.5 {
			c1, c2, k = pink, violet, t/0.5
		} else {
			c1, c2, k = violet, blue, (t-0.5)/0.5
		}
		return color.RGBA{
			R: uint8(float64(c1.R) + (float64(c2.R)-float64(c1.R))*k),
			G: uint8(float64(c1.G) + (float64(c2.G)-float64(c1.G))*k),
			B: uint8(float64(c1.B) + (float64(c2.B)-float64(c1.B))*k),
			A: 255,
		}
	}

	for py := 0; py < renderSize; py++ {
		for px := 0; px < renderSize; px++ {
			// 2x2 超采样抗锯齿
			var accR, accG, accB, accA float64
			for sy := 0; sy < 2; sy++ {
				for sx := 0; sx < 2; sx++ {
					p := vec{(float64(px) + float64(sx)/2) / s, (float64(py) + float64(sy)/2) / s}

					// 底板：圆角方块渐变
					sd := roundRectSD(p, vec{32, 32}, 30, 14)
					alphaBG := clamp(0.5 - sd)
					if alphaBG <= 0 {
						continue
					}
					c := grad(clamp01((p.x + p.y) / 128))

					// 屏幕外框（描边）
					screenSD := roundRectSD(p, vec{32, 33.75}, 16.5, 7)
					whiteA := clamp(2.0 - math.Abs(screenSD)) // 线宽 4

					// 天线两笔（左右关于 x=32 对称）
					antenna := math.Min(
						segDist(p, vec{21, 14.5}, vec{27.5, 22}),
						segDist(p, vec{43, 14.5}, vec{36.5, 22}),
					)
					whiteA = math.Max(whiteA, clamp(2.2-antenna))

					// 下载箭头（竖线 + 两侧斜线）
					arrow := math.Min(
						segDist(p, vec{32, 27.5}, vec{32, 34.5}),
						math.Min(
							segDist(p, vec{28, 30.5}, vec{32, 34.5}),
							segDist(p, vec{32, 34.5}, vec{36, 30.5}),
						),
					)
					whiteA = math.Max(whiteA, clamp(1.8-arrow))

					out := c
					if whiteA > 0 {
						out = mixOver(c, white)
						// 用白色覆盖度重建 alpha 混合
						wa := clamp01(whiteA)
						out = color.RGBA{
							R: blend(c.R, 255, wa), G: blend(c.G, 255, wa), B: blend(c.B, 255, wa), A: 255,
						}
					}

					a := alphaBG * 255
					accR += float64(out.R) * a / 255
					accG += float64(out.G) * a / 255
					accB += float64(out.B) * a / 255
					accA += a
				}
			}
			n := float64(4)
			if accA > 0 {
				alpha := accA / n
				img.SetRGBA(px, py, color.RGBA{
					R: uint8(accR / (accA/255) * (alpha / 255)),
					G: uint8(accG / (accA/255) * (alpha / 255)),
					B: uint8(accB / (accA/255) * (alpha / 255)),
					A: uint8(alpha),
				})
			}
		}
	}
	return img
}

func blend(a, b uint8, t float64) uint8 {
	return uint8(float64(a)*(1-t) + float64(b)*t)
}

func clamp01(v float64) float64 { return math.Max(0, math.Min(1, v)) }
func clamp(v float64) float64   { return clamp01(v) }

// downsample 用盒式滤波把大图缩小到 n（要求 srcSize 是 n 的整数倍）。
func downsample(src *image.RGBA, n int) *image.RGBA {
	m := src.Bounds().Dx() / n
	if m < 1 {
		m = 1
	}
	dst := image.NewRGBA(image.Rect(0, 0, n, n))
	for y := 0; y < n; y++ {
		for x := 0; x < n; x++ {
			var r, g, b, a, cnt float64
			for dy := 0; dy < m; dy++ {
				for dx := 0; dx < m; dx++ {
					c := src.RGBAAt(x*m+dx, y*m+dy)
					af := float64(c.A)
					r += float64(c.R) * af
					g += float64(c.G) * af
					b += float64(c.B) * af
					a += af
					cnt++
				}
			}
			if a > 0 {
				dst.SetRGBA(x, y, color.RGBA{
					R: uint8(r / a), G: uint8(g / a), B: uint8(b / a), A: uint8(a / cnt),
				})
			}
		}
	}
	return dst
}

func savePNG(path string, img image.Image) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	enc := png.Encoder{CompressionLevel: png.BestCompression}
	return enc.Encode(f, img)
}

// buildICNS 把 PNG 打包为 icns 容器。
func buildICNS(sizes map[int][]byte) ([]byte, error) {
	// 类型与尺寸的对应（现代 icns，全部内嵌 PNG）。
	order := []struct {
		typ  string
		size int
	}{
		{"icp4", 16}, {"icp5", 32}, {"ic11", 32}, {"icp6", 64}, {"ic12", 64},
		{"ic07", 128}, {"ic08", 256}, {"ic13", 256}, {"ic09", 512}, {"ic14", 512}, {"ic10", 1024},
	}
	var body []byte
	for _, it := range order {
		data, ok := sizes[it.size]
		if !ok {
			continue
		}
		body = append(body, []byte(it.typ)...)
		length := uint32(8 + len(data))
		body = append(body, byte(length>>24), byte(length>>16), byte(length>>8), byte(length))
		body = append(body, data...)
	}
	total := uint32(8 + len(body))
	out := []byte{'i', 'c', 'n', 's'}
	out = append(out, byte(total>>24), byte(total>>16), byte(total>>8), byte(total))
	return append(out, body...), nil
}

// buildICO 把 PNG 打包为 ico 容器。
func buildICO(sizes []int, pngs map[int][]byte) ([]byte, error) {
	header := []byte{0, 0, 1, 0, byte(len(sizes)), 0}
	dir := make([]byte, 0, len(sizes)*16)
	offset := 6 + len(sizes)*16
	var blobs []byte
	for _, s := range sizes {
		data := pngs[s]
		w := byte(s)
		if s >= 256 {
			w = 0
		}
		dir = append(dir,
			w, w,  // 宽、高（256 用 0 表示）
			0,     // 调色板数
			0,     // 保留
			1, 0,  // planes
			32, 0, // 位深
			byte(len(data)), byte(len(data)>>8), byte(len(data)>>16), byte(len(data)>>24),
			byte(offset), byte(offset>>8), byte(offset>>16), byte(offset>>24),
		)
		blobs = append(blobs, data...)
		offset += len(data)
	}
	out := append(header, dir...)
	return append(out, blobs...), nil
}

func main() {
	outDir := flag.String("out", "build/icons", "输出目录")
	preview := flag.Bool("preview", false, "额外生成 preview.png（深浅双底多尺寸预览，用于审阅）")
	flag.Parse()
	if err := os.MkdirAll(*outDir, 0o755); err != nil {
		fatal(err)
	}

	// 高分辨率底稿 → 各尺寸
	base := render(4096)
	icnsSizes := []int{16, 32, 64, 128, 256, 512, 1024}
	pngs := map[int][]byte{}
	imgs := map[int]*image.RGBA{}
	for _, n := range icnsSizes {
		var img *image.RGBA
		if n == 16 {
			// 16px 从 512 缩两次更柔和
			mid := downsample(base, 512)
			img = downsample(mid, 16)
		} else {
			img = downsample(base, n)
		}
		imgs[n] = img
		tmp := filepath.Join(*outDir, fmt.Sprintf("icon_%d.png", n))
		if err := savePNG(tmp, img); err != nil {
			fatal(err)
		}
		data, err := os.ReadFile(tmp)
		if err != nil {
			fatal(err)
		}
		pngs[n] = data
	}

	// ICNS
	icns, err := buildICNS(pngs)
	if err != nil {
		fatal(err)
	}
	if err := os.WriteFile(filepath.Join(*outDir, "AppIcon.icns"), icns, 0o644); err != nil {
		fatal(err)
	}

	// ICO
	icoSizes := []int{16, 24, 32, 48, 64, 128, 256}
	icoPNGs := map[int][]byte{16: pngs[16], 32: pngs[32], 64: pngs[64], 128: pngs[128], 256: pngs[256]}
	for _, n := range []int{24, 48} {
		img := downsample(base, n)
		tmp := filepath.Join(*outDir, fmt.Sprintf("icon_%d.png", n))
		if err := savePNG(tmp, img); err != nil {
			fatal(err)
		}
		data, _ := os.ReadFile(tmp)
		icoPNGs[n] = data
	}
	ico, err := buildICO(icoSizes, icoPNGs)
	if err != nil {
		fatal(err)
	}
	if err := os.WriteFile(filepath.Join(*outDir, "AppIcon.ico"), ico, 0o644); err != nil {
		fatal(err)
	}

	fmt.Printf("图标已生成到 %s：AppIcon.icns / AppIcon.ico / PNG x%d\n", *outDir, len(icnsSizes)+2)

	if *preview {
		if err := writePreview(filepath.Join(*outDir, "preview.png"), imgs[256], imgs[64], imgs[32], imgs[16]); err != nil {
			fatal(err)
		}
		fmt.Println("预览图：", filepath.Join(*outDir, "preview.png"))
	}
}

// writePreview 生成审阅用预览：左深底右浅底，大图 + 小尺寸一排。
func writePreview(path string, big, s64, s32, s16 *image.RGBA) error {
	const W, H = 1200, 640
	img := image.NewRGBA(image.Rect(0, 0, W, H))
	// 左深右浅
	dark := color.RGBA{R: 11, G: 13, B: 22, A: 255}
	light := color.RGBA{R: 245, G: 246, B: 251, A: 255}
	for x := 0; x < W; x++ {
		for y := 0; y < H; y++ {
			if x < W/2 {
				img.SetRGBA(x, y, dark)
			} else {
				img.SetRGBA(x, y, light)
			}
		}
	}
	// 大图标（256）居中
	drawIcon(img, big, W/4-128, H/2-128)
	drawIcon(img, big, W*3/4-128, H/2-128)
	// 小尺寸一排（浅色侧底部）
	x := W/2 + 60
	for _, s := range []*image.RGBA{s64, s32, s16} {
		drawIcon(img, s, x, H-140)
		x += s.Bounds().Dx() + 40
	}
	return savePNG(path, img)
}

func drawIcon(dst *image.RGBA, icon *image.RGBA, x, y int) {
	for dy := 0; dy < icon.Bounds().Dy(); dy++ {
		for dx := 0; dx < icon.Bounds().Dx(); dx++ {
			if c := icon.RGBAAt(dx, dy); c.A > 0 {
				dst.SetRGBA(x+dx, y+dy, c)
			}
		}
	}
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "icongen:", err)
	os.Exit(1)
}
