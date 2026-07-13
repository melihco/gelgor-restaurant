'use client';

import React from 'react';
import { resolveIgFeedChrome } from './ig-feed-chrome';

function ClockIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRight({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" aria-hidden>
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FeedPublishBar({
  onShareNow,
  onSchedule,
  onEdit,
  onRevise,
  scheduleSubtitle,
  sharing = false,
  disabled = false,
  softWarning = false,
  hardBlockLabel,
  revisioning = false,
  dark = true,
}: {
  onShareNow: () => void;
  onSchedule: () => void;
  onEdit?: () => void;
  onRevise?: () => void;
  scheduleSubtitle?: string | null;
  sharing?: boolean;
  disabled?: boolean;
  softWarning?: boolean;
  hardBlockLabel?: string;
  revisioning?: boolean;
  dark?: boolean;
}) {
  const chrome = resolveIgFeedChrome(dark);
  const shareLabel = sharing
    ? 'Paylaşılıyor…'
    : disabled && hardBlockLabel
      ? hardBlockLabel
      : softWarning
        ? 'Yine de paylaş'
        : 'Paylaş';

  const shareDisabled = disabled || sharing;
  const shareBg = shareDisabled
    ? (dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,149,246,0.35)')
    : '#0095F6';
  const shareColor = shareDisabled
    ? (dark ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.85)')
    : '#fff';

  return (
    <div
      style={{
        marginTop: 2,
        padding: '0 14px 14px',
        background: chrome.shell,
        borderTop: `0.5px solid ${chrome.separator}`,
      }}
    >
      {(onEdit || onRevise) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '10px 0 4px',
          }}
        >
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              style={{
                padding: '8px 4px',
                minHeight: 44,
                border: 'none',
                background: 'none',
                color: chrome.text,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                letterSpacing: '-0.01em',
              }}
            >
              Düzenle
            </button>
          )}
          {onEdit && onRevise && (
            <span style={{ color: chrome.textMuted, fontSize: 13, userSelect: 'none' }}>·</span>
          )}
          {onRevise && (
            <button
              type="button"
              onClick={onRevise}
              disabled={revisioning}
              style={{
                padding: '8px 4px',
                minHeight: 44,
                border: 'none',
                background: 'none',
                color: revisioning ? chrome.textMuted : chrome.text,
                fontSize: 14,
                fontWeight: 600,
                cursor: revisioning ? 'not-allowed' : 'pointer',
                letterSpacing: '-0.01em',
              }}
            >
              {revisioning ? 'Revize ediliyor…' : 'Revize et'}
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onSchedule}
        disabled={sharing}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 0',
          marginBottom: 4,
          border: 'none',
          borderBottom: `0.5px solid ${chrome.separator}`,
          background: 'none',
          cursor: sharing ? 'not-allowed' : 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
          <ClockIcon color={chrome.textMuted} />
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 14,
              fontWeight: 600,
              color: chrome.text,
              letterSpacing: '-0.01em',
            }}>
              Önerilen saatte paylaş
            </div>
            <div style={{
              fontSize: 12,
              color: scheduleSubtitle ? '#C9A96E' : chrome.textMuted,
              marginTop: 2,
              letterSpacing: '-0.005em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {scheduleSubtitle ?? 'Takvimden zaman seç'}
            </div>
          </div>
        </div>
        <ChevronRight color={chrome.textMuted} />
      </button>

      <button
        type="button"
        onClick={onShareNow}
        disabled={shareDisabled}
        style={{
          width: '100%',
          minHeight: 44,
          marginTop: 10,
          padding: '11px 16px',
          borderRadius: 8,
          border: 'none',
          cursor: shareDisabled ? 'not-allowed' : 'pointer',
          background: shareBg,
          color: shareColor,
          fontSize: 14,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          opacity: sharing ? 0.88 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        {sharing && (
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.35)',
              borderTopColor: '#fff',
              animation: 'spinSlow 0.75s linear infinite',
              flexShrink: 0,
            }}
          />
        )}
        {shareLabel}
      </button>

      {softWarning && !sharing && !disabled && (
        <p style={{
          margin: '8px 0 0',
          fontSize: 11,
          lineHeight: 1.45,
          color: '#EAB308',
          textAlign: 'center',
        }}>
          Küçük uyarılar var — tekrar dokunarak yine de paylaşabilirsiniz.
        </p>
      )}
    </div>
  );
}
