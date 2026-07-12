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
import { useTheme } from './theme-context';

export interface MobileBrandAutoFillProps {
  tenantId: string | null | undefined;
  variant?: 'card' | 'inline';
  onDone?: (result: { ok: boolean; resolvedCount: number }) => void;
}

/**
 * Mobile "Benim yerime doldur" — runs POST complete-gaps (AI agent + gallery + theme derive).
 */
export function MobileBrandAutoFill({
  tenantId,
  variant = 'card',
  onDone,
}: MobileBrandAutoFillProps) {
  const { t } = useTheme();
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
  const autoFixable = countAutoFixableGaps(mergedGaps);
  const actionable = countActionableGaps(mergedGaps);

  const runComplete = useCallback(async () => {
    if (!tenantId || running) return;
    setRunning(true);
    setFeedback(null);
    try {
      const r = await fetchTenantBff(
        `/api/brand-context/${tenantId}/complete-gaps`,
        tenantId,
        { method: 'POST', headers: getTenantBffHeaders(tenantId) },
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
        setFeedback({ kind: 'err', text: body.error ?? failed ?? 'Tamamlama başarısız' });
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
        queryClient.invalidateQueries({ queryKey: ['brand-theme-kit', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['gallery-analysis', tenantId] }),
        queryClient.invalidateQueries({ queryKey: ['missions', tenantId] }),
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

  if (!tenantId) return null;

  const label = running
    ? 'AI dolduruyor…'
    : autoFixable > 0
      ? `✦ Benim yerime doldur (${autoFixable})`
      : actionable > 0
        ? '✦ Markayı AI ile güçlendir'
        : '✦ Marka profilini yenile';

  const accent = autoFixable > 0 ? '#10B981' : '#6366F1';

  if (variant === 'inline') {
    return (
      <button
        type="button"
        disabled={running}
        onClick={() => void runComplete()}
        style={{
          flex: 1,
          padding: '9px 12px',
          borderRadius: 10,
          border: `0.5px solid ${accent}55`,
          background: `${accent}18`,
          color: accent,
          fontSize: 12,
          fontWeight: 700,
          cursor: running ? 'wait' : 'pointer',
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        disabled={running}
        onClick={() => void runComplete()}
        style={{
          width: '100%',
          padding: '11px 14px',
          borderRadius: 12,
          border: 'none',
          cursor: running ? 'wait' : 'pointer',
          fontSize: 13,
          fontWeight: 700,
          color: '#fff',
          background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        {running && (
          <span style={{
            width: 14, height: 14, borderRadius: '50%',
            border: '2px solid rgba(255,255,255,0.35)',
            borderTopColor: '#fff',
            animation: 'spinSlow 0.8s linear infinite',
          }} />
        )}
        {label}
      </button>
      <div style={{ fontSize: 11, color: t.textMuted, marginTop: 6, lineHeight: 1.45 }}>
        AI agent marka DNA, tema katmanları, içerik sütunları ve galeri analizini otomatik tamamlar.
      </div>
      {feedback && (
        <div style={{
          marginTop: 8,
          fontSize: 12,
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
