// Package web 嵌入前端构建产物（web/dist），供后端直接托管。
package web

import "embed"

// DistFS 是前端构建产物的文件系统。
//
//go:embed all:dist
var DistFS embed.FS
