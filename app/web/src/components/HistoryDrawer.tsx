// 历史抽屉：从右侧滑入，展示过往下载。
import { CloseIcon, TrashIcon, VideoIcon, AudioIcon, ImageIcon, ArrowRightIcon } from '../icons'
import { coverProxy, formatTime, type HistoryEntry } from '../api'

const kindIcon = {
  视频: <VideoIcon size={12} />,
  音频: <AudioIcon size={12} />,
  封面: <ImageIcon size={12} />,
}

export function HistoryDrawer({
  open,
  items,
  onClose,
  onDelete,
  onClear,
}: {
  open: boolean
  items: HistoryEntry[]
  onClose: () => void
  onDelete: (id: string) => void
  onClear: () => void
}) {
  return (
    <>
      <div className={`drawer-overlay ${open ? 'is-open' : ''}`} onClick={onClose} aria-hidden />
      <aside className={`drawer ${open ? 'is-open' : ''}`} aria-label="下载历史" aria-hidden={!open}>
        <header className="drawer-head">
          <h3 className="section-title">下载历史</h3>
          <div className="drawer-head-actions">
            {items.length > 0 && (
              <button className="ghost-button" onClick={onClear}>
                <TrashIcon size={14} />
                清空
              </button>
            )}
            <button className="icon-button" onClick={onClose} aria-label="关闭">
              <CloseIcon size={17} />
            </button>
          </div>
        </header>

        {items.length === 0 ? (
          <div className="drawer-empty text-tertiary">还没有下载记录</div>
        ) : (
          <div className="history-list">
            {items.map((h) => (
              <div className="history-item" key={h.id}>
                <img className="history-cover" src={coverProxy(h.cover)} alt="" loading="lazy" />
                <div className="history-info">
                  <div className="history-title" title={h.title}>
                    {h.title}
                  </div>
                  <div className="history-meta text-tertiary">
                    <span className="history-kind">
                      {kindIcon[h.kind as keyof typeof kindIcon] ?? null}
                      {h.kind}
                    </span>
                    <span className="dot-sep" aria-hidden />
                    <span className="num">{formatTime(h.createdAt)}</span>
                  </div>
                  <div className="history-path mono text-tertiary" title={h.path}>
                    <ArrowRightIcon size={11} />
                    {h.path}
                  </div>
                </div>
                <button
                  className="history-delete"
                  onClick={() => onDelete(h.id)}
                  aria-label="删除该记录"
                  title="删除"
                >
                  <TrashIcon size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </aside>
    </>
  )
}
