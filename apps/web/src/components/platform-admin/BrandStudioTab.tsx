'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BrandCompleteGapsButton } from '@/components/brand/BrandCompleteGapsButton';
import { AdminSectionTitle, AdminSurface } from '@/components/platform-admin/admin-ui';
import { AiAssistField, SaveBar } from '@/components/platform-admin/AiAssistField';
import { fetchBrandContext, patchBrandContext } from '@/lib/platform-admin-actions-client';

type BrandFields = {
  description: string;
  brand_tone: string;
  visual_style: string;
  target_audience: string;
  content_pillars: string;
  custom_rules: string;
  instagram_bio: string;
  website_summary: string;
  location: string;
};

const EMPTY: BrandFields = {
  description: '',
  brand_tone: '',
  visual_style: '',
  target_audience: '',
  content_pillars: '',
  custom_rules: '',
  instagram_bio: '',
  website_summary: '',
  location: '',
};

function fromContext(ctx: Record<string, unknown> | null): BrandFields {
  if (!ctx) return { ...EMPTY };
  const pillars = ctx.content_pillars;
  const pillarsText = Array.isArray(pillars)
    ? pillars.map(String).join('\n')
    : String(pillars ?? '');
  return {
    description: String(ctx.description ?? ''),
    brand_tone: String(ctx.brand_tone ?? ''),
    visual_style: String(ctx.visual_style ?? ''),
    target_audience: String(ctx.target_audience ?? ''),
    content_pillars: pillarsText,
    custom_rules: String(ctx.custom_rules ?? ''),
    instagram_bio: String(ctx.instagram_bio ?? ''),
    website_summary: String(ctx.website_summary ?? ''),
    location: String(ctx.location ?? ''),
  };
}

function toPatch(fields: BrandFields): Record<string, unknown> {
  const pillars = fields.content_pillars
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    description: fields.description,
    brand_tone: fields.brand_tone,
    visual_style: fields.visual_style,
    target_audience: fields.target_audience,
    content_pillars: pillars,
    custom_rules: fields.custom_rules,
    instagram_bio: fields.instagram_bio,
    website_summary: fields.website_summary,
    location: fields.location,
  };
}

export function BrandStudioTab({
  workspaceId,
  onWorkspaceIdChange,
}: {
  workspaceId: string;
  onWorkspaceIdChange: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<BrandFields>(EMPTY);
  const [baseline, setBaseline] = useState<BrandFields>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const ctxQuery = useQuery({
    queryKey: ['admin-brand-context', workspaceId],
    queryFn: () => fetchBrandContext(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 20_000,
  });

  useEffect(() => {
    const loaded = fromContext(ctxQuery.data ?? null);
    setFields(loaded);
    setBaseline(loaded);
    setSaveMsg(null);
  }, [ctxQuery.data, workspaceId]);

  const dirty = useMemo(
    () => JSON.stringify(fields) !== JSON.stringify(baseline),
    [fields, baseline],
  );

  const setField = useCallback((key: keyof BrandFields, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    setSaveMsg(null);
  }, []);

  const save = useCallback(async () => {
    if (!workspaceId || saving) return;
    setSaving(true);
    setSaveMsg(null);
    const result = await patchBrandContext(workspaceId, toPatch(fields));
    setSaving(false);
    setSaveMsg(result.message);
    if (result.ok) {
      setBaseline({ ...fields });
      void queryClient.invalidateQueries({ queryKey: ['admin-brand-context', workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ['production-context-snapshot', workspaceId] });
    }
  }, [workspaceId, saving, fields, queryClient]);

  return (
    <div className="space-y-6">
      <AdminSurface>
        <AdminSectionTitle
          title="Marka stüdyosu"
          subtitle="Metin düzenleme + AI yardımı — değişiklikler Python brand_context SSOT'a yazılır"
        />
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            className="min-w-[280px] flex-1 rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-white/[0.02] px-4 py-3 text-sm text-gray-800 dark:text-white/90 outline-none"
            value={workspaceId}
            onChange={(e) => onWorkspaceIdChange(e.target.value)}
            placeholder="Workspace UUID"
          />
          <BrandCompleteGapsButton tenantId={workspaceId} variant="primary" />
        </div>
        {ctxQuery.isLoading && <p className="text-sm text-gray-500 dark:text-gray-400">Marka bağlamı yükleniyor…</p>}
        {ctxQuery.data && (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {String(ctxQuery.data.business_name ?? ctxQuery.data.brand_name ?? '—')}
            {' · '}
            {String(ctxQuery.data.business_type ?? '—')}
          </p>
        )}
      </AdminSurface>

      <div className="grid gap-4 lg:grid-cols-2">
        <AiAssistField
          workspaceId={workspaceId}
          field="description"
          label="Açıklama"
          value={fields.description}
          onChange={(v) => setField('description', v)}
          rows={5}
        />
        <AiAssistField
          workspaceId={workspaceId}
          field="brand_tone"
          label="Marka tonu"
          value={fields.brand_tone}
          onChange={(v) => setField('brand_tone', v)}
          rows={4}
        />
        <AiAssistField
          workspaceId={workspaceId}
          field="target_audience"
          label="Hedef kitle"
          value={fields.target_audience}
          onChange={(v) => setField('target_audience', v)}
          rows={3}
        />
        <AiAssistField
          workspaceId={workspaceId}
          field="visual_style"
          label="Görsel stil"
          value={fields.visual_style}
          onChange={(v) => setField('visual_style', v)}
          rows={3}
        />
        <AiAssistField
          workspaceId={workspaceId}
          field="content_pillars"
          label="İçerik sütunları (satır başına bir)"
          value={fields.content_pillars}
          onChange={(v) => setField('content_pillars', v)}
          rows={5}
        />
        <AiAssistField
          workspaceId={workspaceId}
          field="custom_rules"
          label="Özel kurallar"
          value={fields.custom_rules}
          onChange={(v) => setField('custom_rules', v)}
          rows={5}
        />
        <AiAssistField
          workspaceId={workspaceId}
          field="instagram_bio"
          label="Instagram bio"
          value={fields.instagram_bio}
          onChange={(v) => setField('instagram_bio', v)}
          rows={3}
        />
        <AiAssistField
          workspaceId={workspaceId}
          field="website_summary"
          label="Web sitesi özeti"
          value={fields.website_summary}
          onChange={(v) => setField('website_summary', v)}
          rows={4}
        />
        <AiAssistField
          workspaceId={workspaceId}
          field="location"
          label="Konum"
          value={fields.location}
          onChange={(v) => setField('location', v)}
          rows={2}
        />
      </div>

      <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} message={saveMsg} />
    </div>
  );
}
