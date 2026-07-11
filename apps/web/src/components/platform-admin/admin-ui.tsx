'use client';

import type { ReactNode } from 'react';
import {
  GlassPanel,
  MetricsGrid,
  PageHeader,
  SectionHeader,
  MetricCard,
  LoadingSkeleton,
  EmptyState,
} from '@/tailadmin/components/application/PageElements';
import { pa } from '@/components/platform-admin/platform-admin-styles';
import { cn } from '@/lib/utils';

export {
  MetricsGrid,
  PageHeader,
  MetricCard,
  LoadingSkeleton,
  EmptyState,
  SectionHeader,
};

/** Desk shell (#07080f) ile uyumlu — çift arka plan yok. */
export function DataCanvas({
  children,
  className,
  maxWidth = 'max-w-[1560px]',
}: {
  children: ReactNode;
  className?: string;
  maxWidth?: string;
}) {
  return (
    <div className={cn(pa.page, className)}>
      <div className={cn(pa.pageInner, maxWidth)}>{children}</div>
    </div>
  );
}

export function AdminSurface({
  children,
  className,
  padding = 'lg',
}: {
  children: ReactNode;
  className?: string;
  padding?: 'none' | 'md' | 'lg';
}) {
  const paddingClass = padding === 'none' ? 'p-0' : padding === 'md' ? 'p-5' : 'p-6';
  return (
    <GlassPanel className={className} padding={paddingClass}>
      {children}
    </GlassPanel>
  );
}

export function AdminSectionTitle({
  title,
  subtitle,
  count,
  action,
}: {
  title: string;
  subtitle?: string;
  count?: number;
  action?: ReactNode;
}) {
  return <SectionHeader title={title} subtitle={subtitle} count={count} action={action} />;
}

export function AdminAsideStat({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper?: string;
}) {
  return <MetricCard label={label} value={value} helper={helper} tone="cyan" />;
}
