'use client';

import type { ReactNode } from 'react';
import { useTheme } from './theme-context';

/**
 * Premium app chrome for non-feed screens — void black canvas, steel ambient glow,
 * subtle SmartAgency A-mark watermark (same language as login).
 */
export function SaChromeShell({
  children,
  className,
  showMark = true,
}: {
  children: ReactNode;
  className?: string;
  /** Large watermark behind content */
  showMark?: boolean;
}) {
  const { t } = useTheme();
  return (
    <div
      className={[
        'sa-chrome-shell',
        t.isDark ? 'sa-chrome-shell--dark' : 'sa-chrome-shell--light',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="sa-chrome-ambient" aria-hidden />
      {showMark && <div className="sa-chrome-mark" aria-hidden />}
      <div className="sa-chrome-hairline" aria-hidden />
      <div className="sa-chrome-content">{children}</div>
    </div>
  );
}
