'use client';
/**
 * MISSION HUB — Autonomous campaign command centre.
 *
 * Three live sections:
 *   1. Onay Bekliyor    — proposed missions (approve / reject with one tap)
 *   2. Aktif Kampanyalar — approved + in_flight (progress bar, node dots, cancel)
 *   3. Tamamlananlar   — last 5 completed missions
 *
 * "Yeni Misyon Öner" button calls POST /missions/propose — triggers the
 * StrategistAgent (30–90s); shows a pulsing loading state with timeout message.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import type { T } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useAuthStore } from '../auth-store';
import { apiClient, type WorkspaceUsageSummary } from '@/lib/api-client';
import { TokenWalletCard } from '../TokenWalletCard';
import type { MissionSummary, MissionProgress, MissionNodeProgress } from '@/types';

const USD_TRY = 32;
const CATEGORY_LABELS: Record<string, string> = {
  auto_produce: 'İçerik fabrikası',
  mission_propose: 'Strateji',
  content_ideation: 'İçerik fikri',
  market_intelligence: 'Pazar zekası',
  gallery_match: 'Galeri eşleştirme',
  other: 'Diğer',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1)  return 'Az önce';
  if (m < 60) return `${m} dk`;
  if (m < 1440) return `${Math.floor(m / 60)} sa`;
  return `${Math.floor(m / 1440)} gün`;
}

const PRIORITY_COLOR: Record<string, string> = {
  critical: '#EF4444',
  high:     '#F59E0B',
  medium:   '#A78BFA',
  low:      '#60A5FA',
};

const TYPE_LABEL: Record<string, string> = {
  seasonal:    '🌤 Sezonsal',
  opportunity: '⚡ Fırsat',
  competitive: '🏆 Rekabet',
  recovery:    '↑ Toparlanma',
  manual:      '✎ Manuel',
};

const STATUS_DOT: Record<string, string> = {
  completed: '#10B981',
  running:   '#F59E0B',
  pending:   'rgba(160,160,180,0.3)',
  failed:    '#EF4444',
  skipped:   'rgba(120,120,140,0.3)',
};

// ── Progress ring WITH % number inside ───────────────────────────────────────

function ProgressRing({ pct, color, size = 52 }: { pct: number; color: string; size?: number }) {
  const r    = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * (Math.min(pct, 100) / 100);
  const cx   = size / 2;
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      {/* Track */}
      <circle cx={cx} cy={cx} r={r} fill="none"
        stroke="rgba(160,160,180,0.12)" strokeWidth={4} />
      {/* Progress arc — starts at 12 o'clock */}
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={4}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cx})`}
        style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      {/* % label in center */}
      <text x={cx} y={cx + 1} textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize={pct === 100 ? 11 : 12} fontWeight="800"
        fontFamily="-apple-system,SF Pro Display,system-ui,sans-serif">
        {pct === 100 ? '✓' : `${Math.round(pct)}%`}
      </text>
    </svg>
  );
}

// ── Node rows — isimli, durumlu görev listesi ────────────────────────────────

function friendlyError(raw: string): string {
  const msg = raw.replace(/^\[(Final|Attempt \d+)\]\s*/, '');
  if (msg.includes('insufficient_quota') || msg.includes('429'))
    return '⚡ OpenAI kotası doldu — platform.openai.com/billing';
  if (msg.includes('timed out') || msg.includes('TimeoutError'))
    return '⏱ Zaman aşımı — daha sonra tekrar dene';
  if (msg.includes('API_KEY') || msg.includes('api_key'))
    return '🔑 API anahtarı eksik';
  return msg.slice(0, 100) || 'Bilinmeyen hata';
}

const NODE_STATUS_UI: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  pending:   { icon: '○', color: '#8080A0', bg: 'rgba(128,128,160,0.10)', label: 'Bekliyor' },
  running:   { icon: '◉', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  label: 'Çalışıyor' },
  completed: { icon: '✓', color: '#10B981', bg: 'rgba(16,185,129,0.10)', label: 'Tamamlandı' },
  failed:    { icon: '✕', color: '#EF4444', bg: 'rgba(239,68,68,0.10)',  label: 'Başarısız' },
  skipped:   { icon: '—', color: '#707090', bg: 'rgba(112,112,144,0.08)', label: 'Atlandı' },
};

function NodeRows({ nodes }: { nodes: MissionProgress['nodes'] }) {
  const { t } = useTheme();
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const sorted = [...nodes].sort((a, b) => a.phase_index - b.phase_index || a.node_key.localeCompare(b.node_key));

  function toggleError(key: string) {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 0 }}>
      {sorted.map((n, i) => {
        const ui = (NODE_STATUS_UI[n.status] ?? NODE_STATUS_UI['pending'])!;
        const isRunning = n.status === 'running';
        const isFailed  = n.status === 'failed';
        const isLast    = i === sorted.length - 1;

        return (
          <div key={n.node_key} style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            paddingBottom: isLast ? 0 : 10,
            position: 'relative',
          }}>
            {/* Connector line */}
            {!isLast && (
              <div style={{
                position: 'absolute', left: 9, top: 20, bottom: 0, width: 1,
                background: 'rgba(160,160,180,0.15)',
              }} />
            )}

            {/* Status icon — uses explicit bg instead of hex-concat */}
            <div style={{
              width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
              background: ui.bg,
              border: `1.5px solid ${ui.color}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, color: ui.color, fontWeight: 800, zIndex: 1,
              animation: isRunning ? 'breathe 1.4s ease-in-out infinite' : 'none',
              boxShadow: isRunning ? `0 0 8px ${ui.color}` : 'none',
            }}>
              {ui.icon}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: isRunning ? 700 : 600,
                  color: isRunning ? t.textPrimary : isFailed ? '#EF4444' : t.textSecondary,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  flex: 1 }}>
                  {n.title}
                </span>
                <span style={{ fontSize: 10, color: ui.color, fontWeight: 600, flexShrink: 0 }}>
                  {ui.label}
                </span>
              </div>

              {/* Running indicator */}
              {isRunning && (
                <div style={{ marginTop: 4, height: 2, borderRadius: 1,
                  background: 'rgba(245,158,11,0.12)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: '40%', borderRadius: 1,
                    background: '#F59E0B',
                    animation: 'shimmer 1.8s ease-in-out infinite',
                  }} />
                </div>
              )}

              {/* Error message — expandable, with copy + full text */}
              {isFailed && n.error_message && (() => {
                const isOpen = expandedErrors.has(n.node_key);
                const raw = n.error_message;
                const short = friendlyError(raw);
                const hasMore = raw.length > 100 || short !== raw;
                return (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontSize: 11, color: 'rgba(239,100,100,0.85)', lineHeight: 1.4 }}>
                      {short}
                    </div>
                    {hasMore && (
                      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                        <button onClick={() => toggleError(n.node_key)}
                          aria-expanded={isOpen}
                          style={{ fontSize: 10, padding: 0, background: 'none',
                            border: 'none', color: '#EF4444', fontWeight: 600, cursor: 'pointer' }}>
                          {isOpen ? 'Daralt' : 'Tüm hatayı gör'}
                        </button>
                        <button onClick={() => navigator.clipboard.writeText(raw).catch(() => {})}
                          aria-label="Hatayı kopyala"
                          style={{ fontSize: 10, padding: 0, background: 'none',
                            border: 'none', color: 'rgba(239,100,100,0.75)', fontWeight: 600, cursor: 'pointer' }}>
                          Kopyala
                        </button>
                      </div>
                    )}
                    {isOpen && (
                      <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 8,
                        background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.18)',
                        fontSize: 11, color: t.textSecondary, lineHeight: 1.5,
                        wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                        {raw}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── InFlightCard — polls /progress every 5s ───────────────────────────────────

function InFlightCard({ mission, workspaceId, onCancel, onRestart, onTapCompleted }: {
  mission: MissionSummary;
  workspaceId: string;
  onCancel: (id: string) => void;
  onRestart: (id: string) => void;
  onTapCompleted?: () => void;
}) {
  const { t } = useTheme();
  const pColor = PRIORITY_COLOR[mission.priority] ?? t.accent;

  // Poll every 15s — balances responsiveness with battery & backend load
  const { data: prog } = useQuery({
    queryKey: ['mission-progress', mission.id],
    queryFn: () => apiClient.getMissionProgress(workspaceId, mission.id),
    refetchInterval: 15_000,
    staleTime: 10_000,
    refetchIntervalInBackground: false,
  });

  const pct      = prog?.completion_pct ?? mission.completion_pct;
  const nodes    = prog?.nodes ?? [];
  const running  = nodes.filter(n => n.status === 'running').length;
  const failed   = nodes.filter(n => n.status === 'failed').length;
  const done     = prog?.completed_nodes ?? mission.completed_nodes;
  const total    = prog?.total_nodes ?? mission.total_nodes;
  const hasError = failed > 0 && running === 0;
  const isWaiting = mission.status === 'approved' && running === 0 && done === 0 && !hasError;

  const ringColor = hasError ? '#EF4444' : pColor;
  const statusLabel = hasError
    ? '✕ Hata'
    : mission.status === 'in_flight' && running > 0
      ? `▶ ${running} görev çalışıyor`
      : mission.status === 'in_flight'
        ? '◎ İşleniyor'
        : '✓ Onaylandı';

  return (
    <div style={{
      borderRadius: 18, overflow: 'hidden',
      background: t.isDark ? 'rgba(255,255,255,0.04)' : '#fff',
      border: `0.5px solid ${hasError ? 'rgba(239,68,68,0.3)' : t.separator}`,
      boxShadow: t.isDark ? 'none' : '0 2px 12px rgba(0,0,0,0.06)',
    }}>
      <div style={{ height: 3, background: `linear-gradient(90deg, ${ringColor}cc, ${ringColor}22)` }} />
      <div style={{ padding: '16px 16px 14px' }}>

        {/* ── Top row: ring + title + cancel ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
          <ProgressRing pct={pct} color={ringColor} size={52} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: 9, padding: '2px 8px', borderRadius: 20, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.04em',
                background: hasError ? 'rgba(239,68,68,0.1)' : isWaiting ? 'rgba(160,160,180,0.1)' : `${pColor}14`,
                color: hasError ? '#EF4444' : isWaiting ? t.textMuted : pColor,
              }}>
                {statusLabel}
              </span>
              <span style={{ fontSize: 9, color: t.textMuted }}>
                {TYPE_LABEL[mission.type] ?? mission.type}
              </span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary,
              letterSpacing: '-0.01em', lineHeight: 1.2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {mission.title}
            </div>
            <div style={{ fontSize: 12, color: t.textTertiary, marginTop: 3 }}>
              {done}/{total} görev tamamlandı
              {mission.timeline_days ? ` · ${mission.timeline_days} gün` : ''}
            </div>
          </div>

          {mission.status !== 'completed' && (
            <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
              {(hasError || pct === 0) && (
                <button onClick={() => onRestart(mission.id)} style={{
                  padding: '6px 11px', borderRadius: 30, cursor: 'pointer',
                  background: 'rgba(99,102,241,0.08)', border: '0.5px solid rgba(99,102,241,0.22)',
                  color: '#818cf8', fontSize: 11, fontWeight: 600,
                }}>↺ Yeniden</button>
              )}
              <button onClick={() => onCancel(mission.id)} style={{
                padding: '6px 11px', borderRadius: 30, cursor: 'pointer',
                background: 'rgba(239,68,68,0.07)', border: '0.5px solid rgba(239,68,68,0.18)',
                color: t.danger, fontSize: 11, fontWeight: 600,
              }}>İptal</button>
            </div>
          )}
        </div>

        {/* ── Waiting for executor ── */}
        {isWaiting && (
          <div style={{ padding: '8px 10px', borderRadius: 10, marginBottom: 10,
            background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
            border: `0.5px solid ${t.separator}`,
            fontSize: 11, color: t.textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%',
              border: `1.5px solid ${t.separator}`, borderTop: `1.5px solid ${pColor}`,
              animation: 'spinSlow 1s linear infinite', flexShrink: 0 }} />
            Executor başlatılıyor... 5 dakika içinde görevler otomatik atanacak
          </div>
        )}

        {/* ── Node rows with names + status ── */}
        {nodes.length > 0 ? (
          <NodeRows nodes={nodes} />
        ) : (
          /* No progress data yet — show placeholder rows from mission summary */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {Array.from({ length: total || 2 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%',
                  background: 'rgba(160,160,180,0.08)', border: '1.5px solid rgba(160,160,180,0.2)',
                  flexShrink: 0 }} />
                <div style={{ flex: 1, height: 10, borderRadius: 5,
                  background: 'rgba(160,160,180,0.08)' }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── ProposedCard ──────────────────────────────────────────────────────────────

function ProposedCard({ mission, workspaceId, onApprove, onReject, isPending }: {
  mission: MissionSummary;
  workspaceId: string;
  onApprove: (id: string) => void;
  onReject:  (id: string) => void;
  isPending: boolean;
}) {
  const { t } = useTheme();
  const pColor = PRIORITY_COLOR[mission.priority] ?? t.accent;

  return (
    <div style={{
      borderRadius: 18, overflow: 'hidden',
      background: t.isDark ? 'rgba(255,255,255,0.04)' : '#fff',
      border: `0.5px solid ${t.isDark ? 'rgba(245,158,11,0.2)' : 'rgba(245,158,11,0.3)'}`,
      boxShadow: t.isDark ? 'none' : '0 2px 12px rgba(0,0,0,0.06)',
    }}>
      <div style={{ height: 3, background: `linear-gradient(90deg, ${pColor}cc, ${pColor}22)` }} />
      <div style={{ padding: '14px 16px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10,
            background: `${pColor}12`, border: `0.5px solid ${pColor}28`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, flexShrink: 0 }}>
            {mission.type === 'seasonal' ? '🌤' : mission.type === 'opportunity' ? '⚡' :
             mission.type === 'competitive' ? '🏆' : mission.type === 'recovery' ? '↑' : '✎'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 20,
                background: `${pColor}14`, color: pColor, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {mission.priority}
              </span>
              <span style={{ fontSize: 9, color: t.textMuted, fontWeight: 500 }}>
                {TYPE_LABEL[mission.type] ?? mission.type}
              </span>
              {mission.confidence > 0 && (
                <span style={{ fontSize: 9, color: t.live, fontWeight: 500 }}>
                  %{Math.round(mission.confidence * 100)} güven
                </span>
              )}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary,
              lineHeight: 1.25, letterSpacing: '-0.01em' }}>
              {mission.title}
            </div>
          </div>
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          {mission.timeline_days && (
            <span style={{ fontSize: 11, color: t.textTertiary }}>
              📅 {mission.timeline_days} gün
            </span>
          )}
          {mission.total_nodes > 0 && (
            <span style={{ fontSize: 11, color: t.textTertiary }}>
              ⚡ {mission.total_nodes} görev
            </span>
          )}
          {mission.assigned_agent_roles && mission.assigned_agent_roles.length > 0 && (
            <span style={{ fontSize: 11, color: t.textTertiary }}>
              🤖 {mission.assigned_agent_roles.length} ajan
            </span>
          )}
          <span style={{ fontSize: 11, color: t.textMuted, marginLeft: 'auto' }}>
            {timeAgo(mission.created_at)}
          </span>
        </div>

        {mission.objective && (
          <div style={{ fontSize: 12, color: t.textTertiary, lineHeight: 1.5, marginBottom: 10,
            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical' as const }}>
            {mission.objective}
          </div>
        )}

        {/* Approve / Reject buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => onApprove(mission.id)}
            disabled={isPending}
            style={{
              flex: 1, padding: '12px', borderRadius: 14, cursor: isPending ? 'default' : 'pointer',
              background: isPending ? t.accentDim : `linear-gradient(135deg, ${pColor}cc, ${pColor}99)`,
              border: 'none', color: '#fff', fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              boxShadow: isPending ? 'none' : `0 3px 14px ${pColor}40`,
              opacity: isPending ? 0.7 : 1,
            }}>
            {isPending ? (
              <><div style={{ width: 12, height: 12, borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.3)',
                borderTop: '2px solid #fff', animation: 'spinSlow 0.8s linear infinite' }} />
              Başlatılıyor...</>
            ) : '✓ Onayla'}
          </button>
          <button
            onClick={() => onReject(mission.id)}
            disabled={isPending}
            style={{
              flex: 1, padding: '12px', borderRadius: 14, cursor: isPending ? 'default' : 'pointer',
              background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
              border: `0.5px solid ${t.separator}`,
              color: t.textTertiary, fontSize: 13, fontWeight: 500,
              opacity: isPending ? 0.5 : 1,
            }}>
            ✕ Reddet
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Node output renderer — uses existing MobileArtifactView pipeline ────────
// Import the same signalFromArtifact used everywhere else in the app.
import { signalFromArtifact } from '@/components/artifacts/artifact-preview';
import type { ArtifactSignal } from '@/components/artifacts/artifact-preview';

/**
 * Convert raw node output_summary string → fake OutputArtifact →
 * signalFromArtifact → proper ArtifactSignal for rendering.
 * Maps task_type to the artifact type string the parser expects.
 */
function nodeToSignal(node: MissionNodeProgress): ArtifactSignal | null {
  const raw = node.output_summary ?? '';
  if (!raw) return null;

  // Map task_type → artifactType string (mirrors what .NET stores in OutputArtifacts)
  const artifactTypeMap: Record<string, string> = {
    content_ideation:        'instagram_caption',
    content_calendar:        'instagram_caption',
    content_strategy:        'strategy_document',
    visual_design_cards:     'instagram_caption',
    ad_creative_generation:  'ad_copy',
    review_analysis:         'generic_document',
    single_review_response:  'review_response',
    traffic_analysis:        'strategy_document',
    weekly_performance:      'strategy_document',
  };

  const fakeArtifact = {
    id: node.node_key,
    agentRunId: node.node_key,
    type: 'text' as const,
    title: node.title,
    content: raw,
    mimeType: 'application/json',
    artifactType: artifactTypeMap[node.task_type] ?? 'generic_document',
    status: 'approved' as const,
    createdAt: node.completed_at ?? new Date().toISOString(),
    metadata: { agentName: node.agent_role },
  };

  try {
    return signalFromArtifact(fakeArtifact);
  } catch {
    return null;
  }
}

// Content strategy renders differently — structured summary card
function ContentStrategyView({ node, t }: { node: MissionNodeProgress; t: ReturnType<typeof useTheme>['t'] }) {
  const raw = node.output_summary ?? '';
  let obj: Record<string, unknown> = {};
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    obj = JSON.parse(cleaned);
  } catch { /* use empty */ }

  const theme   = String(obj.weekly_theme ?? obj.theme ?? '');
  const brief   = String(obj.mission_brief ?? obj.brief ?? '');
  const pillars = Array.isArray(obj.pillar_mix)
    ? (obj.pillar_mix as Record<string, unknown>[]).map(p => String(p.pillar ?? '')).filter(Boolean)
    : [];
  const formats = Array.isArray(obj.recommended_formats)
    ? (obj.recommended_formats as string[]).slice(0, 4)
    : [];
  const notes   = Array.isArray(obj.strategy_notes)
    ? (obj.strategy_notes as string[]).slice(0, 3)
    : [];

  if (!theme && !brief) {
    // Fallback: just show raw text nicely
    return (
      <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.7,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim().slice(0, 800)}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {theme && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.accent,
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
            Haftalık Tema
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: t.textPrimary, lineHeight: 1.3 }}>
            {theme}
          </div>
        </div>
      )}

      {brief && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.accent,
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
            İçerik Brief
          </div>
          <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.65 }}>
            {brief.slice(0, 400)}
          </div>
        </div>
      )}

      {pillars.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.accent,
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            İçerik Sütunları
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {pillars.map((p, i) => (
              <span key={i} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20,
                background: t.accentDim, color: t.accent, fontWeight: 600 }}>
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {formats.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.accent,
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Önerilen Formatlar
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {formats.map((f, i) => (
              <span key={i} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20,
                background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                color: t.textSecondary, fontWeight: 500 }}>
                {f.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}

      {notes.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.accent,
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
            Strateji Notları
          </div>
          {notes.map((n, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <span style={{ color: t.live, flexShrink: 0, fontSize: 12 }}>→</span>
              <span style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.5 }}>{n}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Content ideation / calendar — rendered as proper content cards
function ContentIdeasView({ signal, t }: { signal: ArtifactSignal; t: ReturnType<typeof useTheme>['t'] }) {
  const ideas = signal.ideas ?? [];
  if (!ideas.length && !signal.caption) {
    return (
      <div style={{ fontSize: 12, color: t.textMuted, fontStyle: 'italic' }}>
        İçerik fikri bulunamadı
      </div>
    );
  }

  const items = ideas.length > 0 ? ideas : [{
    headline: signal.headline ?? (signal as any).title ?? '',
    caption:  signal.caption ?? '',
    cta:      signal.cta ?? '',
    contentType: 'post',
  }];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.slice(0, 6).map((idea, i) => {
        const ia       = idea as any; // ArtifactIdea extended fields
        const headline = ia.headline ?? ia.conceptTitle ?? `Fikir ${i + 1}`;
        const caption  = ia.caption ?? ia.captionDraft ?? ia.caption_draft ?? '';
        const cta      = ia.cta ?? '';
        const fmt      = ia.contentType ?? ia.contentKind ?? ia.content_type ?? 'post';
        const isCalendar = 'day' in idea || ('theme' in ia && !ia.headline);

        if (isCalendar) {
          return (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 0',
              borderBottom: i < items.length - 1 ? `0.5px solid ${t.separator}` : 'none' }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: t.accentDim, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 12, fontWeight: 800, color: t.accent }}>
                {String(ia.day ?? i + 1)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary, marginBottom: 3 }}>
                  {String(ia.theme ?? headline)}
                </div>
                {ia.brief && (
                  <div style={{ fontSize: 12, color: t.textTertiary, lineHeight: 1.45 }}>
                    {String(ia.brief).slice(0, 100)}
                  </div>
                )}
              </div>
            </div>
          );
        }

        return (
          <div key={i} style={{ padding: '14px', borderRadius: 14,
            background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
            border: `0.5px solid ${t.separator}` }}>
            {/* Format badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 20,
                background: t.accentDim, color: t.accent, fontWeight: 700,
                textTransform: 'capitalize', letterSpacing: '0.04em' }}>
                {String(fmt).replace(/_/g, ' ').replace('instagram ', '')}
              </span>
              <span style={{ fontSize: 10, color: t.textMuted }}>#{i + 1}</span>
            </div>

            {/* Headline */}
            <div style={{ fontSize: 14, fontWeight: 800, color: t.textPrimary,
              lineHeight: 1.25, letterSpacing: '-0.01em', marginBottom: 8 }}>
              {String(headline).slice(0, 100)}
            </div>

            {/* Caption */}
            {caption && (
              <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.6,
                marginBottom: 8,
                overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 4,
                WebkitBoxOrient: 'vertical' as const }}>
                {String(caption)}
              </div>
            )}

            {/* CTA */}
            {cta && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 10px', borderRadius: 8,
                background: 'rgba(16,185,129,0.08)', width: 'fit-content' }}>
                <span style={{ fontSize: 9, color: '#10B981' }}>CTA</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#10B981' }}>
                  {String(cta).slice(0, 60)}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Ad creative view
function AdCreativeView({ signal, t }: { signal: ArtifactSignal; t: ReturnType<typeof useTheme>['t'] }) {
  const ideas = signal.ideas ?? [];
  const items = ideas.length > 0 ? ideas : [{ headline: signal.headline, caption: signal.caption, cta: signal.cta }];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.slice(0, 4).map((ad, i) => {
        const adObj = ad as Record<string, unknown>;
        const headlines = Array.isArray(adObj.headline_options)
          ? (adObj.headline_options as string[]).slice(0, 2)
          : [String(adObj.headline ?? ad.headline ?? '')].filter(Boolean);
        const body = String(adObj.body ?? adObj.description ?? ad.caption ?? '');
        const cta  = String(adObj.cta ?? adObj.call_to_action ?? ad.cta ?? '');
        const platform = String(adObj.platform ?? '');

        return (
          <div key={i} style={{ padding: '14px', borderRadius: 14,
            background: t.isDark ? 'rgba(245,158,11,0.06)' : 'rgba(245,158,11,0.04)',
            border: `0.5px solid rgba(245,158,11,0.2)` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 20,
                background: 'rgba(245,158,11,0.12)', color: '#F59E0B', fontWeight: 700 }}>
                Reklam {i + 1}{platform ? ` · ${platform}` : ''}
              </span>
            </div>
            {headlines.map((h, hi) => h ? (
              <div key={hi} style={{ fontSize: 14, fontWeight: 800, color: t.textPrimary,
                lineHeight: 1.25, marginBottom: 6 }}>
                {h.slice(0, 100)}
              </div>
            ) : null)}
            {body && (
              <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.6,
                marginBottom: 8,
                overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical' as const }}>
                {body}
              </div>
            )}
            {cta && (
              <div style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B' }}>→ {cta.slice(0, 60)}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── JSON parse helper ─────────────────────────────────────────────────────────
function tryParseJson(raw: string): Record<string, unknown> | null {
  try {
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(clean);
    return typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

// ── Analytics output renderer (traffic_analysis, conversion_report, weekly_performance) ──
function AnalyticsOutputView({ data, t }: { data: Record<string, unknown>; t: T }) {
  const summary   = data.executive_summary as string || data.summary as string || '';
  const metrics   = data.key_metrics as Record<string, { value: unknown; trend?: string; assessment?: string }> | null;
  const insights  = (data.key_insights ?? data.insights ?? data.recommendations) as string[] | null;
  const sources   = data.source_analysis as Record<string, unknown> | null;

  const trendIcon = (t: string | undefined) =>
    t === 'increasing' ? '↑' : t === 'decreasing' ? '↓' : '→';
  const trendColor = (t: string | undefined) =>
    t === 'increasing' ? '#10B981' : t === 'decreasing' ? '#EF4444' : '#F59E0B';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Executive summary */}
      {summary && (
        <p style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.7, margin: 0 }}>
          {summary.slice(0, 400)}
        </p>
      )}

      {/* KPI grid */}
      {metrics && Object.keys(metrics).length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {Object.entries(metrics).slice(0, 6).map(([key, m]) => (
            <div key={key} style={{
              padding: '10px 12px', borderRadius: 12,
              background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
              border: `0.5px solid ${t.separator}`,
            }}>
              <div style={{ fontSize: 9, color: t.textMuted, textTransform: 'uppercase',
                letterSpacing: '0.06em', marginBottom: 4 }}>
                {key.replace(/_/g, ' ')}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: t.textPrimary }}>
                  {typeof m?.value === 'number' ? m.value.toLocaleString() : String(m?.value ?? '—')}
                </span>
                {m?.trend && (
                  <span style={{ fontSize: 12, color: trendColor(m.trend), fontWeight: 700 }}>
                    {trendIcon(m.trend)}
                  </span>
                )}
              </div>
              {m?.assessment && (
                <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>{m.assessment}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Key insights / recommendations */}
      {Array.isArray(insights) && insights.length > 0 && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: t.accent, textTransform: 'uppercase',
            letterSpacing: '0.08em', marginBottom: 8, marginTop: 0 }}>
            Öneriler
          </p>
          {insights.slice(0, 5).map((ins, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <span style={{ color: t.accent, flexShrink: 0, fontSize: 13 }}>→</span>
              <span style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.55 }}>
                {typeof ins === 'string' ? ins : JSON.stringify(ins)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Source breakdown */}
      {sources && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase',
            letterSpacing: '0.08em', marginBottom: 8, marginTop: 0 }}>
            Kaynak Dağılımı
          </p>
          {Object.entries(sources).slice(0, 4).map(([src, val]) => {
            const v = val as Record<string, unknown>;
            const pct = v?.percentage ?? v?.share ?? '';
            return (
              <div key={src} style={{ display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: t.textSecondary, textTransform: 'capitalize' }}>
                  {src.replace(/_/g, ' ')}
                </span>
                {pct && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: t.accent }}>
                    {typeof pct === 'number' ? `${pct}%` : String(pct)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Review output renderer (review_analysis, single_review_response) ──────────
function ReviewOutputView({ data, t }: { data: Record<string, unknown>; t: T }) {
  const summary  = data.summary as string || data.analysis_summary as string || '';
  const responses = (data.responses ?? data.suggested_responses ?? data.review_responses) as Array<Record<string, unknown>> | null;
  const sentiment = data.overall_sentiment as string || data.sentiment as string || '';
  const highlights = (data.highlights ?? data.positives ?? data.strengths) as string[] | null;
  const concerns  = (data.concerns ?? data.issues ?? data.negatives) as string[] | null;

  const sentimentColor = sentiment?.toLowerCase().includes('positive') || sentiment?.toLowerCase().includes('olumlu')
    ? '#10B981' : sentiment?.toLowerCase().includes('negative') || sentiment?.toLowerCase().includes('olumsuz')
      ? '#EF4444' : '#F59E0B';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {sentiment && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px',
          borderRadius: 20, background: `${sentimentColor}14`,
          border: `0.5px solid ${sentimentColor}40`, alignSelf: 'flex-start' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: sentimentColor }}>{sentiment}</span>
        </div>
      )}
      {summary && (
        <p style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.7, margin: 0 }}>
          {summary.slice(0, 400)}
        </p>
      )}
      {Array.isArray(highlights) && highlights.length > 0 && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#10B981', textTransform: 'uppercase',
            letterSpacing: '0.08em', marginBottom: 6, marginTop: 0 }}>✓ Güçlü Yönler</p>
          {highlights.slice(0, 3).map((h, i) => (
            <div key={i} style={{ fontSize: 12, color: t.textSecondary, marginBottom: 4, paddingLeft: 12,
              borderLeft: '2px solid #10B98144' }}>{typeof h === 'string' ? h : JSON.stringify(h)}</div>
          ))}
        </div>
      )}
      {Array.isArray(concerns) && concerns.length > 0 && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#EF4444', textTransform: 'uppercase',
            letterSpacing: '0.08em', marginBottom: 6, marginTop: 0 }}>⚠ Dikkat Edilecekler</p>
          {concerns.slice(0, 3).map((c, i) => (
            <div key={i} style={{ fontSize: 12, color: t.textSecondary, marginBottom: 4, paddingLeft: 12,
              borderLeft: '2px solid #EF444444' }}>{typeof c === 'string' ? c : JSON.stringify(c)}</div>
          ))}
        </div>
      )}
      {Array.isArray(responses) && responses.length > 0 && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: t.accent, textTransform: 'uppercase',
            letterSpacing: '0.08em', marginBottom: 8, marginTop: 0 }}>💬 Önerilen Yanıtlar</p>
          {responses.slice(0, 3).map((r, i) => {
            const text = r.response ?? r.text ?? r.reply ?? r.suggested_response ?? '';
            const platform = r.platform ?? r.channel ?? '';
            return (
              <div key={i} style={{ padding: '10px 12px', borderRadius: 12, marginBottom: 8,
                background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                border: `0.5px solid ${t.separator}` }}>
                {platform && (
                  <div style={{ fontSize: 9, color: t.textMuted, textTransform: 'uppercase',
                    letterSpacing: '0.06em', marginBottom: 4 }}>{String(platform)}</div>
                )}
                <p style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.6, margin: 0 }}>
                  {String(text).slice(0, 300)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Campaign / Ads output renderer ────────────────────────────────────────────
function CampaignOutputView({ data, t }: { data: Record<string, unknown>; t: T }) {
  const summary    = data.summary as string || data.analysis as string || data.executive_summary as string || '';
  const campaigns  = (data.campaigns ?? data.campaign_recommendations) as Array<Record<string, unknown>> | null;
  const budget     = data.budget_recommendation != null ? String(data.budget_recommendation) : (data.recommended_budget != null ? String(data.recommended_budget) : null);
  const roas       = data.roas != null ? String(data.roas) : (data.current_roas != null ? String(data.current_roas) : null);
  const actions    = (data.recommended_actions ?? data.action_items ?? data.next_steps) as string[] | null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {summary && (
        <p style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.7, margin: 0 }}>
          {summary.slice(0, 400)}
        </p>
      )}
      {(budget || roas) && (
        <div style={{ display: 'flex', gap: 10 }}>
          {budget && (
            <div style={{ flex: 1, padding: '10px 12px', borderRadius: 12, textAlign: 'center',
              background: 'rgba(99,102,241,0.08)', border: '0.5px solid rgba(99,102,241,0.2)' }}>
              <div style={{ fontSize: 9, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bütçe Önerisi</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#818cf8', marginTop: 4 }}>{budget}</div>
            </div>
          )}
          {roas && (
            <div style={{ flex: 1, padding: '10px 12px', borderRadius: 12, textAlign: 'center',
              background: 'rgba(16,185,129,0.08)', border: '0.5px solid rgba(16,185,129,0.2)' }}>
              <div style={{ fontSize: 9, color: '#10B981', textTransform: 'uppercase', letterSpacing: '0.06em' }}>ROAS</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#10B981', marginTop: 4 }}>{roas}</div>
            </div>
          )}
        </div>
      )}
      {Array.isArray(campaigns) && campaigns.slice(0, 3).map((c, i) => (
        <div key={i} style={{ padding: '10px 12px', borderRadius: 12,
          background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          border: `0.5px solid ${t.separator}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: t.textPrimary, marginBottom: 4 }}>
            {String(c.name ?? c.campaign_name ?? `Kampanya ${i + 1}`)}
          </div>
          {(c.recommendation ?? c.action) != null && (
            <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.5 }}>
              {String(c.recommendation ?? c.action).slice(0, 150)}
            </div>
          )}
        </div>
      ))}
      {Array.isArray(actions) && actions.length > 0 && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: t.accent, textTransform: 'uppercase',
            letterSpacing: '0.08em', marginBottom: 8, marginTop: 0 }}>Aksiyon Adımları</p>
          {actions.slice(0, 5).map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <span style={{ color: t.accent, flexShrink: 0 }}>→</span>
              <span style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.55 }}>
                {typeof a === 'string' ? a : JSON.stringify(a)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NodeOutputView({ node }: { node: MissionNodeProgress; t?: unknown }) {
  const { t } = useTheme();

  if (!node.output_summary) {
    return (
      <div style={{ fontSize: 12, color: t.textMuted, fontStyle: 'italic', padding: '8px 0',
        textAlign: 'center' }}>
        Çıktı henüz kaydedilmedi — eski çalıştırma
      </div>
    );
  }

  // content_strategy — custom structured view
  if (node.task_type === 'content_strategy') {
    return <ContentStrategyView node={node} t={t} />;
  }

  // Analytics tasks — KPI cards + insights
  if (['traffic_analysis', 'conversion_report', 'weekly_performance'].includes(node.task_type)) {
    const data = tryParseJson(node.output_summary ?? '');
    if (data) return <AnalyticsOutputView data={data} t={t} />;
  }

  // Review tasks
  if (['review_analysis', 'single_review_response'].includes(node.task_type)) {
    const data = tryParseJson(node.output_summary ?? '');
    if (data) return <ReviewOutputView data={data} t={t} />;
  }

  // Campaign / ads analysis
  if (['campaign_analysis', 'ads_budget_optimization', 'auto_budget_optimize'].includes(node.task_type)) {
    const data = tryParseJson(node.output_summary ?? '');
    if (data) return <CampaignOutputView data={data} t={t} />;
  }

  // For all other tasks: convert to ArtifactSignal and render
  const signal = nodeToSignal(node);

  // Ad creative
  if (node.task_type === 'ad_creative_generation') {
    if (signal) return <AdCreativeView signal={signal} t={t} />;
  }

  // Content ideation / calendar / visual design
  if (['content_ideation', 'content_calendar', 'visual_design_cards'].includes(node.task_type)) {
    if (signal) return <ContentIdeasView signal={signal} t={t} />;
  }

  // Generic signal — summary + recommendations
  if (signal) {
    const recs = signal.recommendations ?? [];
    const sum  = signal.summary ?? '';
    if (sum || recs.length > 0) {
      return (
        <div>
          {sum && (
            <div style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.7, marginBottom: 10 }}>
              {sum.slice(0, 600)}
            </div>
          )}
          {recs.slice(0, 5).map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 7 }}>
              <span style={{ color: t.accent, flexShrink: 0 }}>→</span>
              <span style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.5 }}>{r}</span>
            </div>
          ))}
        </div>
      );
    }
  }

  // Try JSON parse for any remaining task types
  const anyData = tryParseJson(node.output_summary ?? '');
  if (anyData) {
    const sum = anyData.summary as string || anyData.executive_summary as string ||
                anyData.analysis as string || anyData.brief as string || '';
    const recs = (anyData.recommendations ?? anyData.key_insights ?? anyData.actions) as string[] | null;
    if (sum || (Array.isArray(recs) && recs.length > 0)) {
      return (
        <div>
          {sum && <p style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.7, margin: '0 0 10px' }}>{sum.slice(0, 500)}</p>}
          {Array.isArray(recs) && recs.slice(0, 5).map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <span style={{ color: t.accent, flexShrink: 0 }}>→</span>
              <span style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.55 }}>
                {typeof r === 'string' ? r : JSON.stringify(r)}
              </span>
            </div>
          ))}
        </div>
      );
    }
  }

  // Final fallback — clean raw text
  return (
    <div style={{ fontSize: 12, color: t.textSecondary, lineHeight: 1.6,
      whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {(node.output_summary ?? '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim().slice(0, 1000)}
    </div>
  );
}

// ── Mission Detail Sheet ──────────────────────────────────────────────────────

function MissionDetailSheet({ mission, workspaceId, onClose }: {
  mission: MissionSummary;
  workspaceId: string;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const { openMissionFactory, navigate } = useMobileStore();
  const [expandedNode, setExpandedNode] = useState<string | null>(null);

  const { data: prog, isLoading } = useQuery({
    queryKey: ['mission-progress', mission.id],
    queryFn: () => apiClient.getMissionProgress(workspaceId, mission.id),
    staleTime: 30_000,
  });

  const completedNodes = (prog?.nodes ?? []).filter(n => n.status === 'completed');
  const rate = mission.total_nodes > 0
    ? Math.round((mission.completed_nodes / mission.total_nodes) * 100)
    : 0;

  if (typeof window === 'undefined') return null;

  const sheet = (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, zIndex: 600,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
        animation: 'fadeIn 180ms ease both',
      }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 601,
        maxHeight: '92dvh', display: 'flex', flexDirection: 'column',
        background: t.isDark ? '#0D0D1A' : '#f2f2f7',
        borderRadius: '26px 26px 0 0',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        animation: 'slideUp 280ms cubic-bezier(0.4,0,0.2,1) both',
        boxShadow: '0 -12px 60px rgba(0,0,0,0.45)',
        border: t.isDark ? '0.5px solid rgba(255,255,255,0.06)' : 'none',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, marginBottom: 4, flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: t.isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '4px 22px 14px', borderBottom: `0.5px solid ${t.separator}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 20,
              background: rate >= 80 ? 'rgba(16,185,129,0.10)' : 'rgba(245,158,11,0.10)',
              color: rate >= 80 ? '#10B981' : '#F59E0B', fontWeight: 700 }}>
              %{rate} · {TYPE_LABEL[mission.type] ?? mission.type}
            </span>
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: t.textPrimary, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            {mission.title}
          </div>
          {mission.objective && (
            <div style={{ fontSize: 12, color: t.textTertiary, marginTop: 5, lineHeight: 1.5 }}>
              {mission.objective}
            </div>
          )}
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 4 }}>
            {mission.completed_nodes}/{mission.total_nodes} görev · {timeAgo(mission.completed_at)}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>
          {isLoading && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%',
                border: `3px solid ${t.separator}`, borderTop: `3px solid ${t.accent}`,
                animation: 'spinSlow 1s linear infinite', margin: '0 auto 10px' }} />
              <div style={{ fontSize: 13, color: t.textMuted }}>Çıktılar yükleniyor...</div>
            </div>
          )}

          {completedNodes.length === 0 && !isLoading && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: t.textMuted, fontSize: 13 }}>
              Tamamlanmış görev çıktısı bulunamadı
            </div>
          )}

          {completedNodes.map(node => {
            const isOpen = expandedNode === node.node_key;
            const hasOutput = Boolean(node.output_summary);

            return (
              <div key={node.node_key} style={{ marginBottom: 12 }}>
                {/* Node header — tappable to expand */}
                <button
                  onClick={() => hasOutput ? setExpandedNode(isOpen ? null : node.node_key) : undefined}
                  style={{
                    width: '100%', textAlign: 'left', padding: '12px 14px',
                    borderRadius: isOpen ? '14px 14px 0 0' : 14,
                    background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                    border: `0.5px solid ${isOpen ? t.accent + '40' : t.separator}`,
                    cursor: hasOutput ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                      background: 'rgba(16,185,129,0.10)', border: '1.5px solid #10B981',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, color: '#10B981', fontWeight: 800 }}>✓</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary }}>{node.title}</div>
                      <div style={{ fontSize: 10, color: t.textMuted }}>{node.task_type}</div>
                    </div>
                  </div>
                  {hasOutput && (
                    <span style={{ fontSize: 14, color: t.accent, transition: 'transform 0.2s',
                      transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}>
                      ▾
                    </span>
                  )}
                  {!hasOutput && (
                    <span style={{ fontSize: 10, color: t.textMuted, flexShrink: 0 }}>Çıktı yok</span>
                  )}
                </button>

                {/* Expanded output */}
                {isOpen && (
                  <div style={{
                    padding: '14px', border: `0.5px solid ${t.accent + '40'}`,
                    borderTop: 'none', borderRadius: '0 0 14px 14px',
                    background: t.isDark ? 'rgba(255,255,255,0.03)' : '#fff',
                  }}>
                    <NodeOutputView node={node} t={t} />

                    {/* Content action buttons for content_ideation / content_calendar */}
                    {['content_ideation','content_calendar','visual_design_cards'].includes(node.task_type)
                      && node.output_summary && (
                      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                          borderRadius: 10, background: 'rgba(139,92,246,0.08)',
                          border: '0.5px solid rgba(139,92,246,0.2)',
                        }}>
                          <span style={{ fontSize: 11, color: '#8B5CF6', fontWeight: 600, flex: 1 }}>
                            Bu fikirler otomatik olarak Feed'e eklendi
                          </span>
                          <button
                            onClick={() => { onClose(); navigate('feed'); }}
                            style={{
                              padding: '5px 10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                              background: 'rgba(139,92,246,0.15)', color: '#8B5CF6',
                              fontSize: 11, fontWeight: 700,
                            }}
                          >
                            Feed'de Gör
                          </button>
                        </div>
                        <button
                          onClick={() => { onClose(); openMissionFactory(mission.id, node.node_key); }}
                          style={{
                            width: '100%', padding: '13px', borderRadius: 14,
                            cursor: 'pointer', border: `0.5px solid ${t.separator}`,
                            background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                            color: t.textSecondary, fontSize: 12, fontWeight: 600,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          }}>
                          Icerik Fabrikasi'nda Detaylandir
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );

  return createPortal(sheet, document.body);
}

// ── CompletedRow ──────────────────────────────────────────────────────────────

function CompletedRow({ mission, onTap }: { mission: MissionSummary; onTap: () => void }) {
  const { t } = useTheme();
  const rate = mission.total_nodes > 0
    ? Math.round((mission.completed_nodes / mission.total_nodes) * 100)
    : 0;
  return (
    <button onClick={onTap} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
      borderBottom: `0.5px solid ${t.separator}`, cursor: 'pointer',
      background: 'none', border: 'none', textAlign: 'left',
    }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        background: rate >= 80 ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.10)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, color: rate >= 80 ? t.live : t.warning }}>
        {rate >= 80 ? '✓' : '~'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: t.textSecondary,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {mission.title}
        </div>
        <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>
          {TYPE_LABEL[mission.type] ?? mission.type} · %{rate} · {mission.completed_nodes}/{mission.total_nodes} görev
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: t.textMuted }}>{timeAgo(mission.completed_at)}</span>
        <span style={{ fontSize: 12, color: t.accent }}>›</span>
      </div>
    </button>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

function UsageCostCard({ data }: { data: WorkspaceUsageSummary }) {
  const { t } = useTheme();
  if (!data) return null;

  if (data.token_wallet?.enabled) {
    return (
      <div style={{ margin: '12px 22px 0' }}>
        <TokenWalletCard wallet={data.token_wallet} t={t} />
      </div>
    );
  }

  const spent = data.spent_today_usd;
  const cap = data.daily_budget_usd;
  const pct = cap > 0 ? Math.min(100, (spent / cap) * 100) : 0;
  const atCap = data.remaining_today_usd <= 0.001;
  const topCategories = Object.entries(data.category_totals || {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <div style={{
      margin: '12px 22px 0',
      padding: '14px 16px',
      borderRadius: 16,
      background: t.isDark ? 'rgba(255,255,255,0.04)' : '#fff',
      border: `0.5px solid ${atCap ? 'rgba(239,68,68,0.35)' : t.separator}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.labelColor, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            API maliyeti
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: t.textPrimary, marginTop: 4, letterSpacing: '-0.02em' }}>
            ${data.week_cost_usd.toFixed(2)}
            <span style={{ fontSize: 12, fontWeight: 500, color: t.textMuted, marginLeft: 6 }}>
              / hafta
            </span>
          </div>
          <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
            ≈ {(data.week_cost_usd * USD_TRY).toFixed(0)} ₺ · {data.week_artifact_count} içerik · {data.week_mission_count} mission
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: t.textMuted }}>Bugün</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: atCap ? '#EF4444' : t.accent }}>
            ${spent.toFixed(2)} / ${cap.toFixed(2)}
          </div>
          <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>
            {atCap ? 'Bütçe doldu' : `$${data.remaining_today_usd.toFixed(2)} kaldı`}
          </div>
        </div>
      </div>

      <div style={{
        marginTop: 12, height: 6, borderRadius: 3, overflow: 'hidden',
        background: t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%', borderRadius: 3,
          background: atCap
            ? 'linear-gradient(90deg, #EF4444, #F87171)'
            : `linear-gradient(90deg, ${t.accent}cc, ${t.accent})`,
          transition: 'width 0.4s ease',
        }} />
      </div>

      {topCategories.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {topCategories.map(([key, val]) => (
            <span key={key} style={{
              fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 20,
              background: t.accentDim, color: t.accent,
            }}>
              {CATEGORY_LABELS[key] ?? key} ${val.toFixed(2)}
            </span>
          ))}
        </div>
      )}

      <div style={{ fontSize: 10, color: t.textMuted, marginTop: 8, lineHeight: 1.4 }}>
        Tahmini API maliyeti (USD). Otonom üretim günlük ${cap.toFixed(2)} ile sınırlı.
      </div>
    </div>
  );
}

export function MissionHub() {
  const { t } = useTheme();
  const { navigate, goBack } = useMobileStore();
  const { tenantId } = useWorkspaceStore();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [proposeError, setProposeError] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [detailMission, setDetailMission] = useState<MissionSummary | null>(null);

  const wsId = tenantId;

  const { data: missions = [], isLoading } = useQuery({
    queryKey: ['missions', wsId],
    queryFn: () => apiClient.listMissions(wsId),
    refetchInterval: 15_000,
    staleTime: 8_000,
    enabled: Boolean(wsId),
  });

  const { data: brandCtx } = useQuery({
    queryKey: ['brand-context-data', wsId],
    queryFn: () => apiClient.getBrandContextData(wsId),
    staleTime: 30_000, // kısa tut — location/description sonradan doldurulabilir
    enabled: Boolean(wsId),
  });

  const { data: usageCost } = useQuery({
    queryKey: ['usage-cost', wsId],
    queryFn: () => apiClient.getWorkspaceUsageCost(wsId),
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: Boolean(wsId),
  });

  const budgetExhausted = usageCost != null && (
    (usageCost.token_wallet?.enabled
      ? usageCost.token_wallet.remaining_tokens <= 0
      : usageCost.remaining_today_usd <= 0.001)
  );

  const proposed  = missions.filter(m => m.status === 'proposed');
  const active    = missions.filter(m => ['approved','in_flight'].includes(m.status));
  const hasBlockingMissions = proposed.length > 0 || active.length > 0;
  // Completed with errors (failed_nodes > 0) shown in active section so errors are visible
  const failedCompleted = missions.filter(m => m.status === 'completed' && m.failed_nodes > 0);
  const completed = missions.filter(m => m.status === 'completed' && m.failed_nodes === 0).slice(0, 5);

  const proposeMutation = useMutation({
    mutationFn: () => apiClient.proposeMissions(wsId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['missions', wsId] });
      queryClient.invalidateQueries({ queryKey: ['usage-cost', wsId] });
      setProposeError(null);
      if (data.proposals_created === 0) {
        setProposeError('Yeni öneri bulunamadı. Sinyal verileri henüz yeterli olmayabilir.');
      }
    },
    onError: (err: Error) => {
      setProposeError(err.message?.slice(0, 120) ?? 'Öneri oluşturulamadı.');
    },
  });

  const approveMutation = useMutation({
    mutationFn: (missionId: string) =>
      apiClient.approveMission(wsId, missionId, user?.displayName ?? 'operator'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['missions', wsId] }),
  });

  const rejectMutation = useMutation({
    mutationFn: (missionId: string) => apiClient.rejectMission(wsId, missionId),
    onSuccess: () => {
      setRejectId(null);
      queryClient.invalidateQueries({ queryKey: ['missions', wsId] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (missionId: string) => apiClient.cancelMission(wsId, missionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['missions', wsId] }),
  });

  const restartMutation = useMutation({
    mutationFn: (missionId: string) => apiClient.restartMission(wsId, missionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['missions', wsId] }),
  });

  const isEmpty = !isLoading && proposed.length === 0 && active.length === 0 && completed.length === 0 && failedCompleted.length === 0;

  return (
    <>
    {detailMission && (
      <MissionDetailSheet
        mission={detailMission}
        workspaceId={wsId}
        onClose={() => setDetailMission(null)}
      />
    )}
    <div style={{ minHeight: '100dvh', background: t.bg, paddingBottom: 88 }}>
      {/* ── Header ── */}
      <div style={{
        padding: 'calc(env(safe-area-inset-top,0px) + 14px) 22px 0',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={goBack} style={{ ...t.backBtn, cursor: 'pointer',
          width: 34, height: 34, borderRadius: '50%', display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
          ←
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: t.textPrimary,
            letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            Mission Hub
          </div>
          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 1 }}>
            Otonom kampanya yönetimi
          </div>
        </div>
        {/* New Mission button */}
        <button
          onClick={() => { setProposeError(null); proposeMutation.mutate(); }}
          disabled={proposeMutation.isPending || budgetExhausted || hasBlockingMissions}
          title={
            hasBlockingMissions
              ? 'Önce mevcut önerileri onaylayın veya aktif kampanyayı tamamlayın'
              : budgetExhausted
                ? 'Günlük API bütçesi doldu'
                : undefined
          }
          style={{
            padding: '8px 14px', borderRadius: 30, cursor: proposeMutation.isPending ? 'default' : 'pointer',
            background: proposeMutation.isPending
              ? t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
              : `linear-gradient(135deg, ${t.accent}cc, ${t.accent}88)`,
            border: 'none', color: proposeMutation.isPending ? t.textMuted : '#fff',
            fontSize: 12, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 5,
            boxShadow: proposeMutation.isPending ? 'none' : `0 2px 12px ${t.accent}40`,
          }}>
          {proposeMutation.isPending ? (
            <><div style={{ width: 10, height: 10, borderRadius: '50%',
              border: `2px solid ${t.separator}`, borderTop: `2px solid ${t.accent}`,
              animation: 'spinSlow 0.8s linear infinite' }} />Analiz...</>
          ) : <><span>✦</span>Yeni Öneri</>}
        </button>
      </div>

      {usageCost ? <UsageCostCard data={usageCost} /> : null}

      {/* Propose loading note */}
      {proposeMutation.isPending && (
        <div style={{ margin: '12px 22px 0', padding: '10px 14px', borderRadius: 12,
          background: t.accentDim, border: `0.5px solid ${t.accentBorder}`,
          fontSize: 12, color: t.accent, lineHeight: 1.5 }}>
          ✦ StrategistAgent tüm sinyalleri analiz ediyor... 30–90 saniye sürebilir.
        </div>
      )}
      {proposeError && !proposeMutation.isPending && (() => {
        const b = brandCtx as any;
        const missingFields = [
          { label: 'Ürün / Hizmet tanımı', ok: Boolean(b?.description?.trim()) },
          { label: 'Hedef kitle',           ok: Boolean(b?.target_audience?.trim()) },
          { label: 'Konum',                 ok: Boolean(b?.location?.trim()) },
          { label: 'Marka tonu',            ok: Boolean(b?.brand_tone?.trim()) },
        ].filter(f => !f.ok);

        const allFilled = missingFields.length === 0;

        return (
          <div style={{ margin: '12px 22px 0', borderRadius: 16, overflow: 'hidden',
            background: t.isDark ? 'rgba(255,255,255,0.04)' : '#fff',
            border: `0.5px solid ${allFilled ? t.separator : 'rgba(245,158,11,0.25)'}` }}>
            <div style={{ padding: '12px 16px 10px', display: 'flex', alignItems: 'center', gap: 10,
              borderBottom: `0.5px solid ${t.separator}` }}>
              <div style={{ width: 28, height: 28, borderRadius: 8,
                background: allFilled ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                border: `0.5px solid ${allFilled ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {allFilled ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                )}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary }}>
                  {allFilled ? 'Marka verisi hazır' : 'Marka verisi eksik'}
                </div>
                <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>
                  {allFilled
                    ? 'Tüm alanlar dolu — yeniden dene'
                    : `${missingFields.length} alan eksik, strateji üretilemiyor`}
                </div>
              </div>
            </div>

            {!allFilled && (
              <div style={{ padding: '10px 16px' }}>
                {missingFields.map((item, i) => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 0',
                    borderBottom: i < missingFields.length - 1 ? `0.5px solid ${t.separator}` : 'none' }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                      border: '1.5px solid rgba(245,158,11,0.4)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(245,158,11,0.4)' }} />
                    </div>
                    <span style={{ fontSize: 12, color: t.textSecondary }}>{item.label}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ padding: '10px 16px 14px', display: 'flex', gap: 8 }}>
              {!allFilled && (
                <button onClick={() => navigate('brand')} style={{
                  flex: 1, padding: '10px', borderRadius: 12, cursor: 'pointer',
                  background: 'rgba(167,139,250,0.12)', border: '0.5px solid rgba(167,139,250,0.3)',
                  fontSize: 12, fontWeight: 700, color: t.accent,
                }}>
                  Marka Hub'ını Doldur →
                </button>
              )}
              <button onClick={() => {
                if (hasBlockingMissions) return;
                setProposeError(null);
                queryClient.invalidateQueries({ queryKey: ['brand-context-data', wsId] });
                setTimeout(() => proposeMutation.mutate(), 300);
              }} disabled={hasBlockingMissions} style={{
                flex: allFilled ? 1 : 0, padding: '10px 14px', borderRadius: 12,
                cursor: hasBlockingMissions ? 'default' : 'pointer',
                opacity: hasBlockingMissions ? 0.45 : 1,
                background: allFilled ? 'rgba(167,139,250,0.12)' : 'transparent',
                border: allFilled ? '0.5px solid rgba(167,139,250,0.3)' : `0.5px solid ${t.separator}`,
                fontSize: 12, fontWeight: allFilled ? 700 : 400,
                color: allFilled ? t.accent : t.textMuted,
              }}>
                {allFilled ? 'Yeniden Dene →' : 'Tekrar Dene'}
              </button>
            </div>
          </div>
        );
      })()}

      <div style={{ padding: '24px 22px 0' }}>

        {/* ── Loading ── */}
        {isLoading && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%',
              border: `3px solid ${t.separator}`, borderTop: `3px solid ${t.accent}`,
              animation: 'spinSlow 1s linear infinite', margin: '0 auto 16px' }} />
            <div style={{ fontSize: 14, color: t.textMuted }}>Kampanyalar yükleniyor...</div>
          </div>
        )}

        {/* ── Empty state ── */}
        {isEmpty && !isLoading && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✦</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: t.textPrimary, marginBottom: 8 }}>
              Henüz kampanya yok
            </div>
            <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6, marginBottom: 28, maxWidth: 280, margin: '0 auto 28px' }}>
              "Yeni Öneri" butonuna basarak StrategistAgent'ın tüm sinyal verilerini
              analiz etmesini ve kampanya önerileri üretmesini sağla.
            </div>
          </div>
        )}

        {/* ── Proposed ── */}
        {proposed.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.warning,
                animation: 'liveGlow 2s infinite', boxShadow: `0 0 8px ${t.warning}` }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: t.labelColor,
                letterSpacing: '0.1em', textTransform: 'uppercase' }}>Onay Bekliyor</span>
              <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20,
                background: 'rgba(245,158,11,0.12)', color: t.warning, fontWeight: 700 }}>
                {proposed.length}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {proposed.map(m => (
                <ProposedCard
                  key={m.id}
                  mission={m}
                  workspaceId={wsId}
                  onApprove={(id) => approveMutation.mutate(id)}
                  onReject={(id) => rejectMutation.mutate(id)}
                  isPending={approveMutation.isPending && approveMutation.variables === m.id}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Failed completed missions ── */}
        {failedCompleted.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#EF4444',
                letterSpacing: '0.1em', textTransform: 'uppercase' }}>Hatalı Tamamlandı</span>
              <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20,
                background: 'rgba(239,68,68,0.10)', color: '#EF4444', fontWeight: 700 }}>
                {failedCompleted.length}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {failedCompleted.map(m => (
                <InFlightCard key={m.id} mission={m} workspaceId={wsId}
                  onCancel={() => {}}
                  onRestart={(id) => restartMutation.mutate(id)}
                  onTapCompleted={() => setDetailMission(m)} />
              ))}
            </div>
          </div>
        )}

        {/* ── Active ── */}
        {active.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.live,
                animation: 'liveGlow 2s infinite', boxShadow: `0 0 8px ${t.live}` }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: t.labelColor,
                letterSpacing: '0.1em', textTransform: 'uppercase' }}>Aktif Kampanyalar</span>
              <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 20,
                background: 'rgba(16,185,129,0.10)', color: t.live, fontWeight: 700 }}>
                {active.length}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {active.map(m => (
                <InFlightCard
                  key={m.id}
                  mission={m}
                  workspaceId={wsId}
                  onCancel={(id) => cancelMutation.mutate(id)}
                  onRestart={(id) => restartMutation.mutate(id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Completed ── */}
        {completed.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: t.labelColor,
                letterSpacing: '0.1em', textTransform: 'uppercase' }}>Tamamlananlar</span>
            </div>
            <div style={{ borderRadius: 16, overflow: 'hidden',
              background: t.isDark ? 'rgba(255,255,255,0.03)' : '#fff',
              border: `0.5px solid ${t.separator}`,
              padding: '0 14px' }}>
              {completed.map((m, i) => (
                <div key={m.id} style={{ borderBottom: i < completed.length - 1 ? undefined : 'none' }}>
                  <CompletedRow mission={m} onTap={() => setDetailMission(m)} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
