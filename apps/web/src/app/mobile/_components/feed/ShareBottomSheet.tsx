'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  buildAppReferralShareMessage,
  buildSmsShareUrl,
  buildTelegramShareUrl,
  buildTwitterShareUrl,
  buildWhatsAppShareUrl,
  openExternalShare,
  resolveAppReferralUrl,
  type AppReferralShareContext,
} from '@/lib/app-referral-share';
import { getMobilePortalRoot } from '../mobile-client-config';
import { useTheme } from '../theme-context';

type ShareMode = 'content' | 'referral';

type ShareChannel = {
  id: string;
  label: string;
  color: string;
  action: () => void;
};

export function ShareBottomSheet({
  open,
  onClose,
  title,
  shareUrl,
  shareText,
  mode = 'content',
  referralContext,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  shareUrl?: string;
  shareText?: string;
  mode?: ShareMode;
  referralContext?: AppReferralShareContext;
}) {
  const { t } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);

  const isReferral = mode === 'referral';
  const referralMessage = useMemo(
    () => (isReferral ? buildAppReferralShareMessage(referralContext) : ''),
    [isReferral, referralContext],
  );
  const referralUrl = useMemo(() => (isReferral ? resolveAppReferralUrl() : ''), [isReferral]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!mounted || !open || typeof window === 'undefined') return null;

  const url = isReferral
    ? referralUrl
    : (shareUrl || window.location.href);
  const message = isReferral ? referralMessage : (shareText || '');
  const sheetTitle = title ?? (isReferral ? 'SmartAgency\'yi öner' : 'Paylaş');
  const surface = t.isDark ? '#121212' : '#f7f7f8';
  const textColor = t.isDark ? '#f5f5f5' : '#111';

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(isReferral ? referralMessage : url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  const systemShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: isReferral ? 'SmartAgency' : (shareText || 'Paylaş'),
          text: isReferral ? referralMessage : shareText,
          url: isReferral ? referralUrl : url,
        });
        onClose();
      } else {
        await copyMessage();
      }
    } catch {
      /* user cancelled */
    }
  };

  const channels: ShareChannel[] = isReferral
    ? [
        {
          id: 'whatsapp',
          label: 'WhatsApp',
          color: '#25D366',
          action: () => openExternalShare(buildWhatsAppShareUrl(referralMessage)),
        },
        {
          id: 'sms',
          label: 'SMS',
          color: '#34C759',
          action: () => { window.location.href = buildSmsShareUrl(referralMessage); },
        },
        {
          id: 'twitter',
          label: 'X',
          color: '#1DA1F2',
          action: () => openExternalShare(buildTwitterShareUrl(referralMessage)),
        },
        {
          id: 'telegram',
          label: 'Telegram',
          color: '#229ED9',
          action: () => openExternalShare(buildTelegramShareUrl(referralMessage, referralUrl)),
        },
        {
          id: 'copy',
          label: copied ? 'Kopyalandı' : 'Kopyala',
          color: '#8AABBD',
          action: () => { void copyMessage(); },
        },
        {
          id: 'more',
          label: 'Diğer',
          color: '#9CA3AF',
          action: () => { void systemShare(); },
        },
      ]
    : [];

  const sheet = (
    <div className="sa-feed-sheet-root" role="dialog" aria-modal="true" aria-label={sheetTitle}>
      <button type="button" className="sa-feed-sheet-backdrop" aria-label="Kapat" onClick={onClose} />
      <div
        className="sa-feed-sheet-panel sa-feed-share-panel"
        style={{ background: surface, color: textColor }}
      >
        <div className="sa-feed-sheet-handle" aria-hidden />
        <div style={{ padding: '4px 16px 8px', fontSize: 16, fontWeight: 700 }}>{sheetTitle}</div>

        {isReferral && (
          <p style={{
            margin: '0 16px 14px',
            fontSize: 13,
            lineHeight: 1.5,
            color: t.textMuted,
          }}>
            Hazır davet mesajını arkadaşına gönder — her marka kendi adıyla önerir.
          </p>
        )}

        {isReferral ? (
          <div className="sa-feed-share-channels" style={{ padding: '0 16px 12px' }}>
            {channels.map((ch) => (
              <button
                key={ch.id}
                type="button"
                className="sa-feed-share-channel"
                onClick={() => {
                  ch.action();
                  if (ch.id !== 'copy') onClose();
                }}
              >
                <span
                  className="sa-feed-share-channel-icon"
                  style={{ background: `${ch.color}22`, color: ch.color }}
                  aria-hidden
                >
                  {channelGlyph(ch.id)}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, marginTop: 6 }}>{ch.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 8px 12px' }}>
            <button type="button" onClick={() => void copyMessage()} style={rowStyle(t.separator)}>
              <span aria-hidden style={{ fontSize: 18 }}>🔗</span>
              <span style={{ flex: 1, textAlign: 'left', fontWeight: 600 }}>
                {copied ? 'Bağlantı kopyalandı' : 'Bağlantıyı kopyala'}
              </span>
            </button>
            <button type="button" onClick={() => void systemShare()} style={rowStyle(t.separator)}>
              <span aria-hidden style={{ fontSize: 18 }}>↗</span>
              <span style={{ flex: 1, textAlign: 'left', fontWeight: 600 }}>Sistem paylaşımı</span>
            </button>
          </div>
        )}

        {isReferral && (
          <div style={{
            margin: '0 16px 12px',
            padding: '12px 14px',
            borderRadius: 14,
            background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
            border: `0.5px solid ${t.separator}`,
            fontSize: 12,
            lineHeight: 1.55,
            color: t.textMuted,
            maxHeight: 120,
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
          }}>
            {referralMessage}
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          style={{
            margin: '0 16px calc(16px + env(safe-area-inset-bottom))',
            height: 48,
            borderRadius: 14,
            border: `0.5px solid ${t.separator}`,
            background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
            color: textColor,
            fontWeight: 700,
            fontSize: 15,
            cursor: 'pointer',
          }}
        >
          Vazgeç
        </button>
      </div>
    </div>
  );

  return createPortal(sheet, getMobilePortalRoot());
}

function channelGlyph(id: string): string {
  switch (id) {
    case 'whatsapp': return 'WA';
    case 'sms': return '✉';
    case 'twitter': return '𝕏';
    case 'telegram': return 'TG';
    case 'copy': return '⎘';
    default: return '↗';
  }
}

function rowStyle(separator: string): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    padding: '0 12px',
    borderRadius: 12,
    border: `0.5px solid ${separator}`,
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    marginBottom: 8,
  };
}
