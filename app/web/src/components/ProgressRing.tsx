// 圆环进度：conic-gradient 实现，中心显示百分比。
export function ProgressRing({
  progress,
  size = 44,
  active = true,
}: {
  progress: number // 0..1
  size?: number
  active?: boolean
}) {
  const clamped = Math.min(1, Math.max(0, progress))
  const deg = Math.round(clamped * 360)
  const percent = Math.round(clamped * 100)
  return (
    <div
      className={`progress-ring ${active ? 'is-active' : ''}`}
      style={
        {
          width: size,
          height: size,
          '--deg': `${deg}deg`,
        } as React.CSSProperties
      }
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span className="progress-ring-label num">{percent}</span>
    </div>
  )
}
