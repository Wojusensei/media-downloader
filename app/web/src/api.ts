// 后端 API 客户端与类型定义。
export interface VideoInfo {
  bvid: string
  title: string
  cid: number
  cover: string
  duration: number
  owner: string
  pages: { cid: number; index: number; title: string }[]
}

export interface Quality {
  qn: number
  desc: string
}

export interface AudioQuality {
  id: number
  desc: string
  bandwidth: number
}

export interface LoginStatus {
  loggedIn: boolean
  vip: boolean
  username: string
  avatar: string
  mid: number
}

export interface ParseResult {
  video: VideoInfo
  qualities: Quality[] | null
  audioQualities: AudioQuality[] | null
  loggedIn: boolean
  vip: boolean
}

export interface SystemInfo {
  version: string
  platform: string
  ffmpeg: boolean
  saveDir: string
  cookieSource: string
  hasCookie: boolean
  login: LoginStatus
}

export type TaskState =
  | 'resolving'
  | 'downloading'
  | 'merging'
  | 'done'
  | 'error'
  | 'canceled'

export interface Task {
  id: string
  type: 'video' | 'audio' | 'cover'
  title: string
  bvid: string
  page: number
  qn: number
  audioId: number
  audioFormat: string
  saveDir: string
  state: TaskState
  detail: string
  received: number
  total: number
  speed: number
  finalPath: string
  error: string
  createdAt: number
  finishedAt: number
}

export interface HistoryEntry {
  id: string
  bvid: string
  title: string
  cover: string
  owner: string
  kind: string
  path: string
  createdAt: number
}

async function json<T>(resp: Response): Promise<T> {
  const body = await resp.json().catch(() => null)
  if (!resp.ok) {
    const msg = body?.error ?? `请求失败（${resp.status}）`
    throw new Error(msg)
  }
  return body as T
}

export async function getSystem(): Promise<SystemInfo> {
  return json(await fetch('/api/system'))
}

export async function parseURL(url: string): Promise<ParseResult> {
  return json(
    await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }),
  )
}

export interface DownloadRequest {
  url: string
  type: 'video' | 'audio' | 'cover'
  qn?: number
  audioId?: number
  audioFormat?: string
  saveDir?: string
}

export async function startDownload(req: DownloadRequest): Promise<{ task: Task }> {
  return json(
    await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    }),
  )
}

export async function cancelTask(id: string) {
  return json(await fetch(`/api/tasks/${id}/cancel`, { method: 'POST' }))
}

export async function clearFinished() {
  return json(await fetch('/api/tasks/clear', { method: 'POST' }))
}

export async function importBrowserCookie(): Promise<{
  browser: string
  profile: string
  login: LoginStatus
}> {
  return json(await fetch('/api/cookies/browser', { method: 'POST' }))
}

export async function setManualCookie(sessdata: string): Promise<{ login: LoginStatus }> {
  return json(
    await fetch('/api/cookies/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessdata }),
    }),
  )
}

export async function clearCookie() {
  return json(await fetch('/api/cookies', { method: 'DELETE' }))
}

export async function pickFolder(): Promise<{ path: string }> {
  return json(await fetch('/api/dialog/folder', { method: 'POST' }))
}

export async function checkPath(dir: string): Promise<{ ok: boolean; error?: string }> {
  return json(
    await fetch('/api/path/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir }),
    }),
  )
}

export async function deleteHistory(id: string) {
  return json(await fetch(`/api/history/${id}`, { method: 'DELETE' }))
}

export async function clearHistory() {
  return json(await fetch('/api/history/clear', { method: 'POST' }))
}

export function coverProxy(url: string): string {
  return `/api/cover?url=${encodeURIComponent(url)}`
}

// ---------------- SSE 事件流 ----------------

export interface ServerEvent {
  type: 'task' | 'tasks-reset' | 'toast' | 'history'
  task?: Task
  level?: string
  body?: string
  // history 事件直接是数组
  asHistory?: HistoryEntry[]
}

/** 订阅 SSE；onEvent 收到每条事件，返回关闭函数。断线自动重连。 */
export function subscribeEvents(
  onEvent: (ev: Partial<ServerEvent> & { rawType: string; raw: unknown }) => void,
  onOpen?: () => void,
): () => void {
  let es: EventSource | null = null
  let closed = false
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  const connect = () => {
    if (closed) return
    es = new EventSource('/api/events')

    const forward = (name: string) => {
      es!.addEventListener(name, (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data)
          onEvent({ ...(data as object), rawType: name, raw: data })
        } catch {
          /* 忽略坏帧 */
        }
      })
    }
    for (const name of ['task', 'tasks-reset', 'toast', 'history']) forward(name)

    es.onopen = () => onOpen?.()
    es.onerror = () => {
      es?.close()
      if (!closed) {
        retryTimer = setTimeout(connect, 2500)
      }
    }
  }
  connect()

  return () => {
    closed = true
    if (retryTimer) clearTimeout(retryTimer)
    es?.close()
  }
}

// ---------------- 格式化 ----------------

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  const v = n / 1024 ** i
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

export function formatSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '--'
  return `${formatBytes(bytesPerSec)}/s`
}

export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? h + ':' : ''}${mm}:${String(s).padStart(2, '0')}`
}

export function formatTime(unix: number): string {
  const d = new Date(unix * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
