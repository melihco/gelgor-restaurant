/**
 * Customer-facing copy for mobile — hides internal service names from end users.
 */

import type { MissionProductionJobsSummary } from '@/lib/api-client';
import { missionProductionStatusCopy } from '@/lib/mission-production-status';

export function humanizeMobileServiceError(raw: string, status?: number): string {
  const msg = String(raw ?? '').trim();
  const lower = msg.toLowerCase();

  if (
    lower.includes('<!doctype')
    || lower.includes('<html')
    || lower.includes('data-next-head')
  ) {
    if (status === 404) {
      return 'Kayıt servisi bu adreste bulunamadı. Uygulama yanlış projeden yayınlanmış olabilir — Vercel Root Directory: apps/web olmalı.';
    }
    return 'Sunucu beklenmeyen bir yanıt döndürdü. API bağlantı ayarlarını kontrol edin.';
  }

  if (
    lower.includes('backend_not_configured')
    || lower.includes('nexus_api_url')
    || lower.includes('backend_origin ortam')
  ) {
    return 'Kayıt servisi henüz yapılandırılmadı. NEXUS_API_URL (Railway API adresi) Vercel ortam değişkenlerine eklenmeli.';
  }

  if (
    status === 503
    || lower.includes('crew_backend')
    || lower.includes('service unavailable')
    || lower.includes('could not reach')
  ) {
    return 'Servis geçici olarak ulaşılamıyor. Birkaç dakika sonra tekrar deneyin.';
  }

  if (
    status === 0
    || lower.includes('failed to fetch')
    || lower.includes('network error')
    || lower.includes('aborted')
    || lower.includes('timeout')
  ) {
    return 'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.';
  }

  if (lower.includes('nexus') || lower.includes(':5050') || lower.includes(':8000')) {
    return 'Bağlantı sorunu oluştu. Lütfen birkaç dakika sonra tekrar deneyin.';
  }

  if (lower.includes('mission progress failed')) {
    return 'Plan durumu alınamadı. Sayfayı yenileyin.';
  }

  if (lower.includes('feed başlatılamadı') || lower.includes('feed üretimi')) {
    return msg.replace(/crew_backend[^\s]*/gi, '').trim() || 'İçerik üretimi şu an başlatılamadı.';
  }

  if (
    lower.includes('requeue-factory-jobs')
    || lower.includes('slot denemeleri tükendi')
    || lower.includes('endpoint')
  ) {
    return 'Eksik görseller kuyruğa alınıyor. Birkaç dakika içinde tekrar deneyin.';
  }

  return msg;
}

export function missionFeedStatusLabel(opts: {
  publishReady: number;
  productionTarget: number;
  hasPreviewContent: boolean;
  rate: number;
  feedProductionActive?: boolean;
  factorySummary?: Pick<
    MissionProductionJobsSummary,
    'total' | 'ready' | 'phase' | 'blockReason' | 'estimatedWaitMinutes' | 'inFlight' | 'queued'
  > | null;
}): { title: string; subtitle?: string } {
  const { publishReady, productionTarget, hasPreviewContent, rate, feedProductionActive, factorySummary } = opts;

  if (factorySummary && (factorySummary.total ?? 0) > 0) {
    const copy = missionProductionStatusCopy(factorySummary, {
      manifestReady: publishReady,
      manifestRequired: productionTarget,
    });
    return { title: copy.title, subtitle: copy.subtitle };
  }

  const { publishReady: pr, productionTarget: pt, hasPreviewContent: hpc, rate: r, feedProductionActive: fpa } = opts;
  if (r < 80) {
    return { title: `Planınız %${r} tamamlandı`, subtitle: 'AI ekibiniz çalışmaya devam ediyor.' };
  }
  if (pr >= pt && hpc) {
    return { title: 'Haftalık içerik paketiniz hazır', subtitle: 'Onay bekleyen gönderiler İçerik sekmesinde.' };
  }
  if (pr > 0) {
    return {
      title: `${pr}/${pt} içerik onaya hazır`,
      subtitle: 'Kalan gönderiler birkaç dakika içinde eklenecek.',
    };
  }
  if (fpa) {
    return {
      title: 'Görseller üretiliyor',
      subtitle: 'Gönderiler hazır oldukça İçerik sekmesinde görünür.',
    };
  }
  return {
    title: 'Planınız tamamlandı',
    subtitle: 'Görselleri üret\'e dokunarak haftalık paketi oluşturun.',
  };
}

/** Müşteri dilinde kalan krediden tahmini içerik adedi (~35 kr / post+story). */
export function estimateRemainingPosts(remainingTokens: number): number {
  if (!Number.isFinite(remainingTokens) || remainingTokens <= 0) return 0;
  return Math.max(0, Math.floor(remainingTokens / 35));
}
