'use client';

import {
  X,
  Cpu,
  ListChecks,
  ShieldCheck,
  FileOutput,
  ChevronRight,
} from 'lucide-react';
import {
  AGENT_COLORS,
  getAgentById,
  getTaskById,
  getTasksForAgent,
} from '@/lib/mock-data';
import { agentLayoutById, zoneById } from '@/lib/office-layout';
import { useOfficeStore } from '@/stores/office-store';

export default function ContextPanel() {
  const { selectedAgentId, isPanelOpen, panelType, closePanel } = useOfficeStore();
  const agent = selectedAgentId ? getAgentById(selectedAgentId) : undefined;
  const layout = selectedAgentId ? agentLayoutById(selectedAgentId) : undefined;
  const zone = layout ? zoneById(layout.zoneId) : null;
  const tasks = agent ? getTasksForAgent(agent.id) : [];
  const current = agent?.currentTaskId ? getTaskById(agent.currentTaskId) : undefined;

  const visible = isPanelOpen && panelType === 'agent' && agent && layout;

  if (!visible) return null;

  return (
        <aside
          key="ctx"
          className="flex h-full w-[360px] shrink-0 flex-col border-l border-white/[0.06]"
          style={{
            background: 'linear-gradient(200deg, rgba(14,15,26,0.95), rgba(8,9,15,0.98))',
            backdropFilter: 'blur(18px)',
          }}
        >
          <div className="flex items-start justify-between border-b border-white/[0.06] px-4 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-indigo-300/80">
                Selected unit
              </p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--foreground)]">
                {agent.name}
              </h2>
              <p className="text-xs text-[var(--foreground-muted)]">{layout.roleLabel}</p>
            </div>
            <button
              type="button"
              onClick={closePanel}
              className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
              aria-label="Close panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-4">
            <div
              className="mb-4 rounded-2xl p-3.5"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-400">
                <Cpu className="h-3.5 w-3.5" />
                Zone
              </div>
              <p className="mt-1 text-sm font-medium text-[var(--foreground)]">{zone?.name}</p>
              <p className="text-xs text-[var(--foreground-muted)]">{zone?.subtitle}</p>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2">
              {[
                { k: 'Performance', v: `${agent.performanceScore}` },
                { k: 'Shipped', v: `${agent.completedTasks}` },
              ].map((s) => (
                <div
                  key={s.k}
                  className="rounded-xl px-3 py-2.5"
                  style={{
                    background: 'rgba(99,102,241,0.08)',
                    border: '1px solid rgba(99,102,241,0.18)',
                  }}
                >
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">{s.k}</p>
                  <p className="text-base font-semibold text-indigo-100">{s.v}</p>
                </div>
              ))}
            </div>

            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              <ListChecks className="h-3.5 w-3.5" />
              Live task
            </div>
            {current ? (
              <div
                className="mb-4 rounded-2xl p-3.5"
                style={{
                  border: `1px solid ${AGENT_COLORS[agent.type]}33`,
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                <p className="text-sm font-medium text-[var(--foreground)]">{current.title}</p>
                <p className="mt-1 text-xs text-[var(--foreground-muted)]">{current.description}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] text-zinc-300">
                    {current.priority}
                  </span>
                  <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                    in progress
                  </span>
                </div>
              </div>
            ) : (
              <p className="mb-4 text-xs text-zinc-500">No active task assigned.</p>
            )}

            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              <FileOutput className="h-3.5 w-3.5" />
              Queue
            </div>
            <ul className="mb-5 space-y-1.5">
              {tasks
                .filter((t) => t.id !== current?.id)
                .slice(0, 4)
                .map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between rounded-xl bg-white/[0.02] px-3 py-2 text-xs text-zinc-400"
                  >
                    <span className="truncate pr-2 text-zinc-200">{t.title}</span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
                  </li>
                ))}
            </ul>

            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              <ShieldCheck className="h-3.5 w-3.5" />
              Onay kuyruğu
            </div>
            <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3 text-[11px] leading-relaxed text-zinc-500">
              Bu panel 3D ofis önizlemesi içindir. Gerçek onaylar <span className="text-zinc-400">Approvals</span> sayfasından takip edilir; burada örnek veri gösterilmez.
            </p>
          </div>

          <div className="border-t border-white/[0.06] p-3">
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl bg-indigo-500/90 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400"
              >
                Dispatch task
              </button>
              <button
                type="button"
                className="rounded-xl border border-white/[0.08] px-3 py-2.5 text-xs font-medium text-zinc-300 hover:bg-white/[0.05]"
              >
                Ping
              </button>
            </div>
          </div>
        </aside>
  );
}
