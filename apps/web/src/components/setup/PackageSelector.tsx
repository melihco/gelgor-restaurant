'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Star, Zap } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import type { PackageDefinition } from '@/types';

const ACCENT: Record<string, string> = {
  starter: '#38bdf8',
  growth: '#a78bfa',
  performance: '#f472b6',
  executive: '#fbbf24',
};

export default function PackageSelector() {
  const queryClient = useQueryClient();

  const { data: packages = [] } = useQuery({
    queryKey: ['packages'],
    queryFn: () => apiClient.getPackages(),
  });

  const { data: subscription } = useQuery({
    queryKey: ['subscription'],
    queryFn: () => apiClient.getSubscription(),
  });

  const selectMutation = useMutation({
    mutationFn: (packageId: string) => apiClient.selectPackage(packageId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['subscription'] }),
        queryClient.invalidateQueries({ queryKey: ['onboarding-status'] }),
      ]);
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-white">Paket Seçimi</h2>
        <p className="mt-1 text-sm text-zinc-500">İhtiyaçlarınıza uygun paketi seçin. Dilediğiniz zaman yükseltebilirsiniz.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {packages.map((pkg) => {
          const selected = subscription?.packageId === pkg.id;
          const accent = ACCENT[pkg.slug] ?? '#6366f1';
          const features: string[] = safeParseArray(pkg.features);
          const agents: string[] = safeParseArray(pkg.includedAgentTypes);

          return (
            <div
              key={pkg.id}
              className="relative flex flex-col rounded-2xl p-5 transition-all"
              style={{
                background: selected ? `${accent}0a` : 'rgba(255,255,255,0.015)',
                border: selected ? `1px solid ${accent}40` : '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {pkg.isPopular && (
                <div className="absolute -top-2.5 right-4 flex items-center gap-1 rounded-full px-3 py-0.5" style={{ background: accent }}>
                  <Star className="h-3 w-3 text-white" />
                  <span className="text-[9px] font-bold text-white">POPÜLER</span>
                </div>
              )}

              <p className="text-sm font-bold text-white">{pkg.name}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{pkg.description}</p>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-2xl font-black text-white">₺{pkg.monthlyPrice.toLocaleString('tr-TR')}</span>
                <span className="text-xs text-zinc-600">/ay</span>
              </div>
              <p className="text-[10px] text-zinc-700">Yıllık: ₺{pkg.yearlyPrice.toLocaleString('tr-TR')}/yıl</p>

              <div className="mt-3 text-[10px] text-zinc-500">
                {pkg.taskLimitPerMonth === -1 ? 'Sınırsız görev' : `Aylık ${pkg.taskLimitPerMonth} görev`}
                {' · '}{agents.length} agent
              </div>

              <div className="mt-4 flex-1 space-y-1.5">
                {features.map((f, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-3 w-3 shrink-0" style={{ color: accent }} />
                    <span className="text-[11px] text-zinc-400">{f}</span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => selectMutation.mutate(pkg.id)}
                disabled={selected || selectMutation.isPending}
                className="mt-5 w-full rounded-lg py-2.5 text-xs font-bold text-white transition-all hover:brightness-110 disabled:opacity-60"
                style={{ background: selected ? `${accent}33` : accent }}
              >
                {selected ? '✓ Aktif Paket' : selectMutation.isPending ? 'Seçiliyor...' : 'Bu Paketi Seç'}
              </button>
            </div>
          );
        })}
      </div>

      {packages.length === 0 && (
        <div className="rounded-xl border border-white/[0.06] p-8 text-center">
          <p className="text-sm text-zinc-500">Paket bilgileri yükleniyor...</p>
        </div>
      )}
    </div>
  );
}

function safeParseArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
