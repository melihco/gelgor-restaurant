'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ClientErrorBoundary } from '@/components/client-error-boundary';
import AppHeader from '@/tailadmin/layout/AppHeader';
import AppSidebar from '@/tailadmin/layout/AppSidebar';
import Backdrop from '@/tailadmin/layout/Backdrop';
import { useSidebar } from '@/tailadmin/context/SidebarContext';

export function PlatformAdminChrome({ children }: { children: ReactNode }) {
  const { isExpanded, isHovered } = useSidebar();
  const sidebarWide = isExpanded || isHovered;

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: '#07080f' }}>
      <Backdrop />
      <div
        className={cn(
          'min-h-screen transition-[grid-template-columns] duration-300 ease-in-out',
          'lg:grid lg:h-screen lg:min-h-0 lg:overflow-hidden',
          sidebarWide
            ? 'lg:[grid-template-columns:240px_minmax(0,1fr)]'
            : 'lg:[grid-template-columns:72px_minmax(0,1fr)]',
        )}
      >
        <AppSidebar />
        <div className="isolate flex min-h-screen w-full min-w-0 flex-1 flex-col lg:min-h-0 lg:h-full">
          <AppHeader />
          <main className="relative z-0 min-h-0 w-full min-w-0 flex-1 overflow-hidden">
            <ClientErrorBoundary>{children}</ClientErrorBoundary>
          </main>
        </div>
      </div>
    </div>
  );
}
