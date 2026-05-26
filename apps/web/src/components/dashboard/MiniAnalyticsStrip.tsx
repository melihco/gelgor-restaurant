'use client';

import { TrendingUp, GitBranch, Target, Zap } from 'lucide-react';
import { zoneById } from '@/lib/office-layout';
import { useOfficeStore } from '@/stores/office-store';
import { useDashboardSnapshot } from '@/hooks/use-dashboard-snapshot';

export default function MiniAnalyticsStrip() {
  const selectedZoneId = useOfficeStore((s) => s.selectedZoneId);
  const { data } = useDashboardSnapshot();
  const agents = data?.agents ?? [];
  const tasks = data?.tasks ?? [];
  const blocked = agents.filter((a) => a.state === 'blocked').length;
  const working = tasks.filter((t) => t.status === 'in_progress').length;
  const pending = tasks.filter((t) => t.status === 'pending').length;
  const zone = selectedZoneId ? zoneById(selectedZoneId) : null;

  const items = [
    { icon: Zap,        label: 'Üretimde', value: String(working), color: '#a78bfa' },
    { icon: GitBranch,  label: 'Sırada',   value: String(pending), color: '#60a5fa' },
    { icon: Target,     label: 'Risk',      value: String(blocked), color: blocked ? '#f87171' : '#52525b' },
    { icon: TrendingUp, label: 'Odak',      value: zone?.name?.split(' ').slice(0, 2).join(' ') ?? 'Tümü', color: '#818cf8' },
  ];

  return (
    <div
      className="pointer-events-none absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 gap-2 px-4"
      style={{ maxWidth: 'min(800px, calc(100vw - 420px))' }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="pointer-events-auto flex min-w-[100px] flex-1 items-center gap-2.5 rounded-xl px-3 py-2"
          style={{
            background: 'linear-gradient(160deg, rgba(12,13,28,0.85) 0%, rgba(8,9,18,0.9) 100%)',
            border: '1px solid rgba(255,255,255,0.05)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <item.icon className="h-3.5 w-3.5 shrink-0" style={{ color: item.color }} />
          <div className="min-w-0">
            <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-zinc-600">{item.label}</p>
            <p className="truncate text-[13px] font-semibold text-zinc-200">{item.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
