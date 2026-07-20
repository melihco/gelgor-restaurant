/**
 * Client-safe premium-editorial exports (no sharp / node:crypto).
 * Mobile UI must import from here — never from the server barrel index.
 */

export {
  COPY_LIMITS,
  PREMIUM_EDITORIAL_PROMPT_VERSION,
  PREMIUM_EDITORIAL_SLOT_CODE,
  type CreativeVariationKey,
  type EditorialLayoutFamily,
  type PremiumEditorialAspectRatio,
  type PremiumEditorialOutputType,
} from './types';

export { CREATIVE_VARIATION_KEYS } from './creative-direction';
export { EDITORIAL_LAYOUT_FAMILIES } from './layout-specification';
