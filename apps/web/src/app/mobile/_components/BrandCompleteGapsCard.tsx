'use client';

import type { BrandCompleteGapsState } from '@/components/brand/BrandCompleteGapsButton';
import type { T } from './theme-context';

export function BrandCompleteGapsCard({
  t,
  brandGaps,
}: {
  t: T;
  brandGaps: BrandCompleteGapsState;
}) {
  const gapActive = brandGaps.autoFixable > 0 || brandGaps.actionable > 0;
  if (!gapActive) return null;

  return (
    <div style={{ marginBottom: 16 }}>
      <button
        type="button"
        disabled={brandGaps.running}
        onClick={() => void brandGaps.runComplete()}
        className="brand-hub-gap-cta"
        style={{
          width: '100%', padding: '16px 18px', borderRadius: 20, border: 'none',
          cursor: brandGaps.running ? 'wait' : 'pointer', textAlign: 'left',
          background: brandGaps.autoFixable > 0
            ? (t.isDark
              ? 'linear-gradient(135deg, rgba(16,185,129,0.18) 0%, rgba(6,95,70,0.12) 100%)'
              : 'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(209,250,229,0.5) 100%)')
            : (t.isDark
              ? 'linear-gradient(135deg, rgba(99,102,241,0.16) 0%, rgba(49,46,129,0.12) 100%)'
              : 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(224,231,255,0.55) 100%)'),
          boxShadow: t.isDark ? 'inset 0 1px 0 rgba(255,255,255,0.06)' : 'inset 0 1px 0 rgba(255,255,255,0.65)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.65)',
          }}
          >
            {brandGaps.running ? (
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                border: `1.5px solid ${t.separator}`, borderTopColor: t.accent,
                animation: 'spinSlow 0.8s linear infinite',
              }} />
            ) : (
              <span style={{ fontSize: 18, lineHeight: 1, opacity: 0.9 }}>✦</span>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.03em' }}>
              {brandGaps.autoFixable > 0 ? 'Profili güçlendir' : 'Son rötuşlar'}
            </div>
            <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 3, letterSpacing: '-0.01em' }}>
              {brandGaps.running ? 'AI çalışıyor…' : 'Tek dokunuşla tamamla'}
            </div>
          </div>
          {(brandGaps.autoFixable > 0 || brandGaps.actionable > 0) && !brandGaps.running && (
            <span style={{
              minWidth: 28, height: 28, padding: '0 8px', borderRadius: 999,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
              color: brandGaps.autoFixable > 0 ? '#34D399' : '#A5B4FC',
              background: brandGaps.autoFixable > 0 ? 'rgba(16,185,129,0.16)' : 'rgba(99,102,241,0.14)',
            }}
            >
              {brandGaps.autoFixable > 0 ? brandGaps.autoFixable : brandGaps.actionable}
            </span>
          )}
        </div>
      </button>
      {brandGaps.feedback && (
        <div style={{
          marginTop: 10, padding: '12px 14px', borderRadius: 16,
          fontSize: 12.5, lineHeight: 1.5, letterSpacing: '-0.01em',
          color: brandGaps.feedback.kind === 'ok' ? t.success : t.danger,
          background: brandGaps.feedback.kind === 'ok' ? t.successDim : 'rgba(239,68,68,0.08)',
          border: `0.5px solid ${brandGaps.feedback.kind === 'ok' ? 'rgba(16,185,129,0.22)' : 'rgba(239,68,68,0.2)'}`,
        }}
        >
          {brandGaps.feedback.text}
        </div>
      )}
    </div>
  );
}
