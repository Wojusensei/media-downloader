// 历史抽屉：从右侧滑入，展示过往下载。
import { CloseIcon, TrashIcon, VideoIcon, AudioIcon, ImageIcon, ArrowRightIcon } from '../icons'
import { coverProxy, formatTime, type HistoryEntry } from '../api'
import { useI18n } from '../i18n'

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
  const { t } = useI18n()

  // 后端历史记录里 kind 存的是中文，展示时按当前语言映射。
  const kindKeyOf = (kind: string) =>
    kind === '视频' ? 'type.video' : kind === '音频' ? 'type.audio' : kind === '封面' ? 'type.cover' : ''
  const kindIcon: Record<string, React.ReactNode> = {
    'type.video': <VideoIcon size={12} />,
    'type.audio': <AudioIcon size={12} />,
    'type.cover': <ImageIcon size={12} />,
  }

  return (
    <>
      <div className={`drawer-overlay ${open ? 'is-open' : ''}`} onClick={onClose} aria-hidden />
      <aside className={`drawer ${open ? 'is-open' : ''}`} aria-label={t('history.title')} aria-hidden={!open}>
        <header className="drawer-head">
          <h3 className="section-title">{t('history.title')}</h3>
          <div className="drawer-head-actions">
            {items.length > 0 && (
              <button className="ghost-button" onClick={onClear}>
                <TrashIcon size={14} />
                {t('history.clear')}
              </button>
            )}
            <button className="icon-button" onClick={onClose} aria-label={t('toast.close')}>
              <CloseIcon size={17} />
            </button>
          </div>
        </header>

        {items.length === 0 ? (
          <div className="drawer-empty text-tertiary">{t('history.empty')}</div>
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
                      {kindIcon[kindKeyOf(h.kind)] ?? null}
                      {kindKeyOf(h.kind) ? t(kindKeyOf(h.kind)) : h.kind}
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
                  aria-label={t('history.deleteTitle')}
                  title={t('history.delete')}
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
