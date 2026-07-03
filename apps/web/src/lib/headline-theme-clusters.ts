/**
 * Headline theme clusters — cross-mission semantic dedupe for repeated angles
 * (e.g. DJ + seafood on beach brands). Sector-agnostic pattern sets.
 */

export interface HeadlineThemeCluster {
  id: string;
  label: string;
  patterns: RegExp[];
}

export const HEADLINE_THEME_CLUSTERS: HeadlineThemeCluster[] = [
  {
    id: 'dj_nightlife',
    label: 'DJ / gece hayatı',
    patterns: [
      /\bdj\b/i,
      /canlı\s*müzik/i,
      /live\s*music/i,
      /lineup/i,
      /gece\s*partisi/i,
      /night\s*party/i,
      /after\s*party/i,
    ],
  },
  {
    id: 'seafood_menu',
    label: 'Deniz ürünleri / balık',
    patterns: [
      /deniz\s*ürün/i,
      /seafood/i,
      /\bbalık\b/i,
      /karides/i,
      /shrimp/i,
      /midye/i,
      /ahtapot/i,
      /calamari/i,
      /levrek/i,
      /çipura/i,
    ],
  },
  {
    id: 'full_moon',
    label: 'Dolunay',
    patterns: [/dolunay/i, /full\s*moon/i, /ay\s*ışığı/i],
  },
  {
    id: 'sunset_golden',
    label: 'Gün batımı / altın saat',
    patterns: [
      /gün\s*batım/i,
      /sunset/i,
      /altın\s*saat/i,
      /golden\s*hour/i,
    ],
  },
  {
    id: 'brunch_weekend',
    label: 'Brunch / hafta sonu kahvaltı',
    patterns: [/brunch/i, /kahvaltı/i, /pazar\s*brunch/i],
  },
  {
    id: 'reservation_cta',
    label: 'Rezervasyon çağrısı',
    patterns: [
      /rezervasyon/i,
      /reservation/i,
      /masa\s*ayırt/i,
      /book\s*now/i,
    ],
  },
  {
    id: 'menu_special',
    label: 'Günün menüsü / şef önerisi',
    patterns: [
      /günün\s*(tabağ|menü)/i,
      /şef(in)?\s*öner/i,
      /chef('s)?\s*special/i,
      /spesyal\s*menü/i,
    ],
  },
  {
    id: 'spa_wellness',
    label: 'Spa / wellness',
    patterns: [/spa\b/i, /wellness/i, /masaj/i, /bakım\s*paket/i],
  },
];

const DEFAULT_BURN_THRESHOLD = 2;

export function detectHeadlineThemeClusters(text: string): string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  const hits: string[] = [];
  for (const cluster of HEADLINE_THEME_CLUSTERS) {
    if (cluster.patterns.some((re) => re.test(normalized))) {
      hits.push(cluster.id);
    }
  }
  return hits;
}

export function buildThemeClusterCounts(texts: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const id of detectHeadlineThemeClusters(text)) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

export function isThemeClusterBurned(
  clusterId: string,
  counts: ReadonlyMap<string, number>,
  threshold = DEFAULT_BURN_THRESHOLD,
): boolean {
  return (counts.get(clusterId) ?? 0) >= threshold;
}

export function burnedThemeClusterIds(
  counts: ReadonlyMap<string, number>,
  threshold = DEFAULT_BURN_THRESHOLD,
): string[] {
  return [...counts.entries()]
    .filter(([, n]) => n >= threshold)
    .map(([id]) => id);
}

export function themeClusterLabel(clusterId: string): string {
  return HEADLINE_THEME_CLUSTERS.find((c) => c.id === clusterId)?.label ?? clusterId;
}

/** Map a content hook / signal title to theme clusters it would reinforce. */
export function inferThemeClustersFromHook(text: string): string[] {
  return detectHeadlineThemeClusters(text);
}
