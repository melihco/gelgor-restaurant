'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { apiClient } from '@/lib/api-client';
import { IcoBack } from '../Icons';
import type { T } from '../theme-context';
import type { MetaCampaign } from '@/types/meta-ads.types';

const OBJ_LABEL: Record<string, string> = {
  OUTCOME_AWARENESS: 'Erişim', OUTCOME_ENGAGEMENT: 'Etkileşim', OUTCOME_TRAFFIC: 'Trafik',
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
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
  const statusColor = isActive ? '#10B981' : isPaused ? '#F59E0B' : '#94A3B8';

  return (
    <div style={{ padding: '14px 16px', borderRadius: 16, marginBottom: 8,
      background: t.isDark ? 'rgba(255,255,255,0.04)' : '#fff',
      border: `0.5px solid ${t.separator}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, padding: '2px 9px', borderRadius: 20, fontWeight: 700,
            background: `${statusColor}14`, color: statusColor }}>
            {isActive ? 'Aktif' : isPaused ? 'Duraklatıldı' : campaign.status}
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
        <button onClick={onActivate} disabled={isActivating} style={{
          width: '100%', padding: '10px', borderRadius: 12, border: 'none', cursor: isActivating ? 'default' : 'pointer',
          background: isActivating ? 'rgba(16,185,129,0.06)' : 'rgba(16,185,129,0.12)',
          color: '#10B981', fontSize: 12, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          {isActivating
            ? <><div style={{ width: 11, height: 11, borderRadius: '50%',
                border: '1.5px solid rgba(16,185,129,0.3)', borderTop: '1.5px solid #10B981',
                animation: 'spinSlow 0.8s linear infinite' }} />Aktive ediliyor…</>
            : '▶ Aktive Et — Yayınlamaya Başla'
          }
        </button>
      )}
    </div>
  );
}

export function AdsOverview() {
  const { t } = useTheme();
  const { goBack, navigate } = useMobileStore();
  const { tenantId } = useWorkspaceStore();
  const queryClient = useQueryClient();

  const { data: metaCampaigns = [], isLoading: loadingMeta } = useQuery({
    queryKey: ['meta-campaigns', tenantId],
    queryFn: () => apiClient.getMetaCampaigns(tenantId),
    staleTime: 2 * 60_000,
    enabled: Boolean(tenantId),
  });

  const activateMutation = useMutation({
    mutationFn: (campaignId: string) => apiClient.activateCampaign(tenantId, campaignId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meta-campaigns', tenantId] }),
  });

  // Aggregate KPIs from real campaign data
  const totalSpend     = metaCampaigns.reduce((s, c) => s + (c.spendTl ?? 0), 0);
  const totalClicks    = metaCampaigns.reduce((s, c) => s + (c.clicks ?? 0), 0);
  const totalReach     = metaCampaigns.reduce((s, c) => s + (c.actualReach ?? 0), 0);
  const totalImpr      = metaCampaigns.reduce((s, c) => s + (c.impressions ?? 0), 0);
  const activeCount    = metaCampaigns.filter(c => c.status === 'ACTIVE').length;
  const hasData        = metaCampaigns.length > 0;

  const insights = buildInsights(metaCampaigns);

  return (
    <div style={{ minHeight: '100dvh', background: t.bg, paddingBottom: 100, transition: 'background 300ms' }}>
      {/* Header */}
      <div style={{ padding: '56px 24px 20px', borderBottom: `0.5px solid ${t.separator}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={goBack} style={{ ...t.backBtn, width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <IcoBack color={t.textSecondary} />
          </button>
          <div>
            <p style={{ fontSize: 11, color: t.labelColor, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>Meta Ads</p>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.025em' }}>Reklam Performansı</h1>
          </div>
        </div>
      </div>

      {/* Summary KPIs — derived from real Meta campaign data */}
      <div style={{ padding: '20px 24px 0' }}>
        {loadingMeta ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${t.separator}`, borderTop: `2px solid ${t.accent}`, animation: 'spinSlow 1s linear infinite' }} />
          </div>
        ) : hasData ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Toplam Harcama', value: `₺${totalSpend.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`, color: t.textPrimary, sub: 'Tüm kampanyalar' },
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
        ) : null}
      </div>

      {/* AI Insights — generated from real data */}
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

      {/* Meta Campaigns */}
      <div style={{ padding: '24px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <SectionLabel t={t} text="Meta Reklamları" />
          {loadingMeta && (
            <div style={{ width: 14, height: 14, borderRadius: '50%',
              border: `2px solid ${t.separator}`, borderTop: `2px solid ${t.accent}`,
              animation: 'spinSlow 1s linear infinite' }} />
          )}
        </div>

        {!loadingMeta && metaCampaigns.length === 0 && (
          <div style={{ padding: '28px 20px', borderRadius: 16, textAlign: 'center',
            background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            border: `0.5px solid ${t.separator}` }}>
            <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.25 }}>📣</div>
            <p style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary, margin: '0 0 8px' }}>
              Henüz reklam kampanyası yok
            </p>
            <p style={{ fontSize: 13, color: t.textMuted, margin: '0 0 18px', lineHeight: 1.6 }}>
              İçerikleri onayladıktan sonra Instagram üzerinden reklam başlatabilirsiniz.
              Meta hesabınızı bağlamak için entegrasyonları kontrol edin.
            </p>
            <button
              type="button"
              onClick={() => navigate('settings')}
              style={{
                padding: '10px 18px', borderRadius: 20, border: 'none', cursor: 'pointer',
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

      {/* Google Ads — not yet integrated */}
      <div style={{ padding: '24px 24px 0' }}>
        <SectionLabel t={t} text="Google Ads" />
        <div style={{ padding: '20px 16px', borderRadius: 14, textAlign: 'center',
          background: t.isDark ? 'rgba(66,133,244,0.06)' : 'rgba(66,133,244,0.05)',
          border: `0.5px solid rgba(66,133,244,0.2)` }}>
          <p style={{ fontSize: 13, color: t.textMuted, margin: 0, lineHeight: 1.6 }}>
            Google Ads entegrasyonu yakında geliyor.
            <br />Şu an Meta Ads üzerinden kampanya başlatabilirsiniz.
          </p>
        </div>
      </div>

      {/* Impression aggregate (secondary metric) */}
      {hasData && totalImpr > 0 && (
        <div style={{ padding: '24px 24px 0' }}>
          <div style={{ padding: '14px 18px', borderRadius: 14,
            background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            border: `0.5px solid ${t.separator}` }}>
            <span style={{ fontSize: 12, color: t.textMuted }}>Toplam gösterim </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: t.textSecondary, fontVariantNumeric: 'tabular-nums' }}>{fmt(totalImpr)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ t, text }: { t: T; text: string }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: t.labelColor, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>{text}</div>;
}
