// Custom icon library — designed specifically for this platform.
// NOT from Lucide, Feather, or any generic icon set.

type IconProps = { size?: number; color?: string; strokeWidth?: number };
const D = ({ size = 24, color = 'currentColor', strokeWidth = 1.6 }: IconProps) => ({
  width: size, height: size, viewBox: '0 0 24 24',
  fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
});

// ─── Navigation ──────────────────────────────────────────────────────

/** Command Center: 2-column layout panels — represents "overview / dashboard" */
export function IcoCommand({ size = 24, color = 'currentColor', strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="3" y="14" width="8" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="18" rx="2" />
    </svg>
  );
}

/** Campaigns / Missions: Pennant flag — direction, momentum */
export function IcoMission({ size = 24, color = 'currentColor', strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <path d="M4 22V3" />
      <path d="M4 4h14l-4 5 4 5H4" />
    </svg>
  );
}

/** AI: 4-pointed spark / diamond star — intelligence, creative energy */
export function IcoSpark({ size = 24, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2c0 4.97-4.03 9-9 9 4.97 0 9 4.03 9 9 0-4.97 4.03-9 9-9-4.97 0-9-4.03-9-9z" />
    </svg>
  );
}

/** Approvals / Verify: Clean circle with inset tick */
export function IcoVerify({ size = 24, color = 'currentColor', strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M8 12.5l2.5 2.5 5-6" />
    </svg>
  );
}

/** Brand: Multi-faceted gem / crystal — brand value, identity */
export function IcoGem({ size = 24, color = 'currentColor', strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <path d="M6 3h12l4 5-10 13L2 8z" />
      <path d="M2 8h20" />
      <path d="M6 3l3 5M18 3l-3 5" />
    </svg>
  );
}

// ─── Actions ─────────────────────────────────────────────────────────

/** Back arrow — lighter, more elegant than chevron */
export function IcoBack({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <path d="M19 12H5" />
      <path d="M10 6l-5 6 5 6" />
    </svg>
  );
}

/** Notification — bell with soft curves */
export function IcoBell({ size = 17, color = 'currentColor', strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <path d="M18 8.5a6 6 0 1 0-12 0c0 6.5-3 8.5-3 8.5h18s-3-2-3-8.5" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

/** Retry — circular arrow */
export function IcoRetry({ size = 14, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

/** Regenerate — double circular arrows */
export function IcoRegenerate({ size = 14, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <path d="M3 2v6h6" />
      <path d="M3 8a9 9 0 0 1 15-6.7L21 4" />
      <path d="M21 22v-6h-6" />
      <path d="M21 16a9 9 0 0 1-15 6.7L3 20" />
    </svg>
  );
}

/** Share — outbound arrow from square */
export function IcoShare({ size = 16, color = 'currentColor', strokeWidth = 1.8 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <path d="M15 6H9a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z" />
      <path d="M12 2v8" />
      <path d="M9 5l3-3 3 3" />
    </svg>
  );
}

/** More / overflow — three dots horizontal */
export function IcoMore({ size = 16, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

/** Collapse / chevron down */
export function IcoChevronDown({ size = 14, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** Forward / chevron right */
export function IcoChevronRight({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/** Plus */
export function IcoPlus({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// ─── Campaign & Content Type Icons ───────────────────────────────────

/** Gift box with ribbon bow — Summer Gift, gifting campaigns */
export function IcoGift({ size = 24, color = 'currentColor', strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <rect x="3" y="7" width="18" height="3" rx="1.5" />
      <line x1="12" y1="7" x2="12" y2="21" />
      <path d="M9.5 7C9.5 5.3 10.5 3 12 3C13.5 3 14.5 5.3 14.5 7" />
    </svg>
  );
}

/** Film clapperboard — Reels, video content */
export function IcoFilm({ size = 24, color = 'currentColor', strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <rect x="2" y="6" width="20" height="14" rx="2.5" />
      <circle cx="12" cy="13" r="3.5" />
      <path d="M2 10h20" />
      <path d="M7 6V2M12 6V2M17 6V2" />
    </svg>
  );
}

/** Crescent moon — Bayram, seasonal, cultural */
export function IcoCrescent({ size = 24, color = 'currentColor', strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <path d="M20 13.5A9 9 0 0 1 10.5 4 8.5 8.5 0 1 0 20 13.5z" />
    </svg>
  );
}

/** Vertical story frame — Instagram Stories */
export function IcoStory({ size = 24, color = 'currentColor', strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <rect x="6" y="2" width="12" height="20" rx="3" />
      <circle cx="12" cy="12" r="3" />
      <path d="M10.5 10.5l3 1.5-3 1.5V10.5z" strokeWidth="0" fill={color} fillOpacity={0.7} />
    </svg>
  );
}

/** Image frame with horizon — Posts, photos */
export function IcoPost({ size = 24, color = 'currentColor', strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M3 15l4.5-4.5 3.5 3.5 3-3 5 5" />
      <circle cx="8" cy="9" r="1.5" />
    </svg>
  );
}

/** Bar chart rising — Analytics, reports */
export function IcoReport({ size = 24, color = 'currentColor', strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <path d="M3 20h18" />
      <rect x="5" y="13" width="3.5" height="7" rx="1" />
      <rect x="10.25" y="8" width="3.5" height="12" rx="1" />
      <rect x="15.5" y="4" width="3.5" height="16" rx="1" />
    </svg>
  );
}

/** Caption / text lines — Written content, captions */
export function IcoCaption({ size = 24, color = 'currentColor', strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  );
}

// ─── Content Icon Block — renders icon in a premium tinted container ──

export interface ContentIconProps {
  type: 'gift' | 'reel' | 'story' | 'post' | 'caption' | 'crescent' | 'report' | 'analytics';
  color: string;
  size?: number;     // container size
  radius?: number;
  isDark?: boolean;
}

export function ContentIcon({ type, color, size = 46, radius = 13, isDark = true }: ContentIconProps) {
  const iconSize = Math.round(size * 0.48);
  const iconProps = { size: iconSize, color, strokeWidth: 1.7 };

  const icon = {
    gift:      <IcoGift {...iconProps} />,
    reel:      <IcoFilm {...iconProps} />,
    story:     <IcoStory {...iconProps} />,
    post:      <IcoPost {...iconProps} />,
    caption:   <IcoCaption {...iconProps} />,
    crescent:  <IcoCrescent {...iconProps} />,
    report:    <IcoReport {...iconProps} />,
    analytics: <IcoReport {...iconProps} />,
  }[type];

  return (
    <div style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0,
      background: isDark ? `${color}12` : `${color}10`,
      border: `1px solid ${color}${isDark ? '22' : '18'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {icon}
    </div>
  );
}

// ─── Status / Content type ────────────────────────────────────────────

/** Render / Visual — layers stack */
export function IcoLayers({ size = 16, color = 'currentColor', strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

/** Caption / Text — text lines */
export function IcoText({ size = 16, color = 'currentColor', strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <path d="M4 6h16M4 10h16M4 14h10" />
    </svg>
  );
}

/** Template — grid/layout mark */
export function IcoTemplate({ size = 16, color = 'currentColor', strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

/** Analytics — rising bar chart */
export function IcoChart({ size = 16, color = 'currentColor', strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <path d="M3 20h18" />
      <rect x="5" y="12" width="3" height="8" rx="1" />
      <rect x="10.5" y="8" width="3" height="12" rx="1" />
      <rect x="16" y="4" width="3" height="16" rx="1" />
    </svg>
  );
}

/** Live dot — pulsing indicator (use as inline element with animation) */
export function IcoDot({ size = 7, color = '#34d399' }: { size?: number; color?: string }) {
  return (
    <span style={{
      display: 'inline-block',
      width: size, height: size,
      borderRadius: '50%',
      background: color,
      animation: 'liveGlow 2s ease-in-out infinite',
      flexShrink: 0,
    }} />
  );
}

// ─── New Screen Icons ─────────────────────────────────────────────────

/** Content / Outputs library — stacked cards */
export function IcoContent({ size = 24, color = 'currentColor', strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <rect x="2" y="7" width="20" height="14" rx="2.5" />
      <path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
      <path d="M10 12h4M10 16h6" />
    </svg>
  );
}

/** Reviews / Chat bubble with star — customer review management */
export function IcoReviews({ size = 24, color = 'currentColor', strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M12 8v.01M9.5 11l2.5-3 2.5 3" strokeWidth="0" fill={color} fillOpacity="0.6" />
      <path d="M9.5 10.5l2.5-2.5 2.5 2.5" />
    </svg>
  );
}

/** Agents — three dots connected (team/network) */
export function IcoAgents({ size = 24, color = 'currentColor', strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <circle cx="12" cy="6" r="3" />
      <circle cx="5" cy="18" r="3" />
      <circle cx="19" cy="18" r="3" />
      <path d="M12 9v3M12 12l-5.5 4M12 12l5.5 4" />
    </svg>
  );
}

/** Ads / Performance — upward trend with coin */
export function IcoAds({ size = 24, color = 'currentColor', strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 14.5c0 1.1.9 2 2 2h2.5a1.5 1.5 0 0 0 0-3h-2a1.5 1.5 0 0 1 0-3H15" />
      <path d="M12 8.5v1M12 16.5v1" />
    </svg>
  );
}

/** More / Grid of 4 dots — overflow menu */
export function IcoGrid({ size = 24, color = 'currentColor', strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </svg>
  );
}

/** Notification bell — clean minimal */
export function IcoNotification({ size = 24, color = 'currentColor', strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <path d="M6 10a6 6 0 0 1 12 0c0 5.5 2.5 7.5 2.5 7.5h-17S6 15.5 6 10" />
      <path d="M10.3 21a2 2 0 0 0 3.4 0" />
    </svg>
  );
}

/** Star rating — for reviews */
export function IcoStar({ size = 14, color = 'currentColor', filled = false }: IconProps & { filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

/** Google Business icon — location pin with G */
export function IcoGoogle({ size = 16, color = 'currentColor', strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

/** Instagram logo — rounded square with circle */
export function IcoInstagram({ size = 16, color = 'currentColor', strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="17.5" cy="6.5" r="1.2" fill={color} stroke="none" />
    </svg>
  );
}

/** Integration/Link — two chain links */
export function IcoLink({ size = 16, color = 'currentColor', strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

/** Logout — arrow out of box */
export function IcoLogout({ size = 16, color = 'currentColor', strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

/** Send / Post — paper plane */
export function IcoSend({ size = 16, color = 'currentColor', strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

/** Edit — pencil */
export function IcoEdit({ size = 16, color = 'currentColor', strokeWidth = 1.6 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

/** Check / Tick mark */
export function IcoCheck({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/** Close / X */
export function IcoClose({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
  return (
    <svg {...D({ size, color, strokeWidth })}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
