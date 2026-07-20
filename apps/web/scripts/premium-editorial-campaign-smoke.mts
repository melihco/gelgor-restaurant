/**
 * Mission-less smoke for Premium Editorial Campaign slot.
 *
 * Loads brand context from prod (Yula), runs the 5-layer orchestrator locally,
 * writes preview images + report under .preview-renders/.
 *
 * Run:
 *   cd apps/web && npx tsx --env-file=.env.local scripts/premium-editorial-campaign-smoke.mts
 *
 * Optional:
 *   PREMIUM_EDITORIAL_WS=<uuid>  — override workspace
 *   PREMIUM_EDITORIAL_FORMAT=story|post|square
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runPremiumEditorialCampaign } from '../src/lib/premium-editorial';

const PROD = 'https://smartagency-web.onrender.com';
const WS = process.env.PREMIUM_EDITORIAL_WS?.trim()
  || 'd365f0e0-436e-402d-8f84-0c8fd7ab2022';
const FORMAT = (process.env.PREMIUM_EDITORIAL_FORMAT?.trim() || 'post') as
  | 'post'
  | 'story'
  | 'square';
const OUT = join(process.cwd(), '.preview-renders/premium-editorial-campaign-smoke');
mkdirSync(OUT, { recursive: true });

async function fetchJson<T>(url: string, key: string): Promise<T> {
  const res = await fetch(url, {
    headers: { 'X-Internal-Api-Key': key, 'X-Tenant-Id': WS },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json() as Promise<T>;
}

function absUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/')) return `${PROD}${url}`;
  return url;
}

async function main() {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) throw new Error('INTERNAL_API_KEY missing (.env.local)');
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing');

  console.log(`workspace=${WS} format=${FORMAT}`);
  console.log(`out=${OUT}`);

  const [profile, themePayload, dnaPayload, gallery] = await Promise.all([
    fetchJson<Record<string, unknown>>(`${PROD}/api/brand-context-data/${WS}`, key),
    fetchJson<{ theme?: Record<string, unknown> | null }>(`${PROD}/api/brand-context/${WS}/theme`, key),
    fetchJson<Record<string, unknown>>(`${PROD}/api/brand-context/${WS}/brand-dna`, key).catch(() => ({})),
    fetchJson<Record<string, Record<string, unknown>>>(`${PROD}/api/brand-context/${WS}/gallery-analysis`, key)
      .catch(() => ({})),
  ]);

  const theme = themePayload.theme ?? {};
  const galleryUrls = Object.keys(gallery).map((u) => absUrl(u)).filter(Boolean) as string[];
  const refsRaw = profile.reference_image_urls ?? profile.referenceImageUrls;
  const profileRefs = Array.isArray(refsRaw)
    ? (refsRaw as string[]).map((u) => absUrl(u)).filter(Boolean) as string[]
    : [];
  const refs = galleryUrls.length ? galleryUrls : profileRefs;
  const logoUrl = absUrl(
    typeof profile.logo_url === 'string' ? profile.logo_url
      : typeof profile.logoUrl === 'string' ? profile.logoUrl
        : null,
  );

  const brandName = String(profile.business_name ?? profile.brand_name ?? profile.brandName ?? 'Brand');
  console.log(`brand=${brandName} refs=${refs.length} galleryAnalysis=${Object.keys(gallery).length} logo=${Boolean(logoUrl)}`);

  // Remap analysis keys to absolute URLs so matcher scores the same pool as refs.
  const galleryAnalysisAbs: Record<string, Record<string, unknown>> = {};
  for (const [url, meta] of Object.entries(gallery)) {
    const abs = absUrl(url);
    if (abs) galleryAnalysisAbs[abs] = meta as Record<string, unknown>;
  }

  const started = Date.now();
  const result = await runPremiumEditorialCampaign({
    brandId: WS,
    workspaceId: WS,
    contentTopic: 'Sunset terrace tasting — restrained Mediterranean editorial',
    campaignGoal: 'Premium brand awareness',
    headline: 'Golden Hour',
    subheadline: 'Quiet luxury by the water',
    cta: 'Reserve',
    caption: 'Golden hour tasting on the terrace — sunset light, calm Mediterranean water, quiet luxury.',
    mood: 'warm sunset editorial',
    language: 'en',
    outputType: FORMAT,
    aspectRatio: FORMAT === 'story' ? '9:16' : FORMAT === 'square' ? '1:1' : '4:5',
    // Do NOT pin refs[0] — let idea→gallery matcher pick from analysis.
    selectedGalleryAssetUrl: null,
    logoAssetUrl: logoUrl,
    // Venue-grounded social design: GPT bakes typography on the real gallery photo.
    addTextOverlay: true,
    addLogoOverlay: Boolean(logoUrl),
    numberOfVariations: 1,
    forceNewComposition: true,
    galleryAnalysis: galleryAnalysisAbs,
    brandReferenceImageUrls: refs,
    brandContext: {
      ...profile,
      ...dnaPayload,
      brand_name: brandName,
      business_type: profile.business_type ?? profile.businessType ?? 'beach_club',
      location: profile.location ?? profile.city ?? 'Bodrum',
      visual_dna: profile.visual_dna ?? profile.visualDna ?? dnaPayload.visual_dna,
      brand_dna: profile.brand_dna ?? dnaPayload.brand_dna,
      reference_image_urls: refs,
      logo_url: logoUrl,
      brand_theme: theme,
    },
    brandTheme: theme,
  });

  const report = {
    ok: result.status !== 'failed',
    status: result.status,
    generationId: result.generationId,
    secs: Math.round((Date.now() - started) / 1000),
    modelName: result.modelName,
    creativeVariation: result.creativeDirection.creativeVariationKey,
    layoutFamily: result.layoutSpecification.family,
    qaOverall: result.qualityAssessment?.overallScore ?? null,
    qaApproved: result.qualityAssessment?.isApproved ?? null,
    attempts: result.generationAttempts.map((a) => ({
      attempt: a.attempt,
      layoutFamily: a.layoutFamily,
      qa: a.qualityAssessment?.overallScore ?? null,
      error: a.error,
    })),
    warnings: result.warnings,
    backgroundImageUrl: result.backgroundImageUrl,
    finalImageUrl: result.finalImageUrl,
    matchedGalleryUrl: result.matchedGalleryUrl,
    matchedGalleryScore: result.matchedGalleryScore,
    matchedGalleryReason: result.matchedGalleryReason,
    promptVersion: result.promptVersion,
  };

  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  writeFileSync(
    join(OUT, 'layers.json'),
    JSON.stringify({
      brandVisualDna: result.brandVisualDna,
      creativeDirection: result.creativeDirection,
      layoutSpecification: result.layoutSpecification,
      textLayout: result.textLayout,
      qualityAssessment: result.qualityAssessment,
    }, null, 2),
  );
  // Full prompt kept separate for debug — not for UI
  writeFileSync(join(OUT, 'compiled-prompt.txt'), result.finalCompiledPrompt);

  for (const [name, url] of [
    ['background', result.backgroundImageUrl],
    ['final', result.finalImageUrl],
  ] as const) {
    if (!url) continue;
    try {
      const fetchUrl = url.startsWith('/') ? `${PROD}${url}` : url;
      if (url.startsWith('data:image/')) {
        const b64 = url.split(',')[1] ?? '';
        writeFileSync(join(OUT, `${name}.jpg`), Buffer.from(b64, 'base64'));
      } else {
        const img = await fetch(fetchUrl, { signal: AbortSignal.timeout(60_000) });
        if (img.ok) {
          const buf = Buffer.from(await img.arrayBuffer());
          const ext = (img.headers.get('content-type') || '').includes('png') ? 'png' : 'jpg';
          writeFileSync(join(OUT, `${name}.${ext}`), buf);
        }
      }
    } catch (err) {
      console.warn(`download ${name} failed`, err);
    }
  }

  console.log('\n== PREMIUM EDITORIAL SMOKE ==');
  console.log(JSON.stringify(report, null, 2));
  if (result.status === 'failed') process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
