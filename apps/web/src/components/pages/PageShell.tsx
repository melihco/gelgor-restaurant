'use client';

import TopBar from '@/components/ui/TopBar';
import AppNavigation from '@/components/ui/AppNavigation';

export default function PageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col" style={{ background: '#09090b' }}>
      <TopBar />
      <div className="flex min-h-0 flex-1 pt-12">
        <AppNavigation />
        <main className="ml-14 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-8 py-8">
            <h1 className="mb-6 text-xl font-bold text-white">{title}</h1>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
