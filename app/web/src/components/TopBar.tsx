// 顶栏：品牌、语言、登录态、主题切换、历史与设置入口。
import { LogoMark, MoonIcon, MonitorIcon, SunIcon, GearIcon, ClockIcon, UserIcon, VipIcon } from '../icons'
import { useTheme, type ThemeChoice } from '../theme'
import { useI18n, type Lang } from '../i18n'
import { SegmentedControl } from './SegmentedControl'
import type { LoginStatus } from '../api'

export function TopBar({
  login,
  onOpenHistory,
  onOpenSettings,
  historyCount,
}: {
  login: LoginStatus | null
  onOpenHistory: () => void
  onOpenSettings: () => void
  historyCount: number
}) {
  const { choice, setChoice } = useTheme()
  const { t, lang, setLang } = useI18n()

  return (
    <header className="topbar">
      <div className="page topbar-inner">
        <div className="brand">
          <LogoMark size={30} />
          <div className="brand-text">
            <span className="brand-name">{t('brand.name')}</span>
            <span className="brand-tag">{t('brand.tag')}</span>
          </div>
        </div>

        <div className="topbar-actions">
          {login?.loggedIn ? (
            <button className="account-chip is-logged" onClick={onOpenSettings} title={t('topbar.loggedIn')}>
              {login.avatar ? (
                <img className="account-avatar" src={login.avatar} alt="" referrerPolicy="no-referrer" />
              ) : (
                <UserIcon size={15} />
              )}
              <span className="account-name">{login.username || t('topbar.loggedIn')}</span>
              {login.vip && (
                <span className="account-vip" title={t('topbar.vip')}>
                  <VipIcon size={13} />
                  {t('topbar.vip')}
                </span>
              )}
            </button>
          ) : (
            <button className="account-chip" onClick={onOpenSettings} title={t('settings.guestCard')}>
              <UserIcon size={15} />
              <span className="account-name">{t('topbar.guest')}</span>
            </button>
          )}

          <SegmentedControl<Lang>
            size="sm"
            ariaLabel={t('topbar.lang')}
            value={lang}
            onChange={setLang}
            options={[
              { value: 'zh', label: '中' },
              { value: 'en', label: 'EN' },
            ]}
          />

          <SegmentedControl<ThemeChoice>
            size="sm"
            ariaLabel={t('topbar.theme')}
            value={choice}
            onChange={setChoice}
            options={[
              { value: 'light', label: '', icon: <SunIcon size={15} /> },
              { value: 'dark', label: '', icon: <MoonIcon size={15} /> },
              { value: 'system', label: '', icon: <MonitorIcon size={15} /> },
            ]}
          />

          <button
            className="icon-button"
            onClick={onOpenHistory}
            aria-label={t('topbar.history')}
            title={t('topbar.history')}
          >
            <ClockIcon size={18} />
            {historyCount > 0 && <span className="icon-badge num">{historyCount > 99 ? '99+' : historyCount}</span>}
          </button>
          <button className="icon-button" onClick={onOpenSettings} aria-label={t('topbar.settings')} title={t('topbar.settings')}>
            <GearIcon size={18} />
          </button>
        </div>
      </div>
    </header>
  )
}
