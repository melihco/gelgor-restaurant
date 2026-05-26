'use client';

import { type ReactNode, type ButtonHTMLAttributes, forwardRef } from 'react';

/* ─────────────────────────────────────────────
   DESIGN TOKENS
   ───────────────────────────────────────────── */
const T = {
  bg: '#09090b',
  surface0: '#111114',
  surface1: '#18181b',
  surface2: '#1f1f23',
  surface3: '#27272a',
  border: 'rgba(255,255,255,0.08)',
  borderHover: 'rgba(255,255,255,0.14)',
  borderActive: 'rgba(99,102,241,0.35)',
  accent: '#6366f1',
  accentHover: '#818cf8',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#38bdf8',
  text: '#fafafa',
  textMuted: '#a1a1aa',
  textSubtle: '#71717a',
  radius: { sm: 8, md: 12, lg: 14, xl: 20 },
} as const;

/* ─────────────────────────────────────────────
   CARD
   ───────────────────────────────────────────── */
export function Card({
  children,
  className = '',
  glow,
  hover = false,
  padding = 'md',
  onClick,
}: {
  children: ReactNode;
  className?: string;
  glow?: string;
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
}) {
  const pad = { none: '', sm: 'p-4', md: 'p-5 sm:p-6', lg: 'p-6 sm:p-7' }[padding];
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`min-w-0 rounded-xl ${pad} ${hover ? 'transition-all duration-200 hover:border-white/[0.12] hover:shadow-lg hover:shadow-black/20 hover:-translate-y-[1px]' : ''} ${className}`}
      style={{
        background: T.surface1,
        border: `1px solid ${T.border}`,
        ...(glow ? { boxShadow: `0 0 24px ${glow}` } : {}),
        ...(onClick ? { textAlign: 'left' as const, width: '100%' } : {}),
      }}
    >
      {children}
    </Tag>
  );
}

/* ─────────────────────────────────────────────
   GLASS CARD
   ───────────────────────────────────────────── */
export function GlassCard({
  children,
  className = '',
  padding = 'md',
}: {
  children: ReactNode;
  className?: string;
  padding?: 'sm' | 'md' | 'lg';
}) {
  const pad = { sm: 'p-4', md: 'p-5 sm:p-6', lg: 'p-6 sm:p-7' }[padding];
  return (
    <div
      className={`min-w-0 rounded-xl ${pad} ${className}`}
      style={{
        background: 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: `1px solid ${T.border}`,
      }}
    >
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────
   STATUS BADGE
   ───────────────────────────────────────────── */
const STATUS_PRESETS = {
  active:    { color: '#22c55e', label: 'Aktif',       bg: 'rgba(34,197,94,0.12)' },
  idle:      { color: '#71717a', label: 'Boşta',       bg: 'rgba(113,113,122,0.12)' },
  working:   { color: '#22c55e', label: 'Çalışıyor',   bg: 'rgba(34,197,94,0.12)' },
  blocked:   { color: '#ef4444', label: 'Engelli',     bg: 'rgba(239,68,68,0.12)' },
  pending:   { color: '#f59e0b', label: 'Bekliyor',    bg: 'rgba(245,158,11,0.12)' },
  approved:  { color: '#22c55e', label: 'Onaylı',      bg: 'rgba(34,197,94,0.12)' },
  rejected:  { color: '#ef4444', label: 'Reddedildi',  bg: 'rgba(239,68,68,0.12)' },
  error:     { color: '#ef4444', label: 'Hata',        bg: 'rgba(239,68,68,0.12)' },
  completed: { color: '#3b82f6', label: 'Tamamlandı',  bg: 'rgba(59,130,246,0.12)' },
} as const;

export function StatusBadge({
  status,
  label,
  color,
  size = 'sm',
  pulse,
}: {
  status?: keyof typeof STATUS_PRESETS;
  label?: string;
  color?: string;
  size?: 'xs' | 'sm' | 'md';
  pulse?: boolean;
}) {
  const preset = status ? STATUS_PRESETS[status] : null;
  const c = color ?? preset?.color ?? '#71717a';
  const text = label ?? preset?.label ?? '';
  const bg = preset?.bg ?? `${c}18`;
  const sz = {
    xs: 'text-[11px] px-2 py-0.5',
    sm: 'text-[11px] px-2.5 py-1',
    md: 'text-[12px] px-3 py-1',
  }[size];

  return (
    <span
      className={`inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-md font-semibold leading-4 ${sz}`}
      style={{ color: c, background: bg, border: `1px solid ${c}20` }}
    >
      {pulse && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-50" style={{ background: c }} />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: c }} />
        </span>
      )}
      <span className="max-w-[9rem] truncate">{text}</span>
    </span>
  );
}

/* ─────────────────────────────────────────────
   PRIORITY INDICATOR
   ───────────────────────────────────────────── */
const PRIORITY_CONFIG = {
  critical: { color: '#ef4444', label: 'Kritik', bars: 4 },
  high:     { color: '#f59e0b', label: 'Yüksek', bars: 3 },
  medium:   { color: '#3b82f6', label: 'Normal', bars: 2 },
  low:      { color: '#71717a', label: 'Düşük',  bars: 1 },
} as const;

export function PriorityIndicator({ priority }: { priority: 'low' | 'medium' | 'high' | 'critical' }) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-3 w-1 rounded-sm"
            style={{
              background: i <= cfg.bars ? cfg.color : 'rgba(255,255,255,0.08)',
              opacity: i <= cfg.bars ? 1 : 0.3,
            }}
          />
        ))}
      </div>
      <span className="text-[11px] font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
    </div>
  );
}

/* ─────────────────────────────────────────────
   ACTION BUTTON
   ───────────────────────────────────────────── */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger';

const BUTTON_STYLES: Record<ButtonVariant, { bg: string; text: string; border: string }> = {
  primary:   { bg: 'linear-gradient(135deg, #6366f1, #7c3aed)', text: '#fff',     border: 'transparent' },
  secondary: { bg: 'rgba(255,255,255,0.05)',                     text: '#a5b4fc',  border: 'rgba(99,102,241,0.2)' },
  ghost:     { bg: 'transparent',                                 text: '#a1a1aa',  border: 'transparent' },
  success:   { bg: 'rgba(34,197,94,0.12)',                       text: '#22c55e',  border: 'rgba(34,197,94,0.2)' },
  danger:    { bg: 'rgba(239,68,68,0.10)',                       text: '#ef4444',  border: 'rgba(239,68,68,0.2)' },
};

export const ActionButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    icon?: ReactNode;
  }
>(({ variant = 'primary', size = 'md', icon, children, className = '', style: externalStyle, ...props }, ref) => {
  const s = BUTTON_STYLES[variant];
  const sz = {
    xs: 'text-[12px] px-2.5 py-1 gap-1.5',
    sm: 'text-[13px] px-3.5 py-1.5 gap-1.5',
    md: 'text-sm px-4 py-2 gap-2',
    lg: 'text-base px-5 py-2.5 gap-2',
  }[size];

  return (
    <button
      ref={ref}
      className={`inline-flex min-w-0 items-center justify-center rounded-lg font-semibold leading-5 transition-all duration-150 hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none ${sz} ${className}`}
      style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}`, ...externalStyle }}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
});
ActionButton.displayName = 'ActionButton';

/* ─────────────────────────────────────────────
   METRIC CARD
   ───────────────────────────────────────────── */
export function MetricCard({
  label,
  value,
  change,
  icon,
  accent = '#6366f1',
}: {
  label: string;
  value: string | number;
  change?: string;
  icon?: ReactNode;
  accent?: string;
}) {
  const isPositive = change?.startsWith('+');
  return (
    <Card padding="md" className="flex min-h-[144px] min-w-0 items-start gap-4">
      {icon && (
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${accent}14` }}
        >
          <span style={{ color: accent }}>{icon}</span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium uppercase leading-4 tracking-wider text-zinc-500">{label}</p>
        <p className="mt-2 break-words text-2xl font-bold leading-none text-white">{value}</p>
        {change && (
          <p className="mt-0.5 text-[12px] font-medium" style={{ color: isPositive ? '#22c55e' : T.textMuted }}>
            {change}
          </p>
        )}
      </div>
    </Card>
  );
}

/* ─────────────────────────────────────────────
   SECTION HEADER
   ───────────────────────────────────────────── */
export function SectionHeader({
  title,
  subtitle,
  action,
  count,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  count?: number;
}) {
  return (
    <div className="mb-5 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <h2 className="min-w-0 break-words text-base font-semibold leading-6 text-white">{title}</h2>
          {count !== undefined && (
            <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium text-zinc-400">
              {count}
            </span>
          )}
        </div>
        {subtitle && <p className="mt-1 max-w-3xl text-[13px] leading-5 text-zinc-500">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ─────────────────────────────────────────────
   SENTIMENT INDICATOR
   ───────────────────────────────────────────── */
export function SentimentIndicator({ score }: { score: number }) {
  const color = score >= 4 ? '#22c55e' : score >= 3 ? '#f59e0b' : '#ef4444';
  const label = score >= 4 ? 'Pozitif' : score >= 3 ? 'Nötr' : 'Negatif';
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-2 w-4 rounded-sm"
            style={{ background: i <= score ? color : 'rgba(255,255,255,0.08)' }}
          />
        ))}
      </div>
      <span className="text-[11px] font-medium" style={{ color }}>{label}</span>
    </div>
  );
}

/* ─────────────────────────────────────────────
   AVATAR
   ───────────────────────────────────────────── */
export function AgentAvatar({
  name,
  color = '#6366f1',
  size = 'md',
  state,
}: {
  name: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  state?: 'working' | 'idle' | 'blocked' | 'error';
}) {
  const dims = { sm: 'h-9 w-9 text-xs', md: 'h-11 w-11 text-sm', lg: 'h-13 w-13 text-base' }[size];
  const stateColor = state === 'working' ? '#22c55e' : state === 'blocked' || state === 'error' ? '#ef4444' : '#71717a';

  return (
    <div className="relative">
      <div
        className={`flex ${dims} items-center justify-center rounded-xl font-bold text-white`}
        style={{
          background: `linear-gradient(145deg, ${color}cc, ${color}88)`,
          boxShadow: state === 'working' ? `0 0 16px ${color}40` : 'none',
        }}
      >
        {name[0]}
      </div>
      {state && (
        <span
          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-[#18181b]"
          style={{ background: stateColor }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   EMPTY STATE
   ───────────────────────────────────────────── */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-white/[0.08] px-6 py-14 text-center">
      <div className="mb-4 text-zinc-600">{icon}</div>
      <p className="text-base font-medium text-zinc-300">{title}</p>
      {description && <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-zinc-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export { T as tokens };
