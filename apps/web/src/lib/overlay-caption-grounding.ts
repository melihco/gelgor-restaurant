/**
 * Overlay copy grounding — on-canvas headline/subtitle must trace to the slot caption.
 * Blocks tourism/agro-tourism framing and generic e-commerce CTAs when the caption
 * is about concrete products (e.g. zeytinyağı for Karaman Datça).
 */

import {
  extractCaptionThemePunchline,
  isIncompleteOverlayPhrase,
  resolveFalDisplayHeadline,
  resolveFalProductionOverlayHeadline,
  resolveFalSubtitle,
  type OverlayLocale,
} from '@/lib/fal-caption-headline';
import { isNonVenueSectorProfile } from '@/lib/sector-production-profile';

const TOURISM_FRAMING_RX =
  /\b(agro[-\s]?turizm|agroturizm|agro\s+tourism|turizm\s+deneyim|seyahat\s+acent|tatil\s+paket|turist\s+rehber)\b/i;

const GENERIC_RETAIL_CTA_RX =
  /(?:hızlı\s+sipariş|hemen\s+sipariş|hizli\s+siparis|hemen\s+al|sepete\s+ekle|sipariş\s+ver|siparis\s+ver|order\s+now|shop\s+now|buy\s+now)/i;

const PRODUCT_SIGNAL_RX =
  /\b(zeytinyağı|zeytinyagi|zeytin|olive|bal|honey|reçel|recel|peynir|incir|badem|hasat|soğuk\s+sıkım|soguk\s+sikim|sızma|sizma|erken\s+hasat|doğal|dogal|el\s+yapım|artisan|yöresel|yoresel|datça|datca|üretim|uretim|çiftlik|uretici|üretici)\b/i;

const OVERLAY_STOP_TOKENS = new Set([
  'ile', 've', 'mi', 'mu', 'mı', 'mü', 'bir', 'the', 'for', 'with', 'your', 'our',
  'tanıştınız', 'tanistiniz', 'mısın', 'misin', 'mısınız', 'misiniz',
]);

function normalizeOverlayCompare(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function overlayTokens(text: string): string[] {
  return normalizeOverlayCompare(text)
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !OVERLAY_STOP_TOKENS.has(w));
}

/** Simple stem so "sunset" matches "sunsets", "cocktail" ↔ "cocktails". */
function stemOverlayToken(token: string): string {
  const t = token.toLowerCase();
  if (t.length >= 6 && t.endsWith('ies')) return `${t.slice(0, -3)}y`;
  if (t.length >= 5 && t.endsWith('es') && !t.endsWith('ss')) return t.slice(0, -2);
  if (t.length >= 5 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

function captionContainsOverlayToken(captionNorm: string, token: string): boolean {
  const cBlob = ` ${captionNorm} `;
  if (cBlob.includes(` ${token} `) || captionNorm.includes(token)) return true;
  const stem = stemOverlayToken(token);
  if (stem !== token && (cBlob.includes(` ${stem} `) || captionNorm.includes(stem))) return true;
  // Plural in caption, singular in headline (or reverse).
  if (cBlob.includes(` ${stem}s `) || cBlob.includes(` ${stem}es `)) return true;
  return false;
}

/** True when headline tokens substantially appear in the caption body. */
export function overlayHeadlineGroundedInCaption(headline: string, caption: string): boolean {
  const h = normalizeOverlayCompare(headline);
  const c = normalizeOverlayCompare(caption);
  if (!h || !c) return false;
  if (c.includes(h)) return true;

  const hTokens = overlayTokens(headline);
  if (hTokens.length === 0) return false;

  const overlap = hTokens.filter((t) => captionContainsOverlayToken(c, t));
  // One strong scene noun (sunset, dj, cocktail…) is enough when it clearly appears.
  const strongScene = overlap.some((t) =>
    /^(sunset|sunrise|golden|cocktail|kokteyl|dj|night|gece|event|etkinlik|beach|plaj)$/i.test(
      stemOverlayToken(t),
    ));
  if (strongScene && overlap.length >= 1) return true;
  if (overlap.length >= Math.min(2, hTokens.length)) return true;
  return overlap.length / hTokens.length >= 0.5;
}

/** Tourism/agro-tourism hook when caption is product- or farm-focused without tourism language. */
export function isOffTopicTourismOverlay(
  headline: string,
  caption: string,
  businessType?: string,
): boolean {
  if (!TOURISM_FRAMING_RX.test(headline)) return false;
  if (TOURISM_FRAMING_RX.test(caption)) return false;

  const productCaption = PRODUCT_SIGNAL_RX.test(caption);
  const productSector =
    productCaption
    || (businessType ? isNonVenueSectorProfile(businessType) : false)
    || /\blocal_products|artisan|farm_shop|handmade\b/i.test(businessType ?? '');

  if (productSector) return true;
  return !overlayHeadlineGroundedInCaption(headline, caption);
}

/** Generic fast-order CTA not supported by caption (artisan/local product brands). */
export function isGenericRetailOverlayCta(text: string, caption = ''): boolean {
  const probe = text.trim();
  if (!probe || !GENERIC_RETAIL_CTA_RX.test(probe)) return false;
  if (caption && GENERIC_RETAIL_CTA_RX.test(caption)) return false;
  return true;
}

function cleanCaption(raw: string): string {
  return raw
    .replace(/[\u{1F600}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .replace(/#\S+/g, '')
    .replace(/@\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Prefer sentences mentioning concrete products / harvest / origin. */
export function extractProductBiasedCaptionHook(
  caption: string,
  missionTitle: string,
  brandName: string,
  maxLen: number,
): string | null {
  const missionLower = missionTitle.toLowerCase();
  const brandLower = brandName.toLowerCase();
  const sentences = cleanCaption(caption)
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 10 && PRODUCT_SIGNAL_RX.test(s));

  for (const sentence of sentences) {
    if (sentence.toLowerCase() === missionLower) continue;
    if (brandLower && sentence.toLowerCase().includes(brandLower)) continue;
    const clause = sentence.split(/[,—–\-]/)[0]?.trim() ?? sentence;
    if (clause.length >= 8 && clause.length <= maxLen) return clause;
    if (clause.length > maxLen) {
      const words = clause.split(/\s+/).filter(Boolean);
      let acc = '';
      for (const word of words) {
        const next = acc ? `${acc} ${word}` : word;
        if (next.length > maxLen) break;
        acc = next;
      }
      if (acc.length >= 8) return acc;
    }
  }
  return null;
}

export function rebiasUngroundedOverlayCopy(input: {
  headline: string;
  subtitle?: string;
  caption: string;
  brandName?: string;
  businessType?: string;
  channel: 'reel' | 'feed_post' | 'story';
  cta?: string;
  /** Keep calendar/mission punchline — do not replace with caption-derived hook. */
  preserveHeadline?: boolean;
}): { headline: string; subtitle?: string; rebased: boolean } {
  const caption = input.caption.trim();
  const brandName = (input.brandName ?? '').trim();
  const maxLen = input.channel === 'reel' ? 22 : input.channel === 'story' ? 28 : 32;

  let headline = input.headline.trim();
  let subtitle = input.subtitle?.trim();
  let rebased = false;
  const subtitleWasGeneric = Boolean(subtitle && isGenericRetailOverlayCta(subtitle, caption));

  const headlineBad =
    !input.preserveHeadline
    && (
      !overlayHeadlineGroundedInCaption(headline, caption)
      || isOffTopicTourismOverlay(headline, caption, input.businessType)
    );

  if (headlineBad && caption.length >= 16) {
    const productHook = extractProductBiasedCaptionHook(
      caption,
      headline,
      brandName,
      maxLen,
    );
    const themePunch = extractCaptionThemePunchline({
      caption,
      maxLen,
      maxWords: input.channel === 'reel' ? 3 : 3,
      missionTitle: headline,
    });
    const resolved = resolveFalDisplayHeadline({
      caption,
      missionTitle: headline,
      brandName,
      cta: input.cta,
      maxLen,
    });
    // Prefer mission-aligned theme punchline; product hook only when mission is product-led.
    const missionIsEventScene = /sunset|batım|batim|dj|gece|night|event|etkinlik|golden/i.test(headline);
    const candidate = missionIsEventScene
      ? (themePunch || resolved.headline || productHook)
      : (productHook ?? themePunch ?? resolved.headline);
    const clamped = resolveFalProductionOverlayHeadline(
      candidate,
      [themePunch, resolved.headline, headline].filter(Boolean),
      input.channel,
    );
    if (
      clamped
      && !isIncompleteOverlayPhrase(clamped)
      && (
        overlayHeadlineGroundedInCaption(clamped, caption)
        || Boolean(themePunch && clamped === themePunch)
        || Boolean(themePunch && clamped.toLowerCase() === themePunch.toLowerCase())
      )
      && !isOffTopicTourismOverlay(clamped, caption, input.businessType)
    ) {
      headline = clamped;
      rebased = true;
    }
  }

  if (subtitleWasGeneric) {
    subtitle = undefined;
    rebased = true;
  }

  if ((headlineBad || subtitleWasGeneric) && !subtitle) {
    const sub = resolveFalSubtitle({
      caption,
      headline,
      brandName,
      cta: isGenericRetailOverlayCta(input.cta ?? '', caption) ? undefined : input.cta,
      maxLen: 40,
    });
    if (sub && !isGenericRetailOverlayCta(sub, caption)) {
      subtitle = sub;
      rebased = true;
    }
  }

  return { headline, subtitle, rebased };
}

/** Vision readback — reject painted copy that drifted off caption theme. */
export function detectedCanvasTextOffCaption(
  detected: string | null | undefined,
  caption: string,
  businessType?: string,
): boolean {
  const text = String(detected ?? '').trim();
  if (!text || text.length < 4) return false;
  return (
    isOffTopicTourismOverlay(text, caption, businessType)
    || (
      !overlayHeadlineGroundedInCaption(text, caption)
      && isOffTopicTourismOverlay(text, caption, businessType)
    )
  );
}

export function captionLooksProductFocused(caption: string): boolean {
  return PRODUCT_SIGNAL_RX.test(caption);
}

export type { OverlayLocale };
