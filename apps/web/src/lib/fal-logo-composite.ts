/**
 * fal.ai logo integrity — post-production compositing of the official brand mark.
 *
 * AI models (Ideogram, GPT-image) must NOT redraw the logo. When a logo URL is
 * supplied we reserve placement space in prompts, then composite the exact asset
 * with sharp after generation.
 */

import type { FalLogoCanvasChannel } from './fal-caption-headline';
import {
  type FalLogoPosition,
  type ResolvedFalLogoPlacement,
  resolveFalLogoPlacement,
} from './fal-logo-placement';
import {
  compositeLogoOnPhoto,
  imageUrlToBuffer,
  type LogoPlacement,
} from './logo-compositor';
import { persistEnhancedImageUrls } from './persist-enhanced-images';

export function falLogoPositionToCompositorPlacement(
  position: FalLogoPosition | null | undefined,
  channel: FalLogoCanvasChannel,
): LogoPlacement {
  if (position === 'top_left') return 'top_left';
  if (position === 'top_center') return 'top_center';
  if (position === 'top_right') return 'top_right';
  if (position === 'bottom_left') return 'bottom_left';
  if (position === 'bottom_center') return 'bottom_center';
  if (position === 'bottom_right') return 'bottom_right';
  return channel === 'reel' || channel === 'story' ? 'top_right' : 'bottom_right';
}

function resolveCompositorPlacement(
  placement: ResolvedFalLogoPlacement | null | undefined,
  channel: FalLogoCanvasChannel,
): LogoPlacement {
  if (placement?.position) {
    return falLogoPositionToCompositorPlacement(placement.position, channel);
  }
  if (placement?.zoneHint) {
    const inferred = resolveFalLogoPlacement({
      agentLogoZone: placement.zoneHint,
      channel,
    });
    if (inferred.position) {
      return falLogoPositionToCompositorPlacement(inferred.position, channel);
    }
  }
  return falLogoPositionToCompositorPlacement(null, channel);
}

function edgePaddingForChannel(
  channel: FalLogoCanvasChannel,
  placement: LogoPlacement,
  baseH: number,
): number {
  const base = Math.max(16, Math.round(baseH * 0.02));
  if (channel !== 'reel' && channel !== 'story') return base;
  if (placement === 'top_left' || placement === 'top_right' || placement === 'top_center') {
    return Math.max(base, Math.round(baseH * 0.12));
  }
  if (placement === 'bottom_left' || placement === 'bottom_right' || placement === 'bottom_center') {
    return Math.max(base, Math.round(baseH * 0.15));
  }
  return base;
}

/**
 * Composite the official logo file onto a designed frame URL.
 * Returns the original URL when compositing fails (non-fatal).
 */
export async function compositeOfficialLogoOnFrameUrl(input: {
  frameUrl: string;
  logoUrl: string;
  placement?: ResolvedFalLogoPlacement | null;
  channel?: FalLogoCanvasChannel;
  workspaceId?: string;
  sizePct?: number;
  opacity?: number;
}): Promise<{ imageUrl: string; logoApplied: boolean }> {
  const logoUrl = input.logoUrl.trim();
  const frameUrl = input.frameUrl.trim();
  if (!logoUrl || !frameUrl) {
    return { imageUrl: frameUrl, logoApplied: false };
  }

  const channel = input.channel ?? 'feed_post';
  const compositorPlacement = resolveCompositorPlacement(input.placement, channel);

  const frameBuffer = await imageUrlToBuffer(frameUrl);
  if (!frameBuffer) {
    console.warn('[fal-logo-composite] Could not read frame — skipping logo composite');
    return { imageUrl: frameUrl, logoApplied: false };
  }

  const sharp = (await import('sharp')).default;
  const meta = await sharp(frameBuffer).metadata();
  const baseH = meta.height ?? 1080;
  const padding = edgePaddingForChannel(channel, compositorPlacement, baseH);

  const result = await compositeLogoOnPhoto({
    baseImageBuffer: frameBuffer,
    logoUrl,
    placement: compositorPlacement,
    sizePct: input.sizePct ?? 10,
    opacity: input.opacity ?? 0.92,
    padding,
  });

  if (!result.logoApplied) {
    return { imageUrl: frameUrl, logoApplied: false };
  }

  const dataUrl = `data:image/jpeg;base64,${result.buffer.toString('base64')}`;
  const workspaceId = input.workspaceId?.trim() || 'shared';
  const persisted = await persistEnhancedImageUrls([dataUrl], workspaceId);
  const imageUrl = persisted[0] ?? dataUrl;

  console.log(
    `[fal-logo-composite] Official logo composited (${compositorPlacement}, channel=${channel})`,
  );
  return { imageUrl, logoApplied: true };
}
