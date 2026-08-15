// 轻提示（Toast）：右上角滑入，自动消失。
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from './icons'
import { useI18n } from './i18n'

type ToastLevel = 'info' | 'success' | 'error'

interface ToastItem {
  id: number
  level: ToastLevel
  body: string
}

const ToastCtx = createContext<{ push: (level: ToastLevel, body: string) => void }>({
  push: () => {},
})

let nextID = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())
  const { t: tr } = useI18n()

  const dismiss = useCallback((id: number) => {
    setItems((cur) => cur.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback(
    (level: ToastLevel, body: string) => {
      const id = nextID++
      setItems((cur) => [...cur.slice(-4), { id, level, body }])
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), level === 'error' ? 6500 : 3800),
      )
    },
    [dismiss],
  )

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.level}`}>
            <span className="toast-icon">
              {t.level === 'success' ? (
                <CheckIcon size={16} />
              ) : t.level === 'error' ? (
                <AlertIcon size={16} />
              ) : (
                <InfoIcon size={16} />
              )}
            </span>
            <span className="toast-body">{t.body}</span>
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label={tr('toast.close')}>
              <CloseIcon size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  return useContext(ToastCtx).push
}
