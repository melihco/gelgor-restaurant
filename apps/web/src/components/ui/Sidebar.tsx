'use client';

import {
  Activity, BarChart3, Bot, BrainCircuit, CheckSquare, ChevronLeft,
  ChevronRight, CreditCard, FileText, Gauge, LayoutDashboard, Link2,
  MessageSquare, Palette, PenTool, SearchCode, Settings, ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';
import { SmartAgencyLogo } from '@/components/brand/SmartAgencyLogo';
import { useNavigationStore, type AppPage } from '@/stores/navigation-store';
import { useDashboardSnapshot } from '@/hooks/use-dashboard-snapshot';
import { cn } from '@/lib/utils';

interface NavItem {
  id: AppPage;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: number;
  accent?: string;
}

const groups: Array<{ label: string; items: Omit<NavItem, 'badge'>[] }> = [
  {
    label: 'Command',
    items: [
      { id: 'dashboard', label: 'Executive Dashboard', icon: LayoutDashboard, accent: '#22d3ee' },
      { id: 'agents', label: 'AI Agents Office', icon: Bot, accent: '#a78bfa' },
      { id: 'approvals', label: 'Approvals', icon: CheckSquare, accent: '#f59e0b' },
      { id: 'executions', label: 'Execution Center', icon: Activity, accent: '#34d399' },
    ],
  },
  {
    label: 'Growth',
    items: [
      { id: 'content', label: 'Content Studio', icon: PenTool, accent: '#f472b6' },
      { id: 'brand', label: 'Brand Hub', icon: Palette, accent: '#465fff' },
      { id: 'reviews', label: 'Review Management', icon: MessageSquare, accent: '#fb7185' },
      { id: 'ads', label: 'Google Ads', icon: BarChart3, accent: '#fbbf24' },
      { id: 'visitors', label: 'Analytics', icon: Gauge, accent: '#60a5fa' },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { id: 'outputs', label: 'Artifact Center', icon: FileText, accent: '#818cf8' },
      { id: 'reports', label: 'Customer Reports', icon: BrainCircuit, accent: '#22d3ee' },
      { id: 'seo', label: 'SEO Intelligence', icon: SearchCode, accent: '#34d399' },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'setup', label: 'Integrations / Setup', icon: Link2, accent: '#a78bfa' },
      { id: 'billing', label: 'Billing & Usage', icon: CreditCard, accent: '#f59e0b' },
      { id: 'readiness', label: 'Live Readiness', icon: ShieldCheck, accent: '#34d399' },
      { id: 'settings', label: 'Settings / Security', icon: Settings, accent: '#71717a' },
    ],
  },
];

export default function Sidebar() {
  const { currentPage, navigate } = useNavigationStore();
  const { data } = useDashboardSnapshot();
  const [collapsed, setCollapsed] = useState(false);

  const pendingApprovals = data?.pendingArtifacts?.length ?? 0;
  const workingAgents = data?.agents?.filter((agent) => agent.state === 'working').length ?? 0;
  const blockedAgents = data?.agents?.filter((agent) => agent.state === 'blocked' || agent.state === 'error').length ?? 0;

  function badgeFor(id: AppPage) {
    if (id === 'agents') return workingAgents || undefined;
    if (id === 'approvals') return pendingApprovals || undefined;
    if (id === 'executions') return blockedAgents || undefined;
    return undefined;
  }

  return (
    <aside
      className="relative z-50 flex h-full shrink-0 flex-col border-r border-gray-200 bg-white shadow-theme-xl transition-all duration-300 dark:border-gray-800 dark:bg-gray-900"
      style={{ width: collapsed ? 88 : 290 }}
    >
      <div className="flex h-[68px] items-center gap-3 border-b border-gray-200 px-4 dark:border-gray-800">
        <SmartAgencyLogo
          variant={collapsed ? 'mark' : 'full'}
          framed
          className={collapsed ? '!h-7 !w-7' : '!h-8 max-w-[168px]'}
        />
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-5 scrollbar-thin">
        {groups.map((group) => (
          <div key={group.label} className="mb-6">
            {!collapsed && (
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                {group.label}
              </p>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = currentPage === item.id;
                const badge = badgeFor(item.id);
                return (
                  <button
                    key={`${group.label}-${item.label}`}
                    type="button"
                    onClick={() => navigate(item.id)}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'group relative flex w-full items-center gap-3 overflow-hidden rounded-lg px-3 py-2.5 text-left text-theme-sm font-medium transition-all duration-200',
                      active
                        ? 'bg-brand-50 text-brand-500 dark:bg-brand-500/[0.12] dark:text-brand-400'
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-gray-300',
                    )}
                  >
                    {active && (
                      <span
                        className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-brand-500 dark:bg-brand-400"
                      />
                    )}
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                        active ? 'text-brand-500 dark:text-brand-400' : 'text-gray-500 group-hover:text-gray-700 dark:text-gray-400 dark:group-hover:text-gray-300',
                      )}
                    >
                      <item.icon className="h-[18px] w-[18px]" />
                    </span>
                    {!collapsed && (
                      <>
                        <span className="min-w-0 flex-1 truncate">
                          {item.label}
                        </span>
                        {badge && (
                          <span className={cn(
                            'flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold',
                            active ? 'bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300' : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300',
                          )}>
                            {badge}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-gray-200 p-3 dark:border-gray-800">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white py-2 text-gray-500 shadow-theme-xs transition-colors hover:bg-gray-50 hover:text-gray-700 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          {!collapsed && <span className="text-xs font-semibold">Daralt</span>}
        </button>
      </div>
    </aside>
  );
}
