'use client';

import Badge from '@/tailadmin/components/ui/badge/Badge';

const STATUS_BADGE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'light' | 'primary'> = {
  ready: 'success',
  completed: 'success',
  running: 'info',
  in_flight: 'info',
  approved: 'primary',
  proposed: 'warning',
  pending: 'warning',
  rendering: 'info',
  producing: 'info',
  failed: 'error',
  rejected: 'error',
  cancelled: 'light',
  missing: 'light',
  skipped: 'light',
};

export function AdminStatusBadge({ status, label }: { status: string; label?: string }) {
  const key = status.toLowerCase();
  return (
    <Badge color={STATUS_BADGE[key] ?? 'light'} size="sm">
      {label ?? status}
    </Badge>
  );
}

export function AdminProgressBar({ pct, className }: { pct: number; className?: string }) {
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800 ${className ?? ''}`}>
      <div
        className="h-full rounded-full bg-brand-500 transition-all"
        style={{ width: `${v}%` }}
      />
    </div>
  );
}
