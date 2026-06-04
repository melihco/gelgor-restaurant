/**
 * Fetch + resolve Brand Hub AI Görsel Geliştirme settings for production routes.
 */
import {
  resolveAiVisualProductionStandard,
  type AiVisualProductionStandard,
} from '@/lib/ai-visual-production-standard';
import { normalizeBrandThemeRecord } from '@/lib/brand-theme-normalize';

export { normalizeBrandThemeRecord } from '@/lib/brand-theme-normalize';

function themeKeyVariants(snake: string): string[] {
  const camel = snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  return [snake, camel];
}

/** Read boolean theme flag (snake_case or camelCase). */
export function themeFlag(
  theme: Record<string, unknown> | null | undefined,
  key: string,
): boolean {
  if (!theme) return false;
  for (const k of themeKeyVariants(key)) {
    if (k in theme) return Boolean(theme[k]);
  }
  return false;
}

export function themeString(
  theme: Record<string, unknown> | null | undefined,
  key: string,
  fallback: string,
): string {
  if (!theme) return fallback;
  for (const k of themeKeyVariants(key)) {
    if (theme[k] != null && theme[k] !== '') return String(theme[k]);
  }
  return fallback;
}

export function themeStringArray(
  theme: Record<string, unknown> | null | undefined,
  key: string,
  fallback: string[],
): string[] {
  if (!theme) return fallback;
  for (const k of themeKeyVariants(key)) {
    const v = theme[k];
    if (Array.isArray(v) && v.length) {
      return v.map((x) => String(x));
    }
  }
  return fallback;
}

export function resolveProductionVisualStandard(
  theme: Record<string, unknown> | null | undefined,
): AiVisualProductionStandard {
  return resolveAiVisualProductionStandard(normalizeBrandThemeRecord(theme));
}

export async function fetchBrandThemeForProduction(opts: {
  workspaceId: string;
  crewBaseUrl: string;
  internalApiKey: string;
  timeoutMs?: number;
}): Promise<Record<string, unknown> | null> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  try {
    const r = await fetch(
      `${opts.crewBaseUrl.replace(/\/$/, '')}/api/v1/brand-context/${opts.workspaceId}/theme`,
      {
        headers: {
          'X-Internal-Api-Key': opts.internalApiKey,
          'X-Tenant-Id': opts.workspaceId,
        },
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    if (!r.ok) return null;
    const data = (await r.json()) as { theme?: Record<string, unknown> | null };
    if (!data.theme || typeof data.theme !== 'object') return null;
    return normalizeBrandThemeRecord(data.theme);
  } catch {
    return null;
  }
}
