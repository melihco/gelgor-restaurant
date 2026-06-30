/**
 * Brand design template presets — the recurring template "slots" each brand
 * gets generated during onboarding. Definitions are sector-agnostic in shape but
 * carry sector-aware sample copy + gallery asset preferences so the generated
 * preview reflects the brand's actual work (menu, venue, product, etc.).
 *
 * The engine ([brand-design-template-engine.ts]) turns each definition into one
 * Fal.ai-generated preview grounded on a matched gallery photo.
 */

export type DesignTemplateFormat = 'story' | 'post' | 'reel_cover';

/** Stable template_type identifiers persisted in brand_design_templates. */
export type DesignTemplateType =
  | 'campaign_announcement'
  | 'event_special'
  | 'menu_highlight'
  | 'venue_showcase'
  | 'seasonal_promo'
  | 'social_proof'
  | 'daily_story'
  | 'announcement_formal'
  | 'reel_cover'
  | 'brand_identity';

export interface DesignTemplatePreset {
  templateType: DesignTemplateType;
  /** Locale-aware display name (TR). */
  name: string;
  format: DesignTemplateFormat;
  /** Mission intent this template maps to in production routing. */
  intent: string;
  /** Sample headline rendered in the preview (placeholder copy). */
  sampleHeadline: string;
  sampleSubtitle?: string;
  /**
   * Gallery asset types preferred for this template, in priority order. Used to
   * select the most representative real photo as the design base.
   */
  preferredAssetTypes: string[];
  /** Caption-like keywords used to score gallery photos for this template. */
  matchKeywords: string;
  /** Whether the brand logo should be embedded prominently. */
  prominentLogo: boolean;
}

/** Sector-tailored noun for the brand's primary "product" surface. */
function sectorSubject(sector: string): { item: string; venue: string; product: string } {
  const s = (sector || '').toLowerCase();
  if (/(restaurant|cafe|coffee|bakery|patisserie|pizz|sushi|brunch|gelato)/.test(s)) {
    return { item: 'lezzet', venue: 'mekan', product: 'menü' };
  }
  if (/(beach_club|beach|night|bar|cocktail|club)/.test(s)) {
    return { item: 'deneyim', venue: 'mekan', product: 'gece' };
  }
  if (/(hotel|hospitality|resort|spa|travel)/.test(s)) {
    return { item: 'konaklama', venue: 'tesis', product: 'oda' };
  }
  if (/(beauty|salon|wellness|yoga|barber|skincare)/.test(s)) {
    return { item: 'bakım', venue: 'salon', product: 'hizmet' };
  }
  if (/(fashion|boutique|jewelry|streetwear)/.test(s)) {
    return { item: 'koleksiyon', venue: 'mağaza', product: 'ürün' };
  }
  if (/(fitness|gym)/.test(s)) {
    return { item: 'antrenman', venue: 'stüdyo', product: 'program' };
  }
  return { item: 'deneyim', venue: 'mekan', product: 'hizmet' };
}

/**
 * Resolve the 10 design template presets tailored to the brand's sector. Sample
 * copy and gallery asset preferences shift per sector while template_type and
 * format stay stable for production routing.
 */
export function resolveDesignTemplatePresets(sector: string): DesignTemplatePreset[] {
  const subj = sectorSubject(sector);

  return [
    {
      templateType: 'campaign_announcement',
      name: 'Kampanya Duyurusu',
      format: 'post',
      intent: 'campaign',
      sampleHeadline: 'Özel Kampanya',
      sampleSubtitle: 'Sınırlı süre — kaçırma',
      preferredAssetTypes: ['venue_reference', 'product_image', 'food_drink_photo'],
      matchKeywords: `kampanya fırsat indirim özel teklif ${subj.item}`,
      prominentLogo: true,
    },
    {
      templateType: 'event_special',
      name: 'Özel Gün',
      format: 'story',
      intent: 'event',
      sampleHeadline: 'Mutlu Bayramlar',
      sampleSubtitle: 'Sizinle kutluyoruz',
      preferredAssetTypes: ['venue_reference', 'food_drink_photo', 'product_image'],
      matchKeywords: `özel gün kutlama bayram etkinlik ${subj.venue}`,
      prominentLogo: true,
    },
    {
      templateType: 'menu_highlight',
      name: 'Menü / Ürün Öne Çıkar',
      format: 'post',
      intent: 'product',
      sampleHeadline: `Bugünün ${subj.item === 'lezzet' ? 'Lezzeti' : 'Önerisi'}`,
      sampleSubtitle: 'Taze ve özel',
      preferredAssetTypes: ['food_drink_photo', 'product_image'],
      matchKeywords: `${subj.product} ${subj.item} öne çıkan ürün tabak sunum`,
      prominentLogo: false,
    },
    {
      templateType: 'venue_showcase',
      name: 'Mekan Tanıtımı',
      format: 'story',
      intent: 'daily',
      sampleHeadline: 'Seni Bekliyoruz',
      sampleSubtitle: '',
      preferredAssetTypes: ['venue_reference'],
      matchKeywords: `${subj.venue} atmosfer ambiyans iç mekan dış mekan manzara`,
      prominentLogo: false,
    },
    {
      templateType: 'seasonal_promo',
      name: 'Sezon Kampanyası',
      format: 'post',
      intent: 'seasonal',
      sampleHeadline: 'Yeni Sezon',
      sampleSubtitle: 'Bu mevsime özel',
      preferredAssetTypes: ['venue_reference', 'product_image', 'food_drink_photo'],
      matchKeywords: `sezon yaz kış ilkbahar sonbahar mevsim özel ${subj.item}`,
      prominentLogo: true,
    },
    {
      templateType: 'social_proof',
      name: 'Müşteri Yorumu',
      format: 'story',
      intent: 'social_proof',
      sampleHeadline: '"Harika bir deneyim"',
      sampleSubtitle: '— Mutlu misafirimiz',
      preferredAssetTypes: ['venue_reference', 'food_drink_photo'],
      matchKeywords: `yorum puan memnuniyet misafir müşteri deneyim ${subj.venue}`,
      prominentLogo: true,
    },
    {
      templateType: 'daily_story',
      name: 'Günlük Story',
      format: 'story',
      intent: 'daily',
      sampleHeadline: 'Günaydın',
      sampleSubtitle: '',
      preferredAssetTypes: ['venue_reference', 'food_drink_photo', 'product_image'],
      matchKeywords: `günlük selam günaydın bugün ${subj.venue} ${subj.item}`,
      prominentLogo: false,
    },
    {
      templateType: 'announcement_formal',
      name: 'Resmi Duyuru',
      format: 'post',
      intent: 'announcement',
      sampleHeadline: 'Önemli Duyuru',
      sampleSubtitle: 'Bilgilerinize',
      preferredAssetTypes: ['venue_reference'],
      matchKeywords: `duyuru bilgilendirme çalışma saatleri yeni haber ${subj.venue}`,
      prominentLogo: true,
    },
    {
      templateType: 'reel_cover',
      name: 'Reel Kapağı',
      format: 'reel_cover',
      intent: 'reel',
      sampleHeadline: 'İzlemeye Değer',
      sampleSubtitle: '',
      preferredAssetTypes: ['venue_reference', 'food_drink_photo', 'product_image'],
      matchKeywords: `reel video kapak öne çıkan an ${subj.venue} ${subj.item}`,
      prominentLogo: true,
    },
    {
      templateType: 'brand_identity',
      name: 'Marka Kimliği',
      format: 'post',
      intent: 'branding',
      sampleHeadline: '',
      sampleSubtitle: '',
      preferredAssetTypes: ['venue_reference', 'product_image'],
      matchKeywords: `marka kimlik logo slogan değerler ${subj.venue}`,
      prominentLogo: true,
    },
  ];
}

/** Map a design template intent to the auto-produce slot routing intent. */
export const DESIGN_TEMPLATE_INTENT_BY_TYPE: Record<DesignTemplateType, string> = {
  campaign_announcement: 'campaign',
  event_special: 'event',
  menu_highlight: 'product',
  venue_showcase: 'daily',
  seasonal_promo: 'seasonal',
  social_proof: 'social_proof',
  daily_story: 'daily',
  announcement_formal: 'announcement',
  reel_cover: 'reel',
  brand_identity: 'branding',
};
