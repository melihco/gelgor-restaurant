'use client';

import React from 'react';
import { resolveIgFeedChrome } from './ig-feed-chrome';

export function FeedPublishBar({
  onShareNow,
  onSchedule,
  scheduleSubtitle,
  sharing = false,
  disabled = false,
  softWarning = false,
  hardBlockLabel,
  dark = true,
}: {
  onShareNow: () => void;
  onSchedule: () => void;
  scheduleSubtitle?: string | null;
  sharing?: boolean;
  disabled?: boolean;
  softWarning?: boolean;
  hardBlockLabel?: string;
  dark?: boolean;
}) {
  const chrome = resolveIgFeedChrome(dark);
  const shareLabel = sharing
    ? 'Paylaşılıyor…'
    : disabled && hardBlockLabel
      ? hardBlockLabel
      : softWarning
        ? 'Paylaş (uyarı)'
        : 'Paylaş';

  return (
    <div style={{
      padding: '10px 14px 12px',
      background: chrome.publishBarBg,
      borderTop: `0.5px solid ${chrome.publishBarBorder}`,
      borderBottom: `0.5px solid ${chrome.publishBarBorder}`,
    }}>
      <button
        type="button"
        onClick={onShareNow}
        disabled={disabled || sharing}
        style={{
          width: '100%',
          padding: '11px 16px',
          borderRadius: 10,
          border: 'none',
          cursor: disabled || sharing ? 'not-allowed' : 'pointer',
          background: disabled ? (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)') : '#0095F6',
          color: disabled ? (dark ? 'rgba(255,255,255,0.35)' : 'rgba(8,12,16,0.35)') : '#fff',
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: '-0.01em',
          marginBottom: 8,
          opacity: sharing ? 0.85 : 1,
        }}
      >
        {shareLabel}
      </button>

      <button
        type="button"
        onClick={onSchedule}
        disabled={sharing}
        style={{
          width: '100%',
          padding: '10px 14px',
          borderRadius: 10,
          border: `0.5px solid ${dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)'}`,
          background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          cursor: sharing ? 'not-allowed' : 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: chrome.text, letterSpacing: '-0.01em' }}>
          Önerilen saatte paylaş
        </div>
        <div style={{ fontSize: 12, color: scheduleSubtitle ? '#C9A96E' : chrome.textMuted, marginTop: 2 }}>
          {scheduleSubtitle ?? 'Takvimden zaman seç'}
        </div>
      </button>
    </div>
  );
}
