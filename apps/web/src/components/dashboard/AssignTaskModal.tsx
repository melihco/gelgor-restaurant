'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Play, Send, ShieldCheck, Sparkles, X, Zap } from 'lucide-react';
import { useInteractionStore } from '@/stores/interaction-store';
import { useActivityStore } from '@/stores/activity-store';
import { useDashboardSnapshot } from '@/hooks/use-dashboard-snapshot';
import { getRuntimeAgentProfile } from '@/lib/agent-runtime';
import { apiClient, toUserFriendlyApiError } from '@/lib/api-client';
import { MiniStat, StatusPill } from '@/tailadmin/components/application/PageElements';
import Button from '@/tailadmin/components/ui/button/Button';
import { Modal } from '@/tailadmin/components/ui/modal';

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export default function AssignTaskModal() {
  const {
    showAssignModal,
    assignTargetAgentId,
    assignPrefillNote,
    assignPreferredTemplateId,
    closeAssignModal,
    assignTask,
  } = useInteractionStore();
  const queryClient = useQueryClient();
  const addActivity = useActivityStore((state) => state.addActivity);
  const { data } = useDashboardSnapshot();

  const agent = assignTargetAgentId ? data?.agents.find((item) => item.id === assignTargetAgentId || item.apiId === assignTargetAgentId) : undefined;
  const profile = getRuntimeAgentProfile(agent?.backendAgentType ?? '');
  const [selectedId, setSelectedId] = useState<string>('');
  const [prompt, setPrompt] = useState('');
  const [executionMode, setExecutionMode] = useState<'dry-run' | 'live'>('dry-run');
  const [phase, setPhase] = useState<'pick' | 'running' | 'done' | 'error'>('pick');
  const [errorMessage, setErrorMessage] = useState<{ title: string; detail: string; hint?: string; status?: number } | null>(null);

  const selected = useMemo(
    () => profile.taskTemplates.find((template) => template.id === selectedId) ?? profile.taskTemplates[0] ?? null,
    [profile.taskTemplates, selectedId],
  );

  useEffect(() => {
    if (!showAssignModal) return;
    const preferred = profile.taskTemplates.find((template) => template.id === assignPreferredTemplateId);
    setSelectedId((preferred ?? profile.taskTemplates[0])?.id ?? '');
    setPrompt(assignPrefillNote);
    setExecutionMode('dry-run');
    setPhase('pick');
    setErrorMessage(null);
  }, [assignPrefillNote, assignPreferredTemplateId, profile.taskTemplates, showAssignModal]);

  const executeMutation = useMutation({
    mutationFn: async () => {
      if (!selected || !agent) throw new Error('Eksik agent veya görev seçimi');
      setPhase('running');
      return apiClient.executeAgent(agent.apiId, {
        taskType: selected.taskType,
        inputData: {
          ...selected.buildInput(prompt || undefined),
          executionMode,
        },
      });
    },
    onSuccess: async () => {
      if (!selected || !agent) return;
      assignTask(agent.id, selected, prompt || undefined);
      addActivity({
        id: `mission-${Date.now()}`,
        subject: agent.name,
        action: `${selected.label} mission launched`,
        timestamp: new Date().toISOString(),
        accentColor: '#22d3ee',
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard-snapshot'] }),
        queryClient.invalidateQueries({ queryKey: ['suggested-actions'] }),
        queryClient.invalidateQueries({ queryKey: ['ai-control-center'] }),
      ]);
      setPhase('done');
      setTimeout(closeAssignModal, 900);
    },
    onError: async (error) => {
      await queryClient.invalidateQueries({ queryKey: ['dashboard-snapshot'] });
      setErrorMessage(toUserFriendlyApiError(error, 'Mission başlatılamadı.'));
      setPhase('error');
    },
  });

  if (!showAssignModal || !agent) return null;

  return (
    <Modal
      isOpen={showAssignModal}
      onClose={() => {
        if (phase === 'pick') closeAssignModal();
      }}
      showCloseButton={false}
      className="max-w-5xl overflow-hidden border border-gray-200 shadow-theme-xl dark:border-gray-800"
    >
          <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-6 dark:border-gray-800">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-200 bg-brand-50 text-lg font-bold text-brand-600 dark:border-brand-500/20 dark:bg-brand-500/[0.12] dark:text-brand-300">
                {agent.name.slice(0, 1)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold tracking-[-0.02em] text-gray-800 dark:text-white/90">Mission ata</h2>
                  <StatusPill label={executionMode} tone={executionMode === 'live' ? 'emerald' : 'amber'} icon={ShieldCheck} />
                </div>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{agent.name} · {agent.roleLabel}</p>
              </div>
            </div>
            <button type="button" onClick={closeAssignModal} className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid max-h-[72vh] min-h-[560px] overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)_300px]">
            <div className="overflow-y-auto border-r border-gray-200 bg-gray-50/60 p-5 scrollbar-thin dark:border-gray-800 dark:bg-white/[0.02]">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Görev şablonları</p>
              <div className="space-y-2">
                {profile.taskTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedId(template.id)}
                    className={`w-full rounded-2xl border p-4 text-left shadow-theme-xs transition ${
                      selected?.id === template.id
                        ? 'border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/[0.12] dark:text-brand-300'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-brand-200 hover:bg-brand-25 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    <p className="text-sm font-semibold">{template.label}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-500 dark:text-gray-400">{template.description}</p>
                    <div className="mt-3 flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-500">
                      <span>{PRIORITY_LABELS[template.priority] ?? template.priority}</span>
                      <span>~{template.estimatedMin} min</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-y-auto bg-white p-6 scrollbar-thin dark:bg-gray-900">
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-brand-500" />
                  <p className="text-sm font-semibold text-gray-800 dark:text-white/90">Mission prompt</p>
                </div>
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Add business context, constraints, brand notes, target audience, campaign goal, or specific instructions..."
                  className="mt-4 min-h-52 w-full resize-none rounded-xl border border-gray-200 bg-transparent p-4 text-sm leading-6 text-gray-800 outline-hidden placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30"
                />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MiniStat label="Priority" value={selected ? PRIORITY_LABELS[selected.priority] ?? selected.priority : '-'} tone="amber" />
                <MiniStat label="Estimate" value={selected ? `${selected.estimatedMin}m` : '-'} tone="cyan" />
                <MiniStat label="Mode" value={executionMode} tone={executionMode === 'live' ? 'emerald' : 'amber'} />
              </div>

              {phase === 'error' && (
                <div className="mt-4 rounded-2xl border border-error-200 bg-error-50 p-4 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/[0.10] dark:text-error-300">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-error-500/10 text-xs font-bold">
                      !
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{errorMessage?.title ?? 'Mission başlatılamadı'}</p>
                        {errorMessage?.status && (
                          <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-bold dark:bg-white/10">
                            HTTP {errorMessage.status}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 leading-6">{errorMessage?.detail ?? 'Lütfen bilgileri kontrol edip tekrar deneyin.'}</p>
                      {errorMessage?.hint && (
                        <p className="mt-2 rounded-xl bg-white/60 px-3 py-2 text-xs leading-5 text-error-800 dark:bg-black/20 dark:text-error-200">
                          Öneri: {errorMessage.hint}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-l border-gray-200 bg-gray-50/60 p-5 dark:border-gray-800 dark:bg-white/[0.02]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Execution guardrails</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {(['dry-run', 'live'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setExecutionMode(mode)}
                    className={`rounded-xl border p-3 text-sm font-semibold transition ${
                      executionMode === mode
                        ? mode === 'live'
                          ? 'border-success-200 bg-success-50 text-success-700 dark:border-success-500/25 dark:bg-success-500/[0.10] dark:text-success-300'
                          : 'border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-500/25 dark:bg-warning-500/[0.10] dark:text-warning-300'
                        : 'border-gray-200 bg-white text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
                <Clock className="h-5 w-5 text-brand-500" />
                <p className="mt-3 text-sm font-semibold text-gray-800 dark:text-white/90">Run now or queue</p>
                <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">The mission creates a traceable task, agent run, artifact and approval handoff when needed.</p>
              </div>
              <Button
                onClick={() => executeMutation.mutate()}
                disabled={!selected || executeMutation.isPending || phase === 'running'}
                className="mt-4 w-full"
                startIcon={phase === 'done' ? <CheckCircle2 className="h-4 w-4" /> : phase === 'running' ? <Play className="h-4 w-4 animate-pulse" /> : <Send className="h-4 w-4" />}
              >
                {phase === 'done' ? 'Mission launched' : phase === 'running' ? 'Launching...' : 'Run now'}
              </Button>
              <Button
                variant="outline"
                onClick={() => executeMutation.mutate()}
                disabled={!selected || executeMutation.isPending || phase === 'running'}
                className="mt-2 w-full"
                startIcon={<Zap className="h-4 w-4" />}
              >
                Add to queue
              </Button>
            </div>
          </div>
    </Modal>
  );
}
