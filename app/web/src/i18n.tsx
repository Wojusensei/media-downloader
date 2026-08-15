// 语言系统：中文 / 英文切换，localStorage 持久化。
// 中文文案由用户逐条定稿；英文为配套译文。
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type Lang = 'zh' | 'en'

const STORAGE_KEY = 'md-lang'

const zh: Record<string, string> = {
  // 顶栏
  'brand.name': 'Bilibili 下载器',
  'brand.tag': '流光 · Lightflow',
  'topbar.guest': '游客',
  'topbar.loggedIn': '已登录',
  'topbar.vip': '大会员',
  'topbar.history': '下载历史',
  'topbar.settings': '设置',
  'topbar.theme': '主题模式',
  'topbar.lang': '语言',

  // 首屏
  'hero.titleL': '知你所求',
  'hero.titleR': '予你所需',
  'hero.sub': '视频 · 音频 · 封面，多清晰度选择，登录解锁更高画质',
  'hero.placeholder': '粘贴视频链接或 BV 号',
  'hero.paste': '粘贴',
  'hero.pasteTitle': '从剪贴板粘贴',
  'hero.submitTitle': '解析视频',
  'hero.hint':
    '支持 bilibili.com 链接、b23.tv 短链、纯 BV 号 · 粘贴后自动解析 · Command / Ctrl + Enter 开始',

  // 视频卡片
  'card.pages': '分集',
  'card.type': '内容',
  'card.quality': '画质',
  'card.audio': '音质与格式',
  'card.saveTo': '保存至',
  'type.video': '视频',
  'type.audio': '音频',
  'type.cover': '封面',
  'card.downloadVideo': '下载视频',
  'card.downloadAudio': '下载音频',
  'card.downloadCover': '下载封面',
  'card.vipFlag': '大会员画质可用',
  'card.hintNoFFmpeg': '未检测到 ffmpeg：仅能下载自带声音的标准画质',
  'card.hintGuest': '游客模式画质有限，登录后可解锁更高清晰度',
  'card.pickFolderTitle': '选择其他文件夹',
  'card.typeAria': '下载内容类型',
  'card.qualityAria': '画质',
  'card.audioQAria': '音质',
  'card.audioFAria': '音频格式',
  'card.pagesAria': '选择分集',

  // 下载队列
  'dl.title': '下载队列',
  'dl.empty': '暂无下载任务，粘贴链接开始第一次下载',
  'dl.clear': '清除已结束',
  'dl.count': '{n} 个进行中',
  'dl.canceled': '已取消',
  'dl.resolving': '正在解析视频信息',
  'dl.merging': '正在合并 / 转码，请稍候',
  'dl.cancelTitle': '取消任务',
  'dl.region': '下载任务',

  // 提示
  'toast.done': '下载完成：{title}',
  'toast.failed': '下载失败：{reason}',
  'toast.queued': '任务已加入下载队列',
  'toast.saveDirUpdated': '保存位置已更新：{path}',
  'toast.connLost': '无法连接本地服务，请重启应用',
  'toast.imported': '已从 {browser} 导入登录态，欢迎 {name}',
  'toast.importNoLogin': '已从 {browser} 导入 Cookie，但校验未通过（可能未登录 B 站）',
  'toast.loginOk': '登录成功，欢迎 {name}',
  'toast.badSessdata': 'SESSDATA 无效或已过期',
  'toast.logout': '已退出登录，回到游客模式',
  'toast.parseFailed': '解析失败',
  'toast.createFailed': '任务创建失败',
  'toast.opFailed': '操作失败',
  'toast.deleteFailed': '删除失败',
  'toast.clearFailed': '清空失败',
  'toast.cancelFailed': '取消失败',
  'toast.importFailed': '导入失败',
  'toast.applyFailed': '设置失败',
  'toast.folderPickerFailed': '无法打开目录选择',
  'toast.close': '关闭提示',

  // 设置抽屉
  'settings.title': '设置',
  'settings.accountGroup': 'B 站账号',
  'settings.appearanceGroup': '外观',
  'settings.envGroup': '环境',
  'settings.aboutGroup': '关于',
  'settings.guestCard': '游客模式',
  'settings.guestHint': '登录后可下载更高清晰度',
  'settings.loggedInHint': '已登录 · 可下载会员清晰度',
  'settings.logout': '退出',
  'settings.importing': '正在读取浏览器…',
  'settings.importBtn': '从本机浏览器导入登录（Chrome / Edge / Firefox / Safari）',
  'settings.keychainNote':
    'macOS 首次读取 Chrome / Safari 时，系统可能请求钥匙串与磁盘访问权限，请允许。',
  'settings.sessdataPlaceholder': '或手动粘贴 SESSDATA',
  'settings.sessdataBtn': '登录',
  'settings.themeLabel': '主题模式',
  'theme.light': '浅色',
  'theme.dark': '深色',
  'theme.system': '跟随系统',
  'settings.saveDir': '默认保存目录',
  'settings.ffmpeg': 'ffmpeg',
  'settings.ffmpegOk': '可用（高画质与 MP3 已解锁）',
  'settings.ffmpegMissing': '未安装（回退标准画质）',
  'settings.platform': '平台',
  'settings.platform.darwin': 'macOS',
  'settings.platform.windows': 'Windows',
  'settings.aboutName': 'Bilibili 下载器 · 流光',
  'settings.version': '版本 {v}',

  // 历史抽屉
  'history.title': '下载历史',
  'history.clear': '清空',
  'history.empty': '还没有下载记录',
  'history.deleteTitle': '删除该记录',
  'history.delete': '删除',
}

const en: Record<string, string> = {
  'brand.name': 'Bilibili Downloader',
  'brand.tag': 'Lightflow',
  'topbar.guest': 'Guest',
  'topbar.loggedIn': 'Signed in',
  'topbar.vip': 'VIP',
  'topbar.history': 'History',
  'topbar.settings': 'Settings',
  'topbar.theme': 'Theme',
  'topbar.lang': 'Language',

  'hero.titleL': 'What You Seek',
  'hero.titleR': 'What You Keep',
  'hero.sub': 'Video, audio and cover art in multiple qualities — sign in to unlock more',
  'hero.placeholder': 'Paste a video link or BV number',
  'hero.paste': 'Paste',
  'hero.pasteTitle': 'Paste from clipboard',
  'hero.submitTitle': 'Parse video',
  'hero.hint':
    'Supports bilibili.com links, b23.tv short links and plain BV numbers · Auto-parses on paste · Cmd/Ctrl + Enter to start',

  'card.pages': 'Part',
  'card.type': 'Content',
  'card.quality': 'Quality',
  'card.audio': 'Audio & Format',
  'card.saveTo': 'Save to',
  'type.video': 'Video',
  'type.audio': 'Audio',
  'type.cover': 'Cover',
  'card.downloadVideo': 'Download Video',
  'card.downloadAudio': 'Download Audio',
  'card.downloadCover': 'Download Cover',
  'card.vipFlag': 'VIP quality available',
  'card.hintNoFFmpeg': 'ffmpeg not detected: only standard quality with sound is available',
  'card.hintGuest': 'Guest mode is limited — sign in to unlock higher quality',
  'card.pickFolderTitle': 'Choose another folder',
  'card.typeAria': 'Content type',
  'card.qualityAria': 'Quality',
  'card.audioQAria': 'Audio quality',
  'card.audioFAria': 'Audio format',
  'card.pagesAria': 'Select part',

  'dl.title': 'Downloads',
  'dl.empty': 'No downloads yet — paste a link to get started',
  'dl.clear': 'Clear finished',
  'dl.count': '{n} active',
  'dl.canceled': 'Canceled',
  'dl.resolving': 'Resolving video info',
  'dl.merging': 'Merging / transcoding…',
  'dl.cancelTitle': 'Cancel task',
  'dl.region': 'Download tasks',

  'toast.done': 'Downloaded: {title}',
  'toast.failed': 'Failed: {reason}',
  'toast.queued': 'Task queued',
  'toast.saveDirUpdated': 'Save location updated: {path}',
  'toast.connLost': 'Cannot reach the local service — please restart the app',
  'toast.imported': 'Login imported from {browser}. Welcome, {name}',
  'toast.importNoLogin':
    'Cookie imported from {browser}, but validation failed (maybe not signed in to bilibili.com)',
  'toast.loginOk': 'Signed in. Welcome, {name}',
  'toast.badSessdata': 'Invalid or expired SESSDATA',
  'toast.logout': 'Signed out. Back to guest mode',
  'toast.parseFailed': 'Parse failed',
  'toast.createFailed': 'Failed to create task',
  'toast.opFailed': 'Operation failed',
  'toast.deleteFailed': 'Delete failed',
  'toast.clearFailed': 'Clear failed',
  'toast.cancelFailed': 'Cancel failed',
  'toast.importFailed': 'Import failed',
  'toast.applyFailed': 'Failed to save',
  'toast.folderPickerFailed': 'Could not open the folder picker',
  'toast.close': 'Dismiss',

  'settings.title': 'Settings',
  'settings.accountGroup': 'Bilibili Account',
  'settings.appearanceGroup': 'Appearance',
  'settings.envGroup': 'Environment',
  'settings.aboutGroup': 'About',
  'settings.guestCard': 'Guest mode',
  'settings.guestHint': 'Sign in to download in higher quality',
  'settings.loggedInHint': 'Signed in · member qualities available',
  'settings.logout': 'Sign out',
  'settings.importing': 'Reading browsers…',
  'settings.importBtn': 'Import login from local browsers (Chrome / Edge / Firefox / Safari)',
  'settings.keychainNote':
    'On first import, macOS may ask for Keychain and disk access to read Chrome / Safari. Please allow.',
  'settings.sessdataPlaceholder': 'Or paste SESSDATA manually',
  'settings.sessdataBtn': 'Sign in',
  'settings.themeLabel': 'Theme',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.system': 'System',
  'settings.saveDir': 'Default save folder',
  'settings.ffmpeg': 'ffmpeg',
  'settings.ffmpegOk': 'Available (HD & MP3 unlocked)',
  'settings.ffmpegMissing': 'Not installed (falls back to standard quality)',
  'settings.platform': 'Platform',
  'settings.platform.darwin': 'macOS',
  'settings.platform.windows': 'Windows',
  'settings.aboutName': 'Bilibili Downloader · Lightflow',
  'settings.version': 'Version {v}',

  'history.title': 'History',
  'history.clear': 'Clear',
  'history.empty': 'No records yet',
  'history.deleteTitle': 'Delete this record',
  'history.delete': 'Delete',
}

const dictionaries: Record<Lang, Record<string, string>> = { zh, en }

// B 站 API 返回的画质/音质描述是中文，英文模式按档位码映射。
const qualityEN: Record<number, string> = {
  120: '4K UHD', 125: 'HDR', 126: 'Dolby Vision', 112: '1080P Hi-Bitrate',
  116: '1080P60', 80: '1080P', 77: '1080P', 74: '720P60', 64: '720P',
  32: '480P', 16: '360P',
}

const audioQualityEN: Record<number, string> = {
  30216: '64K Standard', 30280: '132K High', 30232: '192K Higher',
  30250: 'Dolby Atmos', 30251: 'Hi-Res Lossless',
}

// 后端错误信息的英文映射：先精确匹配，再按前缀匹配，未命中则原样返回。
const backendErrorExact: Record<string, string> = {
  '没有从输入中识别到 BV 号，请检查链接': 'No BV number found in the input — please check the link',
  '没有识别到 BV 号': 'No BV number recognized',
  'SESSDATA 不能为空': 'SESSDATA cannot be empty',
  '未检测到 ffmpeg，音频已保存为 M4A 格式': 'ffmpeg not found — audio saved as M4A',
  '请求体解析失败': 'Invalid request body',
  '未知的下载类型': 'Unknown download type',
  '不支持图形化目录选择，请直接输入路径': 'Folder picker is unavailable on this system — type the path instead',
}

const backendErrorPrefixes: [string, string][] = [
  ['未在浏览器中找到 B 站登录信息', 'No bilibili login found in local browsers'],
  ['保存目录不可用', 'Save folder unavailable'],
  ['创建下载目录失败', 'Could not create the save folder'],
  ['B站接口错误', 'Bilibili API error'],
  ['网络请求失败', 'Network request failed'],
  ['未获取到传统视频流', 'No legacy stream available'],
  ['未找到可用的音频流', 'No audio stream available'],
  ['下载失败', 'Download failed'],
  ['ffmpeg 失败', 'ffmpeg failed'],
  ['无法打开目录选择', 'Could not open the folder picker'],
  ['Cookie 校验失败', 'Cookie validation failed'],
  ['任务不存在或已结束', 'Task not found or already finished'],
  ['不支持的下载类型', 'Unsupported download type'],
  ['不允许的图片地址', 'Image URL not allowed'],
  ['当前连接不支持流式推送', 'Streaming not supported on this connection'],
  ['解析失败', 'Parse failed'],
  ['解析登录信息失败', 'Failed to parse login info'],
  ['读取响应失败', 'Failed to read response'],
  ['获取高画质流', 'Getting HD streams'],
]

const I18nCtx = createContext<{
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string, vars?: Record<string, string | number>) => string
  qualityLabel: (qn: number, apiDesc: string) => string
  audioQualityLabel: (id: number, apiDesc: string) => string
  translateBackendError: (msg: string) => string
}>({
  lang: 'zh',
  setLang: () => {},
  t: (k) => k,
  qualityLabel: (_q, d) => d,
  audioQualityLabel: (_i, d) => d,
  translateBackendError: (m) => m,
})

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'en' ? 'en' : 'zh'
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang)
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN'
  }, [lang])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let s = dictionaries[lang][key] ?? dictionaries.zh[key] ?? key
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          s = s.replaceAll(`{${k}}`, String(v))
        }
      }
      return s
    },
    [lang],
  )

  // 画质/音质档位标签：英文模式把 B 站返回的中文描述换算为英文。
  const qualityLabel = useCallback(
    (qn: number, apiDesc: string) => (lang === 'en' ? (qualityEN[qn] ?? apiDesc) : apiDesc),
    [lang],
  )

  const audioQualityLabel = useCallback(
    (id: number, apiDesc: string) => (lang === 'en' ? (audioQualityEN[id] ?? apiDesc) : apiDesc),
    [lang],
  )

  const translateBackendError = useCallback(
    (msg: string) => {
      if (lang !== 'en') return msg
      if (backendErrorExact[msg]) return backendErrorExact[msg]
      for (const [zhPrefix, enText] of backendErrorPrefixes) {
        if (msg.startsWith(zhPrefix)) {
          const rest = msg.slice(zhPrefix.length).replace(/^[:：\s]*|[)\]]+$/g, '')
          return rest ? `${enText}: ${rest}` : enText
        }
      }
      return msg
    },
    [lang],
  )

  const setLang = useCallback((l: Lang) => setLangState(l), [])
  const value = useMemo(
    () => ({ lang, setLang, t, qualityLabel, audioQualityLabel, translateBackendError }),
    [lang, setLang, t, qualityLabel, audioQualityLabel, translateBackendError],
  )
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>
}

export function useI18n() {
  return useContext(I18nCtx)
}
