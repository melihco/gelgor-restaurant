'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { MertcafeAccountSwitcher } from './MertcafeAccountSwitcher';
import type { T } from './theme-context';
import type { ReactNode } from 'react';

type SCardProps = {
  t: T;
  title: string;
  accent?: string;
  children: ReactNode;
};

function SCard({ t, title, accent, children }: SCardProps) {
  return (
    <div style={{
      borderRadius: 18, padding: '16px 16px 14px', marginBottom: 14,
      background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
      border: `0.5px solid ${accent ? `${accent}33` : t.separator}`,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
        color: accent ?? t.labelColor, marginBottom: 12 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600,
      padding: '6px 10px', borderRadius: 999,
      background: ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)',
      color: ok ? '#4ade80' : '#f87171',
      border: `0.5px solid ${ok ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.2)'}`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: ok ? '#22c55e' : '#ef4444' }} />
      {label}
    </span>
  );
}

export function MertcafeIntegrationsCard({
  t,
  workspaceId,
  brandName,
  businessMenu,
  businessHours,
  businessAddress,
  businessPhone,
  saveThemePatch,
}: {
  t: T;
  workspaceId: string;
  brandName: string;
  businessMenu?: string;
  businessHours?: string;
  businessAddress?: string;
  businessPhone?: string;
  saveThemePatch: (patch: Record<string, unknown>) => Promise<void>;
  themeAccountId?: string;
}) {
  const [adsAccountId, setAdsAccountId] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ['mertcafe-status', workspaceId],
    queryFn: () => apiClient.getMertcafeStatus(workspaceId),
    staleTime: 15_000,
  });

  const connectAdsMutation = useMutation({
    mutationFn: () => apiClient.connectMertcafeMetaAds({ adsAccountId: adsAccountId.trim(), workspaceId }),
    onSuccess: async () => {
      setMessage('Meta Ads hesabı bağlandı');
      await refetch();
    },
    onError: (e: unknown) => {
      setMessage(e instanceof Error ? e.message : 'Meta Ads bağlanamadı');
    },
  });

  const setupMutation = useMutation({
    mutationFn: () => apiClient.syncMertcafeBusinessSetup({
      workspaceId,
      businessName: brandName || 'İşletme',
      menu: businessMenu || 'Menü bilgisi — Ayarlar\'dan güncelleyin',
      hours: businessHours || '09:00 - 22:00',
      address: businessAddress,
      phone: businessPhone,
      notes: 'SmartAgency marka senkronu',
    }),
    onSuccess: () => setMessage('İşletme bilgileri Mertcafe\'e kaydedildi'),
    onError: (e: unknown) => {
      setMessage(e instanceof Error ? e.message : 'Setup başarısız');
    },
  });

  const adsOk = Boolean(status?.meta_ads_connected);

  return (
    <>
      <MertcafeAccountSwitcher
        t={t}
        workspaceId={workspaceId}
        saveThemePatch={saveThemePatch}
      />

      <SCard t={t} title="Meta Ads & İşletme" accent="#818cf8">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <StatusPill
            ok={Boolean(status?.instagram_connected)}
            label={isLoading ? 'Instagram…' : status?.instagram_connected ? 'OAuth bağlı' : 'OAuth yok'}
          />
          <StatusPill ok={adsOk} label={adsOk ? 'Meta Ads bağlı' : 'Meta Ads yok'} />
        </div>

        <div style={{ marginTop: 4 }}>
          <label style={{ fontSize: 11, color: t.labelColor, display: 'block', marginBottom: 6 }}>
            Meta Ads hesap ID (act_…)
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={adsAccountId}
              onChange={(e) => setAdsAccountId(e.target.value)}
              placeholder="act_1234567890"
              style={{
                flex: 1, padding: '10px 12px', borderRadius: 10, fontSize: 13,
                background: t.isDark ? 'rgba(0,0,0,0.25)' : '#fff',
                border: `0.5px solid ${t.separator}`, color: t.textPrimary,
              }}
            />
            <button
              type="button"
              disabled={!adsAccountId.trim().startsWith('act_') || connectAdsMutation.isPending}
              onClick={() => connectAdsMutation.mutate()}
              style={{
                padding: '10px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                color: t.textPrimary, fontSize: 12, fontWeight: 600,
              }}
            >
              Bağla
            </button>
          </div>
        </div>

        <button
          type="button"
          disabled={setupMutation.isPending || !brandName.trim()}
          onClick={() => setupMutation.mutate()}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 12, cursor: 'pointer', marginTop: 12,
            background: 'transparent', border: `0.5px solid ${t.separator}`,
            color: t.textTertiary, fontSize: 12,
          }}
        >
          {setupMutation.isPending ? 'Senkronize ediliyor…' : 'İşletme bilgilerini Mertcafe\'e gönder'}
        </button>

        {message && (
          <p style={{ fontSize: 12, color: t.accent, marginTop: 12, lineHeight: 1.5 }}>{message}</p>
        )}
      </SCard>
    </>
  );
}
