/**
 * Smoke test — template replica production (single artifact).
 *
 * Reproduces ONE designed-post slot from the latest Yula mission using the NEW
 * local pipeline: stored template prompt (design_spec.prompt) + template
 * thumbnail as GPT edit layout reference + mission copy/photo swap.
 *
 * Run: cd apps/web && npx tsx --env-file=.env.local scripts/yula-template-replica-smoke.mts
 * Cost: ~1-2 GPT image edits + 2 small vision reviews (≈ $0.05–0.25).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import type { MatchedDesignTemplate } from '../src/lib/brand-design-template-matcher';
import {
  buildTemplateLayoutDirectives,
  templateLayoutReferenceUrl,
  templateReplicaSpecFromBinding,
  type BrandTemplateFalBinding,
} from '../src/lib/brand-design-template-production';
import { produceFalDesignedPost } from '../src/app/api/auto-produce/pipelines/fal-designed-post-pipeline';

const PROD_WEB = 'https://smartagency-web.onrender.com';
const WS = 'd365f0e0-436e-402d-8f84-0c8fd7ab2022'; // Yula Bodrum (pilot QA)
const CATALOG_SLOT_KEY = 'restaurant_cafe_private_dining_post';

// Mission copy from the latest Yula mission (idea 0 slot) — intentionally
// different from the template's sample copy ("Özel Kampanya").
const MISSION_HEADLINE = 'Taze Mandalin Fırsatı';
const MISSION_SUBTITLE = 'Pazar günü Yula Bodrum’da';
const MISSION_CAPTION =
  'Pazar fırsatı: Yula Bodrum’a özel taze mandalin lezzetleri sizi bekliyor. '
  + 'Deniz kenarında, mevsimin en taze mandalinleriyle hazırlanan tabaklar.';

const OUT = join(process.cwd(), '.preview-renders/yula-template-replica-smoke');
mkdirSync(OUT, { recursive: true });

interface TemplateRow {
  id: string;
  template_type: string;
  template_name: string;
  format: string;
  thumbnail_url: string | null;
  catalog_slot_key: string | null;
  design_spec?: Record<string, unknown>;
}

function absUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith('/') ? `${PROD_WEB}${url}` : url;
}

async function fetchBuf(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) throw new Error('INTERNAL_API_KEY missing — run with --env-file=.env.local');

  // ── 1. Pull the real Yula template row from prod ──────────────────────────
  const tplRes = await fetch(`${PROD_WEB}/api/brand-context/${WS}/design-templates`, {
    headers: { 'X-Internal-Api-Key': key, 'X-Tenant-Id': WS },
  });
  if (!tplRes.ok) throw new Error(`templates fetch ${tplRes.status}`);
  const rows = await tplRes.json() as TemplateRow[];
  const row = rows.find((r) => r.catalog_slot_key === CATALOG_SLOT_KEY);
  if (!row) throw new Error(`template for ${CATALOG_SLOT_KEY} not found`);

  const sd = row.design_spec ?? {};
  const colors = sd.brandColors as { primary?: string; accent?: string } | undefined;
  const brandColors = {
    primary: colors?.primary ?? '#00C5CC',
    accent: colors?.accent ?? '#f5a25d',
  };
  const galleryRef = absUrl(typeof sd.galleryRef === 'string' ? sd.galleryRef : null);
  const thumbnailUrl = absUrl(row.thumbnail_url);
  if (!thumbnailUrl) throw new Error('template has no thumbnail');
  if (!galleryRef) throw new Error('template has no gallery reference photo');

  const matched: MatchedDesignTemplate = {
    id: row.id,
    templateType: row.template_type,
    templateName: row.template_name,
    format: row.format,
    vibe: sd.vibe as MatchedDesignTemplate['vibe'],
    galleryRef,
    prominentLogo: Boolean(sd.prominentLogo),
    designSpecPrompt: typeof sd.prompt === 'string' ? sd.prompt : null,
    thumbnailUrl,
    brandColors,
    logoUrl: typeof sd.logoUrl === 'string' ? sd.logoUrl : undefined,
    directive: `Stay consistent with the "${row.template_name}" brand template.`,
    sampleHeadline: typeof sd.sampleHeadline === 'string' ? sd.sampleHeadline : null,
    sampleSubtitle: typeof sd.sampleSubtitle === 'string' ? sd.sampleSubtitle : null,
    layoutPattern: typeof sd.layoutPattern === 'string' ? sd.layoutPattern : null,
    designBriefDirectives: Array.isArray(sd.designBriefDirectives)
      ? (sd.designBriefDirectives as string[]).filter((l) => typeof l === 'string')
      : [],
    canvaArchetypeId: typeof sd.canvaArchetypeId === 'string' ? sd.canvaArchetypeId : null,
    canvaArchetypeName: typeof sd.canvaArchetypeName === 'string' ? sd.canvaArchetypeName : null,
    matchQuality: 'hard',
  };

  console.log('template:', matched.templateName, `(${matched.id.slice(0, 8)})`);
  console.log('  sample copy:', matched.sampleHeadline, '/', matched.sampleSubtitle);
  console.log('  stored prompt:', matched.designSpecPrompt?.length ?? 0, 'chars');
  console.log('  thumbnail:', thumbnailUrl.slice(0, 90));
  console.log('  gallery photo:', galleryRef.slice(0, 90));

  // ── 2. Binding as the pipeline would build it (hard pin) ──────────────────
  const binding: BrandTemplateFalBinding = {
    matched,
    lockedVibe: matched.vibe ?? null,
    referencePhotoUrl: galleryRef,
    styleReferenceUrl: thumbnailUrl,
    brandDirectives: buildTemplateLayoutDirectives(matched, {
      headline: MISSION_HEADLINE,
      subtitle: MISSION_SUBTITLE,
    }),
    brandColors,
    logoUrl: typeof sd.logoUrl === 'string' ? sd.logoUrl : undefined,
    occasion: undefined,
  };

  const replicaSpec = templateReplicaSpecFromBinding(binding);
  console.log('replica spec active:', Boolean(replicaSpec));
  console.log('layout image ref active:', Boolean(templateLayoutReferenceUrl(binding)));

  // ── 3. Produce one artifact through the real pipeline ─────────────────────
  const t0 = Date.now();
  const result = await produceFalDesignedPost({
    isFalDesignPost: true,
    existingImageUrl: null,
    workspaceId: WS,
    referenceUrl: galleryRef,
    brandReferenceImageUrls: [],
    headline: MISSION_HEADLINE,
    caption: MISSION_CAPTION,
    cta: MISSION_SUBTITLE,
    subtitle: MISSION_SUBTITLE,
    brandName: 'Yula Bodrum',
    brandColors,
    brandVibe: matched.vibe ?? null,
    sector: 'restaurant_cafe',
    location: 'Bodrum',
    grafikerMaxRetries: 0,
    brandTemplateBinding: binding,
    aspectRatio: '4:5',
    requireGroundedGallery: true,
    captionAwareHeadline: false,
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  console.log('\n== RESULT ==');
  console.log('engine:', result?.falDesignEngine ?? 'none', `(${secs}s)`);
  console.log('grafiker:', result?.falGrafikerScore ?? '—', 'pass:', result?.falGrafikerPass);
  console.log('costDelta:', result?.costDelta);
  if (result?.failureReason) console.log('failure:', result.failureReason);
  if (!result?.imageUrl) throw new Error('no artifact produced');
  console.log('imageUrl:', result.imageUrl.slice(0, 120));

  // ── 4. Save artifact + side-by-side vs template preview ───────────────────
  const artifactBuf = await fetchBuf(
    result.imageUrl.startsWith('/') ? `http://localhost:3000${result.imageUrl}` : result.imageUrl,
  );
  const artifactPath = join(OUT, 'replica-artifact.jpg');
  writeFileSync(artifactPath, await sharp(artifactBuf).jpeg({ quality: 92 }).toBuffer());

  const tplBuf = await fetchBuf(thumbnailUrl);
  const left = await sharp(tplBuf).resize({ height: 1100 }).jpeg().toBuffer();
  const right = await sharp(artifactBuf).resize({ height: 1100 }).jpeg().toBuffer();
  const lMeta = await sharp(left).metadata();
  const rMeta = await sharp(right).metadata();
  const side = await sharp({
    create: {
      width: (lMeta.width ?? 1) + (rMeta.width ?? 1) + 36,
      height: 1100 + 24,
      channels: 3,
      background: { r: 14, g: 18, b: 24 },
    },
  })
    .composite([
      { input: left, top: 12, left: 12 },
      { input: right, top: 12, left: (lMeta.width ?? 0) + 24 },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
  const sidePath = join(OUT, 'template-vs-replica.jpg');
  writeFileSync(sidePath, side);
  console.log('WROTE', artifactPath);
  console.log('WROTE', sidePath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
