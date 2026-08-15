#!/bin/bash
# 打包脚本：产出 macOS universal .app + dmg、Windows x64/arm64 exe。
# 用法：./build/package.sh [版本号，默认 4.0.0]
set -euo pipefail

VERSION="${1:-4.0.0}"
APP_NAME="Bilibili 下载器"
BIN_NAME="MediaDownloader"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/dist"
GOBIN="$(go env GOPATH)/bin"

cd "$ROOT"

echo "==> 前端构建"
(cd web && npm ci --silent && npm run build)

echo "==> 生成图标"
go run ./tools/icongen -out build/icons

echo "==> Windows 资源（图标 + 版本信息）"
# -platform-specific 模式下 goversioninfo 会把 resource_<os>_<arch>.syso 写到当前目录，
# 生成后移入主包目录，go build 会按 GOOS/GOARCH 自动链接。
rm -f cmd/media-downloader/resource_windows_*.syso
GOOS=windows GOARCH=amd64 "$GOBIN/goversioninfo" -platform-specific \
  -icon=build/icons/AppIcon.ico -manifest=build/app.manifest \
  build/versioninfo.json
GOOS=windows GOARCH=arm64 "$GOBIN/goversioninfo" -platform-specific \
  -icon=build/icons/AppIcon.ico -manifest=build/app.manifest \
  build/versioninfo.json
mv resource_windows_amd64.syso resource_windows_arm64.syso cmd/media-downloader/
rm -f resource_windows_386.syso resource_windows_arm.syso

mkdir -p "$OUT"
LDFLAGS="-s -w"

echo "==> Windows x64 / arm64 交叉编译"
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "$LDFLAGS" \
  -o "$OUT/MediaDownloader_${VERSION}_windows_x64.exe" ./cmd/media-downloader
GOOS=windows GOARCH=arm64 CGO_ENABLED=0 go build -trimpath -ldflags "$LDFLAGS" \
  -o "$OUT/MediaDownloader_${VERSION}_windows_arm64.exe" ./cmd/media-downloader

echo "==> macOS 双架构编译 + 合并"
GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 go build -trimpath -ldflags "$LDFLAGS" \
  -o "$OUT/.tmp_media_arm64" ./cmd/media-downloader
GOOS=darwin GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "$LDFLAGS" \
  -o "$OUT/.tmp_media_amd64" ./cmd/media-downloader
lipo -create -output "$OUT/$BIN_NAME" "$OUT/.tmp_media_arm64" "$OUT/.tmp_media_amd64"
rm -f "$OUT/.tmp_media_arm64" "$OUT/.tmp_media_amd64"

echo "==> 组装 .app"
APP="$OUT/${BIN_NAME}.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$OUT/$BIN_NAME" "$APP/Contents/MacOS/$BIN_NAME"
cp build/icons/AppIcon.icns "$APP/Contents/Resources/AppIcon.icns"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${APP_NAME}</string>
  <key>CFBundleDisplayName</key><string>${APP_NAME}</string>
  <key>CFBundleExecutable</key><string>${BIN_NAME}</string>
  <key>CFBundleIdentifier</key><string>com.wojusensei.media-downloader</string>
  <key>CFBundleVersion</key><string>${VERSION}</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.utilities</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSAppleEventsUsageDescription</key>
  <string>用于打开系统文件夹选择窗口。</string>
  <key>CFBundleURLTypes</key>
  <array/>
</dict>
</plist>
PLIST
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || true
rm -f "$OUT/$BIN_NAME"

echo "==> 制作 dmg"
DMG_STAGING="$OUT/.dmg_staging"
rm -rf "$DMG_STAGING"
mkdir -p "$DMG_STAGING"
cp -R "$APP" "$DMG_STAGING/"
ln -s /Applications "$DMG_STAGING/Applications"
hdiutil create -volname "${APP_NAME} ${VERSION}" \
  -srcfolder "$DMG_STAGING" -ov -format UDZO \
  "$OUT/MediaDownloader_${VERSION}_macos_universal.dmg" >/dev/null
rm -rf "$DMG_STAGING"

echo "==> 完成，产物："
ls -lh "$OUT" | awk 'NR>1 {printf "    %s  %s\n", $5, $NF}'
