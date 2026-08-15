// 分段控制器：带滑块动画的多选一控件。
import { useRef, useEffect, useState, type ReactNode } from 'react'

export interface SegmentOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  ariaLabel,
}: {
  value: T
  options: SegmentOption<T>[]
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  ariaLabel?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState({ left: 0, width: 0, ready: false })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const idx = options.findIndex((o) => o.value === value)
    const child = el.children[idx + 1] as HTMLElement | undefined
    if (child) {
      setIndicator({ left: child.offsetLeft, width: child.offsetWidth, ready: true })
    }
  }, [value, options])

  return (
    <div
      ref={ref}
      className={`segmented segmented-${size}`}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      <span
        className={`segmented-indicator ${indicator.ready ? 'is-ready' : ''}`}
        style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }}
        aria-hidden
      />
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          className={`segmented-item ${o.value === value ? 'is-selected' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.icon}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  )
}
