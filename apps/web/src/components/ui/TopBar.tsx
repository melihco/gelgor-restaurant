'use client';

import { Bell, ChevronDown, Command, Plus, Radio, Search, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { SmartAgencyLogo } from '@/components/brand/SmartAgencyLogo';
import { useDashboardSnapshot } from '@/hooks/use-dashboard-snapshot';
import { useNavigationStore } from '@/stores/navigation-store';
import { useInteractionStore } from '@/stores/interaction-store';
import { apiClient } from '@/lib/api-client';
import { trPageTitle } from '@/lib/i18n/tr-shell';
import { StatusPill } from '@/components/ui/command-center';

export default function TopBar() {
  const { data } = useDashboardSnapshot();
  const openAssignModal = useInteractionStore((state) => state.openAssignModal);
  const { data: security } = useQuery({
    queryKey: ['current-user-security'],
    queryFn: () => apiClient.getCurrentUserSecurity(),
    staleTime: 60_000,
  });
  const currentPage = useNavigationStore((state) => state.currentPage);

  const page = trPageTitle(currentPage);
  const agents = data?.agents ?? [];
  const briefAgent = agents.find((agent) => agent.backendAgentType === 'AiCeo') ?? agents[0];
  const workingCount = agents.filter((agent) => agent.state === 'working').length;
  const pendingCount = data?.pendingArtifacts?.length ?? 0;
  const blockedCount = agents.filter((agent) => agent.state === 'blocked' || agent.state === 'error').length;

  const environmentLabel = process.env.NEXT_PUBLIC_APP_ENV ?? 'Development';
  const isLive = environmentLabel.toLowerCase().includes('live');

  return (
    <header className="relative z-40 border-b border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
      <div className="flex h-[76px] items-center justify-between gap-5 px-5 sm:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 shrink-0 items-center overflow-hidden rounded-xl bg-black px-2 shadow-theme-md dark:ring-1 dark:ring-white/10">
            <SmartAgencyLogo variant="full" className="h-8 max-h-8 max-w-[132px]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="truncate text-base font-semibold tracking-[-0.02em] text-gray-800 dark:text-white/90">{page.title}</h1>
            <StatusPill label={isLive ? 'Canlı' : environmentLabel} tone={isLive ? 'emerald' : 'amber'} pulse={isLive} />
            </div>
            <p className="mt-1 hidden max-w-2xl truncate text-xs text-gray-500 dark:text-gray-400 sm:block">{page.subtitle}</p>
          </div>
        </div>

        <div className="hidden min-w-[320px] max-w-xl flex-1 xl:block">
          <button
            type="button"
            className="group flex h-11 w-full items-center gap-3 rounded-lg border border-gray-200 bg-transparent px-4 text-left text-sm text-gray-800 shadow-theme-xs transition-colors hover:border-brand-300 hover:ring-3 hover:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-white/90"
          >
            <Search className="h-4 w-4 text-gray-400" />
            <span className="flex-1 text-gray-400">Agent, çıktı, onay veya brief ara...</span>
            <span className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] font-semibold text-gray-500 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
              <Command className="h-3 w-3" /> K
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => briefAgent && openAssignModal(briefAgent.apiId)}
            disabled={!briefAgent}
            className="hidden items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50 lg:inline-flex"
          >
            <Plus className="h-4 w-4" />
            Yeni Brief
          </button>
          <div className="hidden items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-white/[0.03] lg:flex">
            <Radio className="h-3.5 w-3.5 text-success-500" />
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{workingCount} canlı agent</span>
          </div>
          <div className="hidden items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-white/[0.03] lg:flex">
            <ShieldCheck className="h-3.5 w-3.5 text-brand-500" />
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{blockedCount} risk</span>
          </div>
          <button
            type="button"
            className="relative flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-white"
          >
            <Bell className="h-5 w-5" />
            {pendingCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-error-500 px-1 text-[10px] font-bold text-white">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            type="button"
            className="flex items-center gap-2 rounded-full border border-gray-200 bg-white py-1.5 pl-1.5 pr-3 shadow-theme-xs transition-colors hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-white/[0.03]"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-500 dark:bg-brand-500/15 dark:text-brand-300">
              {(security?.displayName || security?.role || 'S')[0]?.toUpperCase()}
            </div>
            <div className="hidden text-left md:block">
              <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{security?.displayName ?? 'SmartAgency'}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{security?.role ?? 'Operator'}</p>
            </div>
            <ChevronDown className="hidden h-3.5 w-3.5 text-gray-500 md:block" />
          </button>
        </div>
      </div>

      <div className="flex h-9 items-center gap-4 border-t border-gray-200 px-5 text-[11px] text-gray-500 dark:border-gray-800 dark:text-gray-400 sm:px-7">
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-brand-500" />
          Kalıcı yapay zekâ durumu: {agents.length} ajan izleniyor
        </span>
        <span className="hidden h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-700 sm:inline-flex" />
        <span className="hidden sm:inline-flex">{pendingCount} onay bekliyor</span>
        <span className="hidden h-1 w-1 rounded-full bg-gray-300 dark:bg-gray-700 md:inline-flex" />
        <span className="hidden items-center gap-1.5 md:inline-flex">
          <Zap className="h-3 w-3 text-warning-500" />
          Canlı aksiyonlar onay kontrollü
        </span>
      </div>
    </header>
  );
}
