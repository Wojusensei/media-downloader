# media-downloader 构建入口
VERSION ?= 4.0.0

.PHONY: dev web icons test vet build package clean

# 开发模式：先跑 Go 服务（固定端口），再起 Vite 热更新
dev:
	@echo "先启动后端: go run ./cmd/media-downloader -addr 127.0.0.1:8420 -no-open"
	@echo "再另开终端: cd web && npm run dev"
	@(cd web && npm run dev &); \
	go run ./cmd/media-downloader -addr 127.0.0.1:8420 -no-open

web:
	cd web && npm install && npm run build

icons:
	go run ./tools/icongen -out build/icons

test:
	go vet ./... && go test ./...

# 仅构建当前平台二进制（快速验证用）
build: web
	go build -trimpath -ldflags "-s -w" -o dist/media-downloader ./cmd/media-downloader

# 全平台打包：macOS universal .app + dmg，Windows x64 / arm64 exe
package:
	bash build/package.sh $(VERSION)

clean:
	rm -rf dist build/icons web/dist
