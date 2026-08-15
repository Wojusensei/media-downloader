// 设置抽屉：账号登录（浏览器导入 / 手动 SESSDATA）、主题、保存目录、环境信息。
import { useState } from 'react'
import {
  AlertIcon,
  CheckIcon,
  CloseIcon,
  FolderIcon,
  InfoIcon,
  LogoMark,
  MonitorIcon,
  MoonIcon,
  RefreshIcon,
  SunIcon,
  UserIcon,
  VipIcon,
} from '../icons'
import { importBrowserCookie, setManualCookie, clearCookie, type SystemInfo, type LoginStatus } from '../api'
import { useTheme, type ThemeChoice } from '../theme'
import { useI18n } from '../i18n'
import { SegmentedControl } from './SegmentedControl'
import { useToast } from '../toast'

export function SettingsDrawer({
  open,
  system,
  onClose,
  onLoginChange,
}: {
  open: boolean
  system: SystemInfo | null
  onClose: () => void
  onLoginChange: () => void
}) {
  const toast = useToast()
  const { t, translateBackendError } = useI18n()
  const { choice, setChoice } = useTheme()
  const [importing, setImporting] = useState(false)
  const [sessdata, setSessdata] = useState('')
  const login: LoginStatus | null = system?.login?.loggedIn ? system.login : null

  const doImport = async () => {
    setImporting(true)
    try {
      const res = await importBrowserCookie()
      if (res.login?.loggedIn) {
        toast('success', t('toast.imported', { browser: res.browser, name: res.login.username }))
      } else {
        toast('info', t('toast.importNoLogin', { browser: res.browser }))
      }
      onLoginChange()
    } catch (e) {
      toast('error', e instanceof Error ? translateBackendError(e.message) : t('toast.importFailed'))
    } finally {
      setImporting(false)
    }
  }

  const doManual = async () => {
    if (!sessdata.trim()) return
    try {
      const res = await setManualCookie(sessdata.trim())
      if (res.login?.loggedIn) {
        toast('success', t('toast.loginOk', { name: res.login.username }))
      } else {
        toast('error', t('toast.badSessdata'))
      }
      setSessdata('')
      onLoginChange()
    } catch (e) {
      toast('error', e instanceof Error ? translateBackendError(e.message) : t('toast.applyFailed'))
    }
  }

  const doLogout = async () => {
    try {
      await clearCookie()
      toast('info', t('toast.logout'))
      onLoginChange()
    } catch {
      toast('error', t('toast.opFailed'))
    }
  }

  const platformKey =
    system?.platform === 'darwin'
      ? 'settings.platform.darwin'
      : system?.platform === 'windows'
        ? 'settings.platform.windows'
        : ''

  return (
    <>
      <div className={`drawer-overlay ${open ? 'is-open' : ''}`} onClick={onClose} aria-hidden />
      <aside className={`drawer ${open ? 'is-open' : ''}`} aria-label={t('settings.title')} aria-hidden={!open}>
        <header className="drawer-head">
          <h3 className="section-title">{t('settings.title')}</h3>
          <button className="icon-button" onClick={onClose} aria-label={t('toast.close')}>
            <CloseIcon size={17} />
          </button>
        </header>

        <div className="settings-body">
          {/* 账号 */}
          <section className="settings-group">
            <h4 className="settings-group-title">{t('settings.accountGroup')}</h4>
            {login ? (
              <div className="settings-account glass is-flat">
                <span className="settings-account-icon is-ok">
                  <UserIcon size={17} />
                </span>
                <div className="settings-account-info">
                  <div className="settings-account-name">
                    {login.username}
                    {login.vip && (
                      <span className="account-vip">
                        <VipIcon size={12} />
                        {t('topbar.vip')}
                      </span>
                    )}
                  </div>
                  <div className="text-tertiary">{t('settings.loggedInHint')}</div>
                </div>
                <button className="ghost-button" onClick={doLogout}>
                  {t('settings.logout')}
                </button>
              </div>
            ) : (
              <div className="settings-account glass is-flat">
                <span className="settings-account-icon">
                  <UserIcon size={17} />
                </span>
                <div className="settings-account-info">
                  <div className="settings-account-name">{t('settings.guestCard')}</div>
                  <div className="text-tertiary">{t('settings.guestHint')}</div>
                </div>
              </div>
            )}

            <button className="wide-button" onClick={doImport} disabled={importing}>
              <RefreshIcon size={16} className={importing ? 'is-spinning' : ''} />
              {importing ? t('settings.importing') : t('settings.importBtn')}
            </button>
            <p className="settings-note text-tertiary">
              <InfoIcon size={13} />
              {t('settings.keychainNote')}
            </p>

            <div className="manual-cookie">
              <input
                className="text-input mono"
                placeholder={t('settings.sessdataPlaceholder')}
                value={sessdata}
                spellCheck={false}
                onChange={(e) => setSessdata(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void doManual()}
                aria-label={t('settings.sessdataPlaceholder')}
              />
              <button className="wide-button" onClick={doManual} disabled={!sessdata.trim()}>
                <CheckIcon size={15} />
                {t('settings.sessdataBtn')}
              </button>
            </div>
          </section>

          {/* 主题 */}
          <section className="settings-group">
            <h4 className="settings-group-title">{t('settings.appearanceGroup')}</h4>
            <div className="settings-row">
              <span className="text-secondary">{t('settings.themeLabel')}</span>
              <SegmentedControl<ThemeChoice>
                ariaLabel={t('settings.themeLabel')}
                value={choice}
                onChange={setChoice}
                options={[
                  { value: 'light', label: t('theme.light'), icon: <SunIcon size={14} /> },
                  { value: 'dark', label: t('theme.dark'), icon: <MoonIcon size={14} /> },
                  { value: 'system', label: t('theme.system'), icon: <MonitorIcon size={14} /> },
                ]}
              />
            </div>
          </section>

          {/* 环境 */}
          <section className="settings-group">
            <h4 className="settings-group-title">{t('settings.envGroup')}</h4>
            <div className="settings-kv">
              <div className="kv">
                <span className="text-tertiary">{t('settings.saveDir')}</span>
                <span className="mono text-secondary settings-path">
                  <FolderIcon size={13} />
                  {system?.saveDir ?? '--'}
                </span>
              </div>
              <div className="kv">
                <span className="text-tertiary">{t('settings.ffmpeg')}</span>
                <span className={`settings-env ${system?.ffmpeg ? 'is-ok' : 'is-warn'}`}>
                  {system?.ffmpeg ? (
                    <>
                      <CheckIcon size={13} /> {t('settings.ffmpegOk')}
                    </>
                  ) : (
                    <>
                      <AlertIcon size={13} /> {t('settings.ffmpegMissing')}
                    </>
                  )}
                </span>
              </div>
              <div className="kv">
                <span className="text-tertiary">{t('settings.platform')}</span>
                <span className="text-secondary">
                  {platformKey ? t(platformKey) : (system?.platform ?? '--')}
                </span>
              </div>
            </div>
          </section>

          {/* 关于 */}
          <section className="settings-group">
            <h4 className="settings-group-title">{t('settings.aboutGroup')}</h4>
            <div className="settings-about">
              <LogoMark size={34} />
              <div>
                <div className="settings-about-name">{t('settings.aboutName')}</div>
                <div className="text-tertiary num">{t('settings.version', { v: system?.version ?? '--' })}</div>
              </div>
            </div>
          </section>
        </div>
      </aside>
    </>
  )
}
