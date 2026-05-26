import {
  type CanvaTemplateDatasetField,
  type CanvaTemplateMetadata,
} from '@/lib/canva-template-selection';
import { canvaFetch, listCanvaBrandTemplates } from '@/lib/canva-connect-api';
import { getCanvaTenantId, mergeTemplateRegistry, syncTemplateFieldContracts } from '@/lib/canva-template-registry';
import { mergeNexusTemplateAssignments } from '@/lib/nexus-brand-context';

export async function loadCanvaTemplates(
  token: string,
  requestCatalog?: CanvaTemplateMetadata[],
  tenantId = getCanvaTenantId(),
  officeId?: string | null,
): Promise<CanvaTemplateMetadata[]> {
  const catalog = requestCatalog?.length ? requestCatalog : parseTemplateCatalog();
  if (catalog.length > 0) {
    const hydrated = await Promise.all(catalog.map((template) => hydrateTemplateDataset(token, template, tenantId)));
    return mergeNexusTemplateAssignments(await mergeTemplateRegistry(hydrated, tenantId), tenantId, officeId);
  }

  const items = await listCanvaBrandTemplates(token);
  const hydrated = await Promise.all(
    items.map((item) => hydrateTemplateDataset(token, {
      id: item.id,
      title: item.title,
      ...inferTemplateMetadataFromTitle(item.title),
    }, tenantId)),
  );
  return mergeNexusTemplateAssignments(await mergeTemplateRegistry(hydrated, tenantId), tenantId, officeId);
}

async function hydrateTemplateDataset(
  token: string,
  template: CanvaTemplateMetadata,
  tenantId?: string,
): Promise<CanvaTemplateMetadata> {
  if (template.dataset) return template;

  try {
    const result = await canvaFetch<{ dataset?: Record<string, CanvaTemplateDatasetField> }>(
      token,
      `/brand-templates/${encodeURIComponent(template.id)}/dataset`,
    );
    const dataset = result.dataset ?? {};
    // Persist field contracts to registry (fire-and-forget) so limits survive between calls
    if (Object.keys(dataset).length > 0 && tenantId) {
      void syncTemplateFieldContracts(template.id, dataset, tenantId);
    }
    return { ...template, dataset };
  } catch {
    return { ...template, dataset: {} };
  }
}

function parseTemplateCatalog(): CanvaTemplateMetadata[] {
  const raw = process.env.CANVA_TEMPLATE_CATALOG;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as CanvaTemplateMetadata[];
    return Array.isArray(parsed) ? parsed.filter((item) => item.id && item.title) : [];
  } catch {
    return [];
  }
}

function inferTemplateMetadataFromTitle(title: string): Partial<CanvaTemplateMetadata> {
  const normalized = title.toLowerCase();

  // Format detection — be explicit; broad event/party/music keywords do NOT imply Reel
  const isReel  = /\breel\b|\breels\b|\bvideo\b|\bvideolar\b/.test(normalized);
  const isStory = /\bstory\b|\bstories\b|\bhikaye\b/.test(normalized);
  const isCampaign = /ads|campaign|calendar|weekly|hafta|carousel/.test(normalized);

  // Objective / content-type signals (format-agnostic)
  const isMenu    = /menu|menü|food|meal|dinner|product|seasonal/.test(normalized);
  const isReview  = /review|testimonial|yorum|guest|customer/.test(normalized);
  const isOffer   = /offer|discount|deal|limited|kampanya|indirim/.test(normalized);
  const isPremium = /luxury|premium|event|sunu|show|elegant/.test(normalized);
  const isEvent   = /event|etkinlik|promo|party|night|music|show/.test(normalized);

  const objectives: CanvaTemplateMetadata['objectives'] = [];
  if (isReview)  objectives.push('review_reply');
  if (isCampaign) objectives.push('campaign_analysis');
  if (isMenu)    objectives.push('menu_launch');
  if (isEvent || isReel) objectives.push('event_promo');
  if (isOffer)   objectives.push('offer');
  if (objectives.length === 0) objectives.push('announcement');

  // contentKinds: strictly derived from format — NOT from event/party/music hints
  const contentKinds: CanvaTemplateMetadata['contentKinds'] = [];
  if (isReel)       contentKinds.push('instagram_reel');
  else if (isStory) contentKinds.push('instagram_story');
  else if (isCampaign) contentKinds.push('instagram_plan', 'ad_campaign');
  else              contentKinds.push('instagram_post', 'generic');

  return {
    contentKinds: Array.from(new Set(contentKinds)),
    aspectRatio: isReel || isStory ? '9:16' : isCampaign ? '16:9' : '1:1',
    objectives: Array.from(new Set(objectives)),
    tones: isPremium ? ['luxury', 'energetic'] : isOffer ? ['energetic'] : ['minimal'],
  };
}
