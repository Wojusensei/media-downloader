// 视频卡片：信息预览 + 下载选项（内容类型、画质、音质、格式、保存路径）。
import { useMemo, useState } from 'react'
import {
  AudioIcon,
  DownloadIcon,
  FolderIcon,
  ImageIcon,
  VideoIcon,
} from '../icons'
import {
  coverProxy,
  formatDuration,
  type ParseResult,
  type SystemInfo,
} from '../api'
import { useI18n } from '../i18n'
import { SegmentedControl } from './SegmentedControl'
import { useToast } from '../toast'
import * as api from '../api'

type ContentType = 'video' | 'audio' | 'cover'

export function VideoCard({
  result,
  system,
  saveDir,
  onDownload,
  onPickFolder,
}: {
  result: ParseResult
  system: SystemInfo
  saveDir: string
  onDownload: (req: api.DownloadRequest) => void
  onPickFolder: () => Promise<string | null>
}) {
  const { video, qualities, audioQualities } = result
  const toast = useToast()
  const { t, qualityLabel, audioQualityLabel } = useI18n()

  const [type, setType] = useState<ContentType>('video')
  const [qn, setQn] = useState(() => qualities?.[0]?.qn ?? 80)
  const [page, setPage] = useState(1)
  const [audioId, setAudioId] = useState(() => audioQualities?.[0]?.id ?? 30280)
  const [audioFormat, setAudioFormat] = useState<'m4a' | 'mp3'>(
    () => (system.ffmpeg ? 'mp3' : 'm4a'),
  )

  const qualityHint = useMemo(() => {
    if (type !== 'video') return ''
    if (!system.ffmpeg) return t('card.hintNoFFmpeg')
    if (!result.loggedIn) return t('card.hintGuest')
    return ''
  }, [type, system.ffmpeg, result.loggedIn, t])

  const submit = () => {
    const req: api.DownloadRequest = {
      url: video.bvid,
      type,
      saveDir,
      qn: type === 'video' ? qn : undefined,
      audioId: type === 'audio' ? audioId : undefined,
      audioFormat: type === 'audio' ? audioFormat : undefined,
    }
    if (type === 'video' && video.pages.length > 1) {
      ;(req as api.DownloadRequest & { page?: number }).page = page
    }
    onDownload(req)
    toast('success', t('toast.queued'))
  }

  return (
    <section className="video-card glass rise-in" aria-label={t('card.type')}>
      <div className="video-card-cover">
        <img src={coverProxy(video.cover)} alt={video.title} loading="lazy" />
        <span className="video-duration num">{formatDuration(video.duration)}</span>
        {result.vip && (
          <span className="video-vip-flag">
            <span className="video-vip-text">{t('card.vipFlag')}</span>
          </span>
        )}
      </div>

      <div className="video-card-body">
        <div className="video-card-meta">
          <h2 className="video-title" title={video.title}>
            {video.title}
          </h2>
          <div className="video-sub text-secondary">
            <span className="video-owner">{video.owner}</span>
            <span className="dot-sep" aria-hidden />
            <span className="num">{video.bvid}</span>
          </div>
        </div>

        {video.pages.length > 1 && (
          <div className="option-row">
            <div className="option-label text-tertiary">{t('card.pages')}</div>
            <div className="page-picker" role="listbox" aria-label={t('card.pagesAria')}>
              {video.pages.slice(0, 24).map((p) => (
                <button
                  key={p.cid}
                  role="option"
                  aria-selected={p.index === page}
                  className={`page-chip num ${p.index === page ? 'is-active' : ''}`}
                  onClick={() => setPage(p.index)}
                  title={p.title}
                >
                  P{p.index}
                </button>
              ))}
            </div>
            <div className="page-title text-tertiary">
              {video.pages.find((p) => p.index === page)?.title ?? ''}
            </div>
          </div>
        )}

        <div className="option-row">
          <div className="option-label text-tertiary">{t('card.type')}</div>
          <SegmentedControl<ContentType>
            ariaLabel={t('card.typeAria')}
            value={type}
            onChange={setType}
            options={[
              { value: 'video', label: t('type.video'), icon: <VideoIcon size={15} /> },
              { value: 'audio', label: t('type.audio'), icon: <AudioIcon size={15} /> },
              { value: 'cover', label: t('type.cover'), icon: <ImageIcon size={15} /> },
            ]}
          />
        </div>

        {type === 'video' && qualities && qualities.length > 0 && (
          <div className="option-row">
            <div className="option-label text-tertiary">{t('card.quality')}</div>
            <div className="chip-row" role="radiogroup" aria-label={t('card.qualityAria')}>
                {qualities.map((q) => (
                  <button
                    key={q.qn}
                    role="radio"
                    aria-checked={q.qn === qn}
                    className={`chip ${q.qn === qn ? 'is-active' : ''}`}
                    onClick={() => setQn(q.qn)}
                  >
                    {qualityLabel(q.qn, q.desc)}
                  </button>
                ))}
            </div>
          </div>
        )}

        {type === 'audio' && (
          <div className="option-row">
            <div className="option-label text-tertiary">{t('card.audio')}</div>
            <div className="audio-options">
              <div className="chip-row" role="radiogroup" aria-label={t('card.audioQAria')}>
                {(audioQualities ?? []).map((a) => (
                  <button
                    key={a.id}
                    role="radio"
                    aria-checked={a.id === audioId}
                    className={`chip ${a.id === audioId ? 'is-active' : ''}`}
                    onClick={() => setAudioId(a.id)}
                  >
                    {audioQualityLabel(a.id, a.desc)}
                  </button>
                ))}
              </div>
              <SegmentedControl<'m4a' | 'mp3'>
                size="sm"
                ariaLabel={t('card.audioFAria')}
                value={audioFormat}
                onChange={setAudioFormat}
                options={
                  system.ffmpeg
                    ? [
                        { value: 'mp3', label: 'MP3' },
                        { value: 'm4a', label: 'M4A' },
                      ]
                    : [{ value: 'm4a', label: 'M4A' }]
                }
              />
            </div>
          </div>
        )}

        {type !== 'cover' && qualityHint && (
          <div className="quality-hint text-tertiary">{qualityHint}</div>
        )}

        <div className="option-row">
          <div className="option-label text-tertiary">{t('card.saveTo')}</div>
          <button className="path-picker" onClick={() => void onPickFolder()} title={t('card.pickFolderTitle')}>
            <FolderIcon size={16} />
            <span className="path-text mono">{saveDir}</span>
          </button>
        </div>

        <div className="video-card-actions">
          <button className="primary-button" onClick={submit}>
            <DownloadIcon size={17} />
            <span>
              {type === 'video'
                ? t('card.downloadVideo')
                : type === 'audio'
                  ? t('card.downloadAudio')
                  : t('card.downloadCover')}
            </span>
          </button>
        </div>
      </div>
    </section>
  )
}
