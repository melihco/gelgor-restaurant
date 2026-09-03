import { describe, expect, it } from 'vitest';
import sharp from '@/lib/sharp-runtime';
import {
  buildPhotoSpatialPromptLock,
  measurePhotoSpatial,
  parseGalleryPhotoSpatial,
  resolveGalleryPhotoSpatial,
} from '@/lib/gallery-photo-spatial';

async function restaurantRightSubjectPlate(): Promise<Buffer> {
  // Quiet cream left rail + high-frequency dark dish on the right.
  const w = 180;
  const h = 180;
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 3;
      if (x < Math.floor((w * 2) / 3)) {
        raw[i] = 240;
        raw[i + 1] = 232;
        raw[i + 2] = 216;
      } else {
        const busy = ((x + y) % 2 === 0) ? 18 : 96;
        raw[i] = busy;
        raw[i + 1] = busy - 8;
        raw[i + 2] = busy - 12;
      }
    }
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

async function beachClubSkyPlate(): Promise<Buffer> {
  // Calm sky on top, busy shoreline/crowd texture on the bottom.
  const w = 160;
  const h = 240;
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 3;
      if (y < Math.floor(h / 3)) {
        raw[i] = 140;
        raw[i + 1] = 190;
        raw[i + 2] = 230;
      } else {
        const n = ((x * 13 + y * 7) % 5) * 40;
        raw[i] = 40 + n;
        raw[i + 1] = 70 + (n % 60);
        raw[i + 2] = 50 + ((x * y) % 80);
      }
    }
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
}

describe('parseGalleryPhotoSpatial', () => {
  it('reads camelCase persist and snake_case vision dumps', () => {
    const camel = parseGalleryPhotoSpatial({
      subjectAnchor: 'mid_right',
      quietAnchors: ['top_left', 'mid_left'],
      typeSeat: 'top_left',
      typeBand: 'left',
      dominantHex: '#3a2a1c',
      typeSeatLuma: 180,
      subjectLuma: 40,
      source: 'vision',
    });
    expect(camel?.subjectAnchor).toBe('mid_right');
    expect(camel?.typeSeat).toBe('top_left');
    expect(camel?.typeBand).toBe('left');

    const snake = parseGalleryPhotoSpatial({
      subject_anchor: 'bottom_center',
      quiet_anchors: ['top_left', 'top_right'],
      type_seat: 'top_right',
      dominant_hex: 'c8d8e8',
      type_seat_luma: 200,
      subject_luma: 70,
      source: 'pixel',
    });
    expect(snake?.subjectAnchor).toBe('bottom_center');
    expect(snake?.typeSeat).toBe('top_right');
    expect(snake?.dominantHex).toBe('#c8d8e8');
  });

  it('returns null for missing or invented anchors', () => {
    expect(parseGalleryPhotoSpatial({})).toBeNull();
    expect(parseGalleryPhotoSpatial({ subjectAnchor: 'somewhere' })).toBeNull();
  });

  it('resolves nested spatial on gallery meta', () => {
    const meta = resolveGalleryPhotoSpatial({
      spatial: {
        subjectAnchor: 'center',
        quietAnchors: ['top_left'],
        typeSeat: 'top_left',
        typeBand: 'top',
        dominantHex: '#111111',
        typeSeatLuma: 200,
        subjectLuma: 30,
        source: 'pixel',
      },
    });
    expect(meta?.typeSeat).toBe('top_left');
  });
});

describe('buildPhotoSpatialPromptLock', () => {
  it('names the subject seat and type seat so the model cannot guess', () => {
    const lock = buildPhotoSpatialPromptLock({
      subjectAnchor: 'mid_right',
      quietAnchors: ['top_left', 'mid_left'],
      typeSeat: 'top_left',
      typeBand: 'left',
      dominantHex: '#3a2a1c',
      typeSeatLuma: 178,
      subjectLuma: 42,
      source: 'pixel',
    });
    expect(lock).toContain('PHOTO SPATIAL (MANDATORY)');
    expect(lock).toContain('mid-right');
    expect(lock).toContain('upper-left');
    expect(lock).toContain('#3a2a1c');
    expect(lock).toMatch(/dark ink/i);
    expect(lock).toContain('overrides generic type-zone guesses');
  });
});

describe('measurePhotoSpatial', () => {
  it('restaurant_cafe plate: subject on the right → type on the left', async () => {
    const spatial = await measurePhotoSpatial(await restaurantRightSubjectPlate());
    expect(spatial).not.toBeNull();
    expect(spatial!.source).toBe('pixel');
    expect(['mid_right', 'top_right', 'bottom_right']).toContain(spatial!.subjectAnchor);
    expect(['top_left', 'mid_left', 'bottom_left']).toContain(spatial!.typeSeat);
    expect(['left', 'top']).toContain(spatial!.typeBand);
    expect(spatial!.typeSeat).not.toBe(spatial!.subjectAnchor);
  });

  it('beach_club plate: busy shoreline below → type in the sky', async () => {
    const spatial = await measurePhotoSpatial(await beachClubSkyPlate());
    expect(spatial).not.toBeNull();
    expect(['bottom_left', 'bottom_center', 'bottom_right', 'mid_left', 'mid_right', 'center'])
      .toContain(spatial!.subjectAnchor);
    expect(['top_left', 'top_center', 'top_right']).toContain(spatial!.typeSeat);
    expect(spatial!.typeBand).toBe('top');
    expect(spatial!.typeSeat).not.toBe(spatial!.subjectAnchor);
  });
});
