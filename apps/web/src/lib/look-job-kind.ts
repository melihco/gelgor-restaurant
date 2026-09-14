/**
 * Catalog / slot-job family. Safe for client bundles — no OpenAI / server I/O.
 */
export type LookJobKind = 'sell' | 'place' | 'process' | 'other';

const PLACE_RE = /ambiance|atmosphere|venue|sunset|market_day|shop_tour|shop_interior|weekend|hours|saat|lawn|pier|terrace|garden|atmosfer|pazar|dükkan|dukkan|gün batım|gun batim|çim|cim |şemsiye|semsiye|şezlong/;
const PROCESS_RE = /process|bts|farm_visit|craft|atölye|atolye|üretim|uretim|süreç|surec|kulis|çiftlik|ciftlik|behind/;
const SELL_RE = /hero|favorite|limited|new_arrival|product_hero|product_range|product_detail|product_image|range_carousel|gift|menu|dish|favori|sınırlı|sinirli|ürün|urun|parti|yelpaze|campaign_post/;

export function lookJobKind(input: {
  slotJob?: string;
  catalogSlotKey?: string;
}): LookJobKind {
  const bag = `${input.catalogSlotKey ?? ''} ${input.slotJob ?? ''}`.toLowerCase();
  if (!bag.trim()) return 'other';
  if (PLACE_RE.test(bag)) return 'place';
  if (PROCESS_RE.test(bag)) return 'process';
  if (SELL_RE.test(bag)) return 'sell';
  return 'other';
}
