'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getMobilePortalRoot } from '../mobile-client-config';
import { useTheme } from '../theme-context';

export function ShareBottomSheet({
  open,
  onClose,
  title = 'Paylaş',
  shareUrl,
  shareText,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  shareUrl?: string;
  shareText?: string;
}) {
  const { t } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const url = shareUrl || (typeof window !== 'undefined' ? window.location.href : '');
  const surface = t.isDark ? '#121212' : '#f7f7f8';
  const textColor = t.isDark ? '#f5f5f5' : '#111';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
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
          title: shareText || 'Paylaş',
          text: shareText,
          url,
        });
        onClose();
      } else {
        await copyLink();
      }
    } catch {
      /* user cancelled */
    }
  };

  const sheet = (
    <div className="sa-feed-sheet-root" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="sa-feed-sheet-backdrop" aria-label="Kapat" onClick={onClose} />
      <div
        className="sa-feed-sheet-panel sa-feed-share-panel"
        style={{ background: surface, color: textColor }}
      >
        <div className="sa-feed-sheet-handle" aria-hidden />
        <div style={{ padding: '4px 16px 16px', fontSize: 16, fontWeight: 700 }}>{title}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 8px 20px' }}>
          <button
            type="button"
            onClick={() => void copyLink()}
            style={rowStyle(t.separator)}
          >
            <span aria-hidden style={{ fontSize: 18 }}>🔗</span>
            <span style={{ flex: 1, textAlign: 'left', fontWeight: 600 }}>
              {copied ? 'Bağlantı kopyalandı' : 'Bağlantıyı kopyala'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => void systemShare()}
            style={rowStyle(t.separator)}
          >
            <span aria-hidden style={{ fontSize: 18 }}>↗</span>
            <span style={{ flex: 1, textAlign: 'left', fontWeight: 600 }}>Sistem paylaşımı</span>
          </button>
          {/* TODO(backend): in-app DM recipients when messaging API exists */}
          <button
            type="button"
            disabled
            style={{ ...rowStyle(t.separator), opacity: 0.45 }}
            aria-label="Uygulama içi gönderim yakında"
          >
            <span aria-hidden style={{ fontSize: 18 }}>✉️</span>
            <span style={{ flex: 1, textAlign: 'left', fontWeight: 600 }}>
              Uygulama içi gönder (yakında)
            </span>
          </button>
        </div>

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
