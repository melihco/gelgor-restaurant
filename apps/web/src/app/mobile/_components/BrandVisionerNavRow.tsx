'use client';

/**
 * Shared visioner nav row — editorial SaMenuIndex language (not AI list chrome).
 */
import React from 'react';
import type { T } from './theme-context';
import { SaMenuIndex, SaMenuRow } from './SaMenuIndex';

export function BrandVisionerNavRow({
  t,
  label,
  accent,
  completion: _completion,
  icon,
  onClick,
}: {
  t: T;
  label: string;
  /** @deprecated unused — hints removed */
  hint?: string;
  accent: string;
  /** @deprecated progress bars removed from menu chrome */
  completion?: number;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <SaMenuRow
      t={t}
      label={label}
      accent={accent}
      icon={icon}
      onClick={onClick}
    />
  );
}

export function BrandVisionerList({ children }: { children: React.ReactNode }) {
  return <SaMenuIndex>{children}</SaMenuIndex>;
}

export function BrandVisionerGroup({ children }: { children: React.ReactNode }) {
  return <div className="sa-menu-index__slot">{children}</div>;
}
