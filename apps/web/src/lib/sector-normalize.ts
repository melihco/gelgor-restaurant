/**
 * Canonical sector ID normalization — single import for Python ↔ TS alignment.
 * Maps legacy aliases (cafe, gym, nail_salon…) to sector-production-profile keys.
 */
export {
  normalizeSectorId,
  getSectorProfile,
  getSectorReelPacing,
  type ReelPacing,
  type SectorProductionProfile,
} from './sector-production-profile';
