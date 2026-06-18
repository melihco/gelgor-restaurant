/**
 * Sector Production Profile — single source of truth for all sector-specific
 * production behaviour. Every sector in the platform has exactly one profile.
 *
 * Design principle: NO scattered isXxxSector() helpers in business logic.
 * Instead call getSectorProfile(sector) and read the property you need.
 * Adding a new sector = adding one row to SECTOR_PROFILES below.
 */

export type GalleryReliability =
  /** Venue/food/product photos from the website are directly usable → trust gallery score. */
  | 'high'
  /** Photos are partially relevant but may miss specific brief context. */
  | 'medium'
  /**
   * Scraped photos are generic or unrelated to the specific service brief
   * (e.g. a nail salon website has interior shots but not close-up nail-art per caption).
   * High gallery score is misleading → adaptive scene + caption-driven needed.
   */
  | 'low';

export type DefaultVisualSubject =
  | 'venue_interior'   // Restaurant, hotel, beach club — venue IS the product
  | 'service_person'   // Person receiving/performing the service
  | 'product_closeup'  // E-commerce, handmade, local shop — item is hero
  | 'lifestyle'        // Aspirational lifestyle shot, subject secondary
  | 'digital_ui'       // SaaS, software, B2B — show product UI / digital screen
  | 'auto';            // Let the creative director decide

export type EnhanceLevel = 'strong' | 'moderate' | 'light' | 'none';

/** Color grading direction for Remotion stories and GPT image prompts. */
export type ColorGrade = 'warm' | 'cool' | 'vibrant' | 'neutral' | 'dark_moody';

/** Reel pacing driven by sector energy. */
export type ReelPacing = 'fast_cut' | 'mid_tempo' | 'slow_burn';

export interface SectorProductionProfile {
  /**
   * Canonical sector ID — must match what brand_contexts.business_type stores.
   * Aliases (e.g. "nail_salon" → same profile as "beauty_wellness") are handled
   * by normalization in getSectorProfile().
   */
  sectorId: string;

  /** Does this business have a physical location that customers visit? */
  hasPhysicalVenue: boolean;

  /**
   * Are scraped website / gallery photos reliable for matching a specific brief?
   * 'high'   → restaurant food photo = relevant for any food post
   * 'medium' → shop exterior = partially relevant
   * 'low'    → nail salon interior ≠ specific nail art for "summer gel nails"
   */
  galleryReliability: GalleryReliability;

  /**
   * What should the primary visual subject be?
   * Used by the creative director and enhance pipeline.
   */
  defaultVisualSubject: DefaultVisualSubject;

  /**
   * How aggressively should GPT enhance/regenerate the reference photo?
   * 'strong' → gallery photo is just a starting point, full scene rewrite OK
   * 'moderate' → enhance colors/light, keep scene
   * 'light' → barely touch the photo
   * 'none' → no GPT enhance (non-venue / digital sectors)
   */
  defaultEnhanceLevel: EnhanceLevel;

  /**
   * When gallery match score is "high enough to skip enhance",
   * should we still run the enhance pass?
   *
   * TRUE when galleryReliability is low — a high score means "the photo topic
   * matches" but the photo still doesn't show the specific visual the brief needs.
   */
  forceAdaptiveScene: boolean;

  /**
   * Should caption/brief drive a fresh AI generation when gallery is too weak?
   * TRUE for service businesses where gallery rarely has brief-specific shots.
   */
  captionDrivenDefault: boolean;

  /**
   * Should gallery photos be used as a revision base rather than passed through raw?
   * TRUE for all physical venue businesses with AI enhance enabled.
   */
  galleryRevisionDefault: boolean;

  /**
   * Background scene description injected into the AI image prompt.
   * Tells the model WHAT to render regardless of caption words.
   * Example: beauty → "modern nail salon interior", beach → "sea terrace, golden hour".
   */
  backgroundScenePrompt: string;

  /**
   * Hard negative constraints specific to this sector.
   * Prevents the most common AI confusions (e.g. beauty → no cafe/restaurant scene).
   */
  imageNegativeGuards: string[];

  /**
   * Scene lock subject when the brief references a specific service/product.
   * Used in the VISUAL SCENE LOCK block injected at prompt top.
   */
  sceneLockSubject: string;

  /** Color grading direction for Remotion and GPT image generation. */
  colorGrade: ColorGrade;

  /** Reel pacing: how fast should cuts/transitions be? */
  reelPacing: ReelPacing;

  /**
   * Fallback headline text when no AI-generated headline is available.
   * Should be a short, universal phrase that sounds natural for the sector.
   */
  headlineFallback: string;

  /** Recommended enhance level label for the UI. */
  recommendedEnhanceLevelLabel: string;

  /**
   * Whether "menü/menu" in a caption/title means a SERVICE price list
   * (not a food menu). TRUE for service businesses.
   * Used in isProductContent() to avoid triggering food-product mode.
   */
  menuIsServiceList: boolean;
}

// ─── Sector Profile Table ────────────────────────────────────────────────────
// Add a new row here whenever a new sector is introduced.
// ONE row = ONE sector. All production logic reads from here.

const SECTOR_PROFILES: SectorProductionProfile[] = [
  // ── Restaurants / Cafes ──────────────────────────────────────────────────
  {
    sectorId: 'restaurant_cafe',
    hasPhysicalVenue: true,
    galleryReliability: 'high',
    defaultVisualSubject: 'venue_interior',
    defaultEnhanceLevel: 'moderate',
    forceAdaptiveScene: false,
    captionDrivenDefault: false,
    galleryRevisionDefault: true,
    backgroundScenePrompt: 'warm restaurant interior, beautifully plated food, ambient candlelight, natural wood surfaces, shallow depth of field, appetising editorial photography',
    imageNegativeGuards: ['No beauty salon', 'no nail art', 'no manicure tools'],
    sceneLockSubject: 'beautifully plated dish or warm cafe interior with natural lighting',
    colorGrade: 'warm',
    reelPacing: 'mid_tempo',
    headlineFallback: 'Yeni Lezzet',
    recommendedEnhanceLevelLabel: 'Moderate — venue atmosphere preserved',
    menuIsServiceList: false,
  },

  // ── Coffee Shops ──────────────────────────────────────────────────────────
  {
    sectorId: 'coffee_shop',
    hasPhysicalVenue: true,
    galleryReliability: 'high',
    defaultVisualSubject: 'venue_interior',
    defaultEnhanceLevel: 'moderate',
    forceAdaptiveScene: false,
    captionDrivenDefault: false,
    galleryRevisionDefault: true,
    backgroundScenePrompt: 'cozy coffee shop interior, latte art close-up, warm ambient lighting, exposed brick or wooden shelving, morning light streaming through windows',
    imageNegativeGuards: [],
    sceneLockSubject: 'artisan coffee preparation or cozy cafe corner with warm lighting',
    colorGrade: 'warm',
    reelPacing: 'mid_tempo',
    headlineFallback: 'Bugünkü Fincan',
    recommendedEnhanceLevelLabel: 'Moderate — warm cafe atmosphere',
    menuIsServiceList: false,
  },

  // ── Fine Dining ──────────────────────────────────────────────────────────
  {
    sectorId: 'fine_dining',
    hasPhysicalVenue: true,
    galleryReliability: 'high',
    defaultVisualSubject: 'venue_interior',
    defaultEnhanceLevel: 'light',
    forceAdaptiveScene: false,
    captionDrivenDefault: false,
    galleryRevisionDefault: false,
    backgroundScenePrompt: 'luxury restaurant setting, immaculate white tablecloth, artfully plated gourmet dish, soft candlelight, crystal glassware, refined ambiance',
    imageNegativeGuards: ['No fast food', 'no plastic packaging', 'no casual decor'],
    sceneLockSubject: 'gourmet dish presented with precision on fine china, luxury restaurant ambiance',
    colorGrade: 'warm',
    reelPacing: 'slow_burn',
    headlineFallback: 'Özel Deneyim',
    recommendedEnhanceLevelLabel: 'Light — luxury venue authenticity',
    menuIsServiceList: false,
  },

  // ── Beach Clubs ──────────────────────────────────────────────────────────
  {
    sectorId: 'beach_club',
    hasPhysicalVenue: true,
    galleryReliability: 'high',
    defaultVisualSubject: 'venue_interior',
    defaultEnhanceLevel: 'light',
    forceAdaptiveScene: false,
    captionDrivenDefault: false,
    galleryRevisionDefault: false,
    backgroundScenePrompt: 'sun-drenched Mediterranean terrace with turquoise sea view, soft bokeh, golden hour light, white linen sunbeds, Aegean atmosphere',
    imageNegativeGuards: ['No indoor office', 'no city backdrop', 'no winter scene'],
    sceneLockSubject: 'turquoise sea view from luxury terrace with golden hour sunlight',
    colorGrade: 'vibrant',
    reelPacing: 'mid_tempo',
    headlineFallback: 'Yaz Modu',
    recommendedEnhanceLevelLabel: 'Light — preserve venue authenticity',
    menuIsServiceList: false,
  },

  // ── Hospitality / Hotels ─────────────────────────────────────────────────
  {
    sectorId: 'hospitality',
    hasPhysicalVenue: true,
    galleryReliability: 'high',
    defaultVisualSubject: 'venue_interior',
    defaultEnhanceLevel: 'moderate',
    forceAdaptiveScene: false,
    captionDrivenDefault: false,
    galleryRevisionDefault: true,
    backgroundScenePrompt: 'luxury hotel room or lobby, premium linens, architectural details, soft diffused light, five-star hospitality aesthetic',
    imageNegativeGuards: [],
    sceneLockSubject: 'premium hotel suite or scenic hotel terrace with aspirational ambiance',
    colorGrade: 'cool',
    reelPacing: 'slow_burn',
    headlineFallback: 'Konfor Burada',
    recommendedEnhanceLevelLabel: 'Moderate — luxury hotel feel',
    menuIsServiceList: false,
  },

  // ── Beauty & Wellness (nail, manicure, spa, facials…) ───────────────────
  {
    sectorId: 'beauty_wellness',
    hasPhysicalVenue: true,
    galleryReliability: 'low',
    defaultVisualSubject: 'service_person',
    defaultEnhanceLevel: 'strong',
    forceAdaptiveScene: true,
    captionDrivenDefault: true,
    galleryRevisionDefault: true,
    backgroundScenePrompt: 'modern beauty salon interior, clean white marble surfaces, soft diffused window light, premium minimal aesthetic, fresh botanicals, pastel tones',
    imageNegativeGuards: [
      'SECTOR GUARD: This is a BEAUTY/NAIL SALON. STRICTLY FORBIDDEN: cafe tables, coffee cups, restaurant setting, dining chairs, food photography, menu boards, kitchen, bar counter, wine bottles, storefront with food signage.',
    ],
    sceneLockSubject: 'close-up of beautifully manicured hands or person receiving a professional beauty treatment, softly blurred salon background',
    colorGrade: 'cool',
    reelPacing: 'slow_burn',
    headlineFallback: 'Bakım Zamanı',
    recommendedEnhanceLevelLabel: 'Strong — brief/caption drives the visual',
    menuIsServiceList: true,
  },

  // ── Barber / Hair Salon ──────────────────────────────────────────────────
  {
    sectorId: 'barber_salon',
    hasPhysicalVenue: true,
    galleryReliability: 'low',
    defaultVisualSubject: 'service_person',
    defaultEnhanceLevel: 'strong',
    forceAdaptiveScene: true,
    captionDrivenDefault: true,
    galleryRevisionDefault: true,
    backgroundScenePrompt: 'modern barbershop or hair salon, stylish barber chair, clean mirrors, professional tools neatly arranged, premium grooming aesthetic',
    imageNegativeGuards: [
      'SECTOR GUARD: This is a BARBER/HAIR SALON. STRICTLY FORBIDDEN: restaurant setting, food, cafe tables, coffee cups, kitchen equipment.',
    ],
    sceneLockSubject: 'professional hair styling or barbering service, stylish salon setting',
    colorGrade: 'neutral',
    reelPacing: 'mid_tempo',
    headlineFallback: 'Stil Zamanı',
    recommendedEnhanceLevelLabel: 'Strong — service-specific visuals',
    menuIsServiceList: true,
  },

  // ── Healthcare / General Clinics ─────────────────────────────────────────
  {
    sectorId: 'healthcare_clinic',
    hasPhysicalVenue: true,
    galleryReliability: 'medium',
    defaultVisualSubject: 'service_person',
    defaultEnhanceLevel: 'light',
    forceAdaptiveScene: false,
    captionDrivenDefault: false,
    galleryRevisionDefault: false,
    backgroundScenePrompt: 'clean modern medical clinic, professional healthcare environment, soft natural light, white surfaces, trust-inspiring aesthetic',
    imageNegativeGuards: [
      'No dramatic medical procedures visible', 'no blood', 'no frightening imagery',
      'No food', 'no restaurant setting',
    ],
    sceneLockSubject: 'professional medical or clinical setting with clean, reassuring atmosphere',
    colorGrade: 'cool',
    reelPacing: 'slow_burn',
    headlineFallback: 'Sağlıklı Yaşam',
    recommendedEnhanceLevelLabel: 'Light — professional trust maintained',
    menuIsServiceList: true,
  },

  // ── Mental Health Clinics ────────────────────────────────────────────────
  {
    sectorId: 'mental_health_clinic',
    hasPhysicalVenue: false,
    galleryReliability: 'low',
    defaultVisualSubject: 'lifestyle',
    defaultEnhanceLevel: 'none',
    forceAdaptiveScene: false,
    captionDrivenDefault: false,
    galleryRevisionDefault: false,
    backgroundScenePrompt: 'serene lifestyle, calm nature setting, soft warm light, person in peaceful contemplation — never clinical or distressing',
    imageNegativeGuards: [
      'No clinical instruments', 'no medical equipment', 'no distressing imagery',
    ],
    sceneLockSubject: 'calm, peaceful lifestyle moment evoking wellbeing and serenity',
    colorGrade: 'warm',
    reelPacing: 'slow_burn',
    headlineFallback: 'İyi Hisset',
    recommendedEnhanceLevelLabel: 'Off — regulated sector',
    menuIsServiceList: true,
  },

  // ── Real Estate ──────────────────────────────────────────────────────────
  {
    sectorId: 'real_estate',
    hasPhysicalVenue: true,
    galleryReliability: 'high',
    defaultVisualSubject: 'venue_interior',
    defaultEnhanceLevel: 'moderate',
    forceAdaptiveScene: false,
    captionDrivenDefault: false,
    galleryRevisionDefault: false,
    backgroundScenePrompt: 'premium residential or commercial property, architectural photography, clean lines, natural light, aspirational living space',
    imageNegativeGuards: ['Do not alter architectural features', 'no fantasy CGI building'],
    sceneLockSubject: 'premium property interior or architectural exterior with aspirational lighting',
    colorGrade: 'neutral',
    reelPacing: 'slow_burn',
    headlineFallback: 'Yeni Adres',
    recommendedEnhanceLevelLabel: 'Moderate — property authenticity',
    menuIsServiceList: false,
  },

  // ── E-commerce / Retail ──────────────────────────────────────────────────
  {
    sectorId: 'ecommerce_retail',
    hasPhysicalVenue: false,
    galleryReliability: 'medium',
    defaultVisualSubject: 'product_closeup',
    defaultEnhanceLevel: 'moderate',
    forceAdaptiveScene: false,
    captionDrivenDefault: false,
    galleryRevisionDefault: true,
    backgroundScenePrompt: 'clean product photography, minimal studio background, premium e-commerce aesthetic, soft diffused light, hero product in focus',
    imageNegativeGuards: ['No cluttered background', 'no people unless styled'],
    sceneLockSubject: 'hero product shot with premium minimal background and editorial lighting',
    colorGrade: 'neutral',
    reelPacing: 'mid_tempo',
    headlineFallback: 'Yeni Ürün',
    recommendedEnhanceLevelLabel: 'Moderate — product hero',
    menuIsServiceList: false,
  },

  // ── Local Products / Artisan Shop ────────────────────────────────────────
  {
    sectorId: 'local_products_shop',
    hasPhysicalVenue: true,
    galleryReliability: 'medium',
    defaultVisualSubject: 'product_closeup',
    defaultEnhanceLevel: 'moderate',
    forceAdaptiveScene: false,
    captionDrivenDefault: false,
    galleryRevisionDefault: true,
    backgroundScenePrompt: 'artisan product lifestyle shot, natural textures, warm light, local market or boutique shop atmosphere',
    imageNegativeGuards: [],
    sceneLockSubject: 'artisan product in lifestyle context with warm natural textures',
    colorGrade: 'warm',
    reelPacing: 'mid_tempo',
    headlineFallback: 'Yerel Lezzet',
    recommendedEnhanceLevelLabel: 'Moderate — artisan product quality',
    menuIsServiceList: false,
  },

  // ── Handmade / Artisan Brand ─────────────────────────────────────────────
  {
    sectorId: 'handmade_product_brand',
    hasPhysicalVenue: false,
    galleryReliability: 'medium',
    defaultVisualSubject: 'product_closeup',
    defaultEnhanceLevel: 'moderate',
    forceAdaptiveScene: false,
    captionDrivenDefault: false,
    galleryRevisionDefault: true,
    backgroundScenePrompt: 'handcrafted product in beautiful flat-lay or lifestyle scene, natural linen, botanical props, artisan craft aesthetic, warm editorial light',
    imageNegativeGuards: ['No mass-produced factory look', 'no plastic packaging'],
    sceneLockSubject: 'handcrafted product styled with natural textures and artisan aesthetic',
    colorGrade: 'warm',
    reelPacing: 'slow_burn',
    headlineFallback: 'El Yapımı',
    recommendedEnhanceLevelLabel: 'Moderate — handcraft authenticity',
    menuIsServiceList: false,
  },

  // ── Fitness / Gym ────────────────────────────────────────────────────────
  {
    sectorId: 'fitness_gym',
    hasPhysicalVenue: true,
    galleryReliability: 'medium',
    defaultVisualSubject: 'service_person',
    defaultEnhanceLevel: 'moderate',
    forceAdaptiveScene: false,
    captionDrivenDefault: false,
    galleryRevisionDefault: true,
    backgroundScenePrompt: 'modern gym or fitness studio, energetic atmosphere, clean equipment, strong directional lighting, motivational environment',
    imageNegativeGuards: ['No food', 'no restaurant'],
    sceneLockSubject: 'person working out or fitness equipment in premium gym setting',
    colorGrade: 'vibrant',
    reelPacing: 'fast_cut',
    headlineFallback: 'Forma Zamanı',
    recommendedEnhanceLevelLabel: 'Moderate — energy and motivation',
    menuIsServiceList: true,
  },

  // ── Nightclub / Entertainment ────────────────────────────────────────────
  {
    sectorId: 'nightclub',
    hasPhysicalVenue: true,
    galleryReliability: 'medium',
    defaultVisualSubject: 'venue_interior',
    defaultEnhanceLevel: 'moderate',
    forceAdaptiveScene: false,
    captionDrivenDefault: false,
    galleryRevisionDefault: true,
    backgroundScenePrompt: 'upscale nightclub or entertainment venue, dramatic lighting, DJ booth, crowd energy, premium bar aesthetic, night atmosphere',
    imageNegativeGuards: [],
    sceneLockSubject: 'premium nightclub interior with dramatic lighting and night energy',
    colorGrade: 'dark_moody',
    reelPacing: 'fast_cut',
    headlineFallback: 'Bu Gece',
    recommendedEnhanceLevelLabel: 'Moderate — nightlife energy',
    menuIsServiceList: false,
  },

  // ── Moving / Logistics ───────────────────────────────────────────────────
  {
    sectorId: 'moving_logistics',
    hasPhysicalVenue: false,
    galleryReliability: 'low',
    defaultVisualSubject: 'lifestyle',
    defaultEnhanceLevel: 'moderate',
    forceAdaptiveScene: false,
    captionDrivenDefault: true,
    galleryRevisionDefault: false,
    backgroundScenePrompt: 'professional moving service, clean white truck, organized boxes, team in uniform, trust-inspiring logistics operation',
    imageNegativeGuards: ['No food', 'no restaurant', 'no beauty products'],
    sceneLockSubject: 'professional movers at work or organized relocation scene',
    colorGrade: 'neutral',
    reelPacing: 'mid_tempo',
    headlineFallback: 'Taşınmak Artık Kolay',
    recommendedEnhanceLevelLabel: 'Moderate',
    menuIsServiceList: true,
  },

  // ── Local Service Business (generic) ─────────────────────────────────────
  {
    sectorId: 'local_service_business',
    hasPhysicalVenue: true,
    galleryReliability: 'medium',
    defaultVisualSubject: 'auto',
    defaultEnhanceLevel: 'moderate',
    forceAdaptiveScene: false,
    captionDrivenDefault: false,
    galleryRevisionDefault: true,
    backgroundScenePrompt: 'professional local business environment, clean and trustworthy atmosphere, natural light',
    imageNegativeGuards: [],
    sceneLockSubject: 'professional service delivery in a clean, trustworthy local business setting',
    colorGrade: 'neutral',
    reelPacing: 'mid_tempo',
    headlineFallback: 'Hizmetinizdeyiz',
    recommendedEnhanceLevelLabel: 'Moderate',
    menuIsServiceList: true,
  },

  // ── Agency Services ──────────────────────────────────────────────────────
  {
    sectorId: 'agency_services',
    hasPhysicalVenue: false,
    galleryReliability: 'low',
    defaultVisualSubject: 'digital_ui',
    defaultEnhanceLevel: 'none',
    forceAdaptiveScene: false,
    captionDrivenDefault: false,
    galleryRevisionDefault: false,
    backgroundScenePrompt: 'modern agency office, creative team at work, branded digital screens, premium workspace aesthetic',
    imageNegativeGuards: ['No food', 'no restaurant', 'no venue photos'],
    sceneLockSubject: 'creative agency workspace or digital product interface in editorial lifestyle context',
    colorGrade: 'neutral',
    reelPacing: 'mid_tempo',
    headlineFallback: 'Yaratıcı Çözümler',
    recommendedEnhanceLevelLabel: 'Off — digital/SaaS brand',
    menuIsServiceList: false,
  },

  // ── Production / Creative Companies ──────────────────────────────────────
  {
    sectorId: 'production_company',
    hasPhysicalVenue: false,
    galleryReliability: 'medium',
    defaultVisualSubject: 'lifestyle',
    defaultEnhanceLevel: 'none',
    forceAdaptiveScene: false,
    captionDrivenDefault: false,
    galleryRevisionDefault: false,
    backgroundScenePrompt: 'creative studio, film production set, or design workspace with professional equipment',
    imageNegativeGuards: [],
    sceneLockSubject: 'creative production environment or behind-the-scenes studio moment',
    colorGrade: 'dark_moody',
    reelPacing: 'mid_tempo',
    headlineFallback: 'Yeni Proje',
    recommendedEnhanceLevelLabel: 'Off — creative portfolio brand',
    menuIsServiceList: false,
  },

  // ── Fashion Boutique ─────────────────────────────────────────────────────
  {
    sectorId: 'fashion_boutique',
    hasPhysicalVenue: true,
    galleryReliability: 'medium',     // Clothing photos work but need brief-specific styling
    defaultVisualSubject: 'product_closeup',
    defaultEnhanceLevel: 'strong',    // Lookbook quality requires strong visual treatment
    forceAdaptiveScene: true,         // "yeni koleksiyon" needs fresh styling, not generic interior
    captionDrivenDefault: true,
    galleryRevisionDefault: true,
    backgroundScenePrompt: 'upscale fashion boutique interior, editorial clothing display, soft directional light, clean minimal aesthetic, marble surfaces or exposed brick, aspirational lifestyle atmosphere',
    imageNegativeGuards: [
      'No food', 'no restaurant', 'no cafe setting',
      'No cluttered market stall — keep the aesthetic premium and editorial',
    ],
    sceneLockSubject: 'editorial fashion photograph — clothing or accessory as hero, lifestyle or studio setting, aspirational yet attainable aesthetic',
    colorGrade: 'neutral',
    reelPacing: 'mid_tempo',
    headlineFallback: 'Yeni Koleksiyon',
    recommendedEnhanceLevelLabel: 'Strong — lookbook editorial quality',
    menuIsServiceList: false,
  },

  // ── Jewelry & Accessories ─────────────────────────────────────────────────
  {
    sectorId: 'jewelry_accessories',
    hasPhysicalVenue: true,
    galleryReliability: 'medium',
    defaultVisualSubject: 'product_closeup',
    defaultEnhanceLevel: 'strong',    // Jewelry demands macro precision and luxury lighting
    forceAdaptiveScene: true,         // Specific pieces need specific shots, not generic store
    captionDrivenDefault: true,
    galleryRevisionDefault: true,
    backgroundScenePrompt: 'luxury jewelry close-up on dark velvet or marble surface, macro photography, premium lighting that makes gemstones and metals sparkle, minimalist elegant background',
    imageNegativeGuards: [
      'No cluttered jewelry store display', 'no price tags visible',
      'No food', 'no restaurant', 'no beauty salon setting',
    ],
    sceneLockSubject: 'luxury jewelry macro photograph — ring, necklace, or bracelet on premium surface with cinematic lighting that captures the sparkle and craftsmanship',
    colorGrade: 'dark_moody',
    reelPacing: 'slow_burn',
    headlineFallback: 'Yeni Tasarım',
    recommendedEnhanceLevelLabel: 'Strong — luxury product macro quality',
    menuIsServiceList: false,
  },

  // ── Bakery & Patisserie ───────────────────────────────────────────────────
  // Separate from restaurant_cafe: different visual identity, pastry/dessert focus,
  // gifting occasions, seasonal specials.
  {
    sectorId: 'bakery_patisserie',
    hasPhysicalVenue: true,
    galleryReliability: 'high',       // Pastry photos are always relevant to any post
    defaultVisualSubject: 'product_closeup',
    defaultEnhanceLevel: 'moderate',
    forceAdaptiveScene: false,
    captionDrivenDefault: false,
    galleryRevisionDefault: true,
    backgroundScenePrompt: 'artisan bakery or patisserie setting, beautifully arranged pastries and cakes, warm morning light, wooden surfaces, fresh-baked aesthetic, cozy French patisserie vibe',
    imageNegativeGuards: [
      'No savory food or main courses — this is a bakery/pastry brand',
      'No restaurant dining tables or wine glasses',
    ],
    sceneLockSubject: 'beautifully crafted pastry, cake, or bread as hero — editorial food photography with warm soft light and artisan styling',
    colorGrade: 'warm',
    reelPacing: 'mid_tempo',
    headlineFallback: 'Taze Lezzet',
    recommendedEnhanceLevelLabel: 'Moderate — artisan pastry warmth',
    menuIsServiceList: false,
  },

  // ── Wedding & Event Services ──────────────────────────────────────────────
  {
    sectorId: 'wedding_event',
    hasPhysicalVenue: true,
    galleryReliability: 'medium',     // Wedding venue photos good but brief-specific moments vary
    defaultVisualSubject: 'lifestyle',
    defaultEnhanceLevel: 'moderate',
    forceAdaptiveScene: false,
    captionDrivenDefault: false,
    galleryRevisionDefault: true,
    backgroundScenePrompt: 'elegant wedding venue or event space, romantic ambient lighting, floral arrangements, beautifully set tables, warm candlelight, fairy lights — aspirational celebration atmosphere',
    imageNegativeGuards: [
      'No casual or everyday settings', 'no fast food', 'no modern casual dining',
    ],
    sceneLockSubject: 'romantic wedding or event scene — elegant venue styling, floral details, or couple in celebration moment, editorial photography quality',
    colorGrade: 'warm',
    reelPacing: 'slow_burn',
    headlineFallback: 'Unutulmaz An',
    recommendedEnhanceLevelLabel: 'Moderate — romantic venue elegance',
    menuIsServiceList: true,
  },

  // ── General / Unknown ────────────────────────────────────────────────────
  {
    sectorId: 'general_business',
    hasPhysicalVenue: true,
    galleryReliability: 'medium',
    defaultVisualSubject: 'auto',
    defaultEnhanceLevel: 'moderate',
    forceAdaptiveScene: false,
    captionDrivenDefault: false,
    galleryRevisionDefault: true,
    backgroundScenePrompt: 'premium brand environment with natural textures, soft directional light, editorial quality',
    imageNegativeGuards: [],
    sceneLockSubject: 'professional brand lifestyle scene with premium editorial quality',
    colorGrade: 'neutral',
    reelPacing: 'mid_tempo',
    headlineFallback: 'Keşfet',
    recommendedEnhanceLevelLabel: 'Moderate',
    menuIsServiceList: false,
  },
];

// Build lookup map for O(1) access
const PROFILE_MAP = new Map<string, SectorProductionProfile>(
  SECTOR_PROFILES.map((p) => [p.sectorId, p]),
);

/**
 * Known aliases — maps alternate / legacy sector IDs to the canonical profile.
 * Add new aliases here rather than adding duplicate profile rows.
 */
const SECTOR_ALIASES: Record<string, string> = {
  // Beauty family
  nail_salon: 'beauty_wellness',
  spa_wellness: 'beauty_wellness',
  spa: 'beauty_wellness',
  estetik: 'beauty_wellness',
  // Barber family
  hair_salon: 'barber_salon',
  kuafor: 'barber_salon',
  berber: 'barber_salon',
  // Food & drink family
  cafe: 'coffee_shop',
  restaurant: 'restaurant_cafe',
  bistro: 'restaurant_cafe',
  fine_dining: 'fine_dining', // canonical
  // Hospitality family
  hotel: 'hospitality',
  hotel_resort: 'hospitality',
  resort: 'hospitality',
  otel: 'hospitality',
  // Fitness
  gym: 'fitness_gym',
  fitness: 'fitness_gym',
  // Nightlife
  night_club: 'nightclub',
  entertainment: 'nightclub',
  // Logistics
  logistics: 'moving_logistics',
  moving: 'moving_logistics',
  nakliyat: 'moving_logistics',
  // Fashion
  fashion: 'fashion_boutique',
  butik: 'fashion_boutique',
  giyim: 'fashion_boutique',
  clothing: 'fashion_boutique',
  // Jewelry
  jewelry: 'jewelry_accessories',
  takı: 'jewelry_accessories',
  taki: 'jewelry_accessories',
  accessories: 'jewelry_accessories',
  // Bakery
  bakery: 'bakery_patisserie',
  pastane: 'bakery_patisserie',
  firın: 'bakery_patisserie',
  patisserie: 'bakery_patisserie',
  // Wedding
  wedding: 'wedding_event',
  event: 'wedding_event',
  dugun: 'wedding_event',
  organizasyon: 'wedding_event',
};

const FALLBACK_PROFILE: SectorProductionProfile = PROFILE_MAP.get('general_business')!;

/** Normalize a raw sector string to a canonical profile key. */
export function normalizeSectorId(sector: string | null | undefined): string {
  if (!sector) return 'general_business';
  const key = sector.toLowerCase().replace(/[\s-]+/g, '_').trim();
  return SECTOR_ALIASES[key] ?? key;
}

/**
 * Returns the production profile for the given sector.
 * Never throws — falls back to general_business profile.
 */
export function getSectorProfile(sector: string | null | undefined): SectorProductionProfile {
  const key = normalizeSectorId(sector);
  return PROFILE_MAP.get(key) ?? FALLBACK_PROFILE;
}

// ─── Convenience helpers ────────────────────────────────────────────────────
// Thin wrappers over profile properties — use these in business logic
// instead of hardcoded sector strings or regex.

/** True for sectors that do NOT rely on a physical venue (SaaS, agency, etc.). */
export function isNonVenueSectorProfile(sector: string | null | undefined): boolean {
  return !getSectorProfile(sector).hasPhysicalVenue;
}

/** True for sectors where gallery photos are unreliable for brief-specific visuals. */
export function hasLowGalleryReliability(sector: string | null | undefined): boolean {
  return getSectorProfile(sector).galleryReliability === 'low';
}

/** True when the enhance pipeline should ignore gallery match scores and always enhance. */
export function shouldForceAdaptiveScene(sector: string | null | undefined): boolean {
  return getSectorProfile(sector).forceAdaptiveScene;
}

/** Returns the AI enhance level a sector defaults to. */
export function getDefaultEnhanceLevel(sector: string | null | undefined): EnhanceLevel {
  return getSectorProfile(sector).defaultEnhanceLevel;
}

/** True for sectors that should generate fresh images from caption when gallery fails. */
export function isCaptionDrivenDefault(sector: string | null | undefined): boolean {
  return getSectorProfile(sector).captionDrivenDefault;
}

/** Default visual subject for the sector (used by creative director). */
export function getDefaultVisualSubject(sector: string | null | undefined): DefaultVisualSubject {
  return getSectorProfile(sector).defaultVisualSubject;
}

/** Color grade direction for this sector. */
export function getSectorColorGrade(sector: string | null | undefined): ColorGrade {
  return getSectorProfile(sector).colorGrade;
}

/**
 * Background scene prompt for AI image generation.
 * Replaces the scattered inline if/else bgScene logic.
 */
export function getSectorBackgroundScenePrompt(sector: string | null | undefined): string {
  return getSectorProfile(sector).backgroundScenePrompt;
}

/**
 * Hard negative guards for this sector's image generation.
 * Prevents common AI confusions (e.g. beauty → no cafe/restaurant).
 */
export function getSectorImageNegativeGuards(sector: string | null | undefined): string[] {
  return getSectorProfile(sector).imageNegativeGuards;
}

/**
 * Scene lock subject — injected at top of image prompt for visual anchoring.
 */
export function getSectorSceneLockSubject(sector: string | null | undefined): string {
  return getSectorProfile(sector).sceneLockSubject;
}

/**
 * Returns true when "menü/menu" in this sector refers to a SERVICE price list,
 * not a food menu. Prevents isProductContent() false-positives for service businesses.
 */
export function sectorMenuIsServiceList(sector: string | null | undefined): boolean {
  return getSectorProfile(sector).menuIsServiceList;
}

/** Fallback headline text for this sector. */
export function getSectorHeadlineFallback(sector: string | null | undefined): string {
  return getSectorProfile(sector).headlineFallback;
}

/** Reel pacing for this sector. */
export function getSectorReelPacing(sector: string | null | undefined): ReelPacing {
  return getSectorProfile(sector).reelPacing;
}

/** Returns all registered sector profiles (for UI sector picker, admin tools, etc.). */
export function getAllSectorProfiles(): SectorProductionProfile[] {
  return SECTOR_PROFILES;
}
