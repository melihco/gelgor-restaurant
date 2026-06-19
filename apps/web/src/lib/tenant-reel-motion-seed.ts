/**
 * Runway director prompt guardrails — product / venue / digital variants.
 * Sector defaults live in sector-reel-motion-standard.ts (DB via onboarding).
 */
import { applyFidelityToDirectorPrompt } from './runway-reel-fidelity';
import {
  resolveRunwayDirectorVariant,
  type ReelDirectorVariant,
} from './sector-reel-motion-standard';

export type { ReelDirectorVariant as TenantReelDirectorVariant };

export const PRODUCT_SPOTLIGHT_REEL_DIRECTOR_RULES = `
PRODUCT SPOTLIGHT TVC (mandatory):
- Treat the reference as a locked hero product frame from a real food photoshoot — jar, bottle, or pack shot.
- Macro commercial lens: gentle dolly-in toward label and texture; optional subtle focus rack on packaging.
- Allow only micro-motion already plausible in frame: light shimmer on glass, slow pour, steam, condensation, ingredient ripple.
- Premium food-ad pacing — no handheld shake, no scene change, no morphing labels or logos.
- Product shape, label text, and brand colors must stay sharp and legible throughout.
`.trim();

export const VENUE_ATMOSPHERE_REEL_DIRECTOR_RULES = `
VENUE ATMOSPHERE (mandatory):
- Reference is a real beach club / lifestyle venue photo — preserve architecture, sea view, and brand identity.
- Allow subtle ambient motion only: gentle sea shimmer, sun flare, linen breeze, soft water ripple in background.
- Slow pan or tilt — never morph buildings, invent crowds, or change time of day.
- Mediterranean luxury pacing — no product pack-shot macro, no food TVC framing.
`.trim();

export const DIGITAL_EDITORIAL_REEL_DIRECTOR_RULES = `
DIGITAL EDITORIAL (mandatory):
- Reference may be salon interior, UI mockup, or designed brand asset — keep layout and typography pixel-stable.
- Micro-motion only: subtle screen glow, light parallax, focus breathing — no scene rebuild or venue tourism drift.
- Clean agency/SaaS aesthetic — no beach sunset drift, no food product hero shots, no invented people.
`.trim();

export interface RunwayDirectorGuardrailOptions {
  workspaceId?: string;
  sector?: string;
  productSpotlightReel?: boolean;
}

function appendDirectorRules(prompt: string, rules: string, marker: RegExp): string {
  if (marker.test(prompt)) return prompt;
  return `${prompt} ${rules}`;
}

function applyDirectorVariantRules(prompt: string, variant: ReelDirectorVariant | undefined): string {
  if (!variant) return prompt;
  switch (variant) {
    case 'product_tvc':
      return appendDirectorRules(
        prompt,
        PRODUCT_SPOTLIGHT_REEL_DIRECTOR_RULES,
        /product spotlight tvc|hero product frame|food photoshoot/i,
      );
    case 'venue_atmosphere':
      return appendDirectorRules(
        prompt,
        VENUE_ATMOSPHERE_REEL_DIRECTOR_RULES,
        /venue atmosphere|beach club|mediterranean luxury pacing/i,
      );
    case 'digital_editorial':
      return appendDirectorRules(
        prompt,
        DIGITAL_EDITORIAL_REEL_DIRECTOR_RULES,
        /digital editorial|pixel-stable|agency\/saas aesthetic/i,
      );
    default:
      return prompt;
  }
}

export function applyRunwayDirectorPromptGuardrails(
  prompt: string,
  options?: RunwayDirectorGuardrailOptions | string,
): string {
  const opts: RunwayDirectorGuardrailOptions = typeof options === 'string'
    ? { workspaceId: options }
    : options ?? {};

  const variant = resolveRunwayDirectorVariant({
    sector: opts.sector,
    productSpotlightReel: opts.productSpotlightReel,
  });

  const merged = applyDirectorVariantRules(prompt.trim(), variant);
  return applyFidelityToDirectorPrompt(merged);
}

/** @deprecated Use motion profile productSpotlightReel from DB */
export function isTenantProductSpotlightReel(
  _tenantId?: string,
  productSpotlightReel?: boolean,
): boolean {
  return productSpotlightReel === true;
}
