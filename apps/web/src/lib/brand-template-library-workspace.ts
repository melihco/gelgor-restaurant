/**
 * Load tenant-saved template_library from Python brand theme for showcase & catalog.
 */
import {
  ensureBrandTemplateLibrary,
  parseBrandTemplateLibraryFromTheme,
  type BrandTemplateLibrary,
} from './brand-template-library';
import { fetchBrandThemeForWorkspace } from './brand-production-tokens';
import { resolveKitForSector } from './story-template-registry';
import { tenantKitSeed } from './tenant-template-seed';

export interface WorkspaceBrandTemplateLibraryLoadResult {
  library: BrandTemplateLibrary;
  sector: string;
  usesSavedLibrary: boolean;
  kitId: string;
}

async function fetchBrandContextSector(workspaceId: string): Promise<string> {
  const crew = (process.env.CREW_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');
  const key = process.env.INTERNAL_API_KEY ?? 'smartagency-internal-dev-key';
  try {
    const res = await fetch(`${crew}/api/v1/brand-context/${workspaceId}`, {
      headers: {
        'X-Internal-Api-Key': key,
        'X-Tenant-Id': workspaceId,
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return 'professional_service';
    const ctx = await res.json() as Record<string, unknown>;
    return String(ctx.business_type ?? ctx.industry ?? 'professional_service').toLowerCase();
  } catch {
    return 'professional_service';
  }
}

export async function loadWorkspaceBrandTemplateLibrary(
  workspaceId: string,
): Promise<WorkspaceBrandTemplateLibraryLoadResult | null> {
  const trimmed = workspaceId.trim();
  if (!trimmed) return null;

  const [theme, sector] = await Promise.all([
    fetchBrandThemeForWorkspace(trimmed),
    fetchBrandContextSector(trimmed),
  ]);

  const motionRaw = theme?.motion_profile ?? theme?.motionProfile;
  const motionProfile = motionRaw && typeof motionRaw === 'object'
    ? motionRaw as Record<string, unknown>
    : {};
  const motionStyle = String(motionProfile.motion_style ?? motionProfile.motionStyle ?? 'editorial');
  const kitId = resolveKitForSector(sector, tenantKitSeed(trimmed));
  const library = ensureBrandTemplateLibrary(theme, {
    sector,
    kitId,
    motionStyle,
    tenantId: trimmed,
  });
  const saved = parseBrandTemplateLibraryFromTheme(theme);
  const usesSavedLibrary = Boolean(
    saved && (saved.locked || (saved.tenantId && saved.tenantId === trimmed)),
  );

  return {
    library,
    sector,
    usesSavedLibrary,
    kitId: library.kitId,
  };
}
