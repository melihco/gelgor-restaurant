'use client';

import type { ReactNode } from 'react';

/**
 * Minimal orbit glow behind the logo.
 * Pure CSS; wraps logo in the center.
 */
export function BrandLaserShow({
  size = 'md',
  children,
}: {
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}) {
  const stageClass = `brand-laser-stage brand-laser-stage--${size}`;

  return (
    <div className={stageClass} aria-hidden={false}>
      <div className="brand-laser-perspective">
        <div className="brand-laser-core">
          {children}
        </div>
      </div>
    </div>
  );
}
