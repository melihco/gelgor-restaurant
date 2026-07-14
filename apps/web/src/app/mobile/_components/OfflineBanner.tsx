'use client';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from './theme-context';
import { nativeBridge } from '../_lib/native-bridge';

type ConnState = 'online' | 'offline' | 'restored';

/**
 * Connectivity pill for the WebView shell. Slides down under the status bar
 * when the connection drops; on reconnect it flashes "restored", refetches
 * active queries, and slides away.
 */
export function OfflineBanner() {
  const { t } = useTheme();
  const queryClient = useQueryClient();
  const [state, setState] = useState<ConnState>('online');
  const [retrying, setRetrying] = useState(false);
  const restoreTimer = useRef<number | null>(null);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) setState('offline');

    const onOffline = () => {
      if (restoreTimer.current) window.clearTimeout(restoreTimer.current);
      nativeBridge.haptic('warning');
      setState('offline');
    };
    const onOnline = () => {
      setState('restored');
      setRetrying(false);
      void queryClient.refetchQueries({ type: 'active' });
      restoreTimer.current = window.setTimeout(() => setState('online'), 2200);
    };

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      if (restoreTimer.current) window.clearTimeout(restoreTimer.current);
    };
  }, [queryClient]);

  const retry = async () => {
    setRetrying(true);
    try {
      await queryClient.refetchQueries({ type: 'active' });
      if (typeof navigator === 'undefined' || navigator.onLine) setState('online');
    } finally {
      setRetrying(false);
    }
  };

  const visible = state !== 'online';
  const offline = state === 'offline';

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 80,
        display: 'flex',
        justifyContent: 'center',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        pointerEvents: visible ? 'auto' : 'none',
        transform: visible ? 'translateY(0)' : 'translateY(-140%)',
        opacity: visible ? 1 : 0,
        transition: 'transform 320ms cubic-bezier(0.32, 0.72, 0, 1), opacity 240ms ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          maxWidth: 'calc(100% - 32px)',
          padding: '9px 14px',
          borderRadius: 22,
          background: t.isDark ? 'rgba(11,15,22,0.92)' : 'rgba(255,255,255,0.94)',
          border: `0.5px solid ${offline ? 'rgba(248,113,113,0.32)' : 'rgba(138,171,189,0.32)'}`,
          boxShadow: '0 10px 30px rgba(0,0,0,0.30)',
          backdropFilter: 'blur(18px) saturate(160%)',
          WebkitBackdropFilter: 'blur(18px) saturate(160%)',
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            flexShrink: 0,
            background: offline ? t.danger : t.success,
            boxShadow: `0 0 8px ${offline ? t.danger : t.success}80`,
          }}
        />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: t.textPrimary, whiteSpace: 'nowrap' }}>
          {offline ? 'İnternet bağlantısı yok' : 'Bağlantı yeniden kuruldu'}
        </span>
        {offline && (
          <button
            type="button"
            onClick={retry}
            disabled={retrying}
            style={{
              border: 'none',
              cursor: retrying ? 'default' : 'pointer',
              padding: '5px 11px',
              borderRadius: 14,
              fontSize: 11.5,
              fontWeight: 700,
              color: '#fff',
              background: t.gradientAccent,
              opacity: retrying ? 0.6 : 1,
              flexShrink: 0,
            }}
          >
            {retrying ? 'Deneniyor…' : 'Tekrar dene'}
          </button>
        )}
      </div>
    </div>
  );
}
