'use client';

import React from 'react';
import { IcoBell } from '../Icons';
import { useMobileStore } from '../mobile-store';
import { FeedNavbarActions } from '../MobileBrandNavbar';

export function FlowHeaderActions({
  showApproved,
  pendingCount,
  approvedCount,
  onShowPending,
  onShowPublished,
  dark = true,
  notificationCount = 0,
}: {
  showApproved: boolean;
  pendingCount: number;
  approvedCount: number;
  onShowPending: () => void;
  onShowPublished: () => void;
  dark?: boolean;
  notificationCount?: number;
}) {
  const navigate = useMobileStore((s) => s.navigate);
  const iconColor = dark ? '#fff' : '#1a1a22';
  const badgeBorder = dark ? '#000' : '#fff';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button
        type="button"
        aria-label={notificationCount > 0 ? `Bildirimler, ${notificationCount} yeni` : 'Bildirimler'}
        onClick={() => navigate('notifications')}
        style={{
          width: 44,
          height: 44,
          border: 'none',
          background: 'none',
          padding: 0,
          cursor: 'pointer',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: iconColor,
        }}
      >
        <IcoBell size={20} color={iconColor} strokeWidth={1.8} />
        {notificationCount > 0 && (
          <span style={{
            position: 'absolute',
            top: 8,
            right: 8,
            minWidth: 16,
            height: 16,
            padding: '0 4px',
            borderRadius: 8,
            background: '#E1306C',
            color: '#fff',
            fontSize: 9,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `1.5px solid ${badgeBorder}`,
            lineHeight: 1,
          }}>
            {notificationCount > 9 ? '9+' : notificationCount}
          </span>
        )}
      </button>

      <button
        type="button"
        aria-label="Mesajlar"
        onClick={() => navigate('more')}
        style={{
          width: 44,
          height: 44,
          border: 'none',
          background: 'none',
          padding: 0,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: iconColor,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>

      <FeedNavbarActions
        showApproved={showApproved}
        pendingCount={pendingCount}
        approvedCount={approvedCount}
        onShowPending={onShowPending}
        onShowPublished={onShowPublished}
        dark={dark}
      />
    </div>
  );
}
