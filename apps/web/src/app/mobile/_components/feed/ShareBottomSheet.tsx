'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  buildAppReferralShareMessage,
  buildMailtoShareUrl,
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
  /** Solid brand tile behind the glyph */
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
  const surface = t.isDark ? '#0E1218' : '#FFFFFF';
  const textColor = t.isDark ? '#F2F5F8' : '#0F172A';
  const subtle = t.isDark ? 'rgba(226,234,242,0.72)' : 'rgba(15,23,42,0.62)';
  const previewBg = t.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.04)';
  const previewBorder = t.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)';

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

  const shareBody = isReferral ? referralMessage : (message ? `${message}\n${url}` : url);

  const channels: ShareChannel[] = [
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      color: '#25D366',
      action: () => openExternalShare(buildWhatsAppShareUrl(shareBody)),
    },
    {
      id: 'mail',
      label: 'E-posta',
      color: '#EA4335',
      action: () => {
        window.location.href = buildMailtoShareUrl({
          subject: isReferral ? 'SmartAgency önerisi' : (shareText || 'Paylaşım'),
          body: shareBody,
        });
      },
    },
    {
      id: 'sms',
      label: 'SMS',
      color: '#34C759',
      action: () => { window.location.href = buildSmsShareUrl(shareBody); },
    },
    {
      id: 'telegram',
      label: 'Telegram',
      color: '#229ED9',
      action: () => openExternalShare(buildTelegramShareUrl(shareBody, url)),
    },
    {
      id: 'copy',
      label: copied ? 'Kopyalandı' : 'Kopyala',
      color: '#4D7088',
      action: () => { void copyMessage(); },
    },
    {
      id: 'more',
      label: 'Diğer',
      color: '#6B7280',
      action: () => { void systemShare(); },
    },
  ];

  const sheet = (
    <div className="sa-feed-sheet-root" role="dialog" aria-modal="true" aria-label={sheetTitle}>
      <button type="button" className="sa-feed-sheet-backdrop" aria-label="Kapat" onClick={onClose} />
      <div
        className="sa-feed-sheet-panel sa-feed-share-panel"
        style={{ background: surface, color: textColor }}
      >
        <div className="sa-feed-sheet-handle" aria-hidden />

        <div style={{ padding: '2px 20px 4px' }}>
          <div style={{ fontSize: 18, fontWeight: 750, letterSpacing: '-0.02em', color: textColor }}>
            {sheetTitle}
          </div>
          <p style={{
            margin: '6px 0 0',
            fontSize: 14,
            lineHeight: 1.45,
            color: subtle,
            fontWeight: 500,
          }}>
            {isReferral
              ? 'Hazır davet mesajını WhatsApp, e-posta veya SMS ile gönder — marka adın mesajda yer alır.'
              : 'İçeriği arkadaşlarınla veya ekibinle paylaş.'}
          </p>
        </div>

        {isReferral && (
          <div style={{
            margin: '14px 16px 4px',
            padding: '14px 14px',
            borderRadius: 16,
            background: previewBg,
            border: `1px solid ${previewBorder}`,
            fontSize: 13.5,
            lineHeight: 1.55,
            color: textColor,
            fontWeight: 500,
            maxHeight: 140,
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            WebkitOverflowScrolling: 'touch',
          }}>
            {referralMessage}
          </div>
        )}

        <div className="sa-feed-share-channels" style={{ padding: '16px 12px 8px' }}>
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
                className="sa-feed-share-channel-icon sa-feed-share-channel-icon--brand"
                style={{ background: ch.color }}
                aria-hidden
              >
                <ChannelIcon id={ch.id} />
              </span>
              <span style={{
                fontSize: 12,
                fontWeight: 650,
                marginTop: 7,
                color: textColor,
                letterSpacing: '-0.01em',
              }}>
                {ch.label}
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{
            margin: '4px 16px calc(14px + env(safe-area-inset-bottom))',
            minHeight: 48,
            borderRadius: 14,
            border: `1px solid ${previewBorder}`,
            background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)',
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

function ChannelIcon({ id }: { id: string }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    'aria-hidden': true as const,
  };

  switch (id) {
    case 'whatsapp':
      return (
        <svg {...common} fill="#fff">
          <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.78 14.02c-.24.68-1.42 1.25-1.96 1.33-.5.07-1.14.1-1.84-.12-.42-.13-.97-.32-1.67-.62-2.93-1.27-4.84-4.23-4.98-4.43-.15-.19-1.17-1.56-1.17-2.97 0-1.41.74-2.1 1-2.39.26-.28.57-.35.76-.35h.55c.18 0 .42-.07.65.5.24.58.81 2 .88 2.14.07.14.12.31.02.5-.1.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.56.16.28.71 1.17 1.52 1.9 1.05.93 1.93 1.22 2.21 1.36.28.14.44.12.6-.07.17-.19.7-.82.89-1.1.19-.28.37-.23.63-.14.26.09 1.66.78 1.95.93.28.14.47.21.54.33.07.12.07.68-.17 1.36z" />
        </svg>
      );
    case 'mail':
      return (
        <svg {...common} stroke="#fff" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2.2" />
          <path d="m4 7 8 6 8-6" />
        </svg>
      );
    case 'sms':
      return (
        <svg {...common} stroke="#fff" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4 3.2V16H6.5A2.5 2.5 0 0 1 4 13.5v-8Z" />
          <path d="M8 8h8M8 11.5h5" />
        </svg>
      );
    case 'telegram':
      return (
        <svg {...common} fill="#fff">
          <path d="M21.8 4.3 2.9 11.5c-1.3.5-1.3 1.3-.2 1.6l4.8 1.5 1.8 5.6c.2.7.7.8 1.3.5l2.7-2.1 5.3 3.9c1 .6 1.7.3 2-1l3.4-16c.3-1.3-.5-1.9-1.5-1.5zM9.2 14.7l8.9-5.6c.4-.3.8 0 .5.3l-7.3 6.6-.3 3.1-1.8-4.4z" />
        </svg>
      );
    case 'copy':
      return (
        <svg {...common} stroke="#fff" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M4 16V6a2 2 0 0 1 2-2h10" />
        </svg>
      );
    default:
      return (
        <svg {...common} stroke="#fff" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12h11" />
          <path d="m12 6 6 6-6 6" />
        </svg>
      );
  }
}
