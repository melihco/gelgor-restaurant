/**
 * Brand visual DNA → typography vibe (SSOT).
 *
 * Two call sites used to keep near-identical keyword tables that disagreed with
 * each other, and both resolved first-match-wins over a flat list. That made the
 * typographic character of every design depend on which generic adjective
 * happened to sit earlier in the list:
 *
 *   "Clean modern minimal spaces with bright natural light"  → handwritten
 *     (the `handwritten` rule matched "natural" before `minimal_modern` was reached)
 *   "…warm and inviting, earthy tones like terracotta and teal…" (Bodrum beach club)
 *     → anatolian_warm (a palette word bought ocakbaşı/meyhane typography)
 *
 * Words are therefore tiered by how much they actually say about a brand:
 *
 * - IDENTITY — proper nouns, cultural anchors, named styles, venue types. One hit
 *   is decisive because nothing else explains why the word is there.
 * - SUPPORTING — design adjectives. Real signal, but too common to outrank a
 *   curated sector default alone, so two aligned hits are required.
 * - Noise words (warm, natural, clean, modern, cozy…) are excluded entirely.
 *   They appear in nearly every generated visual DNA and carry no typographic
 *   information.
 *
 * When nothing clears the bar this returns null and the caller falls back to the
 * sector default — a deliberate choice beats an adjective guess.
 */

import type { TypographyVibe } from '@/types/brand-theme';

type VibeRule = {
  vibe: TypographyVibe;
  /** One hit decides. */
  identity: string;
  /** Two hits needed — a single design adjective must not flip a brand. */
  supporting?: string;
};

/**
 * Turkish-safe word boundaries. `\b` is ASCII-only, so "ocakbaşı" and "diş"
 * never matched a `\b…\b` pattern — the terms were silently dead.
 */
function termRegex(alternatives: string): RegExp {
  return new RegExp(`(?<!\\p{L})(?:${alternatives})(?!\\p{L})`, 'giu');
}

/** Ordered only for deterministic tie-breaks between equally strong matches. */
const VIBE_RULES: readonly VibeRule[] = [
  {
    vibe: 'warm_coastal',
    identity: 'aegean|ege|mediterranean|akdeniz|bodrum|cycladic|coastal|sahil|marina|beach|plaj|turquoise|sun.?bleach(?:ed)?|bohemian|boho',
  },
  {
    vibe: 'anatolian_warm',
    identity: 'anatolian|anadolu|ocakba[sş][ıi]|meyhane|mezze|meze|mangal|baklava|etnik|heritage.?warm|kilim',
    supporting: 'terracotta|toprak|earthen',
  },
  {
    vibe: 'quiet_luxury',
    identity: '(?:quiet|understated|muted|whispered|restrained).?luxury|sessiz.?l[üu]ks',
  },
  {
    vibe: 'clinical_clean',
    identity: 'clinical|sterile|steril|dental|di[şs].?hekim|klinik|clinic|hygienic|hijyen|medical.?clean|barber.?premium',
  },
  {
    vibe: 'editorial_serif',
    identity: 'michelin|fine.?dining|haute.?cuisine|editorial',
    supporting: 'luxury|l[üu]ks|premium|elegant|refined|sophisticated|zarif',
  },
  {
    vibe: 'handwritten',
    identity: 'artisan|hand.?craft(?:ed)?|handmade|el.?yap[ıi]m[ıi]|spa|wellness|holistic',
    supporting: 'organic|organik|samimi|do[ğg]al.?dokunu[şs]',
  },
  {
    vibe: 'retro_poster',
    identity: 'coffee|kahve|roast(?:ery|ed)?|vintage|nostalg\\w*|bakery|f[ıi]r[ıi]n|retro',
    supporting: 'craft|rustic|rustik',
  },
  {
    vibe: 'minimal_modern',
    identity: 'scandinavian|brutalist|bauhaus|monochrome',
    supporting: 'minimal|sade|contemporary|sleek|understated',
  },
  {
    vibe: 'neon_glow',
    identity: 'neon|nightlife|night.?club|speakeasy|after.?dark|dj|electric',
  },
  {
    vibe: 'street_bold',
    identity: 'urban|street(?:wear)?|graffiti|sokak',
    supporting: 'bold|energy|enerji|dynamic|impact',
  },
];

/** Two supporting hits are required before overriding a curated sector default. */
const SUPPORTING_HITS_REQUIRED = 2;

function countMatches(text: string, alternatives: string): number {
  const unique = new Set<string>();
  for (const match of text.matchAll(termRegex(alternatives))) {
    unique.add(match[0].toLowerCase());
  }
  return unique.size;
}

export type VibeInferenceTier = 'identity' | 'supporting';

export type VibeInference = {
  vibe: TypographyVibe;
  tier: VibeInferenceTier;
  /** Distinct matched terms — useful for provenance in prompts / audits. */
  hits: number;
};

/**
 * Infer a typography vibe from brand visual DNA / tone text.
 * Returns null when the text carries no typographic identity.
 */
export function inferTypographyVibeFromBrandDna(text?: string | null): VibeInference | null {
  const body = (text ?? '').trim();
  if (!body) return null;

  let best: VibeInference | null = null;
  for (const rule of VIBE_RULES) {
    const identityHits = countMatches(body, rule.identity);
    if (identityHits > 0) {
      if (!best || best.tier !== 'identity' || identityHits > best.hits) {
        best = { vibe: rule.vibe, tier: 'identity', hits: identityHits };
      }
      continue;
    }
    if (best?.tier === 'identity' || !rule.supporting) continue;

    const supportingHits = countMatches(body, rule.supporting);
    if (supportingHits >= SUPPORTING_HITS_REQUIRED
      && (!best || supportingHits > best.hits)) {
      best = { vibe: rule.vibe, tier: 'supporting', hits: supportingHits };
    }
  }
  return best;
}

/** Convenience wrapper for callers that only need the vibe. */
export function typographyVibeFromBrandDna(text?: string | null): TypographyVibe | null {
  return inferTypographyVibeFromBrandDna(text)?.vibe ?? null;
}
