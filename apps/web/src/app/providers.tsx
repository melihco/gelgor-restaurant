'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect, type ReactNode } from 'react';
import { registerQueryClient } from '@/lib/query-client-bridge';
import { useNotificationStore } from '@/stores/notification-store';
import { apiClient, ApiRequestError } from '@/lib/api-client';
import { hasBrowserApiAuthContext } from '@/lib/runtime-config';
import { isNexusBackendReachable } from '@/lib/nexus-health';
import { initializeSignalR } from '@/lib/signalr';
import { SidebarProvider } from '@/tailadmin/context/SidebarContext';
import { ThemeProvider } from '@/tailadmin/context/ThemeContext';

function NotificationHydration() {
  const setNotifications = useNotificationStore((s) => s.setNotifications);

  useEffect(() => {
    let disposed = false;

    const hydrate = async () => {
      if (!hasBrowserApiAuthContext()) {
        return;
      }

      try {
        const notifications = await apiClient.getNotifications();
        if (!disposed) {
          setNotifications(notifications);
        }
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 0) {
          console.debug(
            '[notifications] Nexus API şu anda ulaşılamıyor. .NET\'i çalıştırın veya NEXT_PUBLIC_BROWSER_API_PROXY=true iken doğru BACKEND_ORIGIN kullanıldığından emin olun.',
          );
        } else if (error instanceof ApiRequestError && error.status === 401) {
          console.debug('[notifications] Oturum yok veya süresi doldu; giriş sonrası yenilenecek.');
        } else if (error instanceof ApiRequestError && error.status >= 500) {
          console.debug('[notifications] Sunucu hatası — boş liste kullanılıyor.', error.responseBody?.slice(0, 120));
          if (!disposed) setNotifications([]);
        } else {
          console.error('Failed to hydrate notifications from API', error);
        }
      }

      try {
        if (!(await isNexusBackendReachable())) {
          console.debug(
            '[signalr] Nexus API ulaşılamıyor — canlı bildirimler atlandı. ' +
              'PostgreSQL + `cd apps/api/src/Nexus.Api && dotnet run` (port 5050).',
          );
          return;
        }
        await initializeSignalR();
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (
          /500|Internal Server Error|Failed to fetch|negotiation|Handshake was canceled|stopped during negotiation/i.test(
            msg,
          )
        ) {
          console.debug(
            '[signalr] Hub bağlantısı kurulamadı (Nexus kapalı, proxy veya dev hot-reload).',
            msg.slice(0, 120),
          );
        } else {
          console.warn('Failed to initialize SignalR', error);
        }
      }
    };

    void hydrate();

    const onAuthChanged = () => {
      void hydrate();
    };
    window.addEventListener('smartagency-auth-changed', onAuthChanged);

    return () => {
      disposed = true;
      window.removeEventListener('smartagency-auth-changed', onAuthChanged);
    };
  }, [setNotifications]);

  return null;
}

function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 60 s global default — most data (missions, briefs, agents) is stable within a minute.
        // Brand scores use server-side cache; artifacts use the dedicated poller.
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => {
          if (error instanceof ApiRequestError) {
            if (error.status === 429 || error.status === 404) return false;
          }
          return failureCount < 1;
        },
        refetchOnWindowFocus: false,
      },
    },
  });
}

/** Shared React Query client — used by mobile and desk routes. */
export function QueryProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createAppQueryClient);

  registerQueryClient(queryClient);

  useEffect(() => {
    return () => {
      registerQueryClient(null);
    };
  }, [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/** Desk-only chrome: TailAdmin theme, sidebar, notifications + SignalR. */
export function DeskProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <SidebarProvider>
        <NotificationHydration />
        {children}
      </SidebarProvider>
    </ThemeProvider>
  );
}

/** @deprecated Prefer QueryProviders at root + DeskProviders on /desk. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryProviders>
      <DeskProviders>{children}</DeskProviders>
    </QueryProviders>
  );
}
