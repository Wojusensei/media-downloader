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
import { useI18n } from './i18n'
import { TopBar } from './components/TopBar'
import { Hero } from './components/Hero'
import { VideoCard } from './components/VideoCard'
import { Downloads } from './components/Downloads'
import { HistoryDrawer } from './components/HistoryDrawer'
import { SettingsDrawer } from './components/SettingsDrawer'
import { useToast } from './toast'

export default function App() {
  const toast = useToast()
  const { t, translateBackendError } = useI18n()
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
      .catch(() => toast('error', t('toast.connLost')))
  }, [toast, t])

  useEffect(refreshSystem, [refreshSystem])

  // SSE：任务进度 + 历史 + 全局提示。
  useEffect(() => {
    return subscribeEvents((ev) => {
      if (ev.rawType === 'task' && ev.task) {
        const tk = ev.task
        setTasks((cur) => {
          const idx = cur.findIndex((x) => x.id === tk.id)
          if (idx === -1) return [tk, ...cur]
          const next = cur.slice()
          next[idx] = tk
          return next
        })
        if (tk.state === 'done' && tk.finalPath) {
          toast('success', t('toast.done', { title: tk.title }))
        } else if (tk.state === 'error') {
          toast('error', t('toast.failed', { reason: translateBackendError(tk.error) }))
        }
      } else if (ev.rawType === 'tasks-reset') {
        setTasks([])
      } else if (ev.rawType === 'history' && Array.isArray(ev.raw)) {
        setHistory(ev.raw as HistoryEntry[])
      } else if (ev.rawType === 'toast' && ev.body) {
        toast(ev.level === 'error' ? 'error' : 'info', translateBackendError(ev.body))
      }
    })
  }, [toast, t, translateBackendError])

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
        toast('error', e instanceof Error ? translateBackendError(e.message) : t('toast.parseFailed'))
      } finally {
        setParsing(false)
      }
    },
    [toast, translateBackendError, t],
  )

  const doDownload = useCallback(
    async (req: DownloadRequest) => {
      try {
        const { task } = await startDownload(req)
        setTasks((cur) => [task, ...cur])
      } catch (e) {
        toast('error', e instanceof Error ? translateBackendError(e.message) : t('toast.createFailed'))
      }
    },
    [toast, translateBackendError, t],
  )

  const doCancel = useCallback(
    (id: string) => {
      cancelTask(id).catch(() => toast('error', t('toast.cancelFailed')))
    },
    [toast, t],
  )

  const doClear = useCallback(() => {
    clearFinished()
      .then(() =>
        setTasks((cur) =>
          cur.filter((tk) => tk.state !== 'done' && tk.state !== 'error' && tk.state !== 'canceled'),
        ),
      )
      .catch(() => toast('error', t('toast.opFailed')))
  }, [toast, t])

  const doPickFolder = useCallback(async () => {
    try {
      const { path } = await pickFolder()
      if (path) {
        setSaveDir(path)
        toast('info', t('toast.saveDirUpdated', { path }))
      }
    } catch (e) {
      toast('error', e instanceof Error ? translateBackendError(e.message) : t('toast.folderPickerFailed'))
    }
    return null
  }, [toast, translateBackendError, t])

  const doDeleteHistory = useCallback(
    (id: string) => {
      deleteHistory(id)
        .then(() => setHistory((cur) => cur.filter((h) => h.id !== id)))
        .catch(() => toast('error', t('toast.deleteFailed')))
    },
    [toast, t],
  )

  const doClearHistory = useCallback(() => {
    clearHistory()
      .then(() => setHistory([]))
      .catch(() => toast('error', t('toast.clearFailed')))
  }, [toast, t])

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
