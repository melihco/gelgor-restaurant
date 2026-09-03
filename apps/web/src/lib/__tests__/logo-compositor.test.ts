import { describe, expect, it } from 'vitest';
import sharp from '@/lib/sharp-runtime';
import {
  LOGO_MIN_LONG_SIDE_PX,
  LOGO_WHITE_BACKING_THRESHOLD,
  normalizeBrandLogoAsset,
  pickLogoVariantForRegion,
  pickQuietLogoPlacement,
  prepareLogoForComposite,
} from '@/lib/logo-compositor';

async function makeWhiteSquareLogo(): Promise<Buffer> {
  // 64×64 white plate + dark mark block in the center (JPEG-style opaque)
  const raw = Buffer.alloc(64 * 64 * 4, 255);
  for (let y = 20; y < 44; y++) {
    for (let x = 20; x < 44; x++) {
      const i = (y * 64 + x) * 4;
      raw[i] = 40;
      raw[i + 1] = 90;
      raw[i + 2] = 50;
      raw[i + 3] = 255;
    }
  }
  return sharp(raw, { raw: { width: 64, height: 64, channels: 4 } }).jpeg({ quality: 95 }).toBuffer();
}

describe('prepareLogoForComposite', () => {
  it('knocks out opaque white square backing without recoloring the mark', async () => {
    const jpegLogo = await makeWhiteSquareLogo();
    const prepared = await prepareLogoForComposite(jpegLogo);
    const srcMeta = await sharp(jpegLogo).metadata();
    const preparedMeta = await sharp(prepared).metadata();

    // White plate trimmed away → asset shrinks around the mark
    expect((preparedMeta.width ?? 0) * (preparedMeta.height ?? 0)).toBeLessThan(
      (srcMeta.width ?? 1) * (srcMeta.height ?? 1) * 0.55,
    );

    // Composite onto saturated red — leftover white plate would show as pale pixels
    const { data, info } = await sharp({
      create: {
        width: 80,
        height: 80,
        channels: 3,
        background: { r: 220, g: 30, b: 30 },
      },
    })
      .composite([{
        input: await sharp(prepared).resize(48, 48, { fit: 'inside' }).png().toBuffer(),
        gravity: 'southeast',
      }])
      .raw()
      .toBuffer({ resolveWithObject: true });

    let palePlate = 0;
    let markGreen = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      if (r > 240 && g > 240 && b > 240) palePlate += 1;
      if (r < 80 && g > 60 && b < 100) markGreen += 1;
    }
    expect(palePlate).toBe(0);
    expect(markGreen).toBeGreaterThan(50);
  });

  it('knocks out real Gel Gör JPEG plate while keeping mark opaque', async () => {
    const res = await fetch('https://gelgor.vercel.app/images/logo-profile.jpg', {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return; // skip offline
    const jpeg = Buffer.from(await res.arrayBuffer());
    const prepared = await prepareLogoForComposite(jpeg);
    const { data, info } = await sharp(prepared).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let transparent = 0;
    let opaque = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3]! < 16) transparent += 1;
      else if (data[i + 3]! > 200) opaque += 1;
    }
    const total = info.width * info.height;
    expect(transparent / total).toBeGreaterThan(0.35);
    expect(opaque).toBeGreaterThan(80);
    // Corner of trimmed asset should not be opaque white
    const c0 = data[3]!;
    expect(c0).toBeLessThan(16);
  });

  it('preserves already-transparent PNG marks', async () => {
    const raw = Buffer.alloc(32 * 32 * 4, 0);
    for (let y = 8; y < 24; y++) {
      for (let x = 8; x < 24; x++) {
        const i = (y * 32 + x) * 4;
        raw[i] = 200;
        raw[i + 1] = 40;
        raw[i + 2] = 40;
        raw[i + 3] = 255;
      }
    }
    const png = await sharp(raw, { raw: { width: 32, height: 32, channels: 4 } }).png().toBuffer();
    const prepared = await prepareLogoForComposite(png, {
      whiteThreshold: LOGO_WHITE_BACKING_THRESHOLD,
    });
    const { data } = await sharp(prepared).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let opaqueRed = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3]! > 200 && data[i]! > 150) opaqueRed += 1;
    }
    expect(opaqueRed).toBeGreaterThan(50);
  });
});

/** Flat frame with a high-frequency "headline" block in one corner. */
async function makeFrameWithBusyCorner(
  corner: 'bottom' | 'top',
  width = 540,
  height = 960,
): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 4, 190);
  for (let i = 0; i < width * height; i += 1) raw[i * 4 + 3] = 255;
  const bandTop = corner === 'bottom' ? Math.round(height * 0.78) : Math.round(height * 0.04);
  const bandBottom = corner === 'bottom' ? Math.round(height * 0.96) : Math.round(height * 0.22);
  // Alternating stripes stand in for painted typography: high local gradient.
  for (let y = bandTop; y < bandBottom; y += 1) {
    for (let x = Math.round(width * 0.05); x < Math.round(width * 0.95); x += 1) {
      const on = Math.floor(x / 3) % 2 === 0;
      const i = (y * width + x) * 4;
      raw[i] = on ? 255 : 10;
      raw[i + 1] = on ? 255 : 10;
      raw[i + 2] = on ? 255 : 10;
    }
  }
  return sharp(raw, { raw: { width, height, channels: 4 } }).jpeg({ quality: 95 }).toBuffer();
}

describe('pickQuietLogoPlacement', () => {
  it('moves the mark off a corner occupied by painted type', async () => {
    const frame = await makeFrameWithBusyCorner('bottom');
    const picked = await pickQuietLogoPlacement(frame, {
      preferred: 'bottom_right',
      sizePct: 10,
      padding: 40,
    });

    expect(picked.placement.startsWith('bottom')).toBe(false);
    expect(picked.movedFromPreferred).toBe(true);
  });

  it('keeps the art-directed corner when it is quiet', async () => {
    // Type occupies the top band, so the requested bottom corner is legitimate.
    const frame = await makeFrameWithBusyCorner('top');
    const picked = await pickQuietLogoPlacement(frame, {
      preferred: 'bottom_right',
      sizePct: 10,
      padding: 40,
    });

    expect(picked.placement).toBe('bottom_right');
    expect(picked.movedFromPreferred).toBe(false);
  });

  it('falls back to the requested corner on an unreadable frame', async () => {
    const picked = await pickQuietLogoPlacement(Buffer.from('not-an-image'), {
      preferred: 'top_left',
    });

    expect(picked.placement).toBe('top_left');
    expect(picked.movedFromPreferred).toBe(false);
  });
});

describe('normalizeBrandLogoAsset', () => {
  it('restaurant_cafe: white JPEG plate becomes a ≥512 transparent PNG', async () => {
    const kit = await normalizeBrandLogoAsset(await makeWhiteSquareLogo());
    expect(Math.max(kit.width, kit.height)).toBeGreaterThanOrEqual(LOGO_MIN_LONG_SIDE_PX);
    expect(kit.polarity).toBe('color');
    const { data } = await sharp(kit.transparentPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let transparent = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i]! < 16) transparent += 1;
    }
    expect(transparent).toBeGreaterThan(40);
  });

  it('beach_club: white wordmark on a black square knocks out the plate and offers a dark twin', async () => {
    const raw = Buffer.alloc(80 * 80 * 4, 0);
    for (let i = 3; i < raw.length; i += 4) raw[i] = 255;
    for (let y = 28; y < 52; y++) {
      for (let x = 18; x < 62; x++) {
        const i = (y * 80 + x) * 4;
        raw[i] = 250;
        raw[i + 1] = 250;
        raw[i + 2] = 250;
        raw[i + 3] = 255;
      }
    }
    const jpeg = await sharp(raw, { raw: { width: 80, height: 80, channels: 4 } }).jpeg({ quality: 95 }).toBuffer();
    const kit = await normalizeBrandLogoAsset(jpeg);
    expect(kit.polarity).toBe('light');
    expect(Math.max(kit.width, kit.height)).toBeGreaterThanOrEqual(LOGO_MIN_LONG_SIDE_PX);

    const light = await sharp(kit.onLight).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const dark = await sharp(kit.onDark).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let darkInk = 0;
    let lightInk = 0;
    for (let i = 0; i < light.data.length; i += 4) {
      if (light.data[i + 3]! > 200 && light.data[i]! < 40) darkInk += 1;
    }
    for (let i = 0; i < dark.data.length; i += 4) {
      if (dark.data[i + 3]! > 200 && dark.data[i]! > 200) lightInk += 1;
    }
    expect(darkInk).toBeGreaterThan(30);
    expect(lightInk).toBeGreaterThan(30);
  });

  it('picks the contrasting variant for the region', () => {
    expect(pickLogoVariantForRegion('light', 40)).toBe('onDark');
    expect(pickLogoVariantForRegion('dark', 210)).toBe('onLight');
    expect(pickLogoVariantForRegion('color', 40)).toBe('onDark');
  });
});
