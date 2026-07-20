/**
 * Product packaging / label / logo fidelity — SSOT for enhance + scratch prompts.
 * Multi-tenant: driven by sector profile (product_closeup), not brand UUIDs.
 */
import { getSectorProfile } from '@/lib/sector-production-profile';

export function isProductPackagingSector(
  businessType: string | null | undefined,
): boolean {
  return getSectorProfile(businessType).defaultVisualSubject === 'product_closeup';
}

/** True when the request is about a physical SKU with printable packaging. */
export function expectsProductPackaging(input: {
  businessType?: string | null;
  productType?: string | null;
  visualSubjectHint?: string | null;
  slotRole?: string | null;
}): boolean {
  if (isProductPackagingSector(input.businessType)) return true;
  const productType = String(input.productType ?? '').trim();
  if (productType.length > 0) return true;
  const hint = String(input.visualSubjectHint ?? '').toLowerCase();
  if (/\bproduct(_hero|_closeup|_reveal)?\b/.test(hint)) return true;
  const role = String(input.slotRole ?? '').toLowerCase();
  return /\bproduct\b/.test(role);
}

export const PRODUCT_PACKAGING_PRESERVE_BLOCK = `⚠️ CRITICAL PACKAGING FIDELITY — NEVER VIOLATE:
• The product SKU is a LOCKED REGION: shape, lid, glass, fill level, label layout, logo, and every printed character stay EXACTLY as in the source photo
• Do NOT rewrite, translate, blur, stylize, invent, or "improve" brand names, logos, barcodes, ingredients, weight, or any label text
• Do NOT morph the product into a different SKU, bottle, jar, or flavor
• ONLY change pixels OUTSIDE the product silhouette (background, surface, distant props)
• If you cannot keep the label letter-perfect, leave the product UNTOUCHED and only grade the background`;

export const PRODUCT_SCRATCH_NO_FAKE_LABEL_BLOCK = `PACKAGING / BRAND MARK RULES (scratch):
• NEVER invent, approximate, or hallucinate brand logos, label copy, or packaging artwork
• NEVER render garbled, partial, or fake brand names on jars/bottles
• Without a real product reference photo: use BLANK unlabeled packaging only (plain glass/jar/bottle, no logo, no brand text) OR show lifestyle props without a branded SKU
• With a real product reference: keep packaging letter-perfect — do not redesign the label`;

/** Prepend packaging lock when missing (Crew / prebuilt / quick briefs). */
export function ensurePackagingFidelityPrompt(prompt: string): string {
  const base = String(prompt ?? '').trim();
  if (!base) return PRODUCT_PACKAGING_PRESERVE_BLOCK;
  if (base.includes('CRITICAL PACKAGING FIDELITY')) return base;
  return `${PRODUCT_PACKAGING_PRESERVE_BLOCK}\n\n${base}`;
}

/**
 * Overlay typography ban vs packaging exception for generate-instagram-image.
 * Absolute "NO TEXT" forces models to invent/garbled labels on real products.
 */
export function packagingAwareTextConstraints(expectsPackaging: boolean): string[] {
  if (!expectsPackaging) {
    return [
      'CRITICAL — NO TEXT IN IMAGE: Do not render any letters, words, numbers, glyphs, symbols, typography, captions, subtitles, watermarks, logos, banners, labels, price tags, menus, signs, headlines, or any text artifact of any kind inside the generated image. Text must be completely absent. Any visible character will disqualify the image.',
      'No random brand names, no fake business names, no event sponsor names, no readable signs, no garbled or partial text, no text artifacts, no letterforms of any kind.',
    ];
  }
  return [
    'CRITICAL — NO OVERLAY TEXT: Do not add captions, watermarks, banners, price tags, menus, headlines, or any marketing typography that is not already printed on a real product in the reference photo.',
    'PACKAGING EXCEPTION: Real product packaging text/logo/barcode from the reference must remain letter-perfect and unchanged. Do NOT invent, rewrite, translate, blur, or approximate brand marks.',
    PRODUCT_SCRATCH_NO_FAKE_LABEL_BLOCK,
  ];
}

/** Extra level instructions for product BG staging (moderate/full). */
export function productStagingLevelLock(level: 'subtle' | 'moderate' | 'full'): string {
  if (level === 'subtle') {
    return 'BG/props: do not change surroundings. Only lighting and color on the scene around the locked product.';
  }
  return (
    'BG/props ONLY outside the product silhouette. '
    + 'The product must look cut-out-and-composited from the source photo — '
    + 'never regenerated. Prefer fewer props over any risk of touching the label.'
  );
}
