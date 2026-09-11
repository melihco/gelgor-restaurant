'use client';
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { apiClient } from '@/lib/api-client';
import { MobileStackHeader } from '../ui-primitives';
import { BoostPostSheet } from '../BoostPostSheet';
import type { T } from '../theme-context';
import type { MetaCampaign } from '@/types/meta-ads.types';
import type { OutputArtifact } from '@/types';
import { formatMetaCampaignStatus } from '@/lib/mobile-customer-copy';
import { parseArtifactContent } from '@/lib/artifact-utils';
import { resolveClientMediaUrl } from '@/lib/media-url';
import {
  adChannelFromArtifact,
  adCreativeCopy,
  adPlatformAccent,
  adPlatformLabel,
  adPlatformShortLabel,
  filterPaidAdCreatives,
  type AdCreativePlatformFilter,
  type AdPublishChannel,
} from '@/lib/ad-publish-utils';
import { resolveMobileGrowthGates } from '@/lib/mobile-integration-status';

const OBJ_LABEL: Record<string, string> = {
  OUTCOME_AWARENESS: 'Erişim', OUTCOME_ENGAGEMENT: 'Etkileşim', OUTCOME_TRAFFIC: 'Trafik',
};

const PLATFORM_TABS: { id: AdCreativePlatformFilter; label: string }[] = [
  { id: 'all', label: 'Tümü' },
  { id: 'meta_ads', label: 'Meta' },
  { id: 'google_ads', label: 'Google' },
];

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function adImageUrl(artifact: OutputArtifact): string | null {
  const content = parseArtifactContent(artifact.content);
  return resolveClientMediaUrl(
    String(artifact.contentUrl || content.imageUrl || ''),
  );
}

/** Derive performance insights from real Meta campaign data. */
function buildInsights(campaigns: MetaCampaign[]): { text: string; color: string }[] {
  const insights: { text: string; color: string }[] = [];
  const active = campaigns.filter(c => c.status === 'ACTIVE');
  const highSpendNoReach = active.filter(c => c.spendTl > 100 && c.actualReach < 100);
  highSpendNoReach.forEach(c => {
    insights.push({ color: '#fb7185', text: `"${c.objective ? (OBJ_LABEL[c.objective] ?? c.objective) : 'Kampanya'}" yüksek harcama (₺${c.spendTl}) ancak düşük gerçek erişim (${c.actualReach}) — hedeflemeyi kontrol edin.` });
  });
  const highReach = active.filter(c => c.actualReach > 1000);
  highReach.forEach(c => {
    insights.push({ color: '#34d399', text: `Aktif kampanya ${c.actualReach.toLocaleString('tr-TR')} kişiye ulaştı — benzer hedef kitle genişletilebilir.` });
  });
  if (insights.length === 0 && campaigns.length > 0) {
    insights.push({ color: '#94a3b8', text: 'Kampanyalar takip ediliyor. Daha fazla veri toplandıkça AI önerileri burada görünecek.' });
  }
  return insights;
}

function MetaCampaignCard({ campaign, onActivate, isActivating }: {
  campaign: MetaCampaign; onActivate: () => void; isActivating: boolean;
}) {
  const { t } = useTheme();
  const isPaused    = campaign.status === 'PAUSED';
  const isActive    = campaign.status === 'ACTIVE';
  const statusLabel = formatMetaCampaignStatus(campaign.status);
  const statusColor = isActive ? '#10B981' : isPaused ? '#F59E0B' : '#94A3B8';

  return (
    <div style={{ padding: '14px 16px', borderRadius: 16, marginBottom: 8,
      background: t.isDark ? 'rgba(255,255,255,0.04)' : '#fff',
      border: `0.5px solid ${t.separator}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, padding: '2px 9px', borderRadius: 20, fontWeight: 700,
            background: `${statusColor}14`, color: statusColor }}>
            {statusLabel}
          </span>
          <span style={{ fontSize: 11, color: t.textMuted }}>
            {OBJ_LABEL[campaign.objective] ?? campaign.objective}
          </span>
        </div>
        <span style={{ fontSize: 11, color: t.textMuted }}>
          {campaign.budgetTl}₺ / {campaign.durationDays} gün
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: isPaused ? 12 : 0 }}>
        {[
          { label: 'Erişim',       value: campaign.actualReach > 0 ? campaign.actualReach.toLocaleString('tr-TR') : `~${campaign.estimatedReach.toLocaleString('tr-TR')}` },
          { label: 'Etkileşim',   value: campaign.impressions.toLocaleString('tr-TR') },
          { label: 'Tıklama',     value: campaign.clicks.toLocaleString('tr-TR') },
          { label: 'Harcama',     value: `${campaign.spendTl.toFixed(2)}₺` },
        ].map(m => (
          <div key={m.label}>
            <div style={{ fontSize: 9, color: t.labelColor, marginBottom: 2 }}>{m.label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: t.textSecondary,
              fontVariantNumeric: 'tabular-nums' }}>{m.value}</div>
          </div>
        ))}
      </div>

      {isPaused && (
        <button type="button" onClick={onActivate} disabled={isActivating} style={{
          width: '100%', minHeight: 44, padding: '10px', borderRadius: 12, border: 'none', cursor: isActivating ? 'default' : 'pointer',
          background: isActivating ? 'rgba(16,185,129,0.06)' : 'rgba(16,185,129,0.12)',
          color: '#10B981', fontSize: 12, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          {isActivating
            ? <><div style={{ width: 11, height: 11, borderRadius: '50%',
                border: '1.5px solid rgba(16,185,129,0.3)', borderTop: '1.5px solid #10B981',
                animation: 'spinSlow 0.8s linear infinite' }} />Aktive ediliyor…</>
            : 'Aktive Et — Yayınlamaya Başla'
          }
        </button>
      )}
    </div>
  );
}

function AdCreativeCard({
  artifact,
  t,
  onSend,
}: {
  artifact: OutputArtifact;
  t: T;
  onSend: (artifact: OutputArtifact, channel: AdPublishChannel) => void;
}) {
  const channel = adChannelFromArtifact(artifact) ?? 'meta_ads';
  const accent = adPlatformAccent(channel);
  const { headline, primaryText } = adCreativeCopy(artifact);
  const image = adImageUrl(artifact);

  return (
    <article style={{
      ...t.surfaceCard,
      overflow: 'hidden',
      marginBottom: 10,
      padding: 0,
    }}>
      <div style={{ display: 'flex', gap: 12, padding: 12, alignItems: 'stretch' }}>
        <div style={{
          width: 88, height: 88, borderRadius: 12, flexShrink: 0, overflow: 'hidden',
          background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
        }}>
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, color: t.textMuted }}>Görsel</div>
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{
            alignSelf: 'flex-start',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
            padding: '3px 8px', borderRadius: 20,
            background: `${accent}14`, color: accent,
            border: `0.5px solid ${accent}33`,
          }}>
            {adPlatformLabel(channel)}
          </span>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary, lineHeight: 1.3 }}>
            {headline || 'Reklam başlığı'}
          </div>
          {primaryText ? (
            <div style={{
              fontSize: 12, color: t.textSecondary, lineHeight: 1.45,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {primaryText}
            </div>
          ) : null}
        </div>
      </div>
      <div style={{ padding: '0 12px 12px' }}>
        <button
          type="button"
          onClick={() => onSend(artifact, channel)}
          style={{
            width: '100%', minHeight: 44, borderRadius: 12, border: `0.5px solid ${accent}40`,
            background: `${accent}12`, color: accent, fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}
        >
          {adPlatformShortLabel(channel)} Ads&apos;e gönder
        </button>
      </div>
    </article>
  );
}

export function AdsOverview() {
  const { t } = useTheme();
  const { goBack, navigate } = useMobileStore();
  const { tenantId } = useWorkspaceStore();
  const queryClient = useQueryClient();
  const [platform, setPlatform] = useState<AdCreativePlatformFilter>('all');
  const [boostArtifact, setBoostArtifact] = useState<OutputArtifact | null>(null);

  const { data: metaCampaigns = [], isLoading: loadingMeta } = useQuery({
    queryKey: ['meta-campaigns', tenantId],
    queryFn: () => apiClient.getMetaCampaigns(tenantId!),
    staleTime: 2 * 60_000,
    enabled: Boolean(tenantId),
  });

  const { data: adArtifacts = [], isLoading: loadingCreatives } = useQuery({
    queryKey: ['artifacts', 'ad-creatives', tenantId],
    queryFn: () => apiClient.getArtifacts(
      { includeDerivedAds: true, limit: 80 },
      tenantId ?? undefined,
    ),
    staleTime: 30_000,
    enabled: Boolean(tenantId),
  });

  const { data: integrations = [] } = useQuery({
    queryKey: ['integrations', tenantId],
    queryFn: () => apiClient.getIntegrations(),
    staleTime: 60_000,
    enabled: Boolean(tenantId),
  });

  const { data: mertcafeStatus } = useQuery({
    queryKey: ['mertcafe-status', tenantId],
    queryFn: () => apiClient.getMertcafeStatus(tenantId!),
    staleTime: 20_000,
    enabled: Boolean(tenantId),
  });

  const gates = useMemo(
    () => resolveMobileGrowthGates(integrations, mertcafeStatus),
    [integrations, mertcafeStatus],
  );

  const creatives = useMemo(
    () => filterPaidAdCreatives(adArtifacts, platform),
    [adArtifacts, platform],
  );

  const activateMutation = useMutation({
    mutationFn: (campaignId: string) => apiClient.activateCampaign(tenantId!, campaignId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meta-campaigns', tenantId] }),
  });

  const approveGoogleMutation = useMutation({
    mutationFn: (id: string) => apiClient.approveArtifact(id, 'approved_for_platform'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['artifacts', 'ad-creatives', tenantId] }),
  });

  const showMetaCampaigns = platform !== 'google_ads';
  const showGoogleCampaigns = platform !== 'meta_ads';

  const totalSpend     = metaCampaigns.reduce((s, c) => s + (c.spendTl ?? 0), 0);
  const totalClicks    = metaCampaigns.reduce((s, c) => s + (c.clicks ?? 0), 0);
  const totalReach     = metaCampaigns.reduce((s, c) => s + (c.actualReach ?? 0), 0);
  const totalImpr      = metaCampaigns.reduce((s, c) => s + (c.impressions ?? 0), 0);
  const activeCount    = metaCampaigns.filter(c => c.status === 'ACTIVE').length;
  const hasData        = metaCampaigns.length > 0;
  const insights = showMetaCampaigns ? buildInsights(metaCampaigns) : [];

  const emptyLabel = platform === 'google_ads'
    ? 'Google'
    : platform === 'meta_ads'
      ? 'Meta'
      : 'Meta veya Google';

  const handleSend = (artifact: OutputArtifact, channel: AdPublishChannel) => {
    if (channel === 'meta_ads') {
      if (!gates.metaConnected) {
        navigate('settings');
        return;
      }
      setBoostArtifact(artifact);
      return;
    }
    if (!gates.googleAdsConnected) {
      navigate('settings');
      return;
    }
    approveGoogleMutation.mutate(artifact.id);
  };

  return (
    <div className="sa-stack-screen mobile-tab-scroll" style={{ minHeight: '100dvh', background: t.bg, paddingBottom: 100, transition: 'background 300ms' }}>
      <MobileStackHeader t={t} title="Reklamlar" onBack={goBack} />

      <div style={{ padding: '16px 24px 0' }}>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: t.textSecondary }}>
          Haftalık üretimden Meta ve Google kopyaları. Akış’ta görünmez; gönderim buradan.
        </p>
      </div>

      <div style={{
        display: 'flex', gap: 8, padding: '16px 24px 0',
      }}>
        {PLATFORM_TABS.map((tab) => {
          const active = platform === tab.id;
          const color = tab.id === 'google_ads' ? '#4285F4'
            : tab.id === 'meta_ads' ? '#1877F2'
            : t.textPrimary;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPlatform(tab.id)}
              style={{
                flex: 1, minHeight: 44, borderRadius: 12, cursor: 'pointer',
                background: active ? `${color}14` : (t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
                border: `0.5px solid ${active ? `${color}40` : t.separator}`,
                color: active ? color : t.textMuted,
                fontSize: 13, fontWeight: active ? 800 : 600,
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div style={{ padding: '20px 24px 0' }}>
        <SectionLabel t={t} text="Hazır kreatifler" />
        {loadingCreatives ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${t.separator}`, borderTop: `2px solid ${t.accent}`, animation: 'spinSlow 1s linear infinite' }} />
          </div>
        ) : creatives.length === 0 ? (
          <div style={{
            padding: '22px 16px', borderRadius: 16, textAlign: 'center',
            background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            border: `0.5px solid ${t.separator}`,
          }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary, margin: '0 0 8px' }}>
              {emptyLabel} kreatifi yok
            </p>
            <p style={{ fontSize: 13, color: t.textMuted, margin: 0, lineHeight: 1.55 }}>
              Haftalık üretimden sonra aynı kart düzeninde burada durur.
            </p>
          </div>
        ) : (
          creatives.map((artifact) => (
            <AdCreativeCard
              key={artifact.id}
              artifact={artifact}
              t={t}
              onSend={handleSend}
            />
          ))
        )}
      </div>

      {showMetaCampaigns && hasData && (
        <div style={{ padding: '20px 24px 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Toplam Harcama', value: `₺${totalSpend.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`, color: t.textPrimary, sub: 'Canlı Meta' },
              { label: 'Tıklama',        value: fmt(totalClicks),  color: t.info,    sub: 'Toplam'   },
              { label: 'Gerçek Erişim',  value: fmt(totalReach),   color: t.success, sub: 'Kişi'     },
              { label: 'Aktif Kampanya', value: String(activeCount), color: t.accent,  sub: `/ ${metaCampaigns.length} toplam` },
            ].map((s) => (
              <div key={s.label} style={{ ...t.surfaceCard, padding: '16px' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color, lineHeight: 1, marginBottom: 4, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: t.textPrimary, marginBottom: 2 }}>{s.label}</div>
                <div style={{ fontSize: 10, color: t.textMuted }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {insights.length > 0 && (
        <div style={{ padding: '24px 24px 0' }}>
          <SectionLabel t={t} text="AI Önerileri" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {insights.map((rec, i) => (
              <div key={i} style={{
                padding: '14px 16px', borderRadius: 14,
                background: t.isDark ? `${rec.color}07` : `${rec.color}06`,
                border: `0.5px solid ${rec.color}22`,
                display: 'flex', gap: 10, alignItems: 'flex-start',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: rec.color, flexShrink: 0, marginTop: 4 }} />
                <p style={{ fontSize: 13, color: t.textSecondary, lineHeight: 1.55, margin: 0 }}>{rec.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {showMetaCampaigns && (
        <div style={{ padding: '24px 24px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <SectionLabel t={t} text="Canlı Meta kampanyaları" />
            {loadingMeta && (
              <div style={{ width: 14, height: 14, borderRadius: '50%',
                border: `2px solid ${t.separator}`, borderTop: `2px solid ${t.accent}`,
                animation: 'spinSlow 1s linear infinite' }} />
            )}
          </div>

          {!loadingMeta && metaCampaigns.length === 0 && (
            <div style={{ padding: '22px 16px', borderRadius: 16, textAlign: 'center',
              background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              border: `0.5px solid ${t.separator}` }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary, margin: '0 0 8px' }}>
                Canlı kampanya yok
              </p>
              <p style={{ fontSize: 13, color: t.textMuted, margin: '0 0 16px', lineHeight: 1.6 }}>
                Kreatifi yukarıdan seçip Meta hesabınız bağlıysa yayınlayabilirsiniz.
              </p>
              <button
                type="button"
                onClick={() => navigate('settings')}
                style={{
                  minHeight: 44, padding: '10px 18px', borderRadius: 20, border: 'none', cursor: 'pointer',
                  background: t.accent, color: '#fff', fontSize: 13, fontWeight: 700,
                }}
              >
                Entegrasyonları Bağla
              </button>
            </div>
          )}

          {metaCampaigns.map(camp => (
            <MetaCampaignCard
              key={camp.id}
              campaign={camp}
              onActivate={() => activateMutation.mutate(camp.campaignId)}
              isActivating={activateMutation.isPending && (activateMutation.variables === camp.campaignId)}
            />
          ))}
        </div>
      )}

      {showGoogleCampaigns && (
        <div style={{ padding: '24px 24px 0' }}>
          <SectionLabel t={t} text="Canlı Google kampanyaları" />
          <div style={{ padding: '20px 16px', borderRadius: 14, textAlign: 'center',
            background: t.isDark ? 'rgba(66,133,244,0.06)' : 'rgba(66,133,244,0.05)',
            border: '0.5px solid rgba(66,133,244,0.2)' }}>
            <p style={{ fontSize: 13, color: t.textMuted, margin: 0, lineHeight: 1.6 }}>
              Google kreatifleri yukarıda hazır. Canlı kampanya takibi yakında.
            </p>
          </div>
        </div>
      )}

      {showMetaCampaigns && hasData && totalImpr > 0 && (
        <div style={{ padding: '24px 24px 0' }}>
          <div style={{ padding: '14px 18px', borderRadius: 14,
            background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            border: `0.5px solid ${t.separator}` }}>
            <span style={{ fontSize: 12, color: t.textMuted }}>Toplam gösterim </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: t.textSecondary, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalImpr)}</span>
          </div>
        </div>
      )}

      {boostArtifact && (
        <BoostPostSheet
          isOpen
          artifactId={boostArtifact.id}
          workspaceId={tenantId ?? undefined}
          caption={String(parseArtifactContent(boostArtifact.content).caption ?? '') || undefined}
          imageUrl={adImageUrl(boostArtifact) ?? undefined}
          onClose={() => setBoostArtifact(null)}
        />
      )}
    </div>
  );
}

function SectionLabel({ t, text }: { t: T; text: string }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: t.labelColor, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>{text}</div>;
}
