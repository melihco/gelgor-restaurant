'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bot, RefreshCw, Sparkles, Zap, ChevronRight } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useInteractionStore } from '@/stores/interaction-store';
import { useDashboardSnapshot } from '@/hooks/use-dashboard-snapshot';
import type { RecommendedTask } from '@/types';

const PRIORITY_CONFIG = {
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.25)',  label: 'Kritik' },
  high:     { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)', label: 'Yüksek' },
  medium:   { color: '#818cf8', bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.25)', label: 'Orta' },
  low:      { color: '#64748b', bg: 'rgba(100,116,139,0.1)',border: 'rgba(100,116,139,0.2)', label: 'Düşük' },
} as const;

const AGENT_LABELS: Record<string, string> = {
  review_agent:           'Review Agent',
  content_agent:          'Content Agent',
  content_strategy_agent: 'Strategy Agent',
  ads_agent:              'Ads Agent',
  analytics_agent:        'Analytics Agent',
};

function RecommendedTaskCard({
  task,
  onRun,
  running,
}: {
  task: RecommendedTask;
  onRun: () => void;
  running: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const p = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium;

  return (
    <div
      className="overflow-hidden rounded-2xl transition-all"
      style={{ background: 'rgba(13,14,22,0.9)', border: `1px solid ${p.border}` }}
    >
      <div className="flex items-start gap-3 p-4">
        {/* Priority indicator */}
        <div
          className="mt-0.5 flex h-2 w-2 shrink-0 rounded-full"
          style={{ background: p.color, boxShadow: `0 0 6px ${p.color}` }}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[13px] font-semibold text-white/90">{task.title}</p>
                <span
                  className="rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                  style={{ background: p.bg, color: p.color, border: `1px solid ${p.border}` }}
                >
                  {p.label}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">{AGENT_LABELS[task.agent_role] ?? task.agent_role}</p>
            </div>

            <button
              type="button"
              onClick={onRun}
              disabled={running}
              className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
              style={{ background: `linear-gradient(135deg, ${p.color}cc, ${p.color}88)` }}
            >
              {running
                ? <span className="h-3 w-3 animate-spin rounded-full border border-white/30 border-t-white" />
                : <Zap className="h-3 w-3" />}
              {running ? 'Çalışıyor…' : 'Çalıştır'}
            </button>
          </div>

          <p className="mt-2 text-[12px] text-slate-500 line-clamp-2">{task.reason}</p>

          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-700 transition hover:text-slate-400"
          >
            <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
            {expanded ? 'Özet gizle' : 'Detay + brief göster'}
          </button>

          {expanded && (
            <div className="mt-3 space-y-2">
              <div
                className="rounded-xl px-3 py-2.5"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-700">Agent Brief</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-400 whitespace-pre-wrap">{task.brief}</p>
              </div>
              {task.estimated_impact && (
                <p className="text-[11px] text-emerald-600">
                  <span className="font-semibold">Beklenen etki:</span> {task.estimated_impact}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function IntelligencePanel() {
  const workspaceId = useWorkspaceStore((s) => s.tenantId);
  const { data: snapshot } = useDashboardSnapshot();
  const { openAssignModal } = useInteractionStore();
  const queryClient = useQueryClient();
  const [runningTask, setRunningTask] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['intelligence-recommendations', workspaceId],
    queryFn: () => apiClient.getRecommendations(workspaceId),
    enabled: !!workspaceId,
    staleTime: 55 * 60 * 1000, // slightly under 1h cache
    retry: false,
  });

  const refreshMutation = useMutation({
    mutationFn: () => apiClient.refreshRecommendations(workspaceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['intelligence-recommendations', workspaceId] });
    },
  });

  const agents = snapshot?.agents ?? [];

  // Authoritative agent → valid task_types (mirrors engine.py AGENT_ROLES).
  // Last line of defence: if CEO agent produced a bad combo, we correct it here.
  const AGENT_TASK_MAP: Record<string, string> = {
    review_agent:           'review_analysis',
    content_agent:          'content_ideation',
    content_strategy_agent: 'content_strategy',
    ads_agent:              'campaign_analysis',
    analytics_agent:        'weekly_performance',
  };
  const AGENT_VALID_TASKS: Record<string, string[]> = {
    review_agent:           ['review_analysis', 'single_review_response'],
    content_agent:          ['content_ideation', 'content_calendar'],
    content_strategy_agent: ['content_strategy'],
    ads_agent:              ['campaign_analysis', 'ads_budget_optimization'],
    analytics_agent:        ['traffic_analysis', 'conversion_report', 'weekly_performance'],
  };

  async function runTask(task: RecommendedTask) {
    // Validate and correct the agent_role / task_type combo before sending
    const validTasks = AGENT_VALID_TASKS[task.agent_role] ?? [];
    const safeTaskType = validTasks.includes(task.task_type)
      ? task.task_type
      : (AGENT_TASK_MAP[task.agent_role] ?? 'content_ideation');

    const agent = agents.find((a) => {
      const role = a.backendAgentType?.toLowerCase() ?? '';
      return task.agent_role.split('_').every((w) => role.includes(w));
    }) ?? agents[0];

    if (!agent) return;

    setRunningTask(task.task_type);
    try {
      await apiClient.executeAgent(agent.apiId, {
        taskType: safeTaskType,
        inputData: { ...task.input_data, brief: task.input_data?.brief ?? task.brief },
      });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-snapshot'] });
    } catch {
      // non-blocking
    } finally {
      setRunningTask(null);
    }
  }

  if (!workspaceId) return null;

  const recommendations = data?.recommendations ?? [];
  const criticalCount = recommendations.filter((r) => r.priority === 'critical').length;
  const highCount = recommendations.filter((r) => r.priority === 'high').length;

  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{
        background: 'linear-gradient(135deg, rgba(79,70,229,0.06) 0%, rgba(13,14,22,0.9) 100%)',
        border: '1px solid rgba(99,102,241,0.2)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between gap-3 px-5 py-4"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)' }}
          >
            <Sparkles className="h-4 w-4 text-indigo-400" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-white/90">CEO Intelligence</p>
            <p className="text-[10px] text-slate-600">
              {isLoading
                ? 'Workspace analiz ediliyor…'
                : recommendations.length > 0
                  ? `${recommendations.length} görev önerisi · ${criticalCount > 0 ? `${criticalCount} kritik` : highCount > 0 ? `${highCount} yüksek öncelikli` : 'hazır'}`
                  : 'Analiz tamamlandı'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {data?.cached === false && (
            <span className="text-[10px] text-slate-700">
              {new Date(data.generated_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            type="button"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            title="Yeniden analiz et (cache temizle)"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition hover:text-slate-300 disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 py-4">
        {isLoading && (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="h-8 w-8 animate-spin rounded-xl border-2 border-indigo-500/20 border-t-indigo-500/60" />
            <div className="text-center">
              <p className="text-[13px] text-slate-500">CEO Intelligence Agent çalışıyor</p>
              <p className="mt-1 text-[11px] text-slate-700">Workspace analiz ediliyor, görevler hazırlanıyor…</p>
            </div>
          </div>
        )}

        {error && !isLoading && (
          <div
            className="flex items-start gap-3 rounded-xl px-4 py-3"
            style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)' }}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <div>
              <p className="text-[12px] font-semibold text-red-400">Öneri oluşturulamadı</p>
              <p className="text-[11px] text-red-600">Python servisi çalışmıyor olabilir. Kontrol edin ve yenileyin.</p>
            </div>
          </div>
        )}

        {!isLoading && !error && recommendations.length === 0 && (
          <div className="py-6 text-center">
            <Bot className="mx-auto mb-2 h-8 w-8 text-slate-800" />
            <p className="text-[12px] text-slate-700">Şu an öneri bulunmuyor</p>
          </div>
        )}

        {!isLoading && recommendations.length > 0 && (
          <div className="space-y-3">
            {recommendations.map((task, idx) => (
              <RecommendedTaskCard
                key={`${task.agent_role}-${task.task_type}-${idx}`}
                task={task}
                onRun={() => void runTask(task)}
                running={runningTask === task.task_type}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
