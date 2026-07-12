export type CreativePlatform =
  | 'instagram'
  | 'google_business'
  | 'linkedin'
  | 'tiktok'
  | 'youtube'
  | 'meta_ads'
  | 'google_ads';

export type CreativeChannel =
  | 'instagram_post'
  | 'instagram_story'
  | 'instagram_reel'
  | 'instagram_carousel'
  | 'google_business_update'
  | 'linkedin_post'
  | 'tiktok_video'
  | 'youtube_short'
  | 'meta_ad_creative'
  | 'google_ad_asset';

export type CreativeIntent =
  | 'campaign_offer'
  | 'event_announcement'
  | 'menu_share'
  | 'product_highlight'
  | 'service_intro'
  | 'educational_post'
  | 'social_proof'
  | 'review_response'
  | 'daily_story'
  | 'behind_the_scenes'
  | 'brand_awareness'
  | 'lead_generation'
  | 'seasonal_content'
  | 'ad_creative'
  | 'google_business_update'
  | 'post_service_client_result';

export type CreativeRiskTier = 'low' | 'medium' | 'high' | 'blocked';

export type CreativeRiskSignal =
  | 'price'
  | 'discount'
  | 'date'
  | 'location'
  | 'regulated_industry'
  | 'health_claim'
  | 'legal_claim'
  | 'financial_claim'
  | 'before_after'
  | 'personal_data'
  | 'user_generated_content'
  | 'limited_availability'
  | 'alcohol'
  | 'origin_claim';

export type CreativeAssetIntent =
  | 'logo'
  | 'hero_image'
  | 'product_image'
  | 'venue_photo'
  | 'team_photo'
  | 'expert_photo'
  | 'before_after_image'
  | 'brand_background'
  | 'generated_visual'
  | 'video_clip';

export type TemplateFamilyStatus = 'draft' | 'approved' | 'disabled' | 'needs_review';

export interface CreativeContentNeed {
  id: CreativeIntent;
  label: string;
  description: string;
  defaultChannels: CreativeChannel[];
  defaultRiskTier: CreativeRiskTier;
  requiredAssetIntents: CreativeAssetIntent[];
}

export interface IndustryPlaybook {
  id: string;
  label: string;
  defaultContentNeeds: CreativeIntent[];
  riskySignals: CreativeRiskSignal[];
  approvalRequiredFor: CreativeRiskSignal[];
  preferredChannels: CreativeChannel[];
}

export interface TemplateFamilyContract {
  id: string;
  label: string;
  intents: CreativeIntent[];
  channels: CreativeChannel[];
  industries: string[];
  requiredFields: string[];
  optionalFields: string[];
  requiredAssetIntents: CreativeAssetIntent[];
  riskTier: CreativeRiskTier;
  status: TemplateFamilyStatus;
}

export interface TenantGalleryPolicy {
  allowedAssetIntents: CreativeAssetIntent[];
  clientPhotoPolicy: 'allow' | 'approval_required' | 'blocked';
  beforeAfterPolicy: 'allow' | 'approval_required' | 'blocked';
  maxGalleryPhotos: number;
  requireConsentMetadata: boolean;
}

export interface TenantCreativeProfile {
  tenantId: string;
  officeId?: string | null;
  industry: string;
  businessType?: string;
  platforms: CreativePlatform[];
  selectedContentNeeds: CreativeIntent[];
  /** Explicit capability IDs (content + workflow). Empty → derived from contentNeeds + playbook. */
  operatingCapabilities?: string[];
  galleryPolicy?: TenantGalleryPolicy;
  selectedTemplateFamilies: string[];
  brandTone: string[];
  keywords: string[];
  defaultCtas: string[];
  riskRules: Partial<Record<CreativeRiskSignal, 'allow' | 'approval_required' | 'blocked'>>;
  customerVisibleSummary?: string;
  systemIntelligence?: string;
  discoveryConfidence?: number;
  confirmedAt?: string | null;
}

export interface CreativeIntentBrief {
  tenantId: string;
  officeId?: string | null;
  intent: CreativeIntent;
  channel: CreativeChannel;
  headline: string;
  subtitle?: string;
  caption?: string;
  cta?: string;
  assetIntent?: CreativeAssetIntent;
  riskSignals: CreativeRiskSignal[];
  industry: string;
  locale: string;
  source?: 'setup_discovery' | 'gram_master' | 'content_studio' | 'manual';
}

export interface TemplateDecisionResult {
  templateId: string;
  templateFamilyId?: string;
  selectedBy: 'ai_match' | 'manual_override' | 'policy_default';
  score: number;
  eligibility: 'eligible' | 'needs_setup' | 'blocked';
  riskTier: CreativeRiskTier;
  approvalRequired: boolean;
  reasons: string[];
  missingFields: string[];
  validationWarnings: string[];
}

export const CREATIVE_CONTENT_NEEDS: CreativeContentNeed[] = [
  {
    id: 'campaign_offer',
    label: 'Kampanya / teklif paylaşımı',
    description: 'İndirim, paket teklif, sınırlı süreli fırsat veya rezervasyon çağrısı.',
    defaultChannels: ['instagram_story', 'instagram_post', 'meta_ad_creative'],
    defaultRiskTier: 'medium',
    requiredAssetIntents: ['hero_image'],
  },
  {
    id: 'event_announcement',
    label: 'Event / duyuru paylaşımı',
    description: 'Etkinlik, workshop, lansman, canlı müzik veya özel gün duyurusu.',
    defaultChannels: ['instagram_story', 'instagram_reel', 'google_business_update'],
    defaultRiskTier: 'medium',
    requiredAssetIntents: ['hero_image'],
  },
  {
    id: 'menu_share',
    label: 'Menü paylaşımı',
    description: 'Menü, ürün grubu, fiyat veya kategori bazlı yemek/içecek tanıtımı.',
    defaultChannels: ['instagram_post', 'instagram_carousel', 'instagram_story'],
    defaultRiskTier: 'medium',
    requiredAssetIntents: ['product_image'],
  },
  {
    id: 'product_highlight',
    label: 'Ürün / hizmet öne çıkarma',
    description: 'Bir ürünün, hizmetin veya koleksiyonun fayda odaklı tanıtımı.',
    defaultChannels: ['instagram_post', 'instagram_story', 'meta_ad_creative'],
    defaultRiskTier: 'low',
    requiredAssetIntents: ['product_image'],
  },
  {
    id: 'educational_post',
    label: 'Eğitici içerik',
    description: 'İpucu, sık sorulan soru, rehber veya uzmanlık anlatımı.',
    defaultChannels: ['instagram_carousel', 'linkedin_post', 'google_business_update'],
    defaultRiskTier: 'low',
    requiredAssetIntents: ['brand_background'],
  },
  {
    id: 'social_proof',
    label: 'Sosyal kanıt',
    description: 'Müşteri yorumu, başarı hikayesi, referans veya memnuniyet kanıtı.',
    defaultChannels: ['instagram_post', 'instagram_story', 'google_business_update'],
    defaultRiskTier: 'medium',
    requiredAssetIntents: ['brand_background'],
  },
  {
    id: 'behind_the_scenes',
    label: 'Sahne arkası / süreç',
    description: 'Ekip, üretim, mekan, mutfak, atölye veya hazırlık süreci.',
    defaultChannels: ['instagram_story', 'instagram_reel', 'tiktok_video'],
    defaultRiskTier: 'low',
    requiredAssetIntents: ['venue_photo'],
  },
  {
    id: 'lead_generation',
    label: 'Lead / randevu toplama',
    description: 'Form, teklif, randevu, demo veya iletişim odaklı içerikler.',
    defaultChannels: ['meta_ad_creative', 'google_ad_asset', 'linkedin_post'],
    defaultRiskTier: 'medium',
    requiredAssetIntents: ['hero_image'],
  },
];

export const STARTER_INDUSTRY_PLAYBOOKS: IndustryPlaybook[] = [
  {
    id: 'restaurant_cafe',
    label: 'Restoran / Kafe',
    defaultContentNeeds: ['menu_share', 'campaign_offer', 'event_announcement', 'daily_story', 'social_proof'],
    riskySignals: ['price', 'discount', 'date', 'location', 'limited_availability'],
    approvalRequiredFor: ['price', 'discount', 'date'],
    preferredChannels: ['instagram_story', 'instagram_post', 'instagram_reel', 'google_business_update'],
  },
  {
    id: 'beauty_wellness',
    label: 'Güzellik / Wellness',
    defaultContentNeeds: ['service_intro', 'campaign_offer', 'social_proof', 'educational_post', 'behind_the_scenes', 'lead_generation'],
    riskySignals: ['before_after', 'personal_data', 'discount', 'health_claim'],
    approvalRequiredFor: ['before_after', 'personal_data', 'health_claim'],
    preferredChannels: ['instagram_story', 'instagram_reel', 'instagram_post'],
  },
  {
    id: 'healthcare_clinic',
    label: 'Sağlık / Klinik',
    defaultContentNeeds: ['educational_post', 'service_intro', 'social_proof', 'lead_generation'],
    riskySignals: ['regulated_industry', 'health_claim', 'before_after', 'personal_data'],
    approvalRequiredFor: ['health_claim', 'before_after', 'personal_data'],
    preferredChannels: ['instagram_carousel', 'instagram_post', 'google_business_update'],
  },
  {
    id: 'real_estate',
    label: 'Gayrimenkul',
    defaultContentNeeds: ['product_highlight', 'lead_generation', 'educational_post', 'social_proof', 'campaign_offer'],
    riskySignals: ['price', 'location', 'financial_claim', 'limited_availability'],
    approvalRequiredFor: ['price', 'location', 'financial_claim'],
    preferredChannels: ['instagram_post', 'instagram_carousel', 'meta_ad_creative'],
  },
  {
    id: 'ecommerce_retail',
    label: 'E-ticaret / Perakende',
    defaultContentNeeds: ['product_highlight', 'campaign_offer', 'seasonal_content', 'social_proof', 'ad_creative'],
    riskySignals: ['price', 'discount', 'limited_availability', 'user_generated_content'],
    approvalRequiredFor: ['price', 'discount'],
    preferredChannels: ['instagram_post', 'instagram_story', 'meta_ad_creative'],
  },
  {
    id: 'agency_services',
    label: 'Ajans / Profesyonel Hizmet',
    defaultContentNeeds: ['service_intro', 'educational_post', 'social_proof', 'lead_generation'],
    riskySignals: ['financial_claim', 'legal_claim'],
    approvalRequiredFor: ['financial_claim', 'legal_claim'],
    preferredChannels: ['linkedin_post', 'instagram_carousel', 'meta_ad_creative'],
  },
  {
    id: 'local_service_business',
    label: 'Yerel Hizmet İşletmesi',
    defaultContentNeeds: ['service_intro', 'lead_generation', 'social_proof', 'educational_post', 'google_business_update'],
    riskySignals: ['price', 'location', 'personal_data'],
    approvalRequiredFor: ['price', 'personal_data'],
    preferredChannels: ['google_business_update', 'instagram_post', 'meta_ad_creative'],
  },
];

/** Extended playbooks — mirrors Python industry_playbooks.py risky_signals / approval_required_for. */
export const EXTENDED_INDUSTRY_PLAYBOOKS: IndustryPlaybook[] = [
  {
    id: 'beach_club',
    label: 'Beach Club',
    defaultContentNeeds: ['daily_story', 'event_announcement', 'campaign_offer', 'social_proof', 'behind_the_scenes'],
    riskySignals: ['price', 'date', 'limited_availability', 'alcohol'],
    approvalRequiredFor: ['price', 'date', 'alcohol'],
    preferredChannels: ['instagram_story', 'instagram_reel', 'instagram_post'],
  },
  {
    id: 'wedding_event',
    label: 'Düğün / Etkinlik',
    defaultContentNeeds: ['event_announcement', 'social_proof', 'behind_the_scenes', 'campaign_offer', 'lead_generation'],
    riskySignals: ['date', 'location', 'personal_data', 'limited_availability'],
    approvalRequiredFor: ['date', 'personal_data'],
    preferredChannels: ['instagram_story', 'instagram_post', 'instagram_reel'],
  },
  {
    id: 'local_products_shop',
    label: 'Yöresel / Yerel Ürün',
    defaultContentNeeds: ['product_highlight', 'behind_the_scenes', 'social_proof', 'educational_post', 'daily_story'],
    riskySignals: ['price', 'health_claim', 'origin_claim'],
    approvalRequiredFor: ['price', 'health_claim'],
    preferredChannels: ['instagram_post', 'instagram_story', 'instagram_reel'],
  },
  {
    id: 'barber_salon',
    label: 'Berber / Kuaför',
    defaultContentNeeds: ['service_intro', 'social_proof', 'post_service_client_result', 'lead_generation', 'behind_the_scenes'],
    riskySignals: ['personal_data', 'before_after', 'price'],
    approvalRequiredFor: ['personal_data', 'before_after'],
    preferredChannels: ['instagram_story', 'instagram_reel', 'instagram_post'],
  },
  {
    id: 'fitness_gym',
    label: 'Fitness / Gym',
    defaultContentNeeds: ['service_intro', 'educational_post', 'social_proof', 'campaign_offer', 'lead_generation'],
    riskySignals: ['health_claim', 'before_after', 'price', 'personal_data'],
    approvalRequiredFor: ['health_claim', 'before_after', 'personal_data'],
    preferredChannels: ['instagram_reel', 'instagram_story', 'instagram_post'],
  },
  {
    id: 'hospitality',
    label: 'Otel / Konaklama',
    defaultContentNeeds: ['daily_story', 'product_highlight', 'social_proof', 'event_announcement', 'seasonal_content'],
    riskySignals: ['price', 'date', 'limited_availability', 'location'],
    approvalRequiredFor: ['price', 'date'],
    preferredChannels: ['instagram_story', 'instagram_reel', 'instagram_post'],
  },
  {
    id: 'nightclub_lounge',
    label: 'Gece Kulübü / Lounge',
    defaultContentNeeds: ['event_announcement', 'daily_story', 'campaign_offer', 'social_proof', 'behind_the_scenes'],
    riskySignals: ['price', 'date', 'limited_availability', 'alcohol'],
    approvalRequiredFor: ['price', 'date', 'alcohol'],
    preferredChannels: ['instagram_story', 'instagram_reel', 'instagram_post'],
  },
  {
    id: 'cafe_bakery',
    label: 'Pastane / Fırın',
    defaultContentNeeds: ['product_highlight', 'daily_story', 'behind_the_scenes', 'social_proof', 'campaign_offer'],
    riskySignals: ['price', 'date', 'limited_availability'],
    approvalRequiredFor: ['price', 'date'],
    preferredChannels: ['instagram_story', 'instagram_post', 'instagram_reel'],
  },
  {
    id: 'fine_dining',
    label: 'Fine Dining',
    defaultContentNeeds: ['menu_share', 'product_highlight', 'event_announcement', 'social_proof', 'behind_the_scenes'],
    riskySignals: ['price', 'discount', 'date', 'location', 'limited_availability'],
    approvalRequiredFor: ['price', 'discount', 'date'],
    preferredChannels: ['instagram_post', 'instagram_story', 'instagram_reel'],
  },
];

