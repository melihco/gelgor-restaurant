/**
 * Customer-facing copy for mobile — hides internal service names from end users.
 */

export function humanizeMobileServiceError(raw: string, status?: number): string {
  const msg = String(raw ?? '').trim();
  const lower = msg.toLowerCase();

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

  return msg;
}

export function missionFeedStatusLabel(opts: {
  publishReady: number;
  productionTarget: number;
  hasPreviewContent: boolean;
  rate: number;
}): { title: string; subtitle?: string } {
  const { publishReady, productionTarget, hasPreviewContent, rate } = opts;
  if (rate < 80) {
    return { title: `Planınız %${rate} tamamlandı`, subtitle: 'AI ekibiniz çalışmaya devam ediyor.' };
  }
  if (publishReady >= productionTarget && hasPreviewContent) {
    return { title: 'Haftalık içerik paketiniz hazır', subtitle: 'Onay bekleyen gönderiler İçerik sekmesinde.' };
  }
  if (publishReady > 0) {
    return {
      title: `${publishReady}/${productionTarget} içerik onaya hazır`,
      subtitle: 'Kalan gönderiler birkaç dakika içinde eklenecek.',
    };
  }
  return {
    title: 'Planınız tamamlandı',
    subtitle: 'Görseller hazırlanıyor — kısa süre içinde İçerik sekmesinde görünür.',
  };
}

/** Müşteri dilinde kalan krediden tahmini içerik adedi (~35 kr / post+story). */
export function estimateRemainingPosts(remainingTokens: number): number {
  if (!Number.isFinite(remainingTokens) || remainingTokens <= 0) return 0;
  return Math.max(0, Math.floor(remainingTokens / 35));
}
