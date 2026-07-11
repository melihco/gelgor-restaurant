'use client';

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchTenantBff } from '@/lib/bff-fetch';
import { getTenantBffHeaders } from '@/lib/runtime-config';
import {
  countActionableGaps,
  countAutoFixableGaps,
  formatCompleteGapsFeedback,
  mergeBrandGapLists,
  type BrandGapItem,
} from '@/lib/brand-gap-analysis';
import { parseStringOrArray } from '@/lib/brand-readiness';

export interface BrandCompleteGapsButtonProps {
  tenantId: string | null | undefined;
  /** compact = icon + short label for hub header */
  variant?: 'primary' | 'compact';
  onDone?: (result: { ok: boolean; resolvedCount: number }) => void;
}

export function BrandCompleteGapsButton({
  tenantId,
  variant = 'primary',
  onDone,
}: BrandCompleteGapsButtonProps) {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const { data: gapPreview } = useQuery({
    queryKey: ['brand-gaps', tenantId],
    queryFn: async () => {
      if (!tenantId) return { gaps: [] as BrandGapItem[], ctx: null as Record<string, unknown> | null };
      const [gapRes, ctxRes] = await Promise.all([
        fetchTenantBff(
          `/api/brand-context/${tenantId}/complete-gaps`,
          tenantId,
          { headers: getTenantBffHeaders(tenantId) },
        ),
        fetchTenantBff(
          `/api/brand-context-data/${tenantId}`,
          tenantId,
          { headers: getTenantBffHeaders(tenantId) },
        ),
      ]);
      const gaps = gapRes.ok
        ? ((await gapRes.json()) as { gaps?: BrandGapItem[] }).gaps ?? []
        : [];
      const ctx = ctxRes.ok
        ? ((await ctxRes.json()) as Record<string, unknown>)
        : null;
      return { gaps, ctx };
    },
    staleTime: 60_000,
    enabled: Boolean(tenantId),
  });

  const mergedGaps = mergeBrandGapLists(gapPreview?.gaps ?? [], {
    description: String(gapPreview?.ctx?.description ?? ''),
    websiteSummary: String(gapPreview?.ctx?.website_summary ?? ''),
    brandDna: gapPreview?.ctx?.brand_dna,
    discoveryConfidence: Number(gapPreview?.ctx?.discovery_confidence ?? 0),
    contentPillarCount: parseStringOrArray(gapPreview?.ctx?.content_pillars).length,
    defaultCtaCount: parseStringOrArray(gapPreview?.ctx?.default_ctas).length,
    usablePhotoCount: parseStringOrArray(gapPreview?.ctx?.reference_image_urls).length,
    analyzedPhotoCount: Object.keys(
      (typeof gapPreview?.ctx?.gallery_analysis === 'object' && gapPreview?.ctx?.gallery_analysis)
        ? gapPreview.ctx.gallery_analysis as Record<string, unknown>
        : {},
    ).length,
  });
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

  if (!tenantId) return null;

  const label = running
    ? 'Tamamlanıyor…'
    : autoFixable > 0
      ? `Marka eksiklerini tamamla (${autoFixable})`
      : actionable > 0
        ? `Manuel eksikler (${actionable})`
        : 'Marka profilini yenile';

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
          padding: '13px 16px',
          borderRadius: 14,
          border: 'none',
          cursor: running ? 'wait' : 'pointer',
          fontSize: 14,
          fontWeight: 700,
          color: '#fff',
          background: autoFixable > 0
            ? 'linear-gradient(135deg, #10B981, #059669)'
            : 'linear-gradient(135deg, #6366F1, #4F46E5)',
        }}
      >
        {label}
      </button>
      {actionable > 0 && mergedGaps.length > 0 && (
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
