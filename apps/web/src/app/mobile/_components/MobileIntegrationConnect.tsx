'use client';

import { useEffect, useState, type CSSProperties, type RefObject } from 'react';
import type { IntegrationProvider, IntegrationStatus } from '@/types';
import type { T } from './theme-context';
import {
  MOBILE_INTEGRATION_CONNECT,
  mobileIntegrationConnectLabel,
  openWebSetupIntegrations,
  startMobileGoogleOAuth,
  MobileIntegrationConnectError,
  consumeMobileIntegrationsOAuthFlash,
} from '@/lib/mobile-integration-connect';
import type { summarizeMobileIntegrations } from '@/lib/mobile-integration-status';

type IntegrationItem = ReturnType<typeof summarizeMobileIntegrations>['items'][number];

function connectBtnStyle(t: T, accent: string, disabled: boolean): CSSProperties {
  return {
    minHeight: 44,
    minWidth: 88,
    padding: '10px 14px',
    borderRadius: 12,
    border: `0.5px solid ${accent}45`,
    background: disabled ? (t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)') : `${accent}18`,
    color: disabled ? t.textMuted : accent,
    fontSize: 12.5,
    fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
    flexShrink: 0,
    letterSpacing: '-0.01em',
  };
}

export function MobileIntegrationProviderRow({
  t,
  item,
  busy,
  onConnect,
}: {
  t: T;
  item: IntegrationItem;
  busy: boolean;
  onConnect: (provider: IntegrationProvider) => void;
}) {
  const action = MOBILE_INTEGRATION_CONNECT[item.provider];
  const connectLabel = mobileIntegrationConnectLabel(item.connected, item.status);
  const showConnect = Boolean(connectLabel && action);

  return (
    <div style={{ padding: '15px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <ProviderIcon t={t} item={item} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: t.textPrimary, letterSpacing: '-0.01em' }}>
            {item.label}
          </div>
          <div style={{
            fontSize: 11.5, color: t.textTertiary, marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {item.connected && item.displayName ? item.displayName : item.sub}
          </div>
        </div>
        {showConnect ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onConnect(item.provider)}
            style={connectBtnStyle(t, item.color, busy)}
          >
            {busy ? '…' : connectLabel}
          </button>
        ) : (
          <StatusChip t={t} connected={item.connected} status={item.status} />
        )}
      </div>
    </div>
  );
}

function ProviderIcon({ t, item }: { t: T; item: IntegrationItem }) {
  const paths: Record<string, string> = {
    GoogleBusiness: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    Instagram: 'M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM17.5 6.5h.01',
    GoogleAds: 'M3 11l18-8-4 18-6.5-5.5L3 11zM10.5 15.5L9 20',
    GoogleAnalytics: 'M3 20h18M5 20V12M9 20V8M13 20V4M17 20V10',
  };
  const d = paths[item.provider] ?? 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71';
  return (
    <div style={{
      width: 40, height: 40, borderRadius: 12, flexShrink: 0,
      background: item.connected ? `${item.color}12` : (t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'),
      border: `0.5px solid ${item.connected ? `${item.color}30` : t.separatorStrong}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke={item.connected ? item.color : t.textMuted}
        strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={d} />
      </svg>
    </div>
  );
}

function StatusChip({ t, connected, status }: { t: T; connected: boolean; status: IntegrationStatus | string }) {
  const cfg = connected
    ? { bg: t.successDim, border: `${t.success}30`, color: t.success, label: 'Bağlı' }
    : status === 'Expired'
      ? { bg: t.warningDim, border: `${t.warning}30`, color: t.warning, label: 'Yenile' }
      : status === 'Error'
        ? { bg: t.dangerDim, border: `${t.danger}30`, color: t.danger, label: 'Hata' }
        : {
            bg: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
            border: t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            color: t.textMuted,
            label: 'Bağlı değil',
          };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 10.5, padding: '4px 10px', borderRadius: 20, fontWeight: 700,
      background: cfg.bg, border: `0.5px solid ${cfg.border}`, color: cfg.color,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%', background: cfg.color,
        boxShadow: connected ? `0 0 6px ${cfg.color}80` : 'none',
      }} />
      {cfg.label}
    </span>
  );
}

export function MobileIntegrationsFlash({
  t,
  message,
}: {
  t: T;
  message: { text: string; ok: boolean } | null;
}) {
  if (!message) return null;
  return (
    <div style={{
      marginBottom: 14, padding: '12px 16px', borderRadius: 14,
      background: message.ok ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.09)',
      border: `0.5px solid ${message.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.25)'}`,
    }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: message.ok ? '#10B981' : '#F87171' }}>
        {message.text}
      </span>
    </div>
  );
}

export function useIntegrationFlash() {
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const flash = (text: string, ok = true) => {
    setMessage({ text, ok });
    window.setTimeout(() => setMessage(null), ok ? 5000 : 4500);
  };

  useEffect(() => {
    const pending = consumeMobileIntegrationsOAuthFlash();
    if (pending) flash(pending);
  }, []);

  return { message, flash };
}

export function useMobileIntegrationConnectHandlers(options: {
  publishSectionRef: RefObject<HTMLElement | null>;
  onFlash: (text: string, ok?: boolean) => void;
}) {
  const [connectingProvider, setConnectingProvider] = useState<IntegrationProvider | null>(null);
  const [bulkGoogleBusy, setBulkGoogleBusy] = useState(false);

  const handleConnect = async (provider: IntegrationProvider) => {
    const action = MOBILE_INTEGRATION_CONNECT[provider];
    if (!action) {
      options.onFlash('Bu kanal için mobil bağlantı henüz desteklenmiyor.', false);
      return;
    }

    if (action.kind === 'instagram_publish') {
      options.publishSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      options.onFlash('Instagram yayını için yukarıdaki “Yayın Hesabı” bölümünü kullanın.');
      return;
    }

    if (action.kind === 'web_setup') {
      openWebSetupIntegrations();
      options.onFlash('Google İşletme kurulumu web panelinde açıldı.');
      return;
    }

    if (!action.googleScope) {
      options.onFlash('OAuth kapsamı tanımlı değil.', false);
      return;
    }

    setConnectingProvider(provider);
    try {
      await startMobileGoogleOAuth(action.googleScope);
    } catch (err) {
      options.onFlash(
        err instanceof MobileIntegrationConnectError
          ? err.message
          : 'Bağlantı başlatılamadı.',
        false,
      );
      setConnectingProvider(null);
    }
  };

  const handleBulkGoogleConnect = async () => {
    setBulkGoogleBusy(true);
    try {
      await startMobileGoogleOAuth('ads,analytics,search_console');
    } catch (err) {
      options.onFlash(
        err instanceof MobileIntegrationConnectError
          ? err.message
          : 'Google bağlantısı başlatılamadı.',
        false,
      );
      setBulkGoogleBusy(false);
    }
  };

  return {
    connectingProvider,
    bulkGoogleBusy,
    handleConnect,
    handleBulkGoogleConnect,
  };
}
