'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { IcoBack, IcoRetry } from '../Icons';
import { apiClient } from '@/lib/api-client';
import { isMobileOperatorMode } from '../mobile-client-config';
import type { T } from '../theme-context';

type Range = '7daysAgo' | '30daysAgo' | '90daysAgo';

const RANGES: { id: Range; label: string }[] = [
  { id: '7daysAgo',  label: '7g'  },
  { id: '30daysAgo', label: '30g' },
  { id: '90daysAgo', label: '90g' },
];

// Fallback mock when API is not connected
const MOCK: Record<Range, {
  totalUsers: number; newUsers: number; sessions: number; bounceRate: number;
  avgDuration: string; pageviews: number;
  sources: { label: string; value: number; color: string }[];
  topPages: { path: string; views: number }[];
  queries: { query: string; clicks: number; position: number }[];
}> = {
  '7daysAgo': {
    totalUsers: 1840, newUsers: 1240, sessions: 2310, bounceRate: 0.42, avgDuration: '2m 14s', pageviews: 6120,
    sources: [
      { label: 'Organik Arama', value: 44, color: '#34d399' },
      { label: 'Direkt',        value: 28, color: '#60a5fa' },
      { label: 'Sosyal Medya',  value: 18, color: '#f472b6' },
      { label: 'Ücretli',       value: 10, color: '#f59e0b' },
    ],
    topPages: [
      { path: '/urunler/antep-fistikli-lokum', views: 1840 },
      { path: '/hediye-kutulari',              views: 1210 },
      { path: '/',                             views: 980  },
      { path: '/koleksiyon/yaz-2025',          views: 720  },
      { path: '/kurumsal-hediye',              views: 430  },
    ],
    queries: [
      { query: 'bodrum lokum',           clicks: 340, position: 2.1 },
      { query: 'türk lokumu hediye',     clicks: 210, position: 4.3 },
      { query: 'antep fıstıklı lokum',   clicks: 180, position: 1.8 },
      { query: 'premium lokum sipariş',  clicks: 95,  position: 6.7 },
    ],
  },
  '30daysAgo': {
    totalUsers: 7210, newUsers: 4840, sessions: 9420, bounceRate: 0.39, avgDuration: '2m 31s', pageviews: 24600,
    sources: [
      { label: 'Organik Arama', value: 48, color: '#34d399' },
      { label: 'Direkt',        value: 25, color: '#60a5fa' },
      { label: 'Sosyal Medya',  value: 16, color: '#f472b6' },
      { label: 'Ücretli',       value: 11, color: '#f59e0b' },
    ],
    topPages: [
      { path: '/urunler/antep-fistikli-lokum', views: 7200 },
      { path: '/hediye-kutulari',              views: 4800 },
      { path: '/',                             views: 3900 },
      { path: '/koleksiyon/yaz-2025',          views: 2900 },
      { path: '/kurumsal-hediye',              views: 1800 },
    ],
    queries: [
      { query: 'bodrum lokum',           clicks: 1340, position: 2.1 },
      { query: 'türk lokumu hediye',     clicks: 820,  position: 3.9 },
      { query: 'antep fıstıklı lokum',   clicks: 710,  position: 1.8 },
      { query: 'premium lokum sipariş',  clicks: 390,  position: 6.2 },
    ],
  },
  '90daysAgo': {
    totalUsers: 19800, newUsers: 13200, sessions: 27400, bounceRate: 0.37, avgDuration: '2m 48s', pageviews: 71000,
    sources: [
      { label: 'Organik Arama', value: 51, color: '#34d399' },
      { label: 'Direkt',        value: 23, color: '#60a5fa' },
      { label: 'Sosyal Medya',  value: 15, color: '#f472b6' },
      { label: 'Ücretli',       value: 11, color: '#f59e0b' },
    ],
    topPages: [
      { path: '/urunler/antep-fistikli-lokum', views: 21000 },
      { path: '/hediye-kutulari',              views: 14000 },
      { path: '/',                             views: 11400 },
      { path: '/koleksiyon/yaz-2025',          views: 8400  },
      { path: '/kurumsal-hediye',              views: 5200  },
    ],
    queries: [
      { query: 'bodrum lokum',           clicks: 3900, position: 2.0 },
      { query: 'türk lokumu hediye',     clicks: 2400, position: 3.6 },
      { query: 'antep fıstıklı lokum',   clicks: 2100, position: 1.7 },
      { query: 'premium lokum sipariş',  clicks: 1100, position: 5.9 },
    ],
  },
};

export function VisitorsScreen() {
  const { t } = useTheme();
  const { goBack, navigate } = useMobileStore();
  const [range, setRange] = useState<Range>('30daysAgo');
  const operatorMode = isMobileOperatorMode();

  const { data: apiData, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics-dashboard', range],
    queryFn: async () => {
      try { return await apiClient.getAnalyticsDashboard(range); } catch { return null; }
    },
    staleTime: 60_000,
  });

  const hasRealData = Boolean(apiData?.overview?.totalUsers);

  // Müşteri modunda mock gösterme — gerçek Analytics verisi yoksa boş state
  if (!isLoading && !hasRealData && !operatorMode) {
    return (
      <div style={{ minHeight: '100dvh', background: t.bg, paddingBottom: 100 }}>
        <div style={{ padding: '56px 24px 20px', borderBottom: `0.5px solid ${t.separator}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={goBack} style={{ ...t.backBtn, width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <IcoBack color={t.textSecondary} />
            </button>
            <div>
              <p style={{ fontSize: 11, color: t.labelColor, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>Google Analytics</p>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.02em' }}>Web Trafiği</h1>
            </div>
          </div>
        </div>
        <div style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.2 }}>📊</div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: t.textPrimary, marginBottom: 10 }}>Trafik verileri yakında</h2>
          <p style={{ fontSize: 14, color: t.textSecondary, lineHeight: 1.6, margin: '0 auto 24px', maxWidth: 300 }}>
            Google Analytics bağlantısı kurulduğunda ziyaretçi, oturum ve en çok görüntülenen sayfalar burada görünür.
          </p>
          <button
            type="button"
            onClick={() => navigate('settings')}
            style={{
              padding: '12px 22px', borderRadius: 24, border: 'none', cursor: 'pointer',
              background: t.accent, color: '#fff', fontSize: 14, fontWeight: 700,
            }}
          >
            Entegrasyonları Bağla
          </button>
        </div>
      </div>
    );
  }

  // Merge API data with mock fallback (operatör modu)
  const d = (() => {
    const mock = MOCK[range];
    if (!apiData) return mock;
    return {
      totalUsers:  apiData.overview?.totalUsers  ?? mock.totalUsers,
      newUsers:    apiData.overview?.newUsers     ?? mock.newUsers,
      sessions:    apiData.overview?.sessions     ?? mock.sessions,
      bounceRate:  apiData.overview?.bounceRate   ?? mock.bounceRate,
      avgDuration: apiData.overview?.avgSessionDuration ?? mock.avgDuration,
      pageviews:   apiData.overview?.pageViews    ?? mock.pageviews,
      sources:     apiData.sources?.length ? (apiData.sources as any[]).map((s: any, i: number) => ({
        label: s.sourceMedium ?? s.label ?? `Kaynak ${i+1}`,
        value: Math.round(s.percentage ?? 0),
        color: mock.sources[i]?.color ?? '#9DBECE',
      })) : mock.sources,
      topPages: apiData.topPages?.length ? (apiData.topPages as any[]).slice(0, 5).map((p: any) => ({
        path: p.pagePath ?? p.path ?? '/',
        views: p.screenPageViews ?? p.views ?? 0,
      })) : mock.topPages,
      queries: apiData.searchQueries?.length ? (apiData.searchQueries as any[]).slice(0, 4).map((q: any) => ({
        query: q.query ?? q.keys?.[0] ?? '—',
        clicks: q.clicks ?? 0,
        position: Math.round((q.position ?? 0) * 10) / 10,
      })) : mock.queries,
    };
  })();

  const fmtNum = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  return (
    <div style={{ minHeight: '100dvh', background: t.bg, paddingBottom: 100, transition: 'background 300ms' }}>
      {/* Header */}
      <div style={{ padding: '56px 24px 20px', borderBottom: `0.5px solid ${t.separator}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button onClick={goBack} style={{ ...t.backBtn, width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <IcoBack color={t.textSecondary} />
          </button>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 11, color: t.labelColor, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>Google Analytics</p>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.02em' }}>Web Trafiği</h1>
          </div>
          <button onClick={() => refetch()} style={{ ...t.iconBtn, width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <IcoRetry size={14} color={t.textSecondary} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {RANGES.map((r) => (
            <button key={r.id} onClick={() => setRange(r.id)} style={{
              padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: range === r.id ? 600 : 400,
              ...(range === r.id ? t.pillActive(t.info) : t.pillIdle),
            }}>{r.label}</button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', color: t.textMuted, fontSize: 14 }}>Yükleniyor...</div>
      ) : (
        <>
          {/* KPI Grid */}
          <div style={{ padding: '20px 24px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Toplam Ziyaretçi', value: fmtNum(d.totalUsers),  color: t.info    },
              { label: 'Yeni Kullanıcı',   value: fmtNum(d.newUsers),    color: t.accent  },
              { label: 'Oturum',           value: fmtNum(d.sessions),    color: t.success },
              { label: 'Ort. Süre',        value: d.avgDuration,         color: '#f59e0b' },
              { label: 'Sayfa Görünüm',    value: fmtNum(d.pageviews),   color: t.info    },
              { label: 'Bounce Rate',      value: `${Math.round(d.bounceRate * 100)}%`, color: d.bounceRate > 0.5 ? t.danger : t.success },
            ].map((s) => (
              <div key={s.label} style={{ ...t.surfaceCard, padding: '16px' }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color, lineHeight: 1, marginBottom: 4, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: t.labelColor, fontWeight: 500 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Traffic Sources */}
          <div style={{ padding: '20px 24px 0' }}>
            <SLabel t={t} text="Trafik Kaynakları" />
            <div style={{ ...t.surfaceCard, padding: '18px' }}>
              {d.sources.map((src, i) => (
                <div key={src.label} style={{ marginBottom: i < d.sources.length - 1 ? 14 : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: src.color, display: 'inline-block' }} />
                      <span style={{ fontSize: 13, color: t.textSecondary }}>{src.label}</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: src.color, fontVariantNumeric: 'tabular-nums' }}>{src.value}%</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: t.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${src.value}%`, borderRadius: 2, background: src.color, opacity: 0.8 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Pages */}
          <div style={{ padding: '20px 24px 0' }}>
            <SLabel t={t} text="En Çok Görüntülenen Sayfalar" />
            <div style={{ ...t.surfaceGroup }}>
              {d.topPages.map((p, i) => (
                <div key={p.path} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', ...(i < d.topPages.length - 1 ? t.surfaceRow : {}) }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, width: 16, textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 12, color: t.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.path}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: t.textPrimary, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{fmtNum(p.views)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Search Queries */}
          <div style={{ padding: '20px 24px 0' }}>
            <SLabel t={t} text="Arama Sorguları (GSC)" />
            <div style={{ ...t.surfaceGroup }}>
              {d.queries.map((q, i) => (
                <div key={q.query} style={{ padding: '13px 18px', ...(i < d.queries.length - 1 ? t.surfaceRow : {}) }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: t.textSecondary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>{q.query}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: t.info, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{q.clicks} tık</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 10, color: t.textMuted }}>Ort. Pozisyon:</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: q.position <= 3 ? t.success : q.position <= 10 ? t.warning : t.danger, fontVariantNumeric: 'tabular-nums' }}>#{q.position}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SLabel({ t, text }: { t: T; text: string }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: t.labelColor, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12 }}>{text}</div>;
}
