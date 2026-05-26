'use client';

import dynamic from 'next/dynamic';
import TopBar from '@/components/ui/TopBar';
import OpsSidebar from '@/components/dashboard/OpsSidebar';
import AgentDetailPanel from '@/components/dashboard/AgentDetailPanel';
import ActivityFeed from '@/components/dashboard/ActivityFeed';
import MiniAnalyticsStrip from '@/components/dashboard/MiniAnalyticsStrip';
import AssignTaskModal from '@/components/dashboard/AssignTaskModal';
import ArtifactCenter from '@/components/dashboard/ArtifactCenter';
import { useOfficeStore } from '@/stores/office-store';

const OfficeCanvas = dynamic(() => import('@/components/3d/OfficeCanvas'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#050610' }}>
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="h-10 w-10 animate-spin rounded-xl border-2 border-indigo-500/20 border-t-indigo-500/70" />
        </div>
        <div className="text-center">
          <p className="text-[11px] font-medium text-zinc-500">Dijital ofis hazırlanıyor</p>
          <p className="mt-0.5 text-[9px] text-zinc-700">3D sahne yükleniyor…</p>
        </div>
      </div>
    </div>
  ),
});

export default function DashboardShell() {
  const selectedAgentId = useOfficeStore((s) => s.selectedAgentId);
  const selectedZoneId  = useOfficeStore((s) => s.selectedZoneId);

  return (
    <div className="relative flex h-screen flex-col overflow-hidden" style={{ background: '#09090b' }}>
      <TopBar />

      <div className="flex min-h-0 flex-1 pt-12">
        <OpsSidebar />

        <main className="relative min-w-0 flex-1">
          <OfficeCanvas selectedAgentId={selectedAgentId} activeZoneId={selectedZoneId} />

          {/* Top vignette */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[#050610]/80 to-transparent" />
          {/* Bottom vignette */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#050610]/70 to-transparent" />
          {/* Subtle radial glow */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_40%,rgba(99,102,241,0.06),transparent_60%)]" />

          <ActivityFeed />
          <MiniAnalyticsStrip />
        </main>

        <AgentDetailPanel />
      </div>

      <AssignTaskModal />
      <ArtifactCenter />
    </div>
  );
}
