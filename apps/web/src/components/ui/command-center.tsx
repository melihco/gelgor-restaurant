'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle, CheckCircle2, CircleAlert, HelpCircle, ImageIcon, Loader2,
  Play, X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Badge from '@/components/tailadmin/Badge';
import Button from '@/components/tailadmin/Button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/tailadmin/Card';
import { Modal } from '@/tailadmin/components/ui/modal';

export type Tone = 'cyan' | 'violet' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'neutral';
export type Risk = 'low' | 'medium' | 'high' | 'critical';

const toneStyles: Record<Tone, { text: string; bg: string; border: string; glow: string; hex: string; badge: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'light' }> = {
  cyan: { text: 'text-blue-light-500', bg: 'bg-blue-light-50 dark:bg-blue-light-500/15', border: 'border-blue-light-200 dark:border-blue-light-500/20', glow: 'shadow-theme-xs', hex: '#0ba5ec', badge: 'info' },
  violet: { text: 'text-brand-500 dark:text-brand-400', bg: 'bg-brand-50 dark:bg-brand-500/15', border: 'border-brand-200 dark:border-brand-500/20', glow: 'shadow-theme-xs', hex: '#465fff', badge: 'primary' },
  indigo: { text: 'text-brand-500 dark:text-brand-400', bg: 'bg-brand-50 dark:bg-brand-500/15', border: 'border-brand-200 dark:border-brand-500/20', glow: 'shadow-theme-xs', hex: '#465fff', badge: 'primary' },
  emerald: { text: 'text-success-600 dark:text-success-500', bg: 'bg-success-50 dark:bg-success-500/15', border: 'border-success-200 dark:border-success-500/20', glow: 'shadow-theme-xs', hex: '#12b76a', badge: 'success' },
  amber: { text: 'text-warning-600 dark:text-orange-400', bg: 'bg-warning-50 dark:bg-warning-500/15', border: 'border-warning-200 dark:border-warning-500/20', glow: 'shadow-theme-xs', hex: '#f79009', badge: 'warning' },
  rose: { text: 'text-error-600 dark:text-error-500', bg: 'bg-error-50 dark:bg-error-500/15', border: 'border-error-200 dark:border-error-500/20', glow: 'shadow-theme-xs', hex: '#f04438', badge: 'error' },
  neutral: { text: 'text-gray-700 dark:text-gray-300', bg: 'bg-gray-100 dark:bg-white/5', border: 'border-gray-200 dark:border-gray-800', glow: 'shadow-theme-xs', hex: '#667085', badge: 'light' },
};

const riskTone: Record<Risk, Tone> = {
  low: 'emerald',
  medium: 'amber',
  high: 'rose',
  critical: 'rose',
};

export function DataCanvas({
  children,
  className,
  maxWidth = 'max-w-[1640px]',
}: {
  children: ReactNode;
  className?: string;
  maxWidth?: string;
}) {
  return (
    <div className={cn('h-full overflow-y-auto bg-gray-50 px-4 py-8 pb-14 scrollbar-thin dark:bg-gray-950 sm:px-6 lg:px-8', className)}>
      <div className={cn('relative mx-auto min-w-0 space-y-6', maxWidth)}>{children}</div>
    </div>
  );
}

export function MetricsGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 2xl:grid-cols-4', className)}>
      {children}
    </div>
  );
}

export function ContentGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid min-w-0 grid-cols-1 gap-6', className)}>
      {children}
    </div>
  );
}

export function SurfaceCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Card className={cn('p-5 text-left', className)}>
      {children}
    </Card>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  tone = 'cyan',
  action,
  aside,
  guide,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  tone?: Tone;
  action?: ReactNode;
  aside?: ReactNode;
  guide?: ReactNode;
}) {
  const toneStyle = toneStyles[tone];
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03] sm:p-8">
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_400px] xl:items-end">
        <div className="min-w-0">
          <div className="mb-5">
            <Badge color={toneStyle.badge} size="sm" startIcon={Icon ? <Icon className="h-3.5 w-3.5" /> : undefined}>
              {eyebrow}
            </Badge>
          </div>
          <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <h1 className="max-w-5xl break-words text-3xl font-semibold tracking-[-0.03em] text-gray-800 dark:text-white/90 sm:text-4xl lg:text-5xl">
                {title}
              </h1>
              {description && <p className="mt-4 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400 sm:text-base">{description}</p>}
              {guide && <div className="mt-5 flex flex-wrap items-center gap-2">{guide}</div>}
            </div>
            {action && <div className="shrink-0">{action}</div>}
          </div>
        </div>
        {aside && <div className="min-w-0 rounded-2xl border border-gray-200 bg-gray-50 p-5 text-left dark:border-gray-800 dark:bg-white/[0.03]">{aside}</div>}
      </div>
    </section>
  );
}

export function GlassPanel({
  children,
  className,
  hover = false,
  tone = 'neutral',
  padding = 'p-6',
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  tone?: Tone;
  padding?: string;
}) {
  return (
    <Card
      className={cn(
        hover && 'transition-all duration-200 hover:border-brand-200 hover:shadow-theme-md dark:hover:border-brand-500/30',
        className,
      )}
    >
      <div className={cn('min-w-0 text-left', padding)}>{children}</div>
    </Card>
  );
}

export function SectionHeader({
  title,
  subtitle,
  count,
  action,
}: {
  title: string;
  subtitle?: string;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <h2 className="min-w-0 text-lg font-semibold leading-6 text-gray-800 dark:text-white/90">{title}</h2>
          {count !== undefined && <Badge color="light" size="sm">{count}</Badge>}
        </div>
        {subtitle && <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function StatusPill({
  label,
  tone = 'neutral',
  pulse = false,
  icon: Icon,
}: {
  label: string;
  tone?: Tone;
  pulse?: boolean;
  icon?: LucideIcon;
}) {
  const toneStyle = toneStyles[tone];
  return (
    <Badge
      color={toneStyle.badge}
      size="sm"
      startIcon={pulse ? (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-45" style={{ background: toneStyle.hex }} />
          <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: toneStyle.hex }} />
        </span>
      ) : Icon ? <Icon className="h-3 w-3" /> : undefined}
    >
      {label}
    </Badge>
  );
}

export function RiskBadge({ risk }: { risk: Risk }) {
  const labels: Record<Risk, string> = {
    low: 'Düşük risk',
    medium: 'Orta risk',
    high: 'Yüksek risk',
    critical: 'Kritik risk',
  };
  return <StatusPill label={labels[risk]} tone={riskTone[risk]} icon={risk === 'low' ? CheckCircle2 : AlertTriangle} />;
}

export function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
  tone = 'cyan',
  trend,
}: {
  label: string;
  value: string | number;
  helper?: string;
  icon?: LucideIcon;
  tone?: Tone;
  trend?: string;
}) {
  const toneStyle = toneStyles[tone];
  return (
    <GlassPanel hover tone={tone} className="h-full min-h-[156px]" padding="p-6">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0 flex-1 text-left">
          <p className="text-theme-xs font-medium uppercase leading-5 tracking-[0.08em] text-gray-500 dark:text-gray-400">{label}</p>
          <p className="mt-3 break-words text-3xl font-semibold leading-tight tracking-[-0.03em] text-gray-800 dark:text-white/90">{value}</p>
        </div>
        {Icon && (
          <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border', toneStyle.bg, toneStyle.border)}>
            <Icon className={cn('h-5 w-5', toneStyle.text)} />
          </div>
        )}
      </div>
      <div className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-2 text-theme-xs leading-5">
        <span className="min-w-0 break-words text-gray-500 dark:text-gray-400">{helper}</span>
        {trend && <span className={cn('shrink-0 font-semibold', toneStyle.text)}>{trend}</span>}
      </div>
    </GlassPanel>
  );
}

export function HealthScoreCard({
  score,
  label = 'Business AI Health',
  helper,
}: {
  score: number;
  label?: string;
  helper?: string;
}) {
  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  const tone: Tone = bounded >= 80 ? 'emerald' : bounded >= 55 ? 'amber' : 'rose';
  const toneStyle = toneStyles[tone];
  return (
    <GlassPanel tone={tone} className="min-h-[220px]" padding="p-6">
      <div className="flex min-w-0 items-center justify-between gap-5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase leading-4 tracking-[0.14em] text-gray-500 dark:text-gray-400">{label}</p>
          <p className="mt-3 text-6xl font-semibold tracking-[-0.055em] text-gray-800 dark:text-white/90">{bounded}</p>
          <p className="mt-2 max-w-xl text-sm leading-6 text-gray-500 dark:text-gray-400">{helper ?? 'Agent, approval, provider and readiness signals combined.'}</p>
        </div>
        <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="absolute inset-3 rounded-full border border-gray-200 dark:border-gray-800" />
          <span className={cn('relative text-sm font-bold', toneStyle.text)}>{bounded}%</span>
        </div>
      </div>
      <div className="mt-6 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${bounded}%`, background: toneStyle.hex }}
        />
      </div>
    </GlassPanel>
  );
}

function agentStatusLabelTr(status: string, working: boolean): string {
  if (working) return 'Canlı';
  const map: Record<string, string> = {
    idle: 'Boşta',
    blocked: 'Engelli',
    error: 'Hata',
    completed: 'Tamamlandı',
    working: 'Canlı',
  };
  return map[status] ?? status;
}

export function AgentCard({
  name,
  role,
  status,
  queue,
  completedCount,
  outputCount,
  currentTask,
  tone = 'violet',
  onAction,
  onOpen,
  onCancelStuck,
  cancelStuckPending,
}: {
  name: string;
  role: string;
  status: string;
  /** Bekleyen görev sayısı (snapshot’taki görevler). */
  queue: number;
  /** Tamamlanmış veya onay bekleyen görev sayısı. */
  completedCount: number;
  /** Bu ajana bağlı çıktı (artifact) sayısı. */
  outputCount: number;
  currentTask?: string;
  tone?: Tone;
  onAction?: () => void;
  onOpen?: () => void;
  /** When the agent is working, optionally offer DB-side cancellation of a stuck run (does not kill external workers). */
  onCancelStuck?: () => void;
  cancelStuckPending?: boolean;
}) {
  const toneStyle = toneStyles[tone];
  const working = status === 'working';
  return (
    <GlassPanel hover tone={tone} padding="p-0" className="flex h-full min-h-[390px] flex-col">
      <CardHeader className="min-h-[150px] border-b border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.02]">
        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4 text-left">
            <div className="relative shrink-0">
              {working && <div className={cn('absolute -inset-2 animate-pulse rounded-2xl blur-xl', toneStyle.bg)} />}
              <div
                className={cn('relative flex h-16 w-16 items-center justify-center rounded-2xl border text-2xl font-semibold shadow-theme-xs', toneStyle.bg, toneStyle.border, toneStyle.text)}
              >
                {name.slice(0, 1)}
              </div>
            </div>
            <div className="min-w-0 pt-1">
              <CardTitle className="line-clamp-1 break-words text-lg font-semibold">{name}</CardTitle>
              <CardDescription className="line-clamp-2 max-w-[18rem] break-words">{role}</CardDescription>
            </div>
          </div>
          <StatusPill label={agentStatusLabelTr(status, working)} tone={working ? 'emerald' : 'neutral'} pulse={working} />
        </div>

        <div className="mt-5 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: toneStyle.hex }} />
          <p className="text-theme-xs font-medium uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">Çalışan profili</p>
        </div>
      </CardHeader>

      <CardContent className="flex-1 border-t-0 p-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 text-left dark:border-gray-800 dark:bg-gray-900">
          <p className="text-theme-xs font-medium uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">Güncel görev</p>
          <p className="mt-2 min-h-[64px] line-clamp-3 break-words text-sm leading-6 text-gray-700 dark:text-gray-300">{currentTask || 'Sırada görev yok; yeni bir görev atayabilirsiniz.'}</p>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3">
          <MiniStat label="Bekleyen" value={queue} tone={tone} />
          <MiniStat label="Biten / onay" value={completedCount} tone="neutral" />
          <MiniStat label="Çıktı" value={outputCount} tone="cyan" />
        </div>
      </CardContent>

      <CardFooter className="flex flex-col gap-3 bg-gray-50 dark:bg-white/[0.02]">
        {working && onCancelStuck && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={cancelStuckPending}
            onClick={onCancelStuck}
            className="min-h-11 w-full border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-500/35 dark:text-rose-300 dark:hover:bg-rose-500/10"
          >
            {cancelStuckPending ? 'İptal ediliyor…' : 'Takılı görevi durdur'}
          </Button>
        )}
        <div className="grid grid-cols-2 gap-3">
          {onOpen && (
            <Button variant="outline" size="sm" onClick={onOpen} className="min-h-11 w-full">
              Canlı panel
            </Button>
          )}
          {onAction && (
            <Button size="sm" onClick={onAction} className="min-h-11 w-full">
              Görev ata
            </Button>
          )}
        </div>
      </CardFooter>
    </GlassPanel>
  );
}

export function MiniStat({ label, value, tone = 'neutral' }: { label: string; value: string | number; tone?: Tone }) {
  const toneStyle = toneStyles[tone];
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 text-left dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">{label}</p>
      <p className={cn('mt-1.5 text-sm font-semibold tabular-nums', toneStyle.text)}>{value}</p>
    </div>
  );
}

export function InsightCard({
  title,
  description,
  tone = 'cyan',
  icon: Icon = CircleAlert,
  action,
}: {
  title: string;
  description: string;
  tone?: Tone;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  const toneStyle = toneStyles[tone];
  return (
    <SurfaceCard className="p-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border', toneStyle.bg, toneStyle.border)}>
          <Icon className={cn('h-4 w-4', toneStyle.text)} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold leading-5 text-gray-800 dark:text-white/90">{title}</p>
          <p className="mt-1 break-words text-xs leading-5 text-gray-500 dark:text-gray-400">{description}</p>
          {action && <div className="mt-3">{action}</div>}
        </div>
      </div>
    </SurfaceCard>
  );
}

export function Timeline({
  items,
}: {
  items: Array<{ title: string; description?: string; tone?: Tone; time?: string }>;
}) {
  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const toneStyle = toneStyles[item.tone ?? 'neutral'];
        return (
          <div key={`${item.title}-${index}`} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="mt-1 h-2.5 w-2.5 rounded-full" style={{ background: toneStyle.hex, boxShadow: `0 0 18px ${toneStyle.hex}66` }} />
              {index < items.length - 1 && <span className="mt-1 h-full min-h-8 w-px bg-gray-200 dark:bg-gray-800" />}
            </div>
            <div className="min-w-0 pb-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="min-w-0 break-words text-sm font-semibold leading-5 text-gray-800 dark:text-white/90">{item.title}</p>
                {item.time && <span className="shrink-0 text-[10px] text-gray-500 dark:text-gray-400">{item.time}</span>}
              </div>
              {item.description && <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{item.description}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function QuotaMeter({ label, used, limit, tone = 'cyan' }: { label: string; used: number; limit: number; tone?: Tone }) {
  const percent = limit <= 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const toneStyle = toneStyles[percent > 85 ? 'rose' : percent > 65 ? 'amber' : tone];
  return (
    <SurfaceCard className="p-4">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-gray-700 dark:text-gray-300">{label}</span>
        <span className={toneStyle.text}>{used}/{limit}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]">
        <div className="h-full rounded-full" style={{ width: `${percent}%`, background: toneStyle.hex }} />
      </div>
    </SurfaceCard>
  );
}

export function ProviderStatusCard({
  name,
  status,
  detail,
  tone = 'neutral',
}: {
  name: string;
  status: string;
  detail?: string;
  tone?: Tone;
}) {
  return (
    <SurfaceCard className="p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className="min-w-0 break-words text-sm font-semibold leading-5 text-gray-800 dark:text-white/90">{name}</p>
        <StatusPill label={status} tone={tone} pulse={tone === 'emerald'} />
      </div>
      {detail && <p className="mt-2 break-words text-xs leading-5 text-gray-500 dark:text-gray-400">{detail}</p>}
    </SurfaceCard>
  );
}

export function ArtifactCard({
  title,
  type,
  status,
  summary,
  imageUrl,
  videoUrl,
  onOpen,
}: {
  title: string;
  type: string;
  status: string;
  summary?: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  onOpen?: () => void;
}) {
  const hasMedia = Boolean(imageUrl || videoUrl);
  return (
    <button type="button" onClick={onOpen} className="w-full min-w-0 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-theme-xs transition hover:border-brand-200 hover:shadow-theme-md dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-brand-500/30">
      {hasMedia && (
        <div className="mb-3 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
          {videoUrl ? (
            <div className="relative flex h-24 items-center justify-center bg-gradient-to-br from-brand-50 to-gray-50 dark:from-brand-500/10 dark:to-white/[0.02]">
              <Play className="h-7 w-7 text-brand-500" />
              <span className="absolute bottom-2 right-2 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-700 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                Video preview
              </span>
            </div>
          ) : (
            <img src={imageUrl ?? ''} alt={title} className="h-24 w-full object-cover" />
          )}
        </div>
      )}
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words text-sm font-semibold leading-5 text-gray-800 dark:text-white/90">{title}</p>
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
            <ImageIcon className="h-3 w-3" />
            {type}
          </p>
        </div>
        <StatusPill label={status} tone={status.includes('approved') || status.includes('published') ? 'emerald' : 'amber'} />
      </div>
      {summary && <p className="mt-3 line-clamp-3 break-words text-xs leading-5 text-gray-500 dark:text-gray-400">{summary}</p>}
    </button>
  );
}

export function ReadinessChecklist({
  items,
}: {
  items: Array<{ label: string; complete: boolean; detail?: string }>;
}) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <SurfaceCard key={item.label} className="flex items-start gap-3 p-3">
          <div className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border', item.complete ? 'border-success-200 bg-success-50 text-success-600 dark:border-success-500/20 dark:bg-success-500/15 dark:text-success-500' : 'border-warning-200 bg-warning-50 text-warning-600 dark:border-warning-500/20 dark:bg-warning-500/15 dark:text-orange-400')}>
            {item.complete ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{item.label}</p>
            {item.detail && <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{item.detail}</p>}
          </div>
        </SurfaceCard>
      ))}
    </div>
  );
}

export function LoadingSkeleton({ label = 'Loading command surface...' }: { label?: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <GlassPanel className="w-full max-w-sm text-center" padding="p-8">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-500" />
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{label}</p>
      </GlassPanel>
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <Card className="border-dashed text-center">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <p className="mx-auto max-w-sm text-sm leading-6 text-gray-500 dark:text-gray-400">
          Burada gösterilecek kayıt oluştuğunda TailAdmin kart yapısı içinde listelenecek.
        </p>
      </CardContent>
    </Card>
  );
}

export function ErrorState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-2xl border border-error-200 bg-error-50 p-6 dark:border-error-500/20 dark:bg-error-500/15">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-error-600 dark:text-error-500" />
        <div>
          <p className="text-sm font-semibold text-error-700 dark:text-error-500">{title}</p>
          {description && <p className="mt-1 text-sm leading-6 text-error-600 dark:text-error-400">{description}</p>}
        </div>
      </div>
    </div>
  );
}

export interface PageGuideStep {
  title: string;
  description: string;
  icon?: LucideIcon;
}

export function PageGuide({
  pageTitle,
  intro,
  steps,
  hint,
  tone = 'cyan',
}: {
  pageTitle: string;
  intro: string;
  steps: PageGuideStep[];
  hint?: string;
  tone?: Tone;
}) {
  const [open, setOpen] = useState(false);
  const toneStyle = toneStyles[tone];

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition hover:bg-gray-50 dark:hover:bg-white/[0.03]', toneStyle.border, toneStyle.bg, toneStyle.text)}
      >
        <HelpCircle className="h-3.5 w-3.5" />
        Bu sayfa nasıl çalışır?
      </button>

      <Modal isOpen={open} onClose={() => setOpen(false)} className="max-w-2xl p-7">
        <div>
          <Badge color={toneStyle.badge} size="sm" startIcon={<HelpCircle className="h-3.5 w-3.5" />}>
            Sayfa rehberi
          </Badge>
          <h2 className="mt-4 text-2xl font-semibold tracking-[-0.02em] text-gray-800 dark:text-white/90">{pageTitle}</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-gray-500 dark:text-gray-400">{intro}</p>

          <div className="mt-6 space-y-3">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={`${step.title}-${index}`} className="flex gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                  <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-sm font-bold', toneStyle.border, toneStyle.bg, toneStyle.text)}>
                    {Icon ? <Icon className="h-4 w-4" /> : index + 1}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{step.title}</p>
                    <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{step.description}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {hint && (
            <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-xs leading-5 text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
              <span className="font-semibold text-gray-800 dark:text-white/90">İpucu: </span>
              {hint}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

export function DetailDrawer({
  open,
  onClose,
  title,
  eyebrow,
  tone = 'cyan',
  children,
  footer,
  width = 'max-w-2xl',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  tone?: Tone;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const toneStyle = toneStyles[tone];

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex justify-end bg-gray-900/45 backdrop-blur-[24px] dark:bg-black/55"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="pointer-events-none flex h-full max-h-[100dvh] w-full min-w-0 justify-end p-3 pb-4 pl-4 pt-16 sm:p-5 sm:pt-[5.25rem] md:p-6 md:pt-24"
      >
        <div
          onClick={(event: React.MouseEvent) => event.stopPropagation()}
          className={cn(
            'pointer-events-auto flex h-full max-h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl ring-1 ring-black/[0.04] dark:border-gray-800 dark:bg-gray-900 dark:ring-white/[0.06]',
            width,
          )}
        >
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-6 py-5 dark:border-gray-800">
              <div className="min-w-0">
                {eyebrow && (
                  <p className={cn('text-[10px] font-semibold uppercase tracking-[0.18em]', toneStyle.text)}>{eyebrow}</p>
                )}
                <h2 className="mt-1 truncate text-lg font-semibold tracking-[-0.015em] text-gray-800 dark:text-white/90">{title}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 transition hover:bg-gray-200 hover:text-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-thin">{children}</div>
            {footer && (
              <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-white/[0.03]">{footer}</div>
            )}
        </div>
      </div>
    </div>
  );
}
