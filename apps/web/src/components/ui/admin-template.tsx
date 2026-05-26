'use client';

import { type ReactNode } from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'indigo' | 'cyan' | 'violet' | 'amber' | 'emerald' | 'rose' | 'neutral';

const toneMap: Record<Tone, { glow: string; accent: string; soft: string }> = {
  indigo: { glow: 'bg-indigo-500/14', accent: 'text-indigo-300', soft: 'bg-indigo-500/10' },
  cyan: { glow: 'bg-cyan-500/12', accent: 'text-cyan-300', soft: 'bg-cyan-500/10' },
  violet: { glow: 'bg-violet-500/14', accent: 'text-violet-300', soft: 'bg-violet-500/10' },
  amber: { glow: 'bg-amber-400/10', accent: 'text-amber-300', soft: 'bg-amber-400/10' },
  emerald: { glow: 'bg-emerald-400/10', accent: 'text-emerald-300', soft: 'bg-emerald-400/10' },
  rose: { glow: 'bg-rose-500/10', accent: 'text-rose-300', soft: 'bg-rose-500/10' },
  neutral: { glow: 'bg-white/8', accent: 'text-zinc-300', soft: 'bg-white/[0.06]' },
};

export function AdminPageShell({
  children,
  tone = 'indigo',
  maxWidth = 'max-w-[1560px]',
}: {
  children: ReactNode;
  tone?: Tone;
  maxWidth?: string;
}) {
  const toneConfig = toneMap[tone];

  return (
    <div className="relative h-full overflow-y-auto bg-[#050507] px-5 py-8 scrollbar-thin sm:px-8 lg:px-10">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className={cn('absolute left-[9%] top-[-18%] h-[38rem] w-[38rem] rounded-full blur-[135px]', toneConfig.glow)} />
        <div className="absolute right-[-12%] top-[16%] h-[32rem] w-[32rem] rounded-full bg-white/[0.045] blur-[140px]" />
      </div>
      <div className={cn('relative mx-auto', maxWidth)}>{children}</div>
    </div>
  );
}

export function AdminHero({
  eyebrow,
  title,
  description,
  icon: Icon,
  tone = 'indigo',
  aside,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tone?: Tone;
  aside?: ReactNode;
}) {
  const toneConfig = toneMap[tone];

  return (
    <section className="mb-8 overflow-hidden rounded-[2.5rem] border border-white/10 bg-white/[0.055] p-7 shadow-[0_36px_110px_rgba(0,0,0,0.32)] backdrop-blur-3xl sm:p-9">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-end">
        <div>
          <div className="mb-5 inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/62">
            <Icon className={cn('h-3.5 w-3.5 shrink-0', toneConfig.accent)} />
            <span className="truncate">{eyebrow}</span>
          </div>
          <h1 className="max-w-4xl text-[2.4rem] font-semibold leading-none tracking-[-0.055em] text-white sm:text-5xl lg:text-[3.5rem]">
            {title}
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-white/56">{description}</p>
        </div>
        {aside && <div className="rounded-[2rem] border border-white/10 bg-black/20 p-5">{aside}</div>}
      </div>
    </section>
  );
}

export function AdminSurface({
  children,
  className,
  padding = 'lg',
}: {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'md' | 'lg';
}) {
  const paddingClass = {
    none: '',
    md: 'p-5',
    lg: 'p-6',
  }[padding];

  return (
    <div
      className={cn(
        'rounded-[2rem] border border-white/10 bg-white/[0.045] shadow-[0_24px_70px_rgba(0,0,0,0.22)] backdrop-blur-2xl',
        paddingClass,
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AdminSectionTitle({
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
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-center gap-2.5">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-white">{title}</h2>
          {count !== undefined && (
            <span className="rounded-lg bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold text-zinc-400">{count}</span>
          )}
        </div>
        {subtitle && <p className="mt-1 text-sm leading-5 text-white/42">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function AdminAsideStat({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper?: string;
}) {
  return (
    <div className="rounded-2xl bg-white/[0.045] p-4">
      <p className="text-3xl font-semibold tracking-[-0.04em] text-white">{value}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-500">{label}</p>
      {helper && <p className="mt-1 text-[11px] leading-4 text-zinc-600">{helper}</p>}
    </div>
  );
}
