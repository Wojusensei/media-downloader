// 全部界面图标均为手绘 SVG 路径，不使用 emoji。
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function base(props: IconProps) {
  const { size = 18, ...rest } = props
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...rest,
  }
}

export function LogoMark({ size = 26, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden {...rest}>
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fb7299" />
          <stop offset="1" stopColor="#00aeec" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#logo-g)" />
      <path d="M21 14.5l6.5 7.5m15.5-7.5L36.5 22" stroke="#fff" strokeWidth="4.4" strokeLinecap="round" fill="none" />
      <rect x="15.5" y="22" width="33" height="23.5" rx="7" fill="none" stroke="#fff" strokeWidth="4" />
      <path d="M32 27.5v7m0 0l-4-4m4 4l4-4" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

export const LinkIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M10 14a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.4 5.53" />
    <path d="M14 10a5 5 0 0 0-7.07 0l-2.83 2.83a5 5 0 0 0 7.07 7.07l1.42-1.42" />
  </svg>
)

export const PasteIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="7" y="4" width="10" height="4" rx="1.5" />
    <path d="M9 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 17.5 4H15" />
    <path d="M8.5 11h7M8.5 15h4.5" />
  </svg>
)

export const ArrowRightIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 12h15m0 0l-6-6m6 6l-6 6" />
  </svg>
)

export const SunIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7" />
  </svg>
)

export const MoonIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M20 13.6A8.4 8.4 0 1 1 10.4 4a6.9 6.9 0 0 0 9.6 9.6z" />
  </svg>
)

export const MonitorIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="4.5" width="18" height="12.5" rx="2" />
    <path d="M9 20.5h6M12 17v3.5" />
  </svg>
)

export const GearIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.1 14.4a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.47V21a2 2 0 1 1-4 0v-.11a1.6 1.6 0 0 0-1.05-1.47 1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-.97H3a2 2 0 1 1 0-4h.11a1.6 1.6 0 0 0 1.47-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.77.32H9a1.6 1.6 0 0 0 .97-1.47V3a2 2 0 1 1 4 0v.11a1.6 1.6 0 0 0 .97 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.77V9a1.6 1.6 0 0 0 1.47.97H21a2 2 0 1 1 0 4h-.11a1.6 1.6 0 0 0-1.47.97z" />
  </svg>
)

export const FolderIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3.5 7.2c0-1 .8-1.7 1.7-1.7h3.6c.5 0 1 .24 1.35.65l1.2 1.5h7.4c1 0 1.7.8 1.7 1.7v8.5c0 1-.8 1.7-1.7 1.7H5.2c-1 0-1.7-.8-1.7-1.7z" />
  </svg>
)

export const VideoIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="5.5" width="13" height="13" rx="2.5" />
    <path d="M16 10.5l4.6-3.1v9.2L16 13.5z" />
  </svg>
)

export const AudioIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 18V6.8l10-2v11" />
    <circle cx="6.7" cy="18" r="2.3" />
    <circle cx="16.7" cy="15.8" r="2.3" />
  </svg>
)

export const ImageIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <circle cx="9" cy="10" r="1.7" />
    <path d="M3.5 17l4.8-4.5a1.6 1.6 0 0 1 2.2 0l3 2.9m0 0l1.9-1.8a1.6 1.6 0 0 1 2.2 0l3.9 3.6" />
  </svg>
)

export const DownloadIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5" />
    <path d="M4.5 19.5h15" />
  </svg>
)

export const CloseIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

export const TrashIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4.5 6.5h15M9.5 6V4.8c0-.7.6-1.3 1.3-1.3h2.4c.7 0 1.3.6 1.3 1.3V6" />
    <path d="M6.5 6.5l.8 12a1.7 1.7 0 0 0 1.7 1.6h6a1.7 1.7 0 0 0 1.7-1.6l.8-12" />
    <path d="M10.2 10.5v5.5M13.8 10.5v5.5" />
  </svg>
)

export const CheckIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4.5 12.8l4.6 4.6L19.5 6.8" />
  </svg>
)

export const ClockIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3.2 2" />
  </svg>
)

export const UserIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8.2" r="3.7" />
    <path d="M4.8 20c.9-3.4 3.8-5.2 7.2-5.2s6.3 1.8 7.2 5.2" />
  </svg>
)

export const VipIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M3.5 8.5l3 3 4-5.5 4 5.5 3-3v8.2c0 .5-.4.8-.8.8H4.3a.8.8 0 0 1-.8-.8z" />
  </svg>
)

export const AlertIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3.8L2.8 19.5h18.4z" />
    <path d="M12 9.8v4.2M12 16.8v.2" />
  </svg>
)

export const InfoIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 7.6v.2" />
  </svg>
)

export const SpinnerIcon = ({ size = 18, ...rest }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden {...rest}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.4" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <animateTransform
        attributeName="transform"
        type="rotate"
        from="0 12 12"
        to="360 12 12"
        dur="0.9s"
        repeatCount="indefinite"
      />
    </path>
  </svg>
)

export const FileIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M13.5 3.5H7a1.8 1.8 0 0 0-1.8 1.8v13.4A1.8 1.8 0 0 0 7 20.5h10a1.8 1.8 0 0 0 1.8-1.8V8.8z" />
    <path d="M13.5 3.5v5.3h5.3" />
  </svg>
)

export const RefreshIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M20 12a8 8 0 1 1-2.34-5.66" />
    <path d="M20 4v4.5h-4.5" />
  </svg>
)

export const ChevronIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6.5 9.5l5.5 5.5 5.5-5.5" />
  </svg>
)

export const MenuIcon = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
)
