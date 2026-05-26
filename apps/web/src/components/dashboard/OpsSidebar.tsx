'use client';

import { useMemo, useState } from 'react';
import { Search, Zap, ChevronRight } from 'lucide-react';
import { OFFICE_ZONES } from '@/lib/office-layout';
import { AGENT_COLORS, STATE_COLORS } from '@/lib/mock-data';
import { useOfficeStore } from '@/stores/office-store';
import { useInteractionStore } from '@/stores/interaction-store';
import { useDashboardSnapshot } from '@/hooks/use-dashboard-snapshot';

const STATE_LABEL: Record<string, string> = {
  working: 'Çalışıyor', idle: 'Boşta', blocked: 'Engellendi', completed: 'Tamamlandı', error: 'Hata',
};

const STATE_FILTERS = [
  { id: 'all', label: 'Tümü' },
  { id: 'working', label: 'Çalışıyor' },
  { id: 'idle', label: 'Boşta' },
  { id: 'blocked', label: 'Engelli' },
] as const;

export default function OpsSidebar() {
  const { selectedAgentId, selectedZoneId, selectAgent, selectZone, openPanel } = useOfficeStore();
  const openAssignModal = useInteractionStore((s) => s.openAssignModal);
  const { data } = useDashboardSnapshot();
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<(typeof STATE_FILTERS)[number]['id']>('all');

  const agentsByZone = useMemo(() => {
    const map = new Map<string, NonNullable<typeof data>['agents']>();
    for (const z of OFFICE_ZONES) map.set(z.id, []);
    for (const agent of data?.agents ?? []) {
      const normalizedSearch = search.trim().toLowerCase();
      const matchesSearch =
        normalizedSearch.length === 0 ||
        agent.name.toLowerCase().includes(normalizedSearch) ||
        agent.roleLabel.toLowerCase().includes(normalizedSearch);
      const matchesState = stateFilter === 'all' || agent.state === stateFilter;
      if (!matchesSearch || !matchesState) continue;

      const list = map.get(agent.zoneId);
      if (list) list.push(agent);
    }
    return map;
  }, [data?.agents, search, stateFilter]);

  const totalVisibleAgents = useMemo(
    () => Array.from(agentsByZone.values()).reduce((acc, list) => acc + list.length, 0),
    [agentsByZone]
  );

  return (
    <aside
      className="flex h-full w-[260px] shrink-0 flex-col"
      style={{
        background: '#0f0f12',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Header */}
      <div className="px-4 pb-3 pt-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-indigo-400/60">
          Dijital Ofis
        </p>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="text-[13px] font-semibold text-white">AI Çalışanlar</p>
          <span className="rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 text-[9px] font-medium text-zinc-400">
            {totalVisibleAgents} görünür
          </span>
        </div>

        <label className="mt-3 flex items-center gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-zinc-600" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Agent veya rol ara…"
            className="w-full bg-transparent text-[11px] text-zinc-300 placeholder-zinc-700 outline-none"
          />
        </label>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {STATE_FILTERS.map((f) => {
            const on = stateFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setStateFilter(f.id)}
                className="rounded-md px-2 py-1 text-[9px] font-medium transition-all"
                style={{
                  background: on ? 'rgba(99,102,241,0.14)' : 'rgba(255,255,255,0.02)',
                  border: on ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.06)',
                  color: on ? '#c7d2fe' : '#71717a',
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3">
        {/* Zones */}
        <p className="mb-2 px-1 text-[8px] font-bold uppercase tracking-[0.16em] text-zinc-700">
          Bölgeler
        </p>
        <div className="mb-4 flex flex-wrap gap-1.5 px-1">
          {OFFICE_ZONES.map((z) => {
            const on = selectedZoneId === z.id;
            return (
              <button
                key={z.id}
                type="button"
                onClick={() => selectZone(z.id)}
                className="rounded-lg px-2.5 py-1 text-[10px] font-medium transition-all"
                style={{
                  background: on ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.02)',
                  border: on ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.04)',
                  color: on ? '#c7d2fe' : '#71717a',
                }}
              >
                {z.name.split(' ').slice(0, 2).join(' ')}
              </button>
            );
          })}
        </div>

        {/* Agents grouped by zone */}
        {OFFICE_ZONES.map((z) => {
          const agents = agentsByZone.get(z.id) ?? [];
          if (!agents.length) return null;
          return (
            <div key={z.id} className="mb-4">
              <div className="mb-1.5 flex items-center justify-between px-1">
                <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-zinc-700">{z.name}</p>
                <span className="text-[9px] text-zinc-600">{agents.length}</span>
              </div>
              <div className="space-y-0.5">
                {agents.map((agent) => {
                  const sel = selectedAgentId === agent.id;
                  const color = AGENT_COLORS[agent.type] ?? '#6366f1';
                  const stateColor = STATE_COLORS[agent.state] ?? '#6b7280';
                  const subtitle = agent.state === 'working'
                    ? agent.description || agent.roleLabel
                    : (STATE_LABEL[agent.state] ?? agent.roleLabel);

                  return (
                    <div key={agent.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => {
                          selectAgent(sel ? null : agent.id, sel ? null : agent.zoneId);
                          if (!sel) openPanel('agent');
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-all"
                        style={{
                          background: sel ? 'rgba(99,102,241,0.08)' : 'transparent',
                          border: sel ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
                        }}
                      >
                        {/* Avatar */}
                        <div className="relative">
                          <div
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
                            style={{
                              background: `linear-gradient(145deg, ${color}cc, ${color}88)`,
                              boxShadow: agent.state === 'working' ? `0 0 12px ${color}33` : 'none',
                            }}
                          >
                            {agent.name[0]}
                          </div>
                          <span
                            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-[1.5px] ring-[#0a0b16]"
                            style={{
                              background: stateColor,
                              boxShadow: agent.state === 'working' ? `0 0 6px ${stateColor}88` : 'none',
                            }}
                          />
                        </div>

                        {/* Info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-[12px] font-medium text-zinc-200">{agent.name}</p>
                            <span
                              className="shrink-0 rounded px-1 py-0.5 text-[8px] font-semibold"
                              style={{
                                color: stateColor,
                                background: `${stateColor}1f`,
                                border: `1px solid ${stateColor}2f`,
                              }}
                            >
                              {STATE_LABEL[agent.state] ?? agent.state}
                            </span>
                          </div>
                          <p className="truncate text-[10px] leading-tight text-zinc-600">{subtitle}</p>
                        </div>

                        <ChevronRight className="h-3 w-3 shrink-0 text-zinc-800 transition-colors group-hover:text-zinc-500" />
                      </button>

                      {/* Hover assign */}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openAssignModal(agent.id); }}
                        className="absolute right-8 top-1/2 -translate-y-1/2 hidden rounded-md p-1 text-zinc-700 transition-colors hover:bg-white/[0.06] hover:text-indigo-300 group-hover:flex"
                        title="Görev ata"
                      >
                        <Zap className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {totalVisibleAgents === 0 && (
          <div className="mt-10 rounded-xl border border-white/[0.05] bg-white/[0.015] px-3 py-6 text-center">
            <p className="text-[11px] text-zinc-500">Bu filtrede agent bulunamadı.</p>
            <p className="mt-1 text-[10px] text-zinc-700">Aramayı temizleyin veya durum filtresini değiştirin.</p>
          </div>
        )}
      </div>
    </aside>
  );
}
