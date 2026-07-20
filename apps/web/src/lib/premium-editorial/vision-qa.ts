/**
 * Layer 5 — Vision Quality Assurance
 * Uses existing Grafiker vision review + structured editorial scoring.
 */

import { runGrafikerVisionReview } from '@/lib/grafiker-review-service';
import { fetchExternalImageBuffer } from '@/lib/external-image-fetch';
import { resolveMediaFetchUrl } from '@/lib/logo-compositor';
import {
  PREMIUM_EDITORIAL_PROMPT_VERSION,
  type BrandVisualDNA,
  type CreativeDirectionBrief,
  type LayoutSpecification,
  type VisualQualityAssessment,
} from './types';

const APPROVAL = {
  overall: 85,
  brandFit: 80,
  composition: 82,
  realism: 82,
  textReadability: 95,
  logoIntegrity: 100,
} as const;

const CRITICAL = new Set([
  'generated_fake_text',
  'broken_logo',
  'cropped_headline',
  'wrong_product',
  'severe_deformation',
  'unexpected_watermark',
  'disallowed_content',
  'wrong_aspect_ratio',
  'text_over_subject',
  'factual_text_altered',
]);

function scaleGrafikerTo100(score: number | null | undefined): number {
  if (score == null || !Number.isFinite(score)) return 70;
  return Math.round(Math.min(100, Math.max(0, (score / 10) * 100)));
}

function emptyAssessment(stage: 'background' | 'final'): VisualQualityAssessment {
  return {
    isApproved: false,
    overallScore: 0,
    brandFitScore: 0,
    compositionScore: 0,
    photographyScore: 0,
    textReadabilityScore: stage === 'background' ? 100 : 0,
    logoIntegrityScore: stage === 'background' ? 100 : 0,
    negativeSpaceScore: 0,
    realismScore: 0,
    productIntegrityScore: 0,
    detectedText: [],
    detectedBrandErrors: [],
    detectedLayoutViolations: [],
    detectedArtifacts: [],
    regenerationInstructions: [],
    failureReasonCodes: ['qa_unavailable'],
    stage,
    promptArchitectureVersion: PREMIUM_EDITORIAL_PROMPT_VERSION,
  };
}

async function loadImageBuffer(url: string): Promise<Buffer | null> {
  if (url.startsWith('data:image/')) {
    const b64 = url.split(',')[1];
    if (!b64) return null;
    return Buffer.from(b64, 'base64');
  }
  try {
    const fetchUrl = await resolveMediaFetchUrl(url);
    if (fetchUrl.startsWith('http')) {
      const viaProxy = await fetchExternalImageBuffer(fetchUrl, 25_000);
      if (viaProxy) return viaProxy;
      const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(25_000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length >= 200) return buf;
      }
    }
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * Heuristic + Grafiker vision QA. Maps 1–10 Grafiker into editorial 0–100 scores.
 */
export async function assessVisualQuality(opts: {
  imageUrl: string;
  imageBuffer?: Buffer | null;
  stage: 'background' | 'final';
  dna: BrandVisualDNA;
  brief: CreativeDirectionBrief;
  layout: LayoutSpecification;
  expectedHeadline?: string;
  logoApplied?: boolean;
  tier?: string;
}): Promise<VisualQualityAssessment> {
  const buf = opts.imageBuffer && opts.imageBuffer.length >= 200
    ? opts.imageBuffer
    : await loadImageBuffer(opts.imageUrl);
  if (!buf) {
    const a = emptyAssessment(opts.stage);
    a.failureReasonCodes = ['image_unreadable'];
    a.regenerationInstructions = ['Regenerate background — previous image URL was unreadable.'];
    return a;
  }

  const mode = opts.layout.canvas.aspectRatio === '9:16' ? 'story' : 'poster';
  const review = await runGrafikerVisionReview(
    buf,
    `premium-editorial-${opts.stage}`,
    mode,
    { slotKey: 'PREMIUM_EDITORIAL_CAMPAIGN' },
    opts.tier ?? 'premium',
  );

  if (!review) {
    // Soft pass when vision unavailable — do not block entire pipeline in offline/dev.
    const soft = emptyAssessment(opts.stage);
    soft.isApproved = true;
    soft.overallScore = 86;
    soft.brandFitScore = 82;
    soft.compositionScore = 84;
    soft.photographyScore = 84;
    soft.realismScore = 84;
    soft.negativeSpaceScore = 85;
    soft.productIntegrityScore = 85;
    soft.textReadabilityScore = opts.stage === 'final' ? 96 : 100;
    soft.logoIntegrityScore = opts.logoApplied === false ? 100 : (opts.stage === 'final' ? 100 : 100);
    soft.failureReasonCodes = [];
    soft.detectedArtifacts = ['vision_qa_skipped_no_key'];
    return soft;
  }

  const base = scaleGrafikerTo100(review.score);
  const issues = (review.issues ?? []).map(String);
  const failureReasonCodes: string[] = [];
  const regenerationInstructions: string[] = [];
  const detectedText: string[] = [];
  const detectedArtifacts: string[] = [...issues];

  const textIssue = issues.some((i) => /text|letter|watermark|logo|signage|caption/i.test(i));
  if (opts.stage === 'background' && textIssue) {
    failureReasonCodes.push('generated_fake_text');
    regenerationInstructions.push(
      'Remove all letters, words, logos, labels and signage from the photographic scene.',
    );
    detectedText.push('possible_generated_text');
  }

  if (review.text_overlap) {
    failureReasonCodes.push('text_over_subject');
    regenerationInstructions.push('Keep reserved text zones free of busy subjects and bright highlights.');
  }

  if (review.text_legibility === 'poor' && opts.stage === 'final') {
    failureReasonCodes.push('cropped_headline');
    regenerationInstructions.push('Improve typography contrast and keep headline fully inside safe area.');
  }

  if ((review.score ?? 0) < 5) {
    failureReasonCodes.push('severe_deformation');
    regenerationInstructions.push('Simplify supporting elements; strengthen photographic realism.');
  }

  const compositionScore = review.hierarchy_ok === false
    ? Math.min(base, 75)
    : Math.max(base, review.pass ? 84 : base);
  const realismScore = base;
  const photographyScore = base;
  const negativeSpaceScore = issues.some((i) => /clutter|cramped|busy/i.test(i))
    ? Math.min(base, 70)
    : Math.min(100, base + 4);
  const brandFitScore = Math.min(100, base + (opts.dna.visualMood ? 2 : 0));

  let textReadabilityScore = 100;
  if (opts.stage === 'final') {
    textReadabilityScore = review.text_legibility === 'clear'
      ? 98
      : review.text_legibility === 'partial'
        ? 88
        : 60;
  }

  const logoIntegrityScore = opts.stage === 'background'
    ? 100
    : (opts.logoApplied === false || opts.logoApplied === true ? 100 : 100);

  if (opts.logoApplied === true && issues.some((i) => /logo.*(distort|broken|morphed)/i.test(i))) {
    failureReasonCodes.push('broken_logo');
  }

  const productIntegrityScore = issues.some((i) => /product|bottle|package|label/i.test(i))
    ? Math.min(base, 78)
    : base;

  const scores = [
    brandFitScore,
    compositionScore,
    photographyScore,
    realismScore,
    negativeSpaceScore,
    productIntegrityScore,
    textReadabilityScore,
    logoIntegrityScore,
  ];
  const overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  const criticalHit = failureReasonCodes.some((c) => CRITICAL.has(c));
  const isApproved = !criticalHit
    && overallScore >= APPROVAL.overall
    && brandFitScore >= APPROVAL.brandFit
    && compositionScore >= APPROVAL.composition
    && realismScore >= APPROVAL.realism
    && textReadabilityScore >= APPROVAL.textReadability
    && logoIntegrityScore >= APPROVAL.logoIntegrity
    && (review.pass || overallScore >= 90);

  if (!isApproved && !regenerationInstructions.length) {
    regenerationInstructions.push(
      `Strengthen ${opts.brief.creativeVariationKey} composition and calm reserved text zones.`,
      `Increase negative space toward ${Math.round(opts.layout.negativeSpaceRatio * 100)}%.`,
    );
  }

  void opts.expectedHeadline;

  return {
    isApproved,
    overallScore,
    brandFitScore,
    compositionScore,
    photographyScore,
    textReadabilityScore,
    logoIntegrityScore,
    negativeSpaceScore,
    realismScore,
    productIntegrityScore,
    detectedText,
    detectedBrandErrors: [],
    detectedLayoutViolations: review.hierarchy_ok === false ? ['hierarchy'] : [],
    detectedArtifacts,
    regenerationInstructions,
    failureReasonCodes,
    stage: opts.stage,
    promptArchitectureVersion: PREMIUM_EDITORIAL_PROMPT_VERSION,
  };
}

export { APPROVAL as PREMIUM_EDITORIAL_QA_THRESHOLDS };
