'use client';

import { useEffect, useMemo, useState } from 'react';
import { CREATIVE_CONTENT_NEEDS } from '@/lib/creative-production-contracts';
import {
  listCapabilitiesForIndustry,
  resolveTenantOperatingProfile,
  type TenantCapabilityId,
} from '@/lib/tenant-operating-policy';
import { TenantGalleryPolicyBanner } from '@/components/brand/TenantGalleryPolicyBanner';

function parseJsonArray(raw?: string): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function labelForCapability(id: string): string {
  const content = CREATIVE_CONTENT_NEEDS.find((n) => n.id === id);
  if (content) return content.label;
  const fromCatalog = listCapabilitiesForIndustry('').find((c) => c.id === id);
  return fromCatalog?.label ?? id.replace(/_/g, ' ');
}

type Variant = 'desktop' | 'mobile';

type MobileTheme = {
  textPrimary: string;
  textMuted: string;
  textSecondary: string;
  accent: string;
  accentDim: string;
  accentBorder: string;
  separator: string;
  isDark: boolean;
};

export function TenantOperatingCapabilitiesEditor({
  tenantId,
  industry,
  contentNeedsJson,
  operatingCapabilitiesJson,
  galleryPolicyJson,
  riskRulesJson,
  customRules,
  onSave,
  saving,
  variant = 'desktop',
  theme,
}: {
  tenantId: string;
  industry: string;
  contentNeedsJson?: string;
  operatingCapabilitiesJson?: string;
  galleryPolicyJson?: string;
  riskRulesJson?: string;
  customRules?: string;
  onSave: (payload: { operatingCapabilities: string; contentNeeds: string }) => void;
  saving?: boolean;
  variant?: Variant;
  theme?: MobileTheme;
}) {
  const catalog = useMemo(() => listCapabilitiesForIndustry(industry), [industry]);

  const resolved = useMemo(
    () =>
      resolveTenantOperatingProfile({
        tenantId,
        industry,
        contentNeedsJson,
        operatingCapabilitiesJson,
        galleryPolicyJson,
        riskRulesJson,
        customRules,
      }),
    [
      tenantId,
      industry,
      contentNeedsJson,
      operatingCapabilitiesJson,
      galleryPolicyJson,
      riskRulesJson,
      customRules,
    ],
  );

  const [selected, setSelected] = useState<Set<string>>(new Set(resolved.enabledCapabilities));

  useEffect(() => {
    setSelected(new Set(resolved.enabledCapabilities));
  }, [resolved.enabledCapabilities.join('|')]);

  function toggle(id: TenantCapabilityId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function persist() {
    const enabled = [...selected];
    const contentIntents = enabled.filter(
      (id) => !id.startsWith('gallery_') && !id.startsWith('workflow_'),
    );
    onSave({
      operatingCapabilities: JSON.stringify(enabled),
      contentNeeds: JSON.stringify(contentIntents),
    });
  }

  const contentCaps = catalog.filter((c) => c.kind === 'content_intent');
  const workflowCaps = catalog.filter((c) => c.kind === 'workflow');

  if (variant === 'mobile' && theme) {
    return (
      <div>
        <TenantGalleryPolicyBanner profile={resolved} variant="mobile" theme={theme} />
        <p style={{ fontSize: 12, color: theme.textMuted, lineHeight: 1.55, marginBottom: 12 }}>
          Sektörünüze uygun içerik ve galeri yeteneklerini seçin. Cafe/restoranlarda müşteri fotoğrafı varsayılan olarak kapalıdır.
        </p>
        {contentCaps.length > 0 && (
          <>
            <p style={{ fontSize: 11, fontWeight: 700, color: theme.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              İçerik niyetleri
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {contentCaps.map((cap) => {
                const on = selected.has(cap.id);
                return (
                  <button
                    key={cap.id}
                    type="button"
                    onClick={() => toggle(cap.id as TenantCapabilityId)}
                    style={{
                      textAlign: 'left',
                      padding: '12px 14px',
                      borderRadius: 14,
                      border: `0.5px solid ${on ? theme.accentBorder : theme.separator}`,
                      background: on ? theme.accentDim : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: theme.textPrimary }}>{cap.label}</div>
                    <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>{cap.description}</div>
                  </button>
                );
              })}
            </div>
          </>
        )}
        {workflowCaps.length > 0 && (
          <>
            <p style={{ fontSize: 11, fontWeight: 700, color: theme.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Akış & galeri
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {workflowCaps.map((cap) => {
                const on = selected.has(cap.id);
                return (
                  <button
                    key={cap.id}
                    type="button"
                    onClick={() => toggle(cap.id as TenantCapabilityId)}
                    style={{
                      textAlign: 'left',
                      padding: '12px 14px',
                      borderRadius: 14,
                      border: `0.5px solid ${on ? theme.accentBorder : theme.separator}`,
                      background: on ? theme.accentDim : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: theme.textPrimary }}>{cap.label}</div>
                    <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>{cap.description}</div>
                  </button>
                );
              })}
            </div>
          </>
        )}
        <button
          type="button"
          disabled={saving}
          onClick={persist}
          style={{
            width: '100%',
            padding: '13px',
            borderRadius: 14,
            border: 'none',
            background: theme.accent,
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            cursor: saving ? 'default' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Kaydediliyor…' : 'Yetenekleri kaydet'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <TenantGalleryPolicyBanner profile={resolved} />
      <p className="text-xs leading-relaxed text-zinc-500">
        İşletme türüne göre filtrelenmiş yetenekler. Seçimler agent prompt&apos;larına ve galeri upload kurallarına yansır.
      </p>
      {contentCaps.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-600">İçerik niyetleri</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {contentCaps.map((cap) => {
              const on = selected.has(cap.id);
              return (
                <label
                  key={cap.id}
                  className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${
                    on ? 'border-indigo-500/40 bg-indigo-500/10' : 'border-white/10 bg-white/[0.03]'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={on}
                    onChange={() => toggle(cap.id as TenantCapabilityId)}
                  />
                  <div>
                    <p className="text-sm font-semibold text-white">{cap.label}</p>
                    <p className="mt-1 text-[11px] text-zinc-500">{cap.description}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}
      {workflowCaps.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-600">Akış & galeri</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {workflowCaps.map((cap) => {
              const on = selected.has(cap.id);
              return (
                <label
                  key={cap.id}
                  className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${
                    on ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-white/10 bg-white/[0.03]'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={on}
                    onChange={() => toggle(cap.id as TenantCapabilityId)}
                  />
                  <div>
                    <p className="text-sm font-semibold text-white">{cap.label}</p>
                    <p className="mt-1 text-[11px] text-zinc-500">{cap.description}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {[...selected].map((id) => (
          <span
            key={id}
            className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-medium text-zinc-300"
            title={labelForCapability(id)}
          >
            {labelForCapability(id)}
          </span>
        ))}
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={persist}
        className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {saving ? 'Kaydediliyor…' : 'Yetenekleri kaydet'}
      </button>
    </div>
  );
}

export { parseJsonArray as parseProfileJsonArray };
