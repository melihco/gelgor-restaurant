'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { T } from '@/app/mobile/_components/theme-context';
import { fetchTenantBff } from '@/lib/bff-fetch';
import { parseStringOrArray, BRS_MIN_CONTENT_PILLARS } from '@/lib/brand-readiness';
import {
  mirrorPillarsToCompanyProfile,
  afterPillarsMirroredToNexus,
} from '@/lib/content-pillars-sync';
import { useQueryClient } from '@tanstack/react-query';
import { CREATIVE_CONTENT_NEEDS, type CreativeIntent } from '@/lib/creative-production-contracts';
import { deriveContentNeedsFromSectorPack } from '@/lib/slot-content-needs-bridge';

const EXTRA_PILLAR_LABELS: Record<string, string> = {
  daily_story: 'Günlük story / mekan',
  service_intro: 'Hizmet tanıtımı',
  review_response: 'Yorum yanıtı',
  brand_awareness: 'Marka bilinirliği',
  seasonal_content: 'Sezonluk içerik',
  producer_story: 'Üretici hikayesi',
  venue_showcase: 'Mekan vitrini',
  tasting_experience: 'Tadım / deneyim',
  seasonal_availability: 'Sezonluk ürün',
  post_service_client_result: 'Hizmet sonrası sonuç',
};

function pillarLabel(id: string): string {
  const fromCatalog = CREATIVE_CONTENT_NEEDS.find((n) => n.id === id);
  if (fromCatalog) return fromCatalog.label;
  if (EXTRA_PILLAR_LABELS[id]) return EXTRA_PILLAR_LABELS[id];
  return id.replace(/_/g, ' ');
}

function ChipEditor({
  t,
  items,
  onChange,
  placeholder,
  suggestions,
  maxSuggestions = 8,
}: {
  t: T;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  suggestions: string[];
  maxSuggestions?: number;
}) {
  const [draft, setDraft] = useState('');
  const unselected = suggestions.filter((s) => !items.includes(s)).slice(0, maxSuggestions);

  const add = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || items.includes(trimmed)) return;
    onChange([...items, trimmed]);
    setDraft('');
  };

  const remove = (value: string) => onChange(items.filter((i) => i !== value));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {items.map((item) => (
            <div
              key={item}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 20,
                background: `${t.accent}20`,
                border: `1.5px solid ${t.accent}`,
                color: t.accent,
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {pillarLabel(item) !== item ? (
                <span title={item}>{pillarLabel(item)}</span>
              ) : (
                item
              )}
              <button
                type="button"
                onClick={() => remove(item)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: t.accent,
                  fontSize: 16,
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {unselected.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{
            fontSize: 11,
            color: t.textSecondary,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
          >
            Öneriler
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {unselected.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => add(s)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 20,
                  background: t.surface,
                  border: `1.5px dashed ${t.separator}`,
                  color: t.textSecondary,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                + {pillarLabel(s)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) add(draft);
          }}
          placeholder={placeholder}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 10,
            border: `1.5px solid ${t.separator}`,
            background: t.surface,
            color: t.textPrimary,
            fontSize: 13,
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={() => add(draft)}
          style={{
            padding: '8px 14px',
            borderRadius: 10,
            background: t.accent,
            border: 'none',
            color: '#fff',
            fontSize: 13,
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function BrandContentStrategyPanel({
  tenantId,
  t,
  pyCtx,
  sector,
  onSaved,
}: {
  tenantId: string;
  t: T;
  pyCtx: Record<string, unknown> | undefined;
  sector: string;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const initialPillars = useMemo(
    () => parseStringOrArray(pyCtx?.content_pillars),
    [pyCtx?.content_pillars],
  );
  const initialCtas = useMemo(
    () => parseStringOrArray(pyCtx?.default_ctas),
    [pyCtx?.default_ctas],
  );

  const [pillars, setPillars] = useState<string[]>(initialPillars);
  const [ctas, setCtas] = useState<string[]>(initialCtas);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    setPillars(initialPillars);
    setCtas(initialCtas);
  }, [initialPillars, initialCtas]);

  const pillarSuggestions = useMemo(() => {
    const fromSlots = deriveContentNeedsFromSectorPack(sector);
    const fromAnalysis = initialPillars;
    return [...new Set([...fromSlots, ...fromAnalysis])] as CreativeIntent[];
  }, [sector, initialPillars]);

  const persist = useCallback(async (nextPillars: string[], nextCtas: string[]) => {
    if (!tenantId) return;
    setSaving(true);
    setStatus('');
    try {
      const res = await fetchTenantBff(`/api/brand-context-data/${tenantId}`, tenantId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content_pillars: JSON.stringify(nextPillars),
          default_ctas: JSON.stringify(nextCtas),
        }),
      });
      if (res.ok) {
        try {
          await mirrorPillarsToCompanyProfile(nextPillars);
          if (tenantId) {
            await afterPillarsMirroredToNexus(queryClient, tenantId);
          }
        } catch {
          /* Python SSOT saved; Nexus mirror is best-effort */
        }
        setStatus('İçerik stratejisi kaydedildi');
        onSaved?.();
      } else {
        setStatus('Kayıt başarısız');
      }
    } catch {
      setStatus('Bağlantı hatası');
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(''), 2500);
    }
  }, [tenantId, onSaved, queryClient]);

  const scheduleSave = useCallback((nextPillars: string[], nextCtas: string[]) => {
    void persist(nextPillars, nextCtas);
  }, [persist]);

  const onPillarsChange = (next: string[]) => {
    setPillars(next);
    scheduleSave(next, ctas);
  };

  const onCtasChange = (next: string[]) => {
    setCtas(next);
    scheduleSave(pillars, next);
  };

  const pillarOk = pillars.length >= BRS_MIN_CONTENT_PILLARS;
  const ctaOk = ctas.length >= 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: t.textMuted }}>
        Mission ve caption üretimi bu sütunlara ve CTA listesine göre yönlendirilir.
        Analiz sonrası öneriler otomatik gelir; buradan düzenleyebilirsiniz.
      </p>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <p style={{
            margin: 0,
            fontSize: 11,
            fontWeight: 700,
            color: t.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
          >
            İçerik sütunları
          </p>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: pillarOk ? t.success : t.warning,
          }}
          >
            {pillars.length} / {BRS_MIN_CONTENT_PILLARS} min
          </span>
        </div>
        <ChipEditor
          t={t}
          items={pillars}
          onChange={onPillarsChange}
          placeholder="Sütun ekle… (Enter)"
          suggestions={pillarSuggestions}
        />
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <p style={{
            margin: 0,
            fontSize: 11,
            fontWeight: 700,
            color: t.textMuted,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
          >
            Varsayılan CTA’lar
          </p>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: ctaOk ? t.success : t.warning,
          }}
          >
            {ctas.length} CTA
          </span>
        </div>
        <ChipEditor
          t={t}
          items={ctas}
          onChange={onCtasChange}
          placeholder='örn. Rezervasyon Yap, Keşfet… (Enter)'
          suggestions={[
            'Rezervasyon Yap',
            'Keşfet',
            'Hemen İncele',
            'Randevu Al',
            'Sipariş Ver',
            'Detaylar',
            ...initialCtas,
          ]}
          maxSuggestions={6}
        />
      </div>

      {(saving || status) && (
        <p style={{ margin: 0, fontSize: 12, color: saving ? t.textMuted : t.success }}>
          {saving ? 'Kaydediliyor…' : status}
        </p>
      )}
    </div>
  );
}
