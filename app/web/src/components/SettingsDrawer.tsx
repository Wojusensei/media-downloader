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
  const { choice, setChoice } = useTheme()
  const [importing, setImporting] = useState(false)
  const [sessdata, setSessdata] = useState('')
  const login: LoginStatus | null = system?.login?.loggedIn ? system.login : null

  const doImport = async () => {
    setImporting(true)
    try {
      const res = await importBrowserCookie()
      if (res.login?.loggedIn) {
        toast('success', `已从 ${res.browser} 导入登录态，欢迎 ${res.login.username}`)
      } else {
        toast('info', `已从 ${res.browser} 导入 Cookie，但校验未通过（可能未登录 B 站）`)
      }
      onLoginChange()
    } catch (e) {
      toast('error', e instanceof Error ? e.message : '导入失败')
    } finally {
      setImporting(false)
    }
  }

  const doManual = async () => {
    if (!sessdata.trim()) return
    try {
      const res = await setManualCookie(sessdata.trim())
      if (res.login?.loggedIn) {
        toast('success', `登录成功，欢迎 ${res.login.username}`)
      } else {
        toast('error', 'SESSDATA 无效或已过期')
      }
      setSessdata('')
      onLoginChange()
    } catch (e) {
      toast('error', e instanceof Error ? e.message : '设置失败')
    }
  }

  const doLogout = async () => {
    try {
      await clearCookie()
      toast('info', '已退出登录，回到游客模式')
      onLoginChange()
    } catch {
      toast('error', '操作失败')
    }
  }

  return (
    <>
      <div className={`drawer-overlay ${open ? 'is-open' : ''}`} onClick={onClose} aria-hidden />
      <aside className={`drawer ${open ? 'is-open' : ''}`} aria-label="设置" aria-hidden={!open}>
        <header className="drawer-head">
          <h3 className="section-title">设置</h3>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <CloseIcon size={17} />
          </button>
        </header>

        <div className="settings-body">
          {/* 账号 */}
          <section className="settings-group">
            <h4 className="settings-group-title">B 站账号</h4>
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
                        大会员
                      </span>
                    )}
                  </div>
                  <div className="text-tertiary">已登录 · 可下载会员清晰度</div>
                </div>
                <button className="ghost-button" onClick={doLogout}>
                  退出
                </button>
              </div>
            ) : (
              <div className="settings-account glass is-flat">
                <span className="settings-account-icon">
                  <UserIcon size={17} />
                </span>
                <div className="settings-account-info">
                  <div className="settings-account-name">游客模式</div>
                  <div className="text-tertiary">登录后解锁 1080P 及以上清晰度</div>
                </div>
              </div>
            )}

            <button className="wide-button" onClick={doImport} disabled={importing}>
              <RefreshIcon size={16} className={importing ? 'is-spinning' : ''} />
              {importing ? '正在读取浏览器…' : '从本机浏览器导入登录（Chrome / Edge / Firefox / Safari）'}
            </button>
            <p className="settings-note text-tertiary">
              <InfoIcon size={13} />
              macOS 首次读取 Chrome / Safari 时，系统可能请求钥匙串与磁盘访问权限，请允许。
            </p>

            <div className="manual-cookie">
              <input
                className="text-input mono"
                placeholder="或手动粘贴 SESSDATA"
                value={sessdata}
                spellCheck={false}
                onChange={(e) => setSessdata(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void doManual()}
                aria-label="SESSDATA"
              />
              <button className="wide-button" onClick={doManual} disabled={!sessdata.trim()}>
                <CheckIcon size={15} />
                使用该 Cookie
              </button>
            </div>
          </section>

          {/* 主题 */}
          <section className="settings-group">
            <h4 className="settings-group-title">外观</h4>
            <div className="settings-row">
              <span className="text-secondary">主题模式</span>
              <SegmentedControl<ThemeChoice>
                ariaLabel="主题模式"
                value={choice}
                onChange={setChoice}
                options={[
                  { value: 'light', label: '浅色', icon: <SunIcon size={14} /> },
                  { value: 'dark', label: '深色', icon: <MoonIcon size={14} /> },
                  { value: 'system', label: '跟随系统', icon: <MonitorIcon size={14} /> },
                ]}
              />
            </div>
          </section>

          {/* 环境 */}
          <section className="settings-group">
            <h4 className="settings-group-title">环境</h4>
            <div className="settings-kv">
              <div className="kv">
                <span className="text-tertiary">默认保存目录</span>
                <span className="mono text-secondary settings-path">
                  <FolderIcon size={13} />
                  {system?.saveDir ?? '--'}
                </span>
              </div>
              <div className="kv">
                <span className="text-tertiary">ffmpeg</span>
                <span className={`settings-env ${system?.ffmpeg ? 'is-ok' : 'is-warn'}`}>
                  {system?.ffmpeg ? (
                    <>
                      <CheckIcon size={13} /> 可用（高画质与 MP3 已解锁）
                    </>
                  ) : (
                    <>
                      <AlertIcon size={13} /> 未安装（回退标准画质）
                    </>
                  )}
                </span>
              </div>
              <div className="kv">
                <span className="text-tertiary">平台</span>
                <span className="text-secondary">
                  {system?.platform === 'darwin' ? 'macOS' : system?.platform === 'windows' ? 'Windows' : system?.platform ?? '--'}
                </span>
              </div>
            </div>
          </section>

          {/* 关于 */}
          <section className="settings-group">
            <h4 className="settings-group-title">关于</h4>
            <div className="settings-about">
              <LogoMark size={34} />
              <div>
                <div className="settings-about-name">Bilibili 下载器 · 流光</div>
                <div className="text-tertiary num">版本 {system?.version ?? '--'}</div>
              </div>
            </div>
          </section>
        </div>
      </aside>
    </>
  )
}
