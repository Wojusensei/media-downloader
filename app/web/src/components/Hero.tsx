// 首屏：大标题 + 链接输入框（粘贴检测、快捷键提交）。
import { useEffect, useRef, useState } from 'react'
import { ArrowRightIcon, LinkIcon, PasteIcon, SpinnerIcon } from '../icons'

export function Hero({
  onParse,
  parsing,
  hasResult,
}: {
  onParse: (url: string) => void
  parsing: boolean
  hasResult: boolean
}) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // 粘贴即解析：输入框获得焦点时监听 paste 事件。
  const onPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text')?.trim()
    if (text && /bilibili\.com|b23\.tv|BV[0-9A-Za-z]{10}/i.test(text)) {
      e.preventDefault()
      setValue(text)
      onParse(text)
    }
  }

  // Cmd/Ctrl + Enter 全局提交。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        const v = inputRef.current?.value.trim()
        if (v) onParse(v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onParse])

  const submit = () => {
    const v = value.trim()
    if (v) onParse(v)
  }

  return (
    <section className={`hero ${hasResult ? 'is-compact' : ''}`}>
      <div className="page">
        {!hasResult && (
          <div className="hero-headline rise-in">
            <h1 className="hero-title">
              把喜欢的视频
              <br />
              <span className="gradient-text">稳稳收进本地</span>
            </h1>
            <p className="hero-sub">视频 · 音频 · 封面，多清晰度选择，登录解锁更高画质</p>
          </div>
        )}

        <div className={`hero-input-wrap ${hasResult ? 'rise-in' : 'rise-in rise-in-delay-1'}`}>
          <div className="hero-input glass">
            <span className="hero-input-icon">
              <LinkIcon size={19} />
            </span>
            <input
              ref={inputRef}
              className="hero-input-field"
              placeholder="粘贴视频链接或 BV 号"
              value={value}
              spellCheck={false}
              autoFocus
              onPaste={onPaste}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
              aria-label="视频链接"
            />
            <button
              className="hero-paste"
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText()
                  if (text.trim()) {
                    setValue(text.trim())
                    onParse(text.trim())
                  }
                } catch {
                  inputRef.current?.focus()
                }
              }}
              title="从剪贴板粘贴"
            >
              <PasteIcon size={16} />
              <span>粘贴</span>
            </button>
            <button
              className="hero-submit"
              onClick={submit}
              disabled={parsing || !value.trim()}
              title="解析视频"
            >
              {parsing ? <SpinnerIcon size={18} /> : <ArrowRightIcon size={18} />}
            </button>
          </div>
          <div className="hero-hint text-tertiary">
            支持 bilibili.com 链接、b23.tv 短链、纯 BV 号 · 粘贴后自动解析 · Command / Ctrl + Enter 开始
          </div>
        </div>
      </div>
    </section>
  )
}
