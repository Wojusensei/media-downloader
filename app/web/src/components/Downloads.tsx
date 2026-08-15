// 下载面板：任务列表、进度、取消、清除已完成。
import { CheckIcon, CloseIcon, DownloadIcon, FileIcon, SpinnerIcon, TrashIcon, VideoIcon, AudioIcon, ImageIcon } from '../icons'
import { formatBytes, formatSpeed, type Task } from '../api'
import { useI18n } from '../i18n'
import { ProgressRing } from './ProgressRing'

function TypeBadge({ type }: { type: Task['type'] }) {
  const { t } = useI18n()
  const map = {
    video: { icon: <VideoIcon size={13} />, label: t('type.video') },
    audio: { icon: <AudioIcon size={13} />, label: t('type.audio') },
    cover: { icon: <ImageIcon size={13} />, label: t('type.cover') },
  } as const
  const it = map[type] ?? map.video
  return (
    <span className="task-type-badge">
      {it.icon}
      {it.label}
    </span>
  )
}

function TaskItem({ task, onCancel }: { task: Task; onCancel: (id: string) => void }) {
  const { t } = useI18n()
  const running = task.state === 'resolving' || task.state === 'downloading' || task.state === 'merging'
  const progress =
    task.total > 0 && task.received > 0 ? Math.min(1, task.received / task.total) : 0
  const pctText =
    task.state === 'downloading' && task.total > 0 ? `${Math.round(progress * 100)}%` : null

  return (
    <div className={`task-item ${task.state === 'error' ? 'has-error' : ''}`}>
      <div className="task-side">
        {task.state === 'downloading' || task.state === 'merging' ? (
          <ProgressRing progress={task.state === 'merging' ? 1 : progress} active />
        ) : task.state === 'resolving' ? (
          <span className="task-side-spinner">
            <SpinnerIcon size={22} />
          </span>
        ) : task.state === 'done' ? (
          <span className="task-side-done">
            <CheckIcon size={20} />
          </span>
        ) : task.state === 'canceled' ? (
          <span className="task-side-mute">
            <CloseIcon size={18} />
          </span>
        ) : (
          <span className="task-side-error">
            <CloseIcon size={18} />
          </span>
        )}
      </div>

      <div className="task-main">
        <div className="task-row-1">
          <span className="task-title" title={task.title || task.bvid}>
            {task.title || task.bvid}
          </span>
          <TypeBadge type={task.type} />
        </div>

        {task.state === 'downloading' && (
          <div className="task-bar">
            <span
              className="task-bar-fill"
              style={{ width: task.total > 0 ? `${progress * 100}%` : '0%' }}
            />
            {task.total === 0 && <span className="task-bar-indet" />}
          </div>
        )}

        <div className="task-row-2 text-tertiary">
          {task.state === 'done' && (
            <span className="task-path mono" title={task.finalPath}>
              <FileIcon size={12} /> {task.finalPath}
            </span>
          )}
          {task.state === 'error' && <span className="task-error-text">{task.error}</span>}
          {task.state === 'canceled' && <span>{t('dl.canceled')}</span>}
          {task.state === 'resolving' && <span>{t('dl.resolving')}</span>}
          {task.state === 'merging' && <span>{t('dl.merging')}</span>}
          {task.state === 'downloading' && (
            <span className="task-stats num">
              {pctText ? `${pctText} · ` : ''}
              {task.total > 0
                ? `${formatBytes(task.received)} / ${formatBytes(task.total)}`
                : formatBytes(task.received)}
              {task.speed > 0 ? ` · ${formatSpeed(task.speed)}` : ''}
            </span>
          )}
        </div>
      </div>

      {running && (
        <button className="task-cancel" onClick={() => onCancel(task.id)} aria-label={t('dl.cancelTitle')} title={t('dl.cancelTitle')}>
          <CloseIcon size={15} />
        </button>
      )}
    </div>
  )
}

export function Downloads({
  tasks,
  onCancel,
  onClear,
}: {
  tasks: Task[]
  onCancel: (id: string) => void
  onClear: () => void
}) {
  const { t } = useI18n()
  const running = tasks.filter((t) => t.state === 'resolving' || t.state === 'downloading' || t.state === 'merging')
  const finished = tasks.filter((t) => !running.includes(t))
  const hasFinished = finished.length > 0

  return (
    <section className="downloads glass" aria-label={t('dl.region')}>
      <div className="downloads-head">
        <h3 className="section-title">
          <DownloadIcon size={17} />
          {t('dl.title')}
        </h3>
        <div className="downloads-head-right">
          {running.length > 0 && (
            <span className="downloads-count num">{t('dl.count', { n: running.length })}</span>
          )}
          {hasFinished && (
            <button className="ghost-button" onClick={onClear}>
              <TrashIcon size={14} />
              {t('dl.clear')}
            </button>
          )}
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="downloads-empty">
          <div className="downloads-empty-art" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <p className="text-tertiary">{t('dl.empty')}</p>
        </div>
      ) : (
        <div className="downloads-list">
          {tasks.map((tk) => (
            <TaskItem key={tk.id} task={tk} onCancel={onCancel} />
          ))}
        </div>
      )}
    </section>
  )
}
