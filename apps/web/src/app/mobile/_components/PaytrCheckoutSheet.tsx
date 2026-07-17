'use client';

import { useEffect, useRef } from 'react';
import type { T } from './theme-context';

/**
 * Full-screen PayTR iFrame checkout (mobile WebView safe).
 */
export function PaytrCheckoutSheet({
  iframeToken,
  title,
  t,
  onClose,
}: {
  iframeToken: string;
  title: string;
  t: T;
  onClose: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const scriptId = 'paytr-iframe-resizer';
    if (document.getElementById(scriptId)) return;
    const s = document.createElement('script');
    s.id = scriptId;
    s.src = 'https://www.paytr.com/js/iframeResizer.min.js';
    s.async = true;
    document.body.appendChild(s);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const iFrameResize = (window as unknown as {
        iFrameResize?: (opts: object, el: HTMLIFrameElement) => void;
      }).iFrameResize;
      if (iFrameResize && iframeRef.current) {
        try {
          iFrameResize({ log: false }, iframeRef.current);
        } catch {
          /* ignore */
        }
        window.clearInterval(timer);
      }
    }, 400);
    return () => window.clearInterval(timer);
  }, [iframeToken]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: t.isDark ? '#07090F' : '#F4F6F8',
        display: 'flex',
        flexDirection: 'column',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: `0.5px solid ${t.separator}`,
          minHeight: 52,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: t.textPrimary }}>{title}</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Kapat"
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            border: 'none',
            cursor: 'pointer',
            background: t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            color: t.textSecondary,
            fontSize: 18,
          }}
        >
          ✕
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <iframe
          ref={iframeRef}
          id="paytriframe"
          src={`https://www.paytr.com/odeme/guvenli/${iframeToken}`}
          title="PayTR Ödeme"
          frameBorder={0}
          scrolling="yes"
          style={{
            width: '100%',
            minHeight: '100%',
            height: '80dvh',
            border: 'none',
            background: '#fff',
          }}
        />
      </div>
    </div>
  );
}
