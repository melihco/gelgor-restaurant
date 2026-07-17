'use client';

import type { ReactNode } from 'react';

/**
 * Diamond / platinum orbit stage behind the Smart Agency mark.
 * Pure CSS — classy brilliance, no neon carnival energy.
 */
export function BrandLaserShow({
  size = 'md',
  children,
}: {
  size?: 'sm' | 'md' | 'lg' | 'onboarding';
  children: ReactNode;
}) {
  const stageClass = `brand-laser-stage brand-laser-stage--${size}`;

  return (
    <div className={stageClass}>
      <div className="brand-laser-perspective">
        <div className="brand-laser-grid" aria-hidden />
        <div className="brand-diamond-bloom" aria-hidden />
        <div className="brand-diamond-facet" aria-hidden />
        <div className="brand-diamond-facet brand-diamond-facet--inner" aria-hidden />
        <div className="brand-laser-ring brand-laser-ring--halo-1" aria-hidden />
        <div className="brand-laser-ring brand-laser-ring--halo-2" aria-hidden />
        <div className="brand-laser-core">
          {children}
        </div>
      </div>
    </div>
  );
}
