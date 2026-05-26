import { createHash } from 'node:crypto';
import {
  getCanvaFieldDefinition,
  normalizeCanvaFieldName,
} from '@/lib/canva-field-dictionary';
import {
  type CanvaAutofillField,
  type CanvaTemplateMetadata,
} from '@/lib/canva-template-selection';

const DEFAULT_TEXT: Record<string, string> = {
  headline: 'Yeni Sezon Duyurusu',
  subtitle: 'Markanıza özel sosyal medya tasarımı',
  body: 'Bu alan template görünümünü test etmek için default bilgilerle dolduruldu.',
  caption: 'Markanız için hazırlanan örnek sosyal medya açıklaması.',
  cta: 'Hemen İncele',
  hashtags: '#smartagency #yenilik #marka',
  brand_name: 'SmartAgency',
  offer: 'Özel teklif',
  price: '₺999',
  date: '12 Haziran',
  location: 'İstanbul',
  contact: '+90 555 000 00 00',
  website: 'smartagency.local',
};

export function buildTemplateDefaultAutofillData(
  template: CanvaTemplateMetadata,
  input?: {
    brandName?: string;
    locale?: string;
    overrides?: Record<string, string>;
  },
): Record<string, CanvaAutofillField> {
  const data: Record<string, CanvaAutofillField> = {};
  const dataset = template.dataset ?? {};

  for (const [fieldName, field] of Object.entries(dataset)) {
    if (field.type !== 'text') continue;

    const standardName = normalizeCanvaFieldName(fieldName);
    const definition = getCanvaFieldDefinition(fieldName);
    const rawDefault = firstText(
      input?.overrides?.[fieldName],
      input?.overrides?.[standardName ?? ''],
      field.defaultText,
      field.sampleText,
      field.placeholder,
      field.text,
      field.value,
      field.default,
      standardName === 'brand_name' ? input?.brandName : undefined,
      standardName ? DEFAULT_TEXT[standardName] : undefined,
      definition?.label ? `${definition.label} örneği` : undefined,
      `${fieldName} örneği`,
    );

    data[fieldName] = {
      type: 'text',
      text: fitText(rawDefault, field.characterLimit ?? field.maxLength ?? definition?.maxLength),
    };
  }

  return data;
}

export function templatePreviewHash(template: CanvaTemplateMetadata, data: Record<string, CanvaAutofillField>) {
  return createHash('sha256')
    .update(JSON.stringify({
      templateId: template.id,
      title: template.title,
      dataset: template.dataset ?? {},
      data,
    }))
    .digest('hex')
    .slice(0, 16);
}

function firstText(...values: Array<string | undefined | null>) {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() ?? 'Örnek metin';
}

function fitText(value: string, limit?: number) {
  if (!limit || value.length <= limit) return value;
  if (limit <= 1) return value.slice(0, limit);
  return value.slice(0, limit - 1).trimEnd() + '…';
}
