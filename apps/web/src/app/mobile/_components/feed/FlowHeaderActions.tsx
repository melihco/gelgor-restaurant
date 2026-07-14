'use client';

import React from 'react';
import { FeedNavbarActions } from '../MobileBrandNavbar';

/** Akış header — yalnızca kalp (bekleyen) + paylaş (uygulama daveti). */
export function FlowHeaderActions({
  showApproved,
  pendingCount,
  approvedCount,
  onShowPending,
  onShowPublished,
  onShareReferral,
  dark = true,
}: {
  showApproved: boolean;
  pendingCount: number;
  approvedCount: number;
  onShowPending: () => void;
  onShowPublished: () => void;
  onShareReferral: () => void;
  dark?: boolean;
}) {
  return (
    <FeedNavbarActions
      showApproved={showApproved}
      pendingCount={pendingCount}
      approvedCount={approvedCount}
      onShowPending={onShowPending}
      onShowPublished={onShowPublished}
      onShareReferral={onShareReferral}
      dark={dark}
    />
  );
}
