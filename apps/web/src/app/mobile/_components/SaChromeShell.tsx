'use client';

import type { ReactNode } from 'react';
import { useTheme } from './theme-context';

/**
 * Premium app chrome for non-feed screens — void black canvas, steel ambient glow.
 */
export function SaChromeShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
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
      <div className="sa-chrome-hairline" aria-hidden />
      <div className="sa-chrome-content">{children}</div>
    </div>
  );
}
