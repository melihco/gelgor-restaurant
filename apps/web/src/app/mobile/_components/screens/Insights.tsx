'use client';
import { useState } from 'react';
import { useTheme } from '../theme-context';
import { CircleProgress, MetricTile, PageHeader, SectionHeader } from '../ui-primitives';
import type { T } from '../theme-context';

type Period = '7d' | '30d' | '90d';

const metrics: Record<Period, { reach: string; engagement: string; saves: string; engRate: string; reachRaw: number }> = {
  '7d':  { reach: '18.4K',    engagement: '2.1K',  saves: '312',  engRate: '11.4', reachRaw: 18400   },
  '30d': { reach: '72.1K',    engagement: '8.4K',  saves: '1.2K', engRate: '11.7', reachRaw: 72100   },
  '90d': { reach: '198K',     engagement: '24.2K', saves: '3.8K', engRate: '12.2', reachRaw: 198000  },
};

const topCreatives = [
  { id: 't1', title: 'Antep Fıstıklı Reel', type: 'Reel',  reach: '120.5K', reachNum: 120500, delta: '+28%', thumb: '#f472b6' },
  { id: 't2', title: 'Summer Story Serisi', type: 'Story', reach: '98.2K',  reachNum: 98200,  delta: '+14%', thumb: '#a78bfa' },
  { id: 't3', title: 'Bayram Koleksyonu',   type: 'Post',  reach: '75.3K',  reachNum: 75300,  delta: '+9%',  thumb: '#f59e0b' },
];

const campBars = [
  { name: 'Summer Gift',        bar: 82, reach: '9.2K',  color: '#a78bfa' },
  { name: 'Bayram Koleksiyonu', bar: 64, reach: '6.4K',  color: '#60a5fa' },
  { name: 'Antep Fıstıklı',     bar: 42, reach: '3.1K',  color: '#34d399' },
];

export function Insights() {
  const { t } = useTheme();
  const [period, setPeriod] = useState<Period>('7d');
  const m = metrics[period];

  return (
    <div style={{ minHeight: '100dvh', background: t.bg, paddingBottom: 96, transition: 'background 300ms' }}>
      {/* Header */}
      <div style={{ padding: 'calc(env(safe-area-inset-top,0px) + 20px) 20px 20px', borderBottom: `0.5px solid ${t.separator}` }}>
        <PageHeader t={t} eyebrow="Performance" title="Insights"
          right={
            <div style={{ display: 'flex', gap: 4 }}>
              {(['7d','30d','90d'] as Period[]).map(p => (
                <button key={p} onClick={() => setPeriod(p)} style={{ padding: '5px 11px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: period === p ? 700 : 400, ...(period === p ? t.pillActive(t.info) : t.pillIdle) }}>
                  {p}
                </button>
              ))}
            </div>
          }
        />
      </div>

      {/* Hero: big number + ring chart */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ ...t.surfaceCard, padding: '22px 20px', background: t.isDark ? 'linear-gradient(135deg,rgba(96,165,250,0.07),rgba(255,255,255,0.02))' : '#fff' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: t.labelColor, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Genel Performans</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: t.textPrimary, letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 4, fontVariantNumeric: 'tabular-nums' }}>
                {m.reach}
              </div>
              <div style={{ fontSize: 12, color: t.success, fontWeight: 700 }}>+24.5%</div>
              <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>Erişim</div>
            </div>
            <CircleProgress value={parseInt(m.engRate)} size={80} strokeWidth={7} color={t.info} isDark={t.isDark} label={`${m.engRate}%`} sublabel="Etkileşim" />
          </div>
        </div>
      </div>

      {/* Metric tiles */}
      <div style={{ padding: '12px 20px 0', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <MetricTile t={t} label="Etkileşim" value={m.engagement} color={t.accent}   trend="+18%" />
        <MetricTile t={t} label="Tıklama"   value="15.3K"        color={t.info}     trend="+21%" />
        <MetricTile t={t} label="Kaydetme"  value={m.saves}      color={t.success}  trend="+16%" />
      </div>

      {/* AI Recommendation */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ ...t.surfaceCard, padding: '16px', background: t.isDark ? 'rgba(99,102,241,0.06)' : t.accentDim, border: `0.5px solid ${t.accentBorder}`, display: 'flex', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: t.accentDim, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: t.accent, flexShrink: 0 }}>✦</div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.accent, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 5 }}>AI Öneri</div>
            <p style={{ fontSize: 13, color: t.textTertiary, lineHeight: 1.6, margin: 0 }}>
              Reel formatı bu hafta hikayeleri %28 geride bırakıyor. Gelecek kampanyada bütçenin %60'ını reel'e kaydırmanızı öneririz.
            </p>
          </div>
        </div>
      </div>

      {/* Top creatives — cinematic horizontal carousel (instagram bubble feel) */}
      <div style={{ paddingTop: 20 }}>
        <div style={{ padding: '0 20px' }}>
          <SectionHeader t={t} label="En İyi İçerikler" action="Tümü" onAction={() => {}} />
        </div>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '4px 20px 4px',
          scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
          {topCreatives.map((c, i) => (
            <div key={c.id} style={{
              flexShrink: 0, width: 156, borderRadius: 18, overflow: 'hidden',
              background: t.isDark ? 'rgba(255,255,255,0.04)' : '#fff',
              border: `0.5px solid ${t.separator}`,
              boxShadow: t.isDark ? 'none' : '0 2px 8px rgba(0,0,0,0.05)',
            }}>
              {/* Thumbnail block — cinematic gradient with rank badge */}
              <div style={{
                position: 'relative', height: 168,
                background: `linear-gradient(140deg, ${c.thumb}cc 0%, ${c.thumb}66 60%, ${c.thumb}33 100%)`,
                display: 'flex', alignItems: 'flex-end', padding: 12,
              }}>
                {/* Rank chip top-left */}
                <div style={{ position: 'absolute', top: 10, left: 10,
                  width: 24, height: 24, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: '#fff' }}>{i + 1}</div>
                {/* Type badge top-right */}
                <div style={{ position: 'absolute', top: 10, right: 10,
                  padding: '3px 8px', borderRadius: 20,
                  background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
                  fontSize: 9, fontWeight: 700, color: '#fff', letterSpacing: '0.04em' }}>
                  {c.type}
                </div>
                {/* Delta — bottom of image */}
                <div style={{ fontSize: 22, fontWeight: 800, color: '#fff',
                  letterSpacing: '-0.02em', textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
                  {c.delta}
                </div>
              </div>
              {/* Body */}
              <div style={{ padding: '10px 12px 12px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: t.textPrimary,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  marginBottom: 3 }}>{c.title}</div>
                <div style={{ fontSize: 10, color: t.textMuted, fontVariantNumeric: 'tabular-nums' }}>
                  👁 {c.reach} erişim
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Campaign bars */}
      <div style={{ padding: '20px 20px 0' }}>
        <SectionHeader t={t} label="Kampanya Karşılaştırması" />
        <div style={{ ...t.surfaceCard, padding: '18px' }}>
          {campBars.map((c, i) => (
            <div key={c.name} style={{ marginBottom: i < campBars.length - 1 ? 16 : 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
                <span style={{ fontSize: 13, color: t.textSecondary, fontWeight: 500 }}>{c.name}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: c.color, fontVariantNumeric: 'tabular-nums' }}>{c.reach}</span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${c.bar}%`, borderRadius: 2, background: c.color, opacity: 0.8 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
