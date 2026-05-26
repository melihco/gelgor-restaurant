'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect, type ReactNode } from 'react';
import { registerQueryClient } from '@/lib/query-client-bridge';
import { useNotificationStore } from '@/stores/notification-store';
import { apiClient, ApiRequestError } from '@/lib/api-client';
import { hasBrowserApiAuthContext } from '@/lib/runtime-config';
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
        } else {
          console.error('Failed to hydrate notifications from API', error);
        }
      }

      try {
        await initializeSignalR();
      } catch (error) {
        console.error('Failed to initialize SignalR', error);
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

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (failureCount, error) => {
              if (error instanceof ApiRequestError) {
                // 429/404 are usually non-transient here; retrying fans out traffic.
                if (error.status === 429 || error.status === 404) return false;
              }
              return failureCount < 1;
            },
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  registerQueryClient(queryClient);

  useEffect(() => {
    return () => {
      registerQueryClient(null);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SidebarProvider>
          <NotificationHydration />
          {children}
        </SidebarProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
