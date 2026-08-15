# 第三方依赖声明

本项目（`app/` 图形界面应用）在构建与分发中链接了以下开源库。
各许可证原文可在对应上游仓库或本文件所在仓库的模块缓存中查阅。

## Go 依赖

| 依赖 | 用途 | 许可证 |
|------|------|--------|
| [browserutils/kooky](https://github.com/browserutils/kooky) | 读取本机浏览器 Cookie | MIT |
| [browserutils/ese](https://github.com/browserutils/ese) | ESE 数据库解析（kooky 依赖） | Apache-2.0 |
| [browserutils/sqlite3](https://github.com/browserutils/sqlite3) | 纯 Go SQLite 读取（kooky 依赖） | BSD（go-sqlite 作者） |
| [godbus/dbus](https://github.com/godbus/dbus) | Linux 密钥环访问（kooky 依赖） | BSD-2-Clause |
| [gonuts/binary](https://github.com/gonuts/binary) | 二进制解析（kooky 依赖） | MIT |
| [keybase/go-keychain](https://github.com/keybase/go-keychain) | macOS 钥匙串访问（kooky 依赖） | MIT |
| [pierrec/lz4](https://github.com/pierrec/lz4) | LZ4 解压（ESE 数据依赖） | BSD-2-Clause |
| [zalando/go-keyring](https://github.com/zalando/go-keyring) | 跨平台密钥环（kooky 依赖） | MIT |
| [golang.org/x/sys](https://go.dev/golang.org/x/sys) | Windows DPAPI 等系统调用 | BSD-3-Clause |
| [golang.org/x/crypto](https://go.dev/golang.org/x/crypto) | 加密原语 | BSD-3-Clause |
| [golang.org/x/net](https://go.dev/golang.org/x/net) | 网络基础库 | BSD-3-Clause |
| [golang.org/x/text](https://go.dev/golang.org/x/text) | 文本编码 | BSD-3-Clause |
| [gopkg.in/ini.v1](https://github.com/go-ini/ini) | INI 解析（Firefox 配置读取） | Apache-2.0 |

## 前端依赖

Vite / React / TypeScript 及其子依赖均使用 MIT 许可证，详见 `app/web/package-lock.json`。

## 其他

- 下载能力依赖可选安装的 [FFmpeg](https://ffmpeg.org)（LGPL/GPL，按其自身条款分发，本项目不捆绑）。
- 本项目与 bilibili 无隶属关系；Bilibili 及相关商标归上海幻电信息科技有限公司所有。
