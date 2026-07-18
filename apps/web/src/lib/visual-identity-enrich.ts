/**
 * Onboarding / gap-repair visual identity enrichment.
 * Runs skip-scrape extract-vibe (gallery + captions) then optional theme derive.
 */

import { getNextjsInternalOrigin } from '@/lib/runtime-config';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import { isSchemaValidBrandVibeProfile } from '@/lib/brand-vibe-extraction';

export interface VisualIdentityEnrichResult {
  ok: boolean;
  detail: string;
  persisted?: boolean;
  skipped?: boolean;
}

export async function runVisualIdentityEnrich(
  tenantId: string,
  headers: Record<string, string>,
  opts?: { force?: boolean; timeoutMs?: number },
): Promise<VisualIdentityEnrichResult> {
  const origin = getNextjsInternalOrigin();
  const timeoutMs = opts?.timeoutMs ?? 240_000;

  try {
    // Skip if vibe already has motion + palette unless forced
    if (!opts?.force) {
      const ctxRes = await fetchCrewBackendJson<Record<string, unknown>>(
        `/api/v1/brand-context/${tenantId}`,
        { workspaceId: tenantId, timeoutMs: 20_000, headers },
      );
      if (ctxRes.ok && isSchemaValidBrandVibeProfile(ctxRes.data?.brand_vibe_profile)) {
        return {
          ok: true,
          skipped: true,
          detail: 'vibe_already_present',
          persisted: true,
        };
      }
    }

    const res = await fetch(`${origin}/api/brand-context/${tenantId}/extract-vibe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Id': tenantId,
        ...headers,
      },
      body: JSON.stringify({
        source: 'onboarding_gallery',
        persist: true,
        max_images: 12,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      persisted?: boolean;
      error?: string;
      message?: string;
      profile?: unknown;
      stats?: { images_analyzed?: number; captions_collected?: number };
    };

    if (!res.ok) {
      return {
        ok: false,
        detail: json.message || json.error || `HTTP ${res.status}`,
      };
    }

    const valid = isSchemaValidBrandVibeProfile(json.profile);
    return {
      ok: Boolean(json.ok) && valid,
      persisted: json.persisted !== false,
      detail: valid
        ? `gallery_vibe · images=${json.stats?.images_analyzed ?? '?'} captions=${json.stats?.captions_collected ?? 0}`
        : (json.error || 'invalid_vibe_schema'),
    };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Ordered deep-setup step ids that include visual identity enrich (for tests). */
export const DEEP_SETUP_VISUAL_PIPELINE_STEPS = [
  'service_profile',
  'industry_calendar',
  'visual_identity_enrich',
  'production_design_profile',
] as const;
