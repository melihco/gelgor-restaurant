'use client';

import { useCallback, useEffect, useState } from 'react';

interface DiversityReport {
  tenantCount: number;
  uniqueStoryTemplates: number;
  uniquePosterTemplates: number;
  storyCollisionPct: number;
  posterCollisionPct: number;
  worstStoryOverlap: { templateId: string; count: number } | null;
  perTenant: Array<{
    tenantId: string;
    storyIds: string[];
    posterIds: string[];
  }>;
}

export function showcaseManifestScope(input: {
  workspaceId?: string | null;
  presetKey?: string | null;
  kitId: string;
}): string {
  if (input.workspaceId?.trim()) return input.workspaceId.trim().slice(0, 8);
  if (input.presetKey?.trim()) return `preset_${input.presetKey}`;
  return input.kitId;
}

export function showcaseManifestKey(input: {
  templateId: string;
  slotKey?: string;
  isPoster?: boolean;
  posterFormat?: string;
  workspaceId?: string | null;
  presetKey?: string | null;
  kitId: string;
  agencyMode?: boolean;
}): string {
  const scope = showcaseManifestScope({
    workspaceId: input.workspaceId,
    presetKey: input.presetKey,
    kitId: input.kitId,
  });
  if (input.isPoster) return `${input.templateId}_${input.posterFormat ?? 'story'}`;
  if (input.agencyMode) return input.templateId;
  if (input.slotKey) return `${scope}_${input.slotKey}`;
  return `${scope}_${input.templateId}`;
}

export function BrandDiversifyPanel({
  sector,
  kitId,
  workspaceId,
  onWorkspaceChange,
}: {
  sector: string;
  kitId: string;
  workspaceId?: string | null;
  onWorkspaceChange?: (id: string) => void;
}) {
  const [report, setReport] = useState<DiversityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [workspaceDraft, setWorkspaceDraft] = useState(workspaceId ?? '');

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ sector, kitId, count: '10' });
    if (workspaceId) params.set('workspace', workspaceId);
    fetch(`/api/remotion/showcase/diversify?${params}`)
      .then((r) => r.json())
      .then((data) => setReport(data.report ?? null))
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [sector, kitId, workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setWorkspaceDraft(workspaceId ?? '');
  }, [workspaceId]);

  const collisionOk = (report?.storyCollisionPct ?? 100) < 35;

  return (
    <div style={{
      marginBottom: 20, padding: 16, borderRadius: 16,
      background: '#14141f', border: '1px solid rgba(255,255,255,0.1)',
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 12 }}>
        <div style={{ flex: '1 1 280px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>
            Marka çeşitliliği · Canvas seviyesi
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
            Aynı sektörde 10 tenant simülasyonu — template çakışma oranı. Workspace ID ile gerçek marka fingerprint uygulanır.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flex: '1 1 320px' }}>
          <input
            value={workspaceDraft}
            onChange={(e) => setWorkspaceDraft(e.target.value)}
            placeholder="Workspace / tenant UUID"
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 10,
              background: '#0a0a0f', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.12)',
              fontSize: 12,
            }}
          />
          <button
            type="button"
            onClick={() => onWorkspaceChange?.(workspaceDraft.trim())}
            style={{
              padding: '10px 14px', borderRadius: 10, border: 'none',
              background: '#8B5CF6', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer',
            }}
          >
            Uygula
          </button>
          <button
            type="button"
            onClick={load}
            style={{
              padding: '10px 14px', borderRadius: 10,
              background: '#1e293b', color: '#cbd5e1', fontWeight: 600, fontSize: 12,
              border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
            }}
          >
            Yenile
          </button>
        </div>
      </div>

      {loading && <div style={{ fontSize: 12, color: '#64748b' }}>Simülasyon hesaplanıyor…</div>}

      {report && !loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
          {[
            { label: 'Story benzersiz', value: `${report.uniqueStoryTemplates}/50` },
            { label: 'Poster benzersiz', value: `${report.uniquePosterTemplates}` },
            { label: 'Story çakışma', value: `%${report.storyCollisionPct}`, warn: !collisionOk },
            { label: 'Poster çakışma', value: `%${report.posterCollisionPct}` },
          ].map((stat) => (
            <div
              key={stat.label}
              style={{
                padding: '10px 12px', borderRadius: 10,
                background: stat.warn ? 'rgba(251,113,133,0.12)' : 'rgba(56,189,248,0.08)',
                border: `1px solid ${stat.warn ? 'rgba(251,113,133,0.35)' : 'rgba(56,189,248,0.2)'}`,
              }}
            >
              <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {stat.label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: stat.warn ? '#fda4af' : '#7dd3fc', marginTop: 4 }}>
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {report?.worstStoryOverlap && report.worstStoryOverlap.count > 2 && (
        <div style={{ marginTop: 10, fontSize: 11, color: '#fbbf24' }}>
          En çok tekrar: {report.worstStoryOverlap.templateId} ({report.worstStoryOverlap.count} tenant)
        </div>
      )}
    </div>
  );
}
