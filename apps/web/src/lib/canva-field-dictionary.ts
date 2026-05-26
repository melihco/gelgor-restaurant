export type CanvaStandardFieldName =
  | 'headline'
  | 'subtitle'
  | 'body'
  | 'caption'
  | 'cta'
  | 'hashtags'
  | 'brand_name'
  | 'offer'
  | 'price'
  | 'date'
  | 'location'
  | 'contact'
  | 'website'
  | 'hero_image'
  | 'product_image'
  | 'background_image'
  | 'logo'
  | 'avatar'
  | 'qr_code';

export type CanvaFieldKind = 'text' | 'image';

export interface CanvaFieldDefinition {
  name: CanvaStandardFieldName;
  type: CanvaFieldKind;
  label: string;
  required: boolean;
  maxLength?: number;
  purpose: string;
  aliases: string[];
  examples?: string[];
}

export interface CanvaFieldContract extends CanvaFieldDefinition {
  sourceFieldName: string;
}

export interface CanvaTemplateContractHealth {
  ready: boolean;
  knownFields: CanvaFieldContract[];
  unknownFields: Array<{ name: string; type: string }>;
  missingRecommendedFields: CanvaStandardFieldName[];
  missingRequiredFields: CanvaStandardFieldName[];
}

export const CANVA_CORE_REQUIRED_FIELDS: CanvaStandardFieldName[] = ['headline', 'cta'];
export const CANVA_RECOMMENDED_TEXT_FIELDS: CanvaStandardFieldName[] = ['headline', 'subtitle', 'caption', 'cta', 'hashtags'];

export const CANVA_FIELD_DICTIONARY: Record<CanvaStandardFieldName, CanvaFieldDefinition> = {
  headline: {
    name: 'headline',
    type: 'text',
    label: 'Headline',
    required: true,
    maxLength: 48,
    purpose: 'Ana dikkat çekici mesaj. Tasarımdaki en büyük başlık alanı.',
    aliases: ['title', 'heading', 'baslik', 'başlık', 'post_title', 'story_title'],
    examples: ['Yeni Sezon İndirimi', 'Anneler Günü Sofrası'],
  },
  subtitle: {
    name: 'subtitle',
    type: 'text',
    label: 'Subtitle',
    required: false,
    maxLength: 90,
    purpose: 'Başlığı destekleyen kısa açıklama.',
    aliases: ['summary', 'description', 'subheading', 'aciklama', 'açıklama'],
  },
  body: {
    name: 'body',
    type: 'text',
    label: 'Body',
    required: false,
    maxLength: 220,
    purpose: 'Daha uzun açıklama veya kampanya detayı.',
    aliases: ['copy', 'text', 'paragraph', 'details'],
  },
  caption: {
    name: 'caption',
    type: 'text',
    label: 'Caption',
    required: false,
    maxLength: 2200,
    purpose:
      'Tasarım içi kısa görünür metin (Instagram gönderi caption’ı ayrı tutulur; Canva autofill bunu uzun feed metninden türetmez, sınırlı uzunlukta sentezlenir veya canvaFieldCopy ile gelir).',
    aliases: ['post_caption', 'instagram_caption'],
  },
  cta: {
    name: 'cta',
    type: 'text',
    label: 'CTA',
    required: true,
    maxLength: 24,
    purpose: 'Kullanıcıyı aksiyona çağıran kısa ifade.',
    aliases: ['call_to_action', 'button', 'action'],
    examples: ['Hemen İncele', 'Rezervasyon Yap', 'Teklifi Al'],
  },
  hashtags: {
    name: 'hashtags',
    type: 'text',
    label: 'Hashtags',
    required: false,
    maxLength: 180,
    purpose: 'Platforma uygun hashtag seti.',
    aliases: ['hashtag', 'tags'],
  },
  brand_name: {
    name: 'brand_name',
    type: 'text',
    label: 'Brand Name',
    required: false,
    maxLength: 42,
    purpose: 'Tenant marka adı.',
    aliases: ['brand', 'company', 'business_name', 'tenant_name'],
  },
  offer: {
    name: 'offer',
    type: 'text',
    label: 'Offer',
    required: false,
    maxLength: 54,
    purpose: 'Kampanya veya teklif ifadesi.',
    aliases: ['discount', 'campaign', 'deal', 'promo'],
  },
  price: {
    name: 'price',
    type: 'text',
    label: 'Price',
    required: false,
    maxLength: 28,
    purpose: 'Fiyat bilgisi.',
    aliases: ['pricing', 'amount'],
  },
  date: {
    name: 'date',
    type: 'text',
    label: 'Date',
    required: false,
    maxLength: 32,
    purpose: 'Etkinlik, kampanya veya yayın tarihi.',
    aliases: ['event_date', 'publish_date'],
  },
  location: {
    name: 'location',
    type: 'text',
    label: 'Location',
    required: false,
    maxLength: 54,
    purpose: 'Lokasyon veya hizmet bölgesi.',
    aliases: ['address', 'venue', 'city'],
  },
  contact: {
    name: 'contact',
    type: 'text',
    label: 'Contact',
    required: false,
    maxLength: 42,
    purpose: 'Telefon, e-posta veya kısa iletişim bilgisi.',
    aliases: ['phone', 'email', 'whatsapp'],
  },
  website: {
    name: 'website',
    type: 'text',
    label: 'Website',
    required: false,
    maxLength: 54,
    purpose: 'Web sitesi veya rezervasyon linki.',
    aliases: ['url', 'link', 'booking_url'],
  },
  hero_image: {
    name: 'hero_image',
    type: 'image',
    label: 'Hero Image',
    required: false,
    purpose: 'Tasarımın ana görsel alanı.',
    aliases: ['image', 'main_image', 'cover_image', 'visual'],
  },
  product_image: {
    name: 'product_image',
    type: 'image',
    label: 'Product Image',
    required: false,
    purpose: 'Ürün veya hizmet görseli.',
    aliases: ['item_image', 'service_image'],
  },
  background_image: {
    name: 'background_image',
    type: 'image',
    label: 'Background Image',
    required: false,
    purpose: 'Arka plan görseli.',
    aliases: ['background', 'bg_image'],
  },
  logo: {
    name: 'logo',
    type: 'image',
    label: 'Logo',
    required: false,
    purpose: 'Tenant marka logosu.',
    aliases: ['brand_logo', 'company_logo'],
  },
  avatar: {
    name: 'avatar',
    type: 'image',
    label: 'Avatar',
    required: false,
    purpose: 'Kişi, uzman veya müşteri profil görseli.',
    aliases: ['profile_image', 'person_image'],
  },
  qr_code: {
    name: 'qr_code',
    type: 'image',
    label: 'QR Code',
    required: false,
    purpose: 'QR kod görsel alanı.',
    aliases: ['qr', 'reservation_qr'],
  },
};

export function listCanvaFieldDefinitions() {
  return Object.values(CANVA_FIELD_DICTIONARY);
}

export function normalizeCanvaFieldName(fieldName: string): CanvaStandardFieldName | null {
  const normalized = normalizeKey(fieldName);
  const direct = CANVA_FIELD_DICTIONARY[normalized as CanvaStandardFieldName];
  if (direct) return direct.name;

  for (const definition of Object.values(CANVA_FIELD_DICTIONARY)) {
    if (definition.aliases.some((alias) => normalizeKey(alias) === normalized)) return definition.name;
  }

  return null;
}

export function getCanvaFieldDefinition(fieldName: string): CanvaFieldDefinition | null {
  const standardName = normalizeCanvaFieldName(fieldName);
  return standardName ? CANVA_FIELD_DICTIONARY[standardName] : null;
}

export function analyzeCanvaTemplateContract(
  dataset: Record<string, { type: string; required?: boolean; maxLength?: number }> = {},
): CanvaTemplateContractHealth {
  const knownFields: CanvaFieldContract[] = [];
  const unknownFields: Array<{ name: string; type: string }> = [];
  const presentStandardNames = new Set<CanvaStandardFieldName>();

  for (const [sourceFieldName, field] of Object.entries(dataset)) {
    const definition = getCanvaFieldDefinition(sourceFieldName);
    if (!definition || (field.type !== 'text' && field.type !== 'image') || field.type !== definition.type) {
      unknownFields.push({ name: sourceFieldName, type: field.type });
      continue;
    }

    knownFields.push({
      ...definition,
      sourceFieldName,
      required: field.required ?? definition.required,
      maxLength: field.maxLength ?? definition.maxLength,
    });
    presentStandardNames.add(definition.name);
  }

  const missingRecommendedFields = CANVA_RECOMMENDED_TEXT_FIELDS.filter((field) => !presentStandardNames.has(field));
  const missingRequiredFields = CANVA_CORE_REQUIRED_FIELDS.filter((field) => !presentStandardNames.has(field));

  return {
    ready: knownFields.length > 0 && missingRequiredFields.length === 0,
    knownFields,
    unknownFields,
    missingRecommendedFields,
    missingRequiredFields,
  };
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[{}\s-]+/g, '_');
}
