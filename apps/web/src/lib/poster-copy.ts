/** Copy helpers for agency poster overlays — delegates to poster-quality bar. */
export {
  isGenericGeoLocation,
  normalizePosterCopy,
  scorePosterQa,
  type NormalizedPosterCopy,
  type PosterQaResult,
} from './poster-quality';

import { normalizePosterCopy, scorePosterQa } from './poster-quality';

export function resolvePosterOverlayCopy(input: {
  headline: string;
  subtitle?: string;
  brandName: string;
  location?: string;
  eventDate?: string;
  eventTime?: string;
  cta?: string;
  caption?: string;
  sector?: string;
}): {
  headline: string;
  subtitle: string;
  venueArea?: string;
  cta?: string;
} {
  const n = normalizePosterCopy(input);
  return {
    headline: n.headline,
    subtitle: n.subtitle,
    venueArea: n.venueArea,
    cta: n.cta,
  };
}

/** Run QA on resolved overlay copy (APO-4). */
export function auditPosterOverlayCopy(
  copy: ReturnType<typeof resolvePosterOverlayCopy>,
  opts: { sector?: string; layoutFamily?: string },
): PosterQaResult {
  return scorePosterQa({
    headline: copy.headline,
    subtitle: copy.subtitle,
    venueArea: copy.venueArea,
    sector: opts.sector,
    layoutFamily: opts.layoutFamily,
  });
}
