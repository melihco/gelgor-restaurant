'use client';

import type { T } from './theme-context';

export function BrandSectionIntro({
  t,
  title,
  description,
}: {
  t: T;
  title: string;
  description: string;
}) {
  return (
    <div style={{
      marginBottom: 18,
      padding: '14px 16px',
      borderRadius: 14,
      background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
      border: `0.5px solid ${t.separator}`,
    }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.02em', marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: t.textTertiary, lineHeight: 1.55 }}>
        {description}
      </div>
    </div>
  );
}
