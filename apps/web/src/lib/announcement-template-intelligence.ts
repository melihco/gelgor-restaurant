/**
 * Brand-specific template intelligence layer.
 *
 * Responsibilities:
 * - Per-tenant favorites / pinned templates (localStorage-backed)
 * - Recently-used template tracking
 * - Content-aware smart template matching (mood, keywords, lineup detection)
 * - Brand vibe → template affinity scoring
 */

import type {
  AnnouncementTemplateDefinition,
  AnnouncementTemplateId,
  AnnouncementUseCase,
  AnnouncementContentFormat,
} from './announcement-template-types';
import {
  AGENCY_TEMPLATE_CATALOG,
  TEMPLATE_BY_ID,
} from './announcement-template-catalog';
import {
  getSectorCollection,
  normalizeSectorId,
} from './announcement-sector-collections';

// ─── Favorites / Pinned ─────────────────────────────────────────────────────

const FAVORITES_KEY = 'sa_template_favorites_v1';
const RECENTS_KEY = 'sa_template_recents_v1';
const MAX_RECENTS = 12;

function storageKey(base: string, tenantId?: string): string {
  return tenantId ? `${base}_${tenantId}` : base;
}

export function getFavoriteTemplateIds(tenantId?: string): AnnouncementTemplateId[] {
  try {
    const raw = typeof window !== 'undefined'
      ? localStorage.getItem(storageKey(FAVORITES_KEY, tenantId))
      : null;
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function toggleFavoriteTemplate(templateId: AnnouncementTemplateId, tenantId?: string): boolean {
  const current = getFavoriteTemplateIds(tenantId);
  const idx = current.indexOf(templateId);
  let isFavorite: boolean;
  if (idx >= 0) {
    current.splice(idx, 1);
    isFavorite = false;
  } else {
    current.unshift(templateId);
    isFavorite = true;
  }
  try {
    localStorage.setItem(storageKey(FAVORITES_KEY, tenantId), JSON.stringify(current.slice(0, 30)));
  } catch { /* quota */ }
  return isFavorite;
}

export function isFavoriteTemplate(templateId: AnnouncementTemplateId, tenantId?: string): boolean {
  return getFavoriteTemplateIds(tenantId).includes(templateId);
}

/** Add template IDs to favorites (merge, max 30). Returns count of newly added. */
export function favoriteTemplateIds(ids: AnnouncementTemplateId[], tenantId?: string): number {
  const current = getFavoriteTemplateIds(tenantId);
  const toAdd = ids.filter((id) => !current.includes(id));
  if (toAdd.length === 0) return 0;
  try {
    localStorage.setItem(
      storageKey(FAVORITES_KEY, tenantId),
      JSON.stringify([...toAdd, ...current].slice(0, 30)),
    );
  } catch { /* quota */ }
  return toAdd.length;
}

export function getFavoriteTemplates(tenantId?: string): AnnouncementTemplateDefinition[] {
  return getFavoriteTemplateIds(tenantId)
    .map((id) => TEMPLATE_BY_ID.get(id))
    .filter((t): t is AnnouncementTemplateDefinition => Boolean(t));
}

// ─── Recently Used ──────────────────────────────────────────────────────────

export function getRecentTemplateIds(tenantId?: string): AnnouncementTemplateId[] {
  try {
    const raw = typeof window !== 'undefined'
      ? localStorage.getItem(storageKey(RECENTS_KEY, tenantId))
      : null;
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function recordTemplateUsage(templateId: AnnouncementTemplateId, tenantId?: string): void {
  const current = getRecentTemplateIds(tenantId);
  const next = [templateId, ...current.filter((id) => id !== templateId)].slice(0, MAX_RECENTS);
  try {
    localStorage.setItem(storageKey(RECENTS_KEY, tenantId), JSON.stringify(next));
  } catch { /* quota */ }
}

export function getRecentTemplates(tenantId?: string): AnnouncementTemplateDefinition[] {
  return getRecentTemplateIds(tenantId)
    .map((id) => TEMPLATE_BY_ID.get(id))
    .filter((t): t is AnnouncementTemplateDefinition => Boolean(t));
}

// ─── Content-Aware Smart Matching ───────────────────────────────────────────

interface ContentSignal {
  headline?: string;
  caption?: string;
  mood?: string;
  strategicPurpose?: string;
  hasLineup?: boolean;
  lineupCount?: number;
  hasEventDetails?: boolean;
  contentFormat?: AnnouncementContentFormat;
}

interface BrandSignal {
  sectorId?: string;
  vibeKeywords?: string[];
  brandTone?: string;
  visualStyle?: string;
}

interface ScoredTemplate {
  template: AnnouncementTemplateDefinition;
  score: number;
  reasons: string[];
}

const MOOD_FAMILY_AFFINITY: Record<string, string[]> = {
  energetic: ['concert_lineup', 'dj_night', 'neon_night', 'festival_poster', 'impact_vignette'],
  elegant: ['gala_invite', 'script_luxe', 'luxury_bottom', 'frame_classic', 'magazine_date'],
  minimal: ['minimal_whisper', 'editorial_left', 'frosted_panel'],
  bold: ['impact_vignette', 'top_masthead', 'promo_banner', 'color_split'],
  warm: ['script_luxe', 'corner_stamp', 'luxury_bottom', 'frosted_panel'],
  nightlife: ['neon_night', 'dj_night', 'concert_lineup', 'festival_poster'],
  premium: ['gala_invite', 'luxury_bottom', 'frame_classic', 'magazine_date'],
  playful: ['campaign_badge', 'offer_band', 'promo_banner', 'color_split'],
  festive: ['concert_lineup', 'festival_poster', 'gala_invite', 'dj_night'],
};

const KEYWORD_FAMILY_MAP: Record<string, string[]> = {
  dj: ['dj_night', 'concert_lineup', 'neon_night'],
  konser: ['concert_lineup', 'festival_poster'],
  concert: ['concert_lineup', 'festival_poster'],
  festival: ['festival_poster', 'concert_lineup'],
  lineup: ['concert_lineup', 'festival_poster'],
  party: ['dj_night', 'neon_night', 'concert_lineup'],
  gala: ['gala_invite', 'luxury_bottom'],
  davet: ['gala_invite', 'script_luxe', 'corner_stamp'],
  invite: ['gala_invite', 'script_luxe'],
  indirim: ['promo_banner', 'offer_band', 'campaign_badge'],
  discount: ['promo_banner', 'offer_band'],
  sale: ['promo_banner', 'offer_band', 'campaign_badge'],
  kampanya: ['promo_banner', 'campaign_badge', 'offer_band'],
  promo: ['promo_banner', 'campaign_badge'],
  brunch: ['script_luxe', 'corner_stamp', 'frosted_panel'],
  sunset: ['luxury_bottom', 'neon_night', 'impact_vignette'],
  pool: ['dj_night', 'neon_night', 'luxury_bottom'],
  opening: ['gala_invite', 'promo_banner', 'impact_vignette'],
  açılış: ['gala_invite', 'promo_banner', 'impact_vignette'],
  menu: ['script_luxe', 'frosted_panel', 'editorial_left'],
  reservation: ['corner_stamp', 'script_luxe', 'frame_classic'],
  rezervasyon: ['corner_stamp', 'script_luxe', 'frame_classic'],
};

function extractKeywords(text: string): string[] {
  return text.toLowerCase().split(/[\s,;·\-–—/|]+/).filter((w) => w.length > 2);
}

function detectLineup(headline?: string, caption?: string): { hasLineup: boolean; count: number } {
  const text = `${headline ?? ''}\n${caption ?? ''}`;
  const artistPatterns = [
    /(?:feat|ft|featuring|vs|b2b|x)\s/i,
    /\n\s*[A-Z][A-Za-z\s]+\n\s*[A-Z][A-Za-z\s]+/,
    /(?:line[\s-]?up|lineup|sanatçılar|artists?)\s*[:：]/i,
  ];
  const hasLineup = artistPatterns.some((p) => p.test(text));
  const lineMatches = text.match(/\n/g);
  const count = hasLineup ? Math.max(2, (lineMatches?.length ?? 0)) : 0;
  return { hasLineup, count };
}

export function scoreTemplatesForContent(
  useCase: AnnouncementUseCase,
  content: ContentSignal,
  brand: BrandSignal,
): ScoredTemplate[] {
  const sectorPack = brand.sectorId ? getSectorCollection(brand.sectorId) : null;
  const sectorPicks = sectorPack ? new Set([
    ...sectorPack.picks[useCase],
    sectorPack.defaultPreferences[useCase],
  ]) : null;

  const lineup = content.hasLineup ?? detectLineup(content.headline, content.caption).hasLineup;

  const candidates = AGENCY_TEMPLATE_CATALOG.filter((t) => t.useCases.includes(useCase));
  const allKeywords = extractKeywords(
    [content.headline, content.caption, content.mood, content.strategicPurpose].filter(Boolean).join(' '),
  );
  const moodKey = (content.mood ?? '').toLowerCase().trim();

  return candidates.map((template) => {
    let score = 0;
    const reasons: string[] = [];

    if (sectorPicks?.has(template.id)) {
      score += 25;
      reasons.push('sektör önerisi');
    }

    if (lineup && ['concert_lineup', 'festival_poster', 'dj_night'].includes(template.family)) {
      score += 40;
      reasons.push('lineup algılandı');
    }

    if (MOOD_FAMILY_AFFINITY[moodKey]?.includes(template.family)) {
      score += 20;
      reasons.push(`mood: ${moodKey}`);
    }

    for (const kw of allKeywords) {
      if (KEYWORD_FAMILY_MAP[kw]?.includes(template.family)) {
        score += 15;
        reasons.push(`anahtar: "${kw}"`);
        break;
      }
    }

    if (brand.vibeKeywords?.length) {
      for (const vibe of brand.vibeKeywords) {
        if (template.tags.some((tag) => tag.includes(vibe.toLowerCase()))) {
          score += 10;
          reasons.push(`vibe: ${vibe}`);
          break;
        }
      }
    }

    if (brand.brandTone) {
      const tone = brand.brandTone.toLowerCase();
      if (tone.includes('luxury') || tone.includes('premium') || tone.includes('elegant')) {
        if (['gala_invite', 'luxury_bottom', 'script_luxe', 'frame_classic'].includes(template.family)) {
          score += 12;
          reasons.push('premium brand tone');
        }
      } else if (tone.includes('casual') || tone.includes('fun') || tone.includes('energetic')) {
        if (['neon_night', 'dj_night', 'campaign_badge', 'impact_vignette'].includes(template.family)) {
          score += 12;
          reasons.push('casual brand tone');
        }
      }
    }

    if (content.contentFormat === 'story' && template.formats.includes('story')) {
      score += 3;
    }

    return { template, score, reasons };
  })
    .sort((a, b) => b.score - a.score);
}

/**
 * Auto-select the best template for a piece of content.
 * Considers: use case, content mood/keywords, brand sector, lineup detection.
 */
export function smartSelectTemplate(
  useCase: AnnouncementUseCase,
  content: ContentSignal,
  brand: BrandSignal,
  favorites?: AnnouncementTemplateId[],
): { templateId: AnnouncementTemplateId; reason: string } {
  const scored = scoreTemplatesForContent(useCase, content, brand);

  if (favorites?.length) {
    const favMatch = scored.find((s) => favorites.includes(s.template.id) && s.score > 10);
    if (favMatch) {
      return {
        templateId: favMatch.template.id,
        reason: `favori + ${favMatch.reasons[0] ?? 'yüksek uyum'}`,
      };
    }
  }

  const top = scored[0];
  if (top && top.score > 0) {
    return {
      templateId: top.template.id,
      reason: top.reasons.slice(0, 2).join(', ') || 'en iyi eşleşme',
    };
  }

  const sector = brand.sectorId ? getSectorCollection(brand.sectorId) : null;
  return {
    templateId: sector?.defaultPreferences[useCase] ?? 'agency_luxury_bottom_01',
    reason: 'sektör varsayılanı',
  };
}

/**
 * Get top N recommended templates for a content piece, scored and ranked.
 */
export function getRecommendedTemplates(
  useCase: AnnouncementUseCase,
  content: ContentSignal,
  brand: BrandSignal,
  limit = 8,
): Array<{ template: AnnouncementTemplateDefinition; score: number; reason: string }> {
  const scored = scoreTemplatesForContent(useCase, content, brand);
  const seen = new Set<string>();
  const results: Array<{ template: AnnouncementTemplateDefinition; score: number; reason: string }> = [];

  for (const s of scored) {
    if (seen.has(s.template.family)) continue;
    seen.add(s.template.family);
    results.push({
      template: s.template,
      score: s.score,
      reason: s.reasons.slice(0, 2).join(', ') || 'genel',
    });
    if (results.length >= limit) break;
  }

  return results;
}
