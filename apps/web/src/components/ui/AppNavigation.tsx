'use client';

import {
  LayoutDashboard, Settings, Bot, FileText, CheckSquare, Zap,
  CreditCard, Activity, ChevronLeft,
} from 'lucide-react';
import { useNavigationStore, type AppPage } from '@/stores/navigation-store';

const NAV_ITEMS: { id: AppPage; label: string; icon: typeof LayoutDashboard; accent?: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'setup', label: 'Kurulum', icon: Settings },
  { id: 'agents', label: 'Agentlar', icon: Bot },
  { id: 'outputs', label: 'Çıktılar', icon: FileText },
  { id: 'approvals', label: 'Onaylar', icon: CheckSquare },
  { id: 'executions', label: 'Uygulamalar', icon: Activity },
  { id: 'billing', label: 'Faturalama', icon: CreditCard },
];

export default function AppNavigation() {
  const { currentPage, navigate } = useNavigationStore();

  if (currentPage === 'dashboard') return null;

  return (
    <nav
      className="fixed left-0 top-12 z-40 flex h-[calc(100vh-48px)] w-14 flex-col items-center border-r border-white/[0.04] py-3"
      style={{ background: 'rgba(6,7,14,0.95)', backdropFilter: 'blur(12px)' }}
    >
      <button
        type="button"
        onClick={() => navigate('dashboard')}
        className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-white/[0.06]"
        title="Dashboard"
      >
        <ChevronLeft className="h-4 w-4 text-zinc-500" />
      </button>
      <div className="h-px w-7 bg-white/[0.06]" />
      <div className="mt-3 flex flex-1 flex-col gap-1">
        {NAV_ITEMS.filter((n) => n.id !== 'dashboard').map((item) => {
          const active = currentPage === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.id)}
              className="group relative flex h-10 w-10 items-center justify-center rounded-lg transition-all"
              style={{
                background: active ? 'rgba(99,102,241,0.12)' : 'transparent',
                border: active ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
              }}
              title={item.label}
            >
              <item.icon className={`h-4 w-4 ${active ? 'text-indigo-400' : 'text-zinc-600'}`} />
              <span className="pointer-events-none absolute left-full ml-2 hidden whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-[10px] font-medium text-zinc-300 group-hover:block">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
