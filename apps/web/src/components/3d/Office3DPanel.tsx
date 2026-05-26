'use client';

import dynamic from 'next/dynamic';
import { Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOfficeStore } from '@/stores/office-store';

const OfficeCanvas = dynamic(() => import('@/components/3d/OfficeCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[320px] w-full items-center justify-center bg-[#050710]">
      <div className="text-center text-xs text-zinc-500">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-indigo-500/25 border-t-indigo-500" />
        3D ofis yükleniyor…
      </div>
    </div>
  ),
});

type Office3DPanelProps = {
  /** Ek Tailwind sınıfları (yükseklik vb.) */
  className?: string;
};

/**
 * TailAdmin sayfalarında WebGL ofis sahnesi — `OfficeCanvas` istemci tarafında yüklenir (SSR kapalı).
 */
export default function Office3DPanel({ className }: Office3DPanelProps) {
  const selectedAgentId = useOfficeStore((s) => s.selectedAgentId);
  const selectedZoneId = useOfficeStore((s) => s.selectedZoneId);

  return (
    <div
      className={cn(
        'relative w-full overflow-hidden bg-[#050710]',
        'min-h-[320px] h-[min(52vh,560px)]',
        className,
      )}
    >
      <OfficeCanvas selectedAgentId={selectedAgentId} activeZoneId={selectedZoneId} />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 bg-gradient-to-b from-[#050610]/95 via-[#050610]/40 to-transparent px-4 pb-10 pt-3 sm:px-5">
        <p className="flex items-center gap-2 text-[11px] font-medium leading-snug text-zinc-400">
          <Layers className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
          <span>
            Dijital ofis katı — bölgelere tıklayarak yakınlaşın; istasyonlara tıklayınca sağdaki ajan paneli açılır.
          </span>
        </p>
        <span className="hidden shrink-0 text-[10px] text-zinc-600 sm:block">Sürükleyerek döndürün</span>
      </div>
    </div>
  );
}
