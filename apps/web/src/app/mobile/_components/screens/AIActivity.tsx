'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { IcoRetry } from '../Icons';
import { MobileStackHeader } from '../ui-primitives';
import { apiClient } from '@/lib/api-client';
import { parseAgentSummary, parseJobResult } from '../activity-parser';
import { ActivityDetailSheet } from '../ActivityDetailSheet';
import type { OperationsSummary } from '@/types';
import type { T } from '../theme-context';
import type { ParsedActivityContent } from '../activity-parser';
import { humanizeAgentError } from '@/lib/humanize-agent-error';

type Filter = 'all' | 'running' | 'completed' | 'failed';

// ─── Unified activity item ─────────────────────────────────────────────
interface ActivityItem {
  id: string;
  source: 'agent_run' | 'execution_job';
  title: string;
  detail: string;
  agent: string;
  agentType: string;
  agentColor: string;
  status: 'running' | 'completed' | 'failed';
  time: string;
  startedAt: string | null;
  completedAt: string | null;
  duration: string | null;
  durationMs: number | null;
  error: string | null;
  mode?: string | null;
  tokens?: number | null;
  retryCount?: number;
  model?: string | null;
  stage?: string | null;
  // Full raw data for detail sheet
  executionLog: Record<string, unknown> | null;
  rawSummary: string | null;
  parsed: ParsedActivityContent;
}

// ─── Helpers ──────────────────────────────────────────────────────────
const AGENT_COLOR: Record<string, string> = {
  blogwriter: '#9DBECE', instagramcontentgenerator: '#f472b6', socialmediadesigner: '#f472b6',
  googleadsanalyst: '#60a5fa', analyticsanalyst: '#34d399', customerreviewresponder: '#f59e0b',
  aiceo: '#a5b4fc', chatbotmanager: '#818cf8', writer: '#9DBECE', designer: '#f472b6',
  analyst: '#34d399', manager: '#a5b4fc', researcher: '#60a5fa', developer: '#818cf8',
  instagram: '#f472b6', googleads: '#60a5fa', googlebusiness: '#34d399', googleanalytics: '#f59e0b',
  default: '#9DBECE',
};
const agentColor = (t: string) => AGENT_COLOR[(t ?? '').toLowerCase()] ?? AGENT_COLOR['default']!;

function fmtDuration(ms: number | undefined | null): string | null {
  if (!ms || ms <= 0) return null;
  if (ms < 1000)  return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Az önce';
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

function normalizeStatus(s: string): 'running' | 'completed' | 'failed' {
  const low = (s ?? '').toLowerCase().replace(/[\s_-]/g, '');
  if (['running','inprogress','queued','started','pending'].includes(low)) return 'running';
  if (['failed','error','cancelled','canceled','timedout','timeout'].includes(low)) return 'failed';
  return 'completed';
}

function actionTypeLabel(t: string): string {
  return (t ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtTokens(n: number | undefined | null): string {
  if (!n || n <= 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function safeParseLog(raw: string | undefined | null): Record<string, unknown> | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; }
}

function mapSummaryToItems(summary: OperationsSummary): ActivityItem[] {
  const runs: ActivityItem[] = (summary.recentAgentRuns ?? []).map((run) => {
    const parsed = parseAgentSummary(run.agentType, run.summary);
    const executionLog = safeParseLog(run.executionLog);
    return {
      id: run.id,
      source: 'agent_run',
      title: run.taskTitle || `${run.agentName} çalışması`,
      detail: parsed.previewTitle ?? parsed.previewSub ?? run.stage ?? '',
      agent: run.agentName || run.agentType,
      agentType: run.agentType,
      agentColor: agentColor(run.agentType),
      status: normalizeStatus(run.status),
      time: timeAgo(run.startedAt),
      startedAt: run.startedAt ?? null,
      completedAt: run.completedAt ?? null,
      duration: fmtDuration(run.durationMs),
      durationMs: run.durationMs ?? null,
      error: run.errorMessage || null,
      tokens: run.tokensUsed || null,
      model: run.providerModel || null,
      stage: run.stage || null,
      executionLog,
      rawSummary: run.summary || null,
      parsed,
    };
  });

  const jobs: ActivityItem[] = (summary.recentExecutionJobs ?? []).map((job) => {
    const parsed = parseJobResult(job.resultData);
    return {
      id: job.id,
      source: 'execution_job',
      title: actionTypeLabel(job.actionType || 'Execution'),
      detail: parsed.previewTitle ?? parsed.previewSub ?? '',
      agent: job.provider || 'System',
      agentType: job.provider || '',
      agentColor: agentColor(job.provider),
      status: normalizeStatus(job.status),
      time: timeAgo(job.startedAt),
      startedAt: job.startedAt ?? null,
      completedAt: job.completedAt ?? null,
      duration: fmtDuration(job.durationMs),
      durationMs: job.durationMs ?? null,
      error: job.errorMessage || job.providerError || null,
      mode: job.mode,
      retryCount: job.retryCount,
      model: null,
      stage: null,
      executionLog: safeParseLog(job.auditLog),
      rawSummary: null,
      parsed,
    };
  });

  return [...runs, ...jobs].sort((a, b) => {
    if (a.status === 'running' && b.status !== 'running') return -1;
    if (b.status === 'running' && a.status !== 'running') return 1;
    return 0;
  });
}

// ─── Status config ─────────────────────────────────────────────────────
const SC: Record<string, { dot: string; label: string; dimKey: keyof T }> = {
  running:   { dot: '#34d399', label: 'Çalışıyor',  dimKey: 'successDim' },
  completed: { dot: '#60a5fa', label: 'Tamamlandı', dimKey: 'infoDim'    },
  failed:    { dot: '#fb7185', label: 'Hata',        dimKey: 'dangerDim'  },
};

// ─── Main component ────────────────────────────────────────────────────
export function AIActivity() {
  const { t } = useTheme();
  const { goBack } = useMobileStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [detailItem, setDetailItem] = useState<ActivityItem | null>(null);
  const queryClient = useQueryClient();

  const { data: summary, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['operations-summary'],
    queryFn: () => apiClient.getOperationsSummary(),
    refetchInterval: 12_000,
    staleTime: 8_000,
    refetchIntervalInBackground: false,
    retry: 2,
  });

  const reconcileMutation = useMutation({
    mutationFn: () => apiClient.reconcileStaleAgentRuns(10),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['operations-summary'] }),
  });

  const items: ActivityItem[] = summary ? mapSummaryToItems(summary) : [];
  const health = summary?.health;

  const filtered = filter === 'all' ? items : items.filter((a) => a.status === filter);
  const counts = {
    all:       items.length,
    running:   items.filter((a) => a.status === 'running').length,
    completed: items.filter((a) => a.status === 'completed').length,
    failed:    items.filter((a) => a.status === 'failed').length,
  };
  const lastUpdated = dataUpdatedAt ? timeAgo(new Date(dataUpdatedAt).toISOString()) : null;

  return (
    <>
      <div style={{ minHeight: '100dvh', background: t.bg, paddingBottom: 100, transition: 'background 300ms' }}>
        <MobileStackHeader
          t={t}
          title="AI Aktivite"
          onBack={goBack}
          right={counts.failed > 0 ? (
            <button
              type="button"
              onClick={() => reconcileMutation.mutate()}
              disabled={reconcileMutation.isPending}
              aria-label="Takılı görevleri temizle"
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                border: 'none',
                cursor: 'pointer',
                background: t.warningDim,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <IcoRetry size={16} color={t.warning} />
            </button>
          ) : undefined}
        />

        <div style={{ padding: '16px 24px 20px', borderBottom: `0.5px solid ${t.separator}` }}>
          <p style={{ fontSize: 13, color: t.textTertiary, margin: '0 0 12px' }}>
            {isLoading ? 'Yükleniyor...' : `${counts.running} aktif · ${counts.failed} başarısız`}
            {lastUpdated && !isLoading && <span style={{ color: t.textMuted }}> · {lastUpdated}</span>}
          </p>

          {/* Health metrics */}
          {health && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
              {[
                { label: 'Çalışma (24s)', value: String(health.agentRuns24h), color: t.accent },
                { label: 'Başarısız',     value: String(health.failedAgentRuns24h), color: health.failedAgentRuns24h > 0 ? t.danger : t.success },
                { label: 'Token (24s)',   value: fmtTokens(health.tokensUsed24h), color: t.info },
                { label: 'Ort. Süre',    value: fmtDuration(health.avgAgentRunDurationMs) ?? '—', color: t.textSecondary },
              ].map((m) => (
                <div key={m.label} style={{ ...t.surfaceCard, padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: m.color, lineHeight: 1, marginBottom: 3, fontVariantNumeric: 'tabular-nums' }}>{m.value}</div>
                  <div style={{ fontSize: 9, color: t.labelColor, fontWeight: 500, letterSpacing: '0.03em' }}>{m.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Filters */}
        <div style={{ padding: '14px 24px 0', display: 'flex', gap: 7 }}>
          {(['all', 'running', 'completed', 'failed'] as Filter[]).map((f) => {
            const isActive = filter === f;
            const COLORS: Record<Filter, string> = { all: t.accent, running: t.live, completed: t.info, failed: t.danger };
            const color = COLORS[f];
            const labels = { all: 'Tümü', running: 'Aktif', completed: 'Bitti', failed: 'Hata' };
            return (
              <button key={f} onClick={() => setFilter(f)} style={{
                padding: '7px 13px', borderRadius: 30, flexShrink: 0, cursor: 'pointer',
                fontSize: 12, fontWeight: isActive ? 600 : 400,
                ...(isActive ? t.pillActive(color) : t.pillIdle),
              }}>
                {labels[f]}
                <span style={{ marginLeft: 5, fontSize: 10, opacity: 0.65 }}>{counts[f]}</span>
              </button>
            );
          })}
        </div>

        {/* Activity list */}
        <div style={{ padding: '16px 24px 0' }}>
          {isLoading ? <LoadingSkeleton t={t} /> : filtered.length === 0 ? (
            <div style={{ ...t.surfaceCard, padding: '48px', textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: t.textMuted }}>{filter === 'all' ? 'Henüz aktivite yok' : `${filter} aktivite yok`}</div>
            </div>
          ) : (
            <div style={{ ...t.surfaceGroup }}>
              {filtered.map((item, i) => {
                const sc = SC[item.status] ?? SC['completed']!;
                const hasContent = item.parsed.kind !== 'empty';

                return (
                  <div
                    key={item.id}
                    onClick={() => setDetailItem(item)}
                    style={{
                      display: 'flex', gap: 12, padding: '16px 18px', width: '100%', textAlign: 'left',
                      background: 'transparent', cursor: 'pointer',
                      ...(i < filtered.length - 1 ? t.surfaceRow : {}),
                    }}
                  >
                    {/* Status dot */}
                    <div style={{ paddingTop: 4, flexShrink: 0 }}>
                      <span style={{
                        display: 'block', width: 8, height: 8, borderRadius: '50%', background: sc.dot,
                        boxShadow: item.status === 'running' ? `0 0 8px ${sc.dot}80` : 'none',
                        animation: item.status === 'running' ? 'liveGlow 2s infinite' : 'none',
                      }} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Title + status */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: t.textPrimary, lineHeight: 1.2 }}>{item.title}</span>
                          {item.mode && (
                            <span style={{ marginLeft: 7, fontSize: 9, padding: '2px 6px', borderRadius: 20, fontWeight: 700, background: item.mode.toLowerCase() === 'live' ? t.dangerDim : t.infoDim, color: item.mode.toLowerCase() === 'live' ? t.danger : t.info, textTransform: 'uppercase' as const }}>
                              {item.mode}
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, fontWeight: 600, flexShrink: 0, background: t[sc.dimKey] as string, color: sc.dot }}>
                          {sc.label}
                        </span>
                      </div>

                      {/* Parsed preview — replaces raw JSON */}
                      {hasContent && (item.parsed.previewTitle || item.parsed.previewSub) && (
                        <div style={{
                          padding: '8px 10px', borderRadius: 10, marginBottom: 6,
                          background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                          border: `0.5px solid ${t.separator}`,
                        }}>
                          {item.parsed.previewTitle && (
                            <div style={{ fontSize: 12, fontWeight: 600, color: t.textSecondary, marginBottom: item.parsed.previewSub ? 2 : 0 }}>
                              {item.parsed.previewTitle}
                            </div>
                          )}
                          {item.parsed.previewSub && (
                            <div style={{ fontSize: 11, color: t.textTertiary, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                              {item.parsed.previewSub}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Error */}
                      {item.error && (() => {
                        const h = humanizeAgentError(item.error);
                        return (
                          <div style={{ fontSize: 12, color: t.danger, padding: '8px 10px', borderRadius: 10, background: t.dangerDim, border: `0.5px solid ${t.danger}20`, marginBottom: 6, lineHeight: 1.4, position: 'relative' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                              <span style={{ fontWeight: 700 }}>{h?.title ?? 'Hata'}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(item.error ?? '').catch(() => {});
                                }}
                                aria-label="Hatayı kopyala"
                                style={{
                                  flexShrink: 0, fontSize: 10, fontWeight: 600, padding: '3px 8px',
                                  borderRadius: 6, border: `0.5px solid ${t.danger}30`,
                                  background: 'transparent', color: t.danger, cursor: 'pointer',
                                }}>
                                Kopyala
                              </button>
                            </div>
                            <div style={{ fontSize: 11, color: t.textSecondary }}>{h?.summary ?? item.error}</div>
                          </div>
                        );
                      })()}

                      {/* Footer */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: item.agentColor, display: 'inline-block' }} />
                          <span style={{ fontSize: 11, color: item.agentColor, fontWeight: 500 }}>{item.agent}</span>
                          {item.tokens && item.tokens > 0 && (
                            <><span style={{ fontSize: 10, color: t.textMuted }}>·</span><span style={{ fontSize: 11, color: t.textMuted }}>{fmtTokens(item.tokens)} token</span></>
                          )}
                          {item.retryCount && item.retryCount > 0 && (
                            <><span style={{ fontSize: 10, color: t.textMuted }}>·</span><span style={{ fontSize: 11, color: t.warning }}>{item.retryCount}× retry</span></>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          {item.duration && <span style={{ fontSize: 11, color: t.textMuted, fontVariantNumeric: 'tabular-nums' }}>{item.duration}</span>}
                          <span style={{ fontSize: 11, color: t.textMuted }}>{item.time}</span>
                          <span style={{ fontSize: 11, color: t.accent, fontWeight: 500 }}>Detay →</span>
                        </div>
                      </div>

                      {/* Reconcile for failed */}
                      {item.status === 'failed' && item.source === 'agent_run' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); reconcileMutation.mutate(); }}
                          disabled={reconcileMutation.isPending}
                          style={{ marginTop: 10, width: '100%', padding: '9px', borderRadius: 10, cursor: 'pointer', background: t.dangerDim, border: `0.5px solid ${t.danger}20`, color: t.danger, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        >
                          <IcoRetry size={12} color={t.danger} strokeWidth={2.2} />
                          {reconcileMutation.isPending ? 'Düzeltiliyor...' : 'Stuck\'ı Temizle'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Failures section */}
          {summary?.failures && summary.failures.length > 0 && (filter === 'all' || filter === 'failed') && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: t.danger, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>Son Hatalar</div>
              <div style={{ ...t.surfaceGroup }}>
                {summary.failures.slice(0, 5).map((f, i, arr) => (
                  <div key={f.id} style={{ padding: '14px 18px', ...(i < arr.length - 1 ? t.surfaceRow : {}) }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary }}>{f.title}</span>
                      <span style={{ fontSize: 11, color: t.textMuted }}>{timeAgo(f.occurredAt)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: t.danger, lineHeight: 1.4 }}>
                      {(() => {
                        const h = humanizeAgentError(f.detail);
                        return h ? <>{h.summary}</> : f.detail;
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detail bottom sheet — rendered outside scrollable container */}
      {detailItem && (
        <ActivityDetailSheet
          item={detailItem}
          content={detailItem.parsed}
          onClose={() => setDetailItem(null)}
        />
      )}
    </>
  );
}

function LoadingSkeleton({ t }: { t: T }) {
  return (
    <div style={{ ...t.surfaceGroup }}>
      {[1,2,3,4].map((i) => (
        <div key={i} style={{ padding: '16px 18px', ...(i < 4 ? t.surfaceRow : {}) }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', marginTop: 4, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 14, borderRadius: 4, background: t.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)', width: '65%', marginBottom: 8, animation: 'shimmer 1.4s ease-in-out infinite' }} />
              <div style={{ height: 36, borderRadius: 8, background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', marginBottom: 8, animation: 'shimmer 1.4s ease-in-out infinite' }} />
              <div style={{ height: 11, borderRadius: 4, background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', width: '40%', animation: 'shimmer 1.4s ease-in-out infinite' }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
