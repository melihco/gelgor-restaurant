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
      marginBottom: 20,
      paddingLeft: 14,
      borderLeft: `2px solid ${t.accent}`,
    }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.03em', marginBottom: 5, lineHeight: 1.1 }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: t.textTertiary, lineHeight: 1.55, maxWidth: 560 }}>
        {description}
      </div>
    </div>
  );
}
