'use client';

import { useMemo } from 'react';
import { X, Activity, Clock, FileText, ListChecks, Sparkles, Zap } from 'lucide-react';
import { useOfficeStore } from '@/stores/office-store';
import { useInteractionStore } from '@/stores/interaction-store';
import { useDashboardSnapshot } from '@/hooks/use-dashboard-snapshot';
import { getRuntimeAgentProfile } from '@/lib/agent-runtime';
import { getCrewLineForAgentType } from '@/lib/dashboard-mappers';
import {
  ArtifactCard,
  GlassPanel,
  MiniStat,
  SectionHeader,
  StatusPill,
  Timeline,
} from '@/tailadmin/components/application/PageElements';

const CREW_LABELS = {
  review_agent: 'Reputation Crew',
  content_agent: 'Creative Crew',
  ads_agent: 'Growth Crew',
  analytics_agent: 'Intelligence Crew',
} as const;

function elapsedMinutes(startedAt?: string) {
  if (!startedAt) return 0;
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((Date.now() - start) / 60_000));
}

function progressForTask(task?: { status: string; startedAt?: string; estimatedDuration: number }) {
  if (!task) return { percent: 0, elapsed: 0, remaining: 0, label: 'No mission' };
  const estimated = Math.max(task.estimatedDuration || 6, 1);
  const elapsed = elapsedMinutes(task.startedAt);
  if (task.status === 'completed' || task.status === 'review') return { percent: 100, elapsed, remaining: 0, label: 'Handoff ready' };
  if (task.status === 'failed') return { percent: 100, elapsed, remaining: 0, label: 'Failed' };
  if (task.status === 'pending') return { percent: 8, elapsed: 0, remaining: estimated, label: 'Queued' };
  return {
    percent: Math.min(92, Math.max(18, Math.round((elapsed / estimated) * 100))),
    elapsed,
    remaining: Math.max(0, estimated - elapsed),
    label: elapsed > estimated ? 'Running long' : 'Working',
  };
}

export default function AgentDetailPanel() {
  const { selectedAgentId, isPanelOpen, panelType, closePanel } = useOfficeStore();
  const { openAssignModal, openArtifactCenter } = useInteractionStore();
  const { data } = useDashboardSnapshot();

  const agent = selectedAgentId ? data?.agents.find((item) => item.id === selectedAgentId) : undefined;
  const profile = agent ? getRuntimeAgentProfile(agent.backendAgentType) : null;
  const crew = agent ? CREW_LABELS[getCrewLineForAgentType(agent.backendAgentType)] : '';
  const tasks = agent ? (data?.tasks.filter((task) => task.assignedAgent === agent.id) ?? []) : [];
  const currentTask = agent
    ? tasks.find((task) => task.id === agent.currentTaskId) ??
      tasks.find((task) => task.status === 'in_progress' || task.status === 'review') ??
      tasks[0]
    : undefined;
  const outputs = useMemo(
    () => (data?.artifacts ?? []).filter((artifact) => tasks.some((task) => task.id === artifact.taskId)),
    [data?.artifacts, tasks],
  );
  const progress = progressForTask(currentTask);

  const visible = isPanelOpen && panelType === 'agent' && !!agent;
  if (!visible || !agent || !profile) return null;

  return (
    <aside className="relative z-50 flex h-full w-[480px] shrink-0 flex-col border-l border-gray-200 bg-white shadow-theme-xl dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-5 dark:border-gray-800">
        <div className="flex items-start gap-4">
          <div className="relative">
            {agent.state === 'working' && <div className="absolute -inset-2 animate-pulse rounded-2xl bg-brand-500/15 blur-xl" />}
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-200 bg-brand-50 text-lg font-bold text-brand-600 dark:border-brand-500/20 dark:bg-brand-500/[0.12] dark:text-brand-300">
              {agent.name.slice(0, 1)}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-gray-800 dark:text-white/90">{agent.name}</h2>
              <StatusPill label={agent.state} tone={agent.state === 'working' ? 'emerald' : agent.state === 'error' ? 'rose' : 'neutral'} pulse={agent.state === 'working'} />
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{agent.roleLabel} · {crew}</p>
            <p className="mt-2 max-w-sm text-xs leading-5 text-gray-500 dark:text-gray-400">{profile.specialty}</p>
          </div>
        </div>
        <button type="button" onClick={closePanel} className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50/60 p-5 scrollbar-thin dark:bg-white/[0.02]">
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Score" value={agent.performanceScore ?? 0} tone="cyan" />
          <MiniStat label="Queue" value={tasks.filter((task) => task.status === 'pending').length} tone="violet" />
          <MiniStat label="Outputs" value={outputs.length} tone="emerald" />
        </div>

        <GlassPanel tone="cyan" className="mt-5" padding="p-5">
          <SectionHeader title="Live work" subtitle="Watch the AI employee move a mission toward approval handoff." />
          {currentTask ? (
            <>
              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{currentTask.title}</p>
                    <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{currentTask.description}</p>
                  </div>
                  <StatusPill label={progress.label} tone={currentTask.status === 'failed' ? 'rose' : 'emerald'} pulse={currentTask.status === 'in_progress'} />
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-500 to-success-500 transition-all duration-700"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <MiniStat label="Progress" value={`${progress.percent}%`} tone="cyan" />
                  <MiniStat label="Elapsed" value={`${progress.elapsed}m`} tone="neutral" />
                  <MiniStat label="Remaining" value={`${progress.remaining}m`} tone="amber" />
                </div>
              </div>
              <div className="mt-4">
                <Timeline
                  items={[
                    { title: 'Mission received', description: 'Brand context, account data and user prompt are prepared.', tone: 'cyan' },
                    { title: 'Reasoning summary', description: 'The agent evaluates the task and produces business-safe output. Raw chain-of-thought is never exposed.', tone: 'violet' },
                    { title: 'Approval handoff', description: 'Actionable provider changes move to approval before live execution.', tone: 'emerald' },
                  ]}
                />
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
              <Clock className="mx-auto h-6 w-6 text-gray-400" />
              <p className="mt-3 text-sm font-semibold text-gray-800 dark:text-white/90">No active mission</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Assign work to watch this employee live.</p>
            </div>
          )}
        </GlassPanel>

        <GlassPanel tone="violet" className="mt-5" padding="p-5">
          <SectionHeader title="Queue" subtitle="Pending and recent missions." count={tasks.length} />
          <div className="space-y-2">
            {tasks.slice(0, 6).map((task) => (
              <div key={task.id} className="rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">{task.title}</p>
                    <p className="mt-1 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">{task.description}</p>
                  </div>
                  <StatusPill label={task.status} tone={task.status === 'in_progress' ? 'emerald' : task.status === 'failed' ? 'rose' : 'neutral'} />
                </div>
              </div>
            ))}
            {tasks.length === 0 && <p className="py-6 text-center text-xs text-gray-500 dark:text-gray-400">Queue empty.</p>}
          </div>
        </GlassPanel>

        <GlassPanel tone="indigo" className="mt-5" padding="p-5">
          <SectionHeader title="Outputs" subtitle="Artifacts this employee produced." count={outputs.length} />
          <div className="space-y-2">
            {outputs.slice(0, 5).map((artifact) => (
              <ArtifactCard
                key={artifact.id}
                title={artifact.title}
                type={artifact.type}
                status={artifact.status}
                summary={artifact.content}
                onOpen={() => openArtifactCenter(artifact.id)}
              />
            ))}
            {outputs.length === 0 && <p className="py-6 text-center text-xs text-gray-500 dark:text-gray-400">No outputs yet.</p>}
          </div>
        </GlassPanel>

        <GlassPanel tone="emerald" className="mt-5" padding="p-5">
          <SectionHeader title="Capabilities" subtitle="What this employee is designed to do." />
          <div className="grid gap-2">
            {profile.taskTemplates.slice(0, 6).map((template) => (
              <div key={template.id} className="rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-success-500" />
                  <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{template.label}</p>
                </div>
                <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{template.description}</p>
              </div>
            ))}
          </div>
        </GlassPanel>
      </div>

      <div className="border-t border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <button
          type="button"
          onClick={() => openAssignModal(agent.apiId)}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white shadow-theme-xs transition hover:bg-brand-600"
        >
          <Zap className="h-4 w-4" />
          Assign new mission
        </button>
      </div>
    </aside>
  );
}
