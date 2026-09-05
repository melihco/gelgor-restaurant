/**
 * Catalog vs Remotion library keys on artifacts.
 *
 * `catalog_slot_key` is production SSOT. `library_slot_key` is the legacy
 * typography/Remotion alias (`editorial_story`, `campaign_post`, …) and must
 * not be copied from catalog or used as a catalog fallback.
 */

function trimKey(value: string | null | undefined): string | null {
  const key = String(value ?? '').trim();
  return key || null;
}

export function resolveArtifactSlotKeys(input: {
  catalogSlotKey?: string | null;
  librarySlotKey?: string | null;
}): { catalog_slot_key?: string; library_slot_key?: string } {
  const catalog = trimKey(input.catalogSlotKey);
  const library = trimKey(input.librarySlotKey);
  return {
    ...(catalog ? { catalog_slot_key: catalog } : {}),
    ...(library ? { library_slot_key: library } : {}),
  };
}
