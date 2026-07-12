/**
 * fal.ai şablon galerisi — Canva archetype kataloğu + marka design-template etiketleri.
 */

import {
  CANVA_ARCHETYPE_CATALOG,
  pickSectorArchetypePool,
  type CanvaArchetypeId,
  type CanvaArchetypeSpec,
  type CanvaFormat,
} from './canva-archetype-catalog';

export const DESIGN_TEMPLATE_TYPE_LABELS: Record<string, { tr: string; desc: string }> = {
  campaign_announcement: {
    tr: 'Kampanya duyurusu',
    desc: 'İndirim, teklif ve kampanya paylaşımları.',
  },
  event_special: {
    tr: 'Özel gün / etkinlik',
    desc: 'Bayram, sezon ve etkinlik kutlamaları.',
  },
  menu_highlight: {
    tr: 'Menü / ürün',
    desc: 'Menü ve ürün tanıtım görselleri.',
  },
  venue_showcase: {
    tr: 'Mekan vitrini',
    desc: 'Mekan atmosferini öne çıkaran story/post.',
  },
  seasonal_promo: {
    tr: 'Sezon kampanyası',
    desc: 'Mevsimsel promosyon tasarımları.',
  },
  social_proof: {
    tr: 'Sosyal kanıt',
    desc: 'Yorum ve müşteri memnuniyeti paylaşımları.',
  },
  daily_story: {
    tr: 'Günlük story',
    desc: 'Sade günlük paylaşım şablonu.',
  },
  announcement_formal: {
    tr: 'Resmi duyuru',
    desc: 'Kurumsal duyuru ve bilgilendirme.',
  },
  reel_cover: {
    tr: 'Reel kapağı',
    desc: 'Reels video kapak tasarımı.',
  },
  brand_identity: {
    tr: 'Marka kimliği',
    desc: 'Logo ve marka tonu vitrini.',
  },
};

/** Stil referansı — layout önizlemeleri (fal çıktısı değil, kompozisyon ipucu). */
export const ARCHETYPE_REFERENCE_IMAGE: Partial<Record<CanvaArchetypeId, string>> = {
  frosted_quote_card: '/remotion-showcase/poster_gala_invite_01_story.png',
  magazine_cover_drop: '/remotion-showcase/poster_event_masthead_01_post.png',
  split_feature_panel: '/remotion-showcase/poster_promo_split_02_post.png',
  diagonal_brand_split: '/remotion-showcase/poster_promo_split_01_post.png',
  cinematic_full_bleed: '/remotion-showcase/poster_restaurant_feature_01_post.png',
  campaign_hero_block: '/remotion-showcase/poster_promo_split_03_post.png',
  event_ticket_stub: '/remotion-showcase/poster_event_masthead_01_story.png',
  gallery_carousel_tease: '/remotion-showcase/poster_festival_grid_01_story.png',
  before_after_diptych: '/remotion-showcase/poster_restaurant_feature_03_post.png',
  location_pin_card: '/remotion-showcase/poster_editorial_date_01_post.png',
  neon_night_promo: '/remotion-showcase/poster_neon_club_02_story.png',
  polaroid_memory: '/remotion-showcase/poster_editorial_date_03_post.png',
  noir_editorial: '/remotion-showcase/poster_art_deco_01_story.png',
  promo_price_stack: '/remotion-showcase/poster_promo_split_04_story.png',
  social_proof_banner: '/remotion-showcase/poster_gala_invite_04_story.png',
  editorial_date_masthead: '/remotion-showcase/poster_editorial_date_04_post.png',
  product_hero_card: '/remotion-showcase/poster_restaurant_feature_01_post.png',
  graphic_shape_stack: '/remotion-showcase/poster_lineup_tiered_03_post.png',
};

export const ARCHETYPE_LABELS_TR: Record<CanvaArchetypeId, string> = {
  frosted_quote_card: 'Buzlu alıntı kartı',
  magazine_cover_drop: 'Dergi kapağı',
  split_feature_panel: 'Bölünmüş panel',
  diagonal_brand_split: 'Çapraz marka bölümü',
  cinematic_full_bleed: 'Sinematik tam ekran',
  campaign_hero_block: 'Kampanya hero bloğu',
  event_ticket_stub: 'Etkinlik bileti',
  gallery_carousel_tease: 'Galeri kolaj',
  before_after_diptych: 'Önce / sonra',
  location_pin_card: 'Konum pini',
  neon_night_promo: 'Neon gece',
  polaroid_memory: 'Polaroid anı',
  noir_editorial: 'Noir editoryal',
  promo_price_stack: 'Fiyat / teklif yığını',
  social_proof_banner: 'Sosyal kanıt bandı',
  editorial_date_masthead: 'Editoryal tarih',
  product_hero_card: 'Ürün hero',
  graphic_shape_stack: 'Grafik şekil yığını',
};

export const FORMAT_LABELS: Record<CanvaFormat, string> = {
  post: 'Post',
  story: 'Story',
  reel: 'Reels',
};

export interface BrandDesignTemplateRow {
  id: string;
  template_type: string;
  template_name: string;
  format: string;
  thumbnail_url?: string | null;
  catalog_slot_key?: string | null;
  usage_count?: number;
  status?: string;
}

export function normalizeDesignTemplateRow(raw: Record<string, unknown>): BrandDesignTemplateRow {
  return {
    id: String(raw.id ?? ''),
    template_type: String(raw.template_type ?? raw.templateType ?? ''),
    template_name: String(raw.template_name ?? raw.templateName ?? 'Şablon'),
    format: String(raw.format ?? 'post'),
    thumbnail_url: (raw.thumbnail_url ?? raw.thumbnailUrl) as string | null | undefined,
    catalog_slot_key: (raw.catalog_slot_key ?? raw.catalogSlotKey) as string | null | undefined,
    usage_count: Number(raw.usage_count ?? raw.usageCount ?? 0),
    status: String(raw.status ?? 'active'),
  };
}

export function sectorArchetypeIds(sector: string, format: CanvaFormat = 'post'): CanvaArchetypeId[] {
  return pickSectorArchetypePool(sector, format);
}

export function listArchetypesForGallery(formatFilter: CanvaFormat | 'all'): CanvaArchetypeSpec[] {
  if (formatFilter === 'all') return CANVA_ARCHETYPE_CATALOG;
  return CANVA_ARCHETYPE_CATALOG.filter((a) => a.formats.includes(formatFilter));
}

export function archetypeDisplayName(spec: CanvaArchetypeSpec): string {
  return ARCHETYPE_LABELS_TR[spec.id as CanvaArchetypeId] ?? spec.name;
}

export function archetypeReferenceUrl(id: CanvaArchetypeId): string | undefined {
  return ARCHETYPE_REFERENCE_IMAGE[id];
}
