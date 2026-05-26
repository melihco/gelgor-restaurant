'use client';

import { Radio } from 'lucide-react';
import { timeAgo } from '@/lib/mock-data';
import { useOfficeStore } from '@/stores/office-store';
import { useActivityStore } from '@/stores/activity-store';

export default function ActivityFeed() {
  const show = useOfficeStore((s) => s.showActivityFeed);
  const items = useActivityStore((s) => s.items);
  if (!show) return null;

  return (
    <div
      className="pointer-events-auto absolute bottom-[108px] left-[300px] z-20 w-[min(400px,calc(100vw-340px))] overflow-hidden rounded-2xl"
      style={{
        background: 'linear-gradient(170deg, rgba(12,13,28,0.88) 0%, rgba(8,9,18,0.92) 100%)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.3)',
        backdropFilter: 'blur(20px)',
        maxHeight: '240px',
      }}
    >
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Canlı olaylar
          </span>
        </div>
        <span className="text-[9px] font-medium text-emerald-500/70">Akış</span>
      </div>
      <div className="scrollbar-thin max-h-[196px] space-y-0 overflow-y-auto py-1">
        {items.length === 0 && (
          <div className="px-4 py-5 text-[11px] text-zinc-600">
            Henüz canlı olay yok. Agent execution ve review aksiyonları burada akacak.
          </div>
        )}
        {items.slice(0, 8).map((evt, i) => {
          const c = evt.accentColor ?? '#a1a1b5';
          return (
            <div
              key={evt.id}
              className="flex gap-3 px-4 py-2 transition-colors hover:bg-white/[0.02]"
              style={{
                borderLeft: `2px solid ${i === 0 ? c : `${c}33`}`,
                background: i === 0 ? 'rgba(255,255,255,0.02)' : undefined,
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-[11px] leading-relaxed">
                  <span className="font-semibold" style={{ color: c }}>
                    {evt.subject}
                  </span>{' '}
                  <span className="text-zinc-500">{evt.action}</span>
                </p>
              </div>
              <span className="shrink-0 text-[9px] tabular-nums text-zinc-700">{timeAgo(evt.timestamp)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
