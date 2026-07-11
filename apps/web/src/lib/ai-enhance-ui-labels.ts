/**
 * Mission Hub — AI Fotoğraf İyileştirme durum etiketleri (TR).
 */
import type { GptEnhanceSkipCode } from '@/lib/gpt-enhance-policy';

export type AiEnhanceUiStatus = 'applied' | 'skipped' | 'off' | 'failed';

const SKIP_LABEL_PROD: Record<GptEnhanceSkipCode, string> = {
  disabled: 'Kapalı',
  format_excluded: 'Bu format için uygulanmıyor',
  remotion_story: 'Tasarımlı story (fal.ai) kullanıldı',
  fal_story: 'fal.ai story poster tasarımı kullanıldı',
  remotion_post: 'Tasarımlı post kullanıldı',
  gallery_match_ok: 'Galeri yeterli — atlandı',
  stock_only: 'Stok görsel',
  non_venue_saas: 'Mekan dışı işletme — atlandı',
  remotion_grade: 'Tasarım katmanı uygulandı — atlandı',
};

const SKIP_LABEL_DEBUG: Record<GptEnhanceSkipCode, string> = {
  disabled: 'ai_photo_enhance kapalı',
  format_excluded: 'Format filtresi (ai_enhance_formats)',
  remotion_story: 'Policy: designed_story',
  fal_story: 'Policy: fal_story',
  remotion_post: 'Policy: designed_post',
  gallery_match_ok: 'Policy: galeri skoru yeterli',
  stock_only: 'Stok galeri',
  non_venue_saas: 'Policy: non_venue_saas (sektör venue dışı)',
  remotion_grade: 'Policy: designed_grade (render-time grade)',
};

export function labelAiEnhanceSkip(
  code: GptEnhanceSkipCode,
  debugMode: boolean,
): string {
  return debugMode ? SKIP_LABEL_DEBUG[code] : SKIP_LABEL_PROD[code];
}

export function labelAiEnhanceStatus(
  status: AiEnhanceUiStatus,
  skipCode: GptEnhanceSkipCode | null | undefined,
  debugMode: boolean,
): string {
  if (status === 'applied') {
    return debugMode ? 'GPT enhance uygulandı' : 'Fotoğraf iyileştirildi';
  }
  if (status === 'off') {
    return debugMode ? 'AI görsel kapalı' : 'Kapalı';
  }
  if (status === 'failed') {
    return debugMode ? 'Enhance API boş döndü' : 'İyileştirme uygulanamadı';
  }
  if (skipCode) return labelAiEnhanceSkip(skipCode, debugMode);
  return debugMode ? 'Atlandı' : 'Bu slotta uygulanmıyor';
}

export function summarizeAiEnhanceItems(
  items: Array<{ aiEnhanceStatus?: AiEnhanceUiStatus; aiEnhanceLabel?: string }>,
  debugMode: boolean,
): string | null {
  const withStatus = items.filter((i) => i.aiEnhanceStatus);
  if (!withStatus.length) return null;
  const applied = withStatus.filter((i) => i.aiEnhanceStatus === 'applied').length;
  const skipped = withStatus.filter((i) => i.aiEnhanceStatus === 'skipped').length;
  const adaptiveApplied = withStatus.filter(
    (i) => i.aiEnhanceStatus === 'applied' && (i.aiEnhanceLabel?.includes('uyarlandı') || i.aiEnhanceLabel?.includes('adaptive')),
  ).length;
  if (applied === 0 && skipped > 0) {
    return debugMode
      ? `AI enhance: 0/${withStatus.length} uygulandı (çoğu policy skip)`
      : `AI fotoğraf iyileştirme bu pakette uygulanmadı — tasarım şablonlarıyla üretildi.`;
  }
  if (applied > 0 && skipped > 0) {
    return debugMode
      ? `AI enhance: ${applied}/${withStatus.length} uygulandı${adaptiveApplied ? ` (${adaptiveApplied} adaptive scene)` : ''}`
      : adaptiveApplied > 0
        ? `${applied} gönderide caption'a uygun sahne kuruldu, ${skipped} slotta şablon/galeri kullanıldı.`
        : `${applied} gönderide fotoğraf iyileştirildi, ${skipped} slotta tasarım/galeri kullanıldı.`;
  }
  if (applied === withStatus.length) {
    return debugMode
      ? `AI enhance: ${applied}/${withStatus.length} uygulandı`
      : adaptiveApplied === applied
        ? `${applied} gönderide caption'a uygun sahne/ürün kompoziti uygulandı.`
        : `${applied} gönderide AI fotoğraf iyileştirme uygulandı.`;
  }
  return null;
}
