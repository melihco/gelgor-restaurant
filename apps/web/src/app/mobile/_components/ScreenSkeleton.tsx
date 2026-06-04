'use client';

import { useTheme } from './theme-context';

/** Lightweight placeholder while lazy-loaded mobile screens load. */
export function ScreenSkeleton() {
  const { t } = useTheme();
  return (
    <div
      style={{
        minHeight: '60dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          border: `2px solid ${t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
          borderTopColor: 'rgba(124,58,237,0.55)',
          animation: 'spinSlow 0.9s linear infinite',
        }}
      />
      <span style={{ fontSize: 12, color: t.textMuted }}>Yükleniyor…</span>
    </div>
  );
}
