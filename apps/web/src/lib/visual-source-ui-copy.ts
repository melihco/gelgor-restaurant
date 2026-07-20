/**
 * Brand Hub — Görsel Kaynak Tercihi UI copy + save patches.
 * Enums stay stable; only labels/descriptions adapt by sector family.
 */
import type { VisualSourceMode } from '@/lib/ai-visual-production-standard';
import { getDefaultVisualSubject } from '@/lib/sector-production-profile';

export type VisualSourceUiFamily = 'venue' | 'product' | 'digital';

export function resolveVisualSourceUiFamily(
  sector: string | null | undefined,
): VisualSourceUiFamily {
  const subject = getDefaultVisualSubject(sector);
  if (subject === 'product_closeup') return 'product';
  if (subject === 'digital_ui') return 'digital';
  return 'venue';
}

export type VisualSourceModeCopy = {
  id: VisualSourceMode;
  icon: string;
  title: string;
  desc: string;
};

const MODE_COPY: Record<VisualSourceUiFamily, VisualSourceModeCopy[]> = {
  venue: [
    {
      id: 'gallery_only',
      icon: '\u{1F4F7}',
      title: 'Galeri fotoğrafları',
      desc: 'Galeri / Instagram’dan gelen gerçek mekan görselleri — AI düzeltme yok',
    },
    {
      id: 'gallery_enhanced',
      icon: '\u2728',
      title: 'Galeri + sahne düzeltme',
      desc: 'Gerçek fotoğraflara ışık, mood ve hafif sahne iyileştirmesi',
    },
    {
      id: 'ai_generated',
      icon: '\u{1F916}',
      title: 'AI görsel üretimi',
      desc: 'Caption’dan sıfırdan yapay zeka görseli oluştur',
    },
  ],
  product: [
    {
      id: 'gallery_only',
      icon: '\u{1F4F7}',
      title: 'Ürün fotoğrafları',
      desc: 'Galeri’deki gerçek ürün / paket görselleri — AI staging yok',
    },
    {
      id: 'gallery_enhanced',
      icon: '\u2728',
      title: 'Ürün foto + AI sahne',
      desc: 'Ürünü koruyarak ışık, zemin ve lifestyle sahne düzenlemesi',
    },
    {
      id: 'ai_generated',
      icon: '\u{1F916}',
      title: 'AI ürün görseli',
      desc: 'Caption’dan sıfırdan ürün / vitrin görseli üret',
    },
  ],
  digital: [
    {
      id: 'gallery_only',
      icon: '\u{1F4F7}',
      title: 'Galeri görselleri',
      desc: 'Yüklenen referans görseller — AI düzeltme yok',
    },
    {
      id: 'gallery_enhanced',
      icon: '\u2728',
      title: 'Galeri + AI düzenleme',
      desc: 'Referans görsellere ışık ve sahne düzenlemesi',
    },
    {
      id: 'ai_generated',
      icon: '\u{1F916}',
      title: 'AI görsel üretimi',
      desc: 'Caption’dan sıfırdan arayüz / marka görseli oluştur',
    },
  ],
};

export function getVisualSourceModeCopy(
  sector: string | null | undefined,
): VisualSourceModeCopy[] {
  return MODE_COPY[resolveVisualSourceUiFamily(sector)];
}

const LEVEL_LABEL: Record<string, string> = {
  subtle: 'Hafif',
  moderate: 'Orta',
  full: 'Tam',
};

const SUBJECT_LABEL: Record<VisualSourceUiFamily, Record<string, string>> = {
  venue: {
    auto: 'Otomatik',
    venue_ambiance: 'Mekan / ambiyans',
    product_hero: 'Ürün hero',
    digital_ui: 'Dijital arayüz',
  },
  product: {
    auto: 'Otomatik (ürün)',
    venue_ambiance: 'Mekan / ambiyans',
    product_hero: 'Ürün hero',
    digital_ui: 'Dijital arayüz',
  },
  digital: {
    auto: 'Otomatik',
    venue_ambiance: 'Mekan / ambiyans',
    product_hero: 'Ürün hero',
    digital_ui: 'Dijital arayüz',
  },
};

export function labelAiEnhanceLevel(level: string): string {
  return LEVEL_LABEL[level] ?? 'Orta';
}

export function labelAiVisualSubject(
  subject: string,
  sector: string | null | undefined,
): string {
  const family = resolveVisualSourceUiFamily(sector);
  return SUBJECT_LABEL[family][subject] ?? SUBJECT_LABEL.venue.auto ?? 'Otomatik';
}

/** Hint under the selected radio — does not promise staging alone. */
export function getVisualSourceModeHint(
  mode: VisualSourceMode,
  opts: {
    sector?: string | null;
    level?: string;
    subject?: string;
  },
): string | null {
  const family = resolveVisualSourceUiFamily(opts.sector);
  if (mode === 'gallery_only') {
    return family === 'product'
      ? 'Ham ürün fotoğrafları kullanılır; AI sahne/staging kapalı.'
      : 'Ham galeri fotoğrafları kullanılır; AI düzeltme kapalı.';
  }
  if (mode === 'gallery_enhanced') {
    const level = labelAiEnhanceLevel(opts.level ?? 'moderate');
    const subject = labelAiVisualSubject(opts.subject ?? 'auto', opts.sector);
    return `Yoğunluk: ${level} · Konu: ${subject}. İleri ayarlardan değiştirilebilir.`;
  }
  if (mode === 'ai_generated') {
    return family === 'product'
      ? 'Feed postlarında caption’dan AI ürün görseli üretilir (fal motion ayrı kalır).'
      : 'Feed postlarında caption’dan AI görsel üretilir (fal motion ayrı kalır).';
  }
  return null;
}

export function getEmptyGalleryWarning(sector: string | null | undefined): string {
  const family = resolveVisualSourceUiFamily(sector);
  if (family === 'product') {
    return 'Henüz ürün fotoğrafınız yok. Galeri sekmesinden yükleyin — o zamana kadar AI görseller otomatik üretilir.';
  }
  if (family === 'digital') {
    return 'Henüz referans görseliniz yok. Galeri sekmesinden yükleyin — o zamana kadar AI görseller otomatik üretilir.';
  }
  return 'Henüz mekan fotoğrafınız yok. Galeri sekmesinden yükleyin — o zamana kadar AI görseller otomatik üretilir.';
}

/** Concrete theme patch for a radio mode (keeps flags + mode aligned). */
export function buildVisualSourceModePatch(
  mode: VisualSourceMode,
): Record<string, unknown> {
  if (mode === 'gallery_only') {
    return {
      visual_source_mode: 'gallery_only',
      ai_photo_enhance: false,
      ai_caption_driven_visual: false,
      ai_enhance_gallery_selected: false,
    };
  }
  if (mode === 'ai_generated') {
    return {
      visual_source_mode: 'ai_generated',
      ai_photo_enhance: true,
      ai_caption_driven_visual: true,
      ai_enhance_gallery_selected: true,
    };
  }
  return {
    visual_source_mode: 'gallery_enhanced',
    ai_photo_enhance: true,
    ai_caption_driven_visual: false,
    ai_enhance_gallery_selected: true,
  };
}

/**
 * When advanced enhance / caption toggles change, keep visual_source_mode in sync.
 */
export function buildVisualSourceModeFromFlags(flags: {
  aiPhotoEnhance: boolean;
  aiCaptionDrivenVisual?: boolean;
}): Record<string, unknown> {
  if (!flags.aiPhotoEnhance) {
    return buildVisualSourceModePatch('gallery_only');
  }
  if (flags.aiCaptionDrivenVisual) {
    return buildVisualSourceModePatch('ai_generated');
  }
  return buildVisualSourceModePatch('gallery_enhanced');
}
