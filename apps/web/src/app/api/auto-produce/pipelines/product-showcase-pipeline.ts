/**
 * product-showcase Pipeline — AI background-replacement product scene studio.
 *
 * Generates a studio-style scene around a product photo (configured per brand via
 * brandTheme.product_showcase). Falls back to the gallery reference photo when the
 * scene generation fails.
 *
 * Extracted from production-loop.ts as a ProductionPipelineHandler (b2b). Behavior
 * is identical to the previous inline `if (isProductShowcase && referenceUrl)` block.
 */

import { generateProductShowcaseImage } from '../handlers/image-generators';
import type { ProductionPipelineHandler } from './pipeline-types';

export const productShowcaseHandler: ProductionPipelineHandler = {
  name: 'product_showcase',
  canRun: (ctx) => ctx.inputs.isProductShowcase && Boolean(ctx.inputs.referenceUrl),
  run: async ({ inputs, state }) => {
    const referenceUrl = inputs.referenceUrl;
    if (!referenceUrl) return;

    const showcaseConfig = (inputs.brandTheme?.product_showcase ?? inputs.brandTheme?.productShowcase) as
      | { background_style?: string; product_photo_urls?: string[] }
      | undefined;
    const showcaseFormat = inputs.slotRole === 'product_showcase_story' ? 'story' : 'post';
    const productPhotoUrl = showcaseConfig?.product_photo_urls?.length
      ? showcaseConfig.product_photo_urls[inputs.ideaIndex % showcaseConfig.product_photo_urls.length]!
      : referenceUrl;

    const showcaseResult = await generateProductShowcaseImage({
      workspaceId: inputs.workspaceId,
      productPhotoUrl,
      headline: inputs.headline,
      caption: inputs.caption,
      format: showcaseFormat,
      brandName: inputs.resolvedBrandName,
      location: inputs.brandLocation,
      businessType: inputs.brandBusinessType,
      backgroundStyle: (showcaseConfig?.background_style as never) ?? 'auto',
      logoUrl: inputs.brandLogoUrl || undefined,
      brandTone: inputs.brandTone,
    });
    if (showcaseResult) {
      state.imageUrl = showcaseResult;
      console.log(`[auto-produce] product showcase (${showcaseFormat}): "${inputs.headline.slice(0, 40)}" → ${showcaseResult.slice(0, 60)}`);
    } else {
      console.warn(`[auto-produce] product showcase failed for "${inputs.headline.slice(0, 40)}" — falling back to gallery photo`);
      state.imageUrl = referenceUrl;
    }
  },
};
