/**
 * Mission Hub — production factory status copy (phase + block reason).
 */
import type { MissionProductionJobsSummary } from '@/lib/api-client';

export type MissionProductionPhase =
  | 'idle'
  | 'queued'
  | 'producing'
  | 'partial'
  | 'complete'
  | 'blocked';

export type MissionProductionBlockReason =
  | 'platform_queue'
  | 'brand_in_flight'
  | 'budget'
  | 'provider_quota'
  | 'unknown';

export function missionProductionStatusCopy(
  summary: Pick<
    MissionProductionJobsSummary,
    'phase' | 'blockReason' | 'estimatedWaitMinutes' | 'ready' | 'total' | 'inFlight' | 'queued'
  > | null | undefined,
  opts?: { manifestReady?: number; manifestRequired?: number },
): { title: string; subtitle: string; inProgress: boolean } {
  const manifestReady = opts?.manifestReady ?? summary?.ready ?? 0;
  const manifestRequired = opts?.manifestRequired ?? 3;

  if (!summary || summary.total === 0) {
    return {
      title: 'Planınız hazır',
      subtitle: 'Görselleri üret\'e dokunarak haftalık paketi oluşturun.',
      inProgress: false,
    };
  }

  const phase = summary.phase ?? 'idle';
  const eta = summary.estimatedWaitMinutes;
  const etaText = eta != null && eta > 0 ? ` Tahmini süre: ~${eta} dk.` : '';

  if (phase === 'complete' || (summary.ready >= summary.total && summary.total > 0)) {
    return {
      title: 'Haftalık paket tamamlandı',
      subtitle: 'Onay bekleyen gönderiler İçerik sekmesinde.',
      inProgress: false,
    };
  }

  if (phase === 'partial' || manifestReady > 0) {
    return {
      title: `${manifestReady}/${manifestRequired} içerik hazır`,
      subtitle: `Kalan görseller üretiliyor (${summary.ready}/${summary.total} slot).${etaText}`,
      inProgress: true,
    };
  }

  if (phase === 'producing' || (summary.inFlight ?? 0) > 0) {
    return {
      title: 'Görseller üretiliyor',
      subtitle: `Üretim devam ediyor (${summary.ready}/${summary.total} slot).${etaText}`,
      inProgress: true,
    };
  }

  if (phase === 'queued') {
    if (summary.blockReason === 'brand_in_flight') {
      return {
        title: 'Markanızda üretim devam ediyor',
        subtitle: `Diğer slotlar kısa süre içinde başlayacak.${etaText}`,
        inProgress: true,
      };
    }
    if (summary.blockReason === 'budget') {
      return {
        title: 'Üretim kotası doldu',
        subtitle: 'Kredi veya günlük limit yenilenince otomatik devam eder.',
        inProgress: false,
      };
    }
    if (summary.blockReason === 'provider_quota') {
      return {
        title: 'Görsel servisi geçici limitte',
        subtitle: 'Sistem otomatik yeniden deneyecek. Birkaç dakika bekleyin.',
        inProgress: true,
      };
    }
    return {
      title: 'Üretim sırasındasınız',
      subtitle: `Platform yoğun — sıra ilerledikçe görselleriniz hazırlanacak.${etaText}`,
      inProgress: true,
    };
  }

  return {
    title: 'Planınız hazır',
    subtitle: 'Görselleri üret\'e dokunarak haftalık paketi oluşturun.',
    inProgress: false,
  };
}
