'use client';
import { useState } from 'react';
import { useTheme } from '../theme-context';
import { IcoBack } from '../Icons';
import type { T } from '../theme-context';

const families = [
  { id: 'tf1', name: 'Aegean Luxury',    desc: 'Warm Mediterranean tones. Cinematic product close-ups. Minimal serif.', status: 'active',   score: 98, uses: 24, accent: '#d4a574', tags: ['Warm', 'Artisan', 'Premium'], variants: [{ type: 'Story', bg: 'linear-gradient(145deg,#1a0a00,#2d1200)' }, { type: 'Reel', bg: 'linear-gradient(145deg,#1a0a00,#3d1a00)' }, { type: 'Post', bg: 'linear-gradient(145deg,#0a0800,#1a1200)' }] },
  { id: 'tf2', name: 'Minimal White',    desc: 'Clean white space. Product-forward composition. Simple sans-serif.',  status: 'active',   score: 91, uses: 14, accent: '#8b7355', tags: ['Clean', 'Editorial', 'Refined'], variants: [{ type: 'Post', bg: 'linear-gradient(145deg,#f0ece8,#e8e0d8)' }, { type: 'Story', bg: 'linear-gradient(145deg,#f5f1ed,#ede5dc)' }] },
  { id: 'tf3', name: 'Ramadan Gold',     desc: 'Deep navy with gold accents. Crescent motifs. Heritage typography.',   status: 'seasonal', score: 87, uses: 6,  accent: '#c8a84b', tags: ['Heritage', 'Festive', 'Sacred'],  variants: [{ type: 'Story', bg: 'linear-gradient(145deg,#0d0a1a,#1a1430)' }, { type: 'Reel', bg: 'linear-gradient(145deg,#0d0a1a,#1a1430)' }] },
  { id: 'tf4', name: 'Gift Wrap Series', desc: 'Textured kraft backgrounds. Ribbon motifs. Warm greeting card feel.',  status: 'inactive', score: 74, uses: 3,  accent: '#8b6040', tags: ['Warm', 'Gifting', 'Textured'],  variants: [{ type: 'Post', bg: 'linear-gradient(145deg,#2a1a0a,#1a0d00)' }] },
];

const STATUS: Record<string, { label: string; colorKey: 'live' | 'warning' | 'labelColor'; dimKey: 'liveDim' | 'warningDim' }> = {
  active:   { label: 'Active',   colorKey: 'live',       dimKey: 'liveDim'    },
  seasonal: { label: 'Seasonal', colorKey: 'warning',    dimKey: 'warningDim' },
  inactive: { label: 'Inactive', colorKey: 'labelColor', dimKey: 'warningDim' },
};

export function Templates() {
  const { t } = useTheme();
  const [detail, setDetail] = useState<typeof families[0] | null>(null);

  if (detail) return <TemplateDetail t={t} family={detail} onBack={() => setDetail(null)} />;

  return (
    <div style={{ minHeight: '100dvh', background: t.bg, paddingBottom: 100, transition: 'background 300ms' }}>
      <div style={{ padding: '60px 24px 24px', borderBottom: `0.5px solid ${t.separator}` }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: t.labelColor, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>Creative System</p>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.03em', marginBottom: 4 }}>Templates</h1>
        <p style={{ fontSize: 13, color: t.textTertiary }}>{families.filter((f) => f.status === 'active').length} active · {families.length} families</p>
      </div>

      <div style={{ padding: '20px 24px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {families.map((f) => {
          const sc = STATUS[f.status] ?? STATUS['inactive']!;
          const statusColor = sc.colorKey === 'labelColor' ? t.labelColor : t[sc.colorKey];
          const statusDim = f.status === 'inactive' ? (t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)') : t[sc.dimKey];
          return (
            <button key={f.id} onClick={() => setDetail(f)} style={{
              ...t.surfaceCard, padding: '20px', textAlign: 'left', cursor: 'pointer', width: '100%',
              opacity: f.status === 'inactive' ? 0.6 : 1,
            }}>
              {/* Variant thumbnails */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 16, alignItems: 'flex-end' }}>
                {f.variants.map((v) => (
                  <div key={v.type} style={{ width: v.type === 'Post' ? 52 : 38, height: v.type === 'Post' ? 52 : 66, borderRadius: 8, background: v.bg, border: '0.5px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 4, flexShrink: 0 }}>
                    <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>{v.type}</span>
                  </div>
                ))}
                <div style={{ flex: 1, paddingLeft: 4, display: 'flex', flexWrap: 'wrap', gap: 4, alignContent: 'flex-end' }}>
                  {f.tags.map((tag) => (
                    <span key={tag} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 20, background: `${f.accent}12`, color: f.accent, fontWeight: 500 }}>{tag}</span>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary, marginBottom: 4 }}>{f.name}</div>
                  <div style={{ fontSize: 12, color: t.textTertiary, lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.desc}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: f.score > 90 ? t.success : f.score > 80 ? t.warning : t.danger, fontVariantNumeric: 'tabular-nums' }}>{f.score}</div>
                  <div style={{ fontSize: 9, color: t.textMuted }}>match</div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: t.textMuted }}>Used {f.uses}×</span>
                <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, fontWeight: 600, background: statusDim, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{sc.label}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TemplateDetail({ t, family, onBack }: { t: T; family: typeof families[0]; onBack: () => void }) {
  return (
    <div style={{ minHeight: '100dvh', background: t.bg, paddingBottom: 100, transition: 'background 300ms' }}>
      <div style={{ padding: '56px 24px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={onBack} style={{ ...t.backBtn, width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <IcoBack color={t.textSecondary} />
          </button>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.02em' }}>{family.name}</h2>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {family.variants.map((v) => (
            <div key={v.type} style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
              <div style={{ width: v.type === 'Post' ? 80 : 56, height: v.type === 'Post' ? 80 : 96, borderRadius: 12, background: v.bg, border: '0.5px solid rgba(255,255,255,0.08)' }} />
              <span style={{ fontSize: 10, color: t.textTertiary, fontWeight: 500 }}>{v.type}</span>
            </div>
          ))}
        </div>

        <div style={{ ...t.surfaceCard, padding: '18px' }}>
          <p style={{ fontSize: 14, color: t.textSecondary, lineHeight: 1.65, marginBottom: 14 }}>{family.desc}</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {family.tags.map((tag) => (
              <span key={tag} style={{ padding: '5px 11px', borderRadius: 30, background: `${family.accent}09`, border: `0.5px solid ${family.accent}18`, color: family.accent, fontSize: 12, fontWeight: 500 }}>{tag}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
