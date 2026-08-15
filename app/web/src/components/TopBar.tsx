// 顶栏：品牌、登录态、主题切换、历史与设置入口。
import { LogoMark, MoonIcon, MonitorIcon, SunIcon, GearIcon, ClockIcon, UserIcon, VipIcon } from '../icons'
import { useTheme, type ThemeChoice } from '../theme'
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

  return (
    <header className="topbar">
      <div className="page topbar-inner">
        <div className="brand">
          <LogoMark size={30} />
          <div className="brand-text">
            <span className="brand-name">Bilibili 下载器</span>
            <span className="brand-tag">流光 · Lightflow</span>
          </div>
        </div>

        <div className="topbar-actions">
          {login?.loggedIn ? (
            <button className="account-chip is-logged" onClick={onOpenSettings} title="已登录">
              {login.avatar ? (
                <img className="account-avatar" src={login.avatar} alt="" referrerPolicy="no-referrer" />
              ) : (
                <UserIcon size={15} />
              )}
              <span className="account-name">{login.username || '已登录'}</span>
              {login.vip && (
                <span className="account-vip" title="大会员">
                  <VipIcon size={13} />
                  大会员
                </span>
              )}
            </button>
          ) : (
            <button className="account-chip" onClick={onOpenSettings} title="游客模式，点击前往设置登录">
              <UserIcon size={15} />
              <span className="account-name">游客</span>
            </button>
          )}

          <SegmentedControl<ThemeChoice>
            size="sm"
            ariaLabel="主题模式"
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
            aria-label="下载历史"
            title="下载历史"
          >
            <ClockIcon size={18} />
            {historyCount > 0 && <span className="icon-badge num">{historyCount > 99 ? '99+' : historyCount}</span>}
          </button>
          <button className="icon-button" onClick={onOpenSettings} aria-label="设置" title="设置">
            <GearIcon size={18} />
          </button>
        </div>
      </div>
    </header>
  )
}
