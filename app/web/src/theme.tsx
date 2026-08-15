// 主题系统：浅色 / 深色 / 跟随系统，localStorage 持久化，切换时平滑过渡。
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type ThemeChoice = 'light' | 'dark' | 'system'
type Applied = 'light' | 'dark'

const STORAGE_KEY = 'md-theme'

interface ThemeCtx {
  choice: ThemeChoice
  applied: Applied
  setChoice: (t: ThemeChoice) => void
}

const Ctx = createContext<ThemeCtx>({
  choice: 'system',
  applied: 'dark',
  setChoice: () => {},
})

function systemApplied(): Applied {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(t: Applied) {
  document.documentElement.dataset.theme = t
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
  })
  const [applied, setApplied] = useState<Applied>(() =>
    choice === 'system' ? systemApplied() : choice,
  )

  useEffect(() => {
    const next: Applied = choice === 'system' ? systemApplied() : choice
    setApplied(next)
    applyTheme(next)
    localStorage.setItem(STORAGE_KEY, choice)
  }, [choice])

  useEffect(() => {
    if (choice !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const next = systemApplied()
      setApplied(next)
      applyTheme(next)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [choice])

  const setChoice = useCallback((t: ThemeChoice) => setChoiceState(t), [])

  const value = useMemo(() => ({ choice, applied, setChoice }), [choice, applied, setChoice])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme() {
  return useContext(Ctx)
}
