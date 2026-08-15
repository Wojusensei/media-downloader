import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getSystem,
  parseURL,
  subscribeEvents,
  cancelTask,
  clearFinished,
  pickFolder,
  deleteHistory,
  clearHistory,
  startDownload,
  type ParseResult,
  type SystemInfo,
  type Task,
  type HistoryEntry,
  type DownloadRequest,
} from './api'
import { TopBar } from './components/TopBar'
import { Hero } from './components/Hero'
import { VideoCard } from './components/VideoCard'
import { Downloads } from './components/Downloads'
import { HistoryDrawer } from './components/HistoryDrawer'
import { SettingsDrawer } from './components/SettingsDrawer'
import { useToast } from './toast'

export default function App() {
  const toast = useToast()
  const [system, setSystem] = useState<SystemInfo | null>(null)
  const [result, setResult] = useState<ParseResult | null>(null)
  const [parsing, setParsing] = useState(false)
  const [tasks, setTasks] = useState<Task[]>([])
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [saveDir, setSaveDir] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const resultAnchor = useRef<HTMLDivElement>(null)

  const refreshSystem = useCallback(() => {
    getSystem()
      .then((info) => {
        setSystem(info)
        setSaveDir((cur) => cur || info.saveDir)
      })
      .catch(() => toast('error', '无法连接本地服务，请重启应用'))
  }, [toast])

  useEffect(refreshSystem, [refreshSystem])

  // SSE：任务进度 + 历史 + 全局提示。
  useEffect(() => {
    return subscribeEvents((ev) => {
      if (ev.rawType === 'task' && ev.task) {
        const t = ev.task
        setTasks((cur) => {
          const idx = cur.findIndex((x) => x.id === t.id)
          if (idx === -1) return [t, ...cur]
          const next = cur.slice()
          next[idx] = t
          return next
        })
        if (t.state === 'done' && t.finalPath) {
          toast('success', `下载完成：${t.title}`)
        } else if (t.state === 'error') {
          toast('error', `下载失败：${t.error}`)
        }
      } else if (ev.rawType === 'tasks-reset') {
        setTasks([])
      } else if (ev.rawType === 'history' && Array.isArray(ev.raw)) {
        setHistory(ev.raw as HistoryEntry[])
      } else if (ev.rawType === 'toast' && ev.body) {
        toast(ev.level === 'error' ? 'error' : 'info', ev.body)
      }
    })
  }, [toast])

  const doParse = useCallback(
    async (url: string) => {
      setParsing(true)
      try {
        const res = await parseURL(url)
        setResult(res)
        requestAnimationFrame(() => {
          resultAnchor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
      } catch (e) {
        toast('error', e instanceof Error ? e.message : '解析失败')
      } finally {
        setParsing(false)
      }
    },
    [toast],
  )

  const doDownload = useCallback(async (req: DownloadRequest) => {
    try {
      const { task } = await startDownload(req)
      setTasks((cur) => [task, ...cur])
    } catch (e) {
      toast('error', e instanceof Error ? e.message : '任务创建失败')
    }
  }, [toast])

  const doCancel = useCallback(
    (id: string) => {
      cancelTask(id).catch(() => toast('error', '取消失败'))
    },
    [toast],
  )

  const doClear = useCallback(() => {
    clearFinished()
      .then(() => setTasks((cur) => cur.filter((t) => t.state !== 'done' && t.state !== 'error' && t.state !== 'canceled')))
      .catch(() => toast('error', '操作失败'))
  }, [toast])

  const doPickFolder = useCallback(async () => {
    try {
      const { path } = await pickFolder()
      if (path) {
        setSaveDir(path)
        toast('info', `保存位置已更新：${path}`)
      }
    } catch (e) {
      toast('error', e instanceof Error ? e.message : '无法打开目录选择')
    }
    return null
  }, [toast])

  const doDeleteHistory = useCallback((id: string) => {
    deleteHistory(id)
      .then(() => setHistory((cur) => cur.filter((h) => h.id !== id)))
      .catch(() => toast('error', '删除失败'))
  }, [toast])

  const doClearHistory = useCallback(() => {
    clearHistory()
      .then(() => setHistory([]))
      .catch(() => toast('error', '清空失败'))
  }, [toast])

  return (
    <>
      <div className="canvas" aria-hidden>
        <div className="aurora aurora-1" />
        <div className="aurora aurora-2" />
        <div className="aurora aurora-3" />
      </div>

      <TopBar
        login={system?.login ?? null}
        historyCount={history.length}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="main">
        <Hero onParse={doParse} parsing={parsing} hasResult={!!result} />

        <div className="page main-grid">
          <div ref={resultAnchor} className="main-col">
            {result && system && (
              <VideoCard
                result={result}
                system={system}
                saveDir={saveDir}
                onDownload={doDownload}
                onPickFolder={doPickFolder}
              />
            )}
          </div>
          <div className={`main-col ${result ? '' : 'main-col-wide'}`}>
            <Downloads tasks={tasks} onCancel={doCancel} onClear={doClear} />
          </div>
        </div>
      </main>

      <footer className="page footer text-tertiary">
        <span>本地运行 · 不上传任何数据</span>
        <span className="dot-sep" aria-hidden />
        <span className="num">{system ? `v${system.version}` : ''}</span>
      </footer>

      <HistoryDrawer
        open={historyOpen}
        items={history}
        onClose={() => setHistoryOpen(false)}
        onDelete={doDeleteHistory}
        onClear={doClearHistory}
      />
      <SettingsDrawer
        open={settingsOpen}
        system={system}
        onClose={() => setSettingsOpen(false)}
        onLoginChange={refreshSystem}
      />
    </>
  )
}
