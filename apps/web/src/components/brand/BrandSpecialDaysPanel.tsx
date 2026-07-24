'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { T } from '@/app/mobile/_components/theme-context';
import { fetchTenantBff } from '@/lib/bff-fetch';

interface SpecialDayRow {
  name: string;
  name_en?: string | null;
  category: string;
  theme_hint: string;
  month: number;
  day: number;
  mmdd: string;
  importance: number;
  days_until: number;
  country_code: string;
}

interface SpecialDaysResponse {
  country_code: string;
  sector: string;
  days: SpecialDayRow[];
}

const CATEGORY_LABELS: Record<string, string> = {
  celebration: 'Kutlama',
  romantic: 'Romantik',
  religious: 'Dini',
  seasonal: 'Mevsimsel',
  sector: 'Sektör günü',
};

function formatDaysUntil(days: number): string {
  if (days === 0) return 'Bugün';
  if (days === 1) return 'Yarın';
  if (days < 7) return `${days} gün sonra`;
  if (days < 30) return `${Math.round(days / 7)} hafta sonra`;
  return `${days} gün sonra`;
}

function importanceDots(importance: number, t: T): React.ReactNode {
  const max = 5;
  return (
    <span style={{ display: 'inline-flex', gap: 3 }} title={`Önem: ${importance}/5`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: i < importance ? t.accent : t.separator,
            opacity: i < importance ? 1 : 0.35,
          }}
        />
      ))}
    </span>
  );
}

export function BrandSpecialDaysPanel({
  tenantId,
  t,
}: {
  tenantId: string;
  t: T;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['brand-special-days', tenantId],
    queryFn: async (): Promise<SpecialDaysResponse> => {
      const res = await fetchTenantBff(
        `/api/brand-context/${tenantId}/special-days?within_days=120&limit=24`,
        tenantId,
      );
      if (!res.ok) throw new Error('special-days fetch failed');
      return res.json() as Promise<SpecialDaysResponse>;
    },
    enabled: Boolean(tenantId),
    staleTime: 60_000 * 30,
  });

  const days = data?.days ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {isLoading && (
        <p style={{ fontSize: 12, color: t.textMuted, margin: 0 }}>Yükleniyor…</p>
      )}

      {isError && (
        <p style={{ fontSize: 12, color: t.warning, margin: 0 }}>
          Özel günler yüklenemedi.
        </p>
      )}

      {!isLoading && !isError && days.length === 0 && (
        <p style={{ fontSize: 12, color: t.textMuted, margin: 0 }}>
          Önümüzdeki 120 günde kayıtlı özel gün yok.
        </p>
      )}

      <div className="sa-menu-index" style={{ borderRadius: 16, overflow: 'hidden' }}>
        {days.map((day, idx) => {
          const categoryLabel = CATEGORY_LABELS[day.category] ?? day.category;
          const dateLabel = `${day.day}.${day.month}`;
          return (
            <div
              key={`${day.country_code}-${day.mmdd}-${day.name}`}
              className="sa-menu-index__slot"
              style={{
                padding: '12px 14px',
                borderTop: idx === 0 ? 'none' : undefined,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.02em' }}>
                      {day.name}
                    </span>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: 'rgba(138,171,189,0.14)',
                      color: '#9DBECE',
                      letterSpacing: '0.04em',
                    }}
                    >
                      {categoryLabel}
                    </span>
                  </div>
                  <p style={{ margin: '5px 0 0', fontSize: 12, color: t.textMuted, lineHeight: 1.4 }}>
                    {day.theme_hint}
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#C8A86A' }}>
                    {formatDaysUntil(day.days_until)}
                  </div>
                  <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>
                    {dateLabel}
                  </div>
                  <div style={{ marginTop: 6 }}>{importanceDots(day.importance, t)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
