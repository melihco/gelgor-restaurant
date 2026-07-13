'use client';

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchTenantBff } from '@/lib/bff-fetch';
import { getTenantBffHeaders } from '@/lib/runtime-config';
import {
  countActionableGaps,
  countAutoFixableGaps,
  formatCompleteGapsFeedback,
  type BrandGapItem,
} from '@/lib/brand-gap-analysis';
import { fetchBrandGapPreview } from '@/lib/brand-gap-preview-client';

export interface BrandCompleteGapsState {
  running: boolean;
  label: string;
  shortLabel: string;
  hint: string;
  autoFixable: number;
  actionable: number;
  feedback: { kind: 'ok' | 'err'; text: string } | null;
  runComplete: () => Promise<void>;
}

export function useBrandCompleteGaps(
  tenantId: string | null | undefined,
  onDone?: (result: { ok: boolean; resolvedCount: number }) => void,
): BrandCompleteGapsState {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const { data: gapPreview } = useQuery({
    queryKey: ['brand-gaps', tenantId],
    queryFn: async () => {
      if (!tenantId) return { gaps: [] as BrandGapItem[], mergedGaps: [] as BrandGapItem[], ctx: null };
      return fetchBrandGapPreview(tenantId);
    },
    staleTime: 60_000,
    enabled: Boolean(tenantId),
  });

  const mergedGaps = gapPreview?.mergedGaps ?? [];
  const actionable = countActionableGaps(mergedGaps);
  const autoFixable = countAutoFixableGaps(mergedGaps);

  const runComplete = useCallback(async () => {
    if (!tenantId || running) return;
    setRunning(true);
    setFeedback(null);
    try {
      const r = await fetchTenantBff(
        `/api/brand-context/${tenantId}/complete-gaps`,
        tenantId,
        {
          method: 'POST',
          headers: getTenantBffHeaders(tenantId),
        },
      );
      const body = await r.json().catch(() => ({})) as {
        ok?: boolean;
        resolvedCount?: number;
        gapsAfter?: BrandGapItem[];
        steps?: Array<{ id: string; ok: boolean; detail?: string }>;
        error?: string;
      };
      if (!r.ok || body.ok === false) {
        const failed = (body.steps ?? []).filter((s) => !s.ok).map((s) => s.id).join(', ');
        setFeedback({
          kind: 'err',
          text: body.error ?? failed ?? 'Tamamlama başarısız',
        });
        onDone?.({ ok: false, resolvedCount: body.resolvedCount ?? 0 });
        return;
      }
      const resolved = body.resolvedCount ?? 0;
      setFeedback({
        kind: 'ok',
        text: formatCompleteGapsFeedback({
          resolvedCount: resolved,
          steps: body.steps,
          gapsAfter: body.gapsAfter,
        }),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['brand-gaps', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['brand-readiness', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['brand-context-data', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['company-profile', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['company-profile'] }),
        queryClient.invalidateQueries({ queryKey: ['python-brand-ctx-display', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', tenantId] }),
      ]);
      onDone?.({ ok: true, resolvedCount: resolved });
    } catch (err) {
      setFeedback({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Tamamlama başarısız',
      });
      onDone?.({ ok: false, resolvedCount: 0 });
    } finally {
      setRunning(false);
    }
  }, [tenantId, running, queryClient, onDone]);

  const label = running
    ? 'Tamamlanıyor…'
    : autoFixable > 0
      ? `Marka eksiklerini tamamla (${autoFixable})`
      : actionable > 0
        ? 'Kalan adımlar'
        : 'Marka profilini yenile';

  const shortLabel = running
    ? 'Tamamlanıyor…'
    : autoFixable > 0
      ? 'Marka eksiklerini tamamla'
      : actionable > 0
        ? 'Manuel eksikler'
        : 'Marka profilini yenile';

  const hint = running
    ? 'AI çalışıyor'
    : autoFixable > 0
      ? 'AI ile otomatik'
      : actionable > 0
        ? `${actionable} kalan adım`
        : 'Profili yenile';

  return {
    running,
    label,
    shortLabel,
    hint,
    autoFixable,
    actionable,
    feedback,
    runComplete,
  };
}

export interface BrandCompleteGapsButtonProps {
  tenantId: string | null | undefined;
  /** compact = icon + short label for hub header; mobile = slim CTA without gap bullet list */
  variant?: 'primary' | 'compact' | 'mobile';
  /** When false, hides the gap label list under the button (mobile dashboard). */
  showGapPreview?: boolean;
  onDone?: (result: { ok: boolean; resolvedCount: number }) => void;
}

export function BrandCompleteGapsButton({
  tenantId,
  variant = 'primary',
  showGapPreview = variant !== 'mobile',
  onDone,
}: BrandCompleteGapsButtonProps) {
  const {
    running,
    label,
    autoFixable,
    actionable,
    feedback,
    runComplete,
  } = useBrandCompleteGaps(tenantId, onDone);

  const { data: gapPreview } = useQuery({
    queryKey: ['brand-gaps', tenantId],
    queryFn: async () => {
      if (!tenantId) return { gaps: [] as BrandGapItem[], mergedGaps: [] as BrandGapItem[], ctx: null };
      return fetchBrandGapPreview(tenantId);
    },
    staleTime: 60_000,
    enabled: Boolean(tenantId) && showGapPreview && variant === 'primary',
  });
  const mergedGaps = gapPreview?.mergedGaps ?? [];

  if (!tenantId) return null;

  if (variant === 'mobile') {
    return (
      <div style={{ marginBottom: 12 }}>
        <button
          type="button"
          disabled={running}
          onClick={() => void runComplete()}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            padding: '13px 16px',
            borderRadius: 14,
            border: autoFixable > 0
              ? '0.5px solid rgba(16,185,129,0.3)'
              : '0.5px solid rgba(99,102,241,0.28)',
            cursor: running ? 'wait' : 'pointer',
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: autoFixable > 0 ? '#34D399' : '#A5B4FC',
            background: autoFixable > 0
              ? 'rgba(16,185,129,0.1)'
              : 'rgba(99,102,241,0.1)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {running ? (
              <span
                style={{
                  width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                  border: '1.5px solid currentColor', borderTopColor: 'transparent',
                  animation: 'spinSlow 0.8s linear infinite',
                }}
              />
            ) : (
              <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }}>✦</span>
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
          </span>
          {autoFixable > 0 && !running && (
            <span style={{
              flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
              background: 'rgba(16,185,129,0.18)', color: '#34D399',
            }}
            >
              {autoFixable}
            </span>
          )}
        </button>
        {feedback && (
          <div style={{
            marginTop: 8, fontSize: 12.5, lineHeight: 1.45,
            color: feedback.kind === 'ok' ? '#10B981' : '#EF4444',
          }}
          >
            {feedback.text}
          </div>
        )}
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          disabled={running}
          onClick={() => void runComplete()}
          title="AI ile visual DNA, marka DNA, sektör takvimi ve açıklama alanlarını doldurur"
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold transition disabled:opacity-40"
          style={{
            background: autoFixable > 0 ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${autoFixable > 0 ? 'rgba(52,211,153,0.35)' : 'rgba(255,255,255,0.09)'}`,
            color: autoFixable > 0 ? '#34d399' : '#64748b',
          }}
        >
          {running ? (
            <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
          ) : '✦'}
          {label}
        </button>
        {feedback && (
          <span className="max-w-[220px] text-right text-[10px]" style={{ color: feedback.kind === 'ok' ? '#34d399' : '#f87171' }}>
            {feedback.text}
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        type="button"
        disabled={running}
        onClick={() => void runComplete()}
        style={{
          width: '100%',
          padding: '14px 16px',
          borderRadius: 16,
          border: autoFixable > 0
            ? '0.5px solid rgba(16,185,129,0.35)'
            : '0.5px solid rgba(99,102,241,0.35)',
          cursor: running ? 'wait' : 'pointer',
          fontSize: 13.5,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: '#fff',
          background: autoFixable > 0
            ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
            : 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
          boxShadow: autoFixable > 0
            ? '0 10px 28px rgba(16,185,129,0.22)'
            : '0 10px 28px rgba(99,102,241,0.22)',
        }}
      >
        {label}
      </button>
      {showGapPreview && actionable > 0 && mergedGaps.length > 0 && (
        <ul style={{ marginTop: 10, paddingLeft: 18, fontSize: 12, lineHeight: 1.5, opacity: 0.85 }}>
          {mergedGaps.slice(0, 6).map((g) => (
            <li key={g.id}>
              {g.label}
              {g.severity === 'low' ? ' (opsiyonel)' : ''}
            </li>
          ))}
        </ul>
      )}
      {feedback && (
        <div style={{
          marginTop: 10,
          fontSize: 12.5,
          lineHeight: 1.45,
          color: feedback.kind === 'ok' ? '#10B981' : '#EF4444',
        }}
        >
          {feedback.text}
        </div>
      )}
    </div>
  );
}
