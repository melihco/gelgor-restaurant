import { Suspense } from 'react';

/**
 * Showcase layout — root body uses overflow:hidden for the SPA shell.
 * This route needs its own scroll container.
 */
export default function RemotionShowcaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="remotion-showcase-scroll"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#0a0a0f',
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
      }}
    >
      <Suspense fallback={<div style={{ padding: 24, color: '#94a3b8' }}>Yükleniyor…</div>}>
        {children}
      </Suspense>
    </div>
  );
}
