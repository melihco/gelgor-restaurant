import { describe, expect, it } from 'vitest';
import {
  buildFalReelAgencyPack,
  mergeFalReelMotionCue,
} from '../fal-reel-agency-directives';

describe('buildFalReelAgencyPack', () => {
  it('builds general→specific still directives from vibe + mission', () => {
    const pack = buildFalReelAgencyPack({
      brandName: 'Test Beach',
      sector: 'beach_club',
      brandTone: 'samimi, sıcak',
      visualStyle: 'golden hour coastal editorial',
      brandTheme: {
        grading: {
          look: 'warm golden editorial',
          lutDirective: 'warm tones, lifted shadows',
        },
        composition: { primary_pattern: 'lower-third type, airy negative space' },
        caption_voice_rules: ['kısa ve davetkar'],
        typography_design: { vibe: 'warm_coastal' },
        motion_profile: {
          reel_pace: 'slow_burn',
          reel_camera_motion: 'dolly_in',
          motion_style: 'luxury',
        },
      },
      brandVibeProfile: {
        what_makes_this_agency_level: 'Quiet luxury type with real venue light.',
      },
      headline: 'Sunset Terrace',
      caption: 'Altın saatte sahilde buluşalım',
      mood: 'warm golden',
      visualDirection: 'terrace + sea horizon',
      strategicPurpose: 'drive evening reservations',
      slotRole: 'organic_reel',
      announcementType: 'ambiance',
      catalogSlotKey: 'beach_club_sunset_reel',
    });

    expect(pack.stillDirectives.some((d) => d.includes('AGENCY QUALITY BAR'))).toBe(true);
    expect(pack.stillDirectives.some((d) => d.includes('BRAND GRADING'))).toBe(true);
    expect(pack.stillDirectives.some((d) => d.includes('SLOT PURPOSE'))).toBe(true);
    expect(pack.stillDirectives.some((d) => d.includes('STRATEGIC PURPOSE'))).toBe(true);
    expect(pack.stillDirectives.some((d) => d.includes('Sunset Terrace'))).toBe(true);
    expect(pack.motionCue).toBeTruthy();
    expect(pack.summary.agencyLevel).toMatch(/Quiet luxury/i);
  });

  it('mergeFalReelMotionCue keeps FD cue primary', () => {
    expect(mergeFalReelMotionCue('soft light on cocktail', 'slow cinematic burn')).toMatch(
      /soft light on cocktail/,
    );
    expect(mergeFalReelMotionCue(undefined, 'dolly in')).toBe('dolly in');
  });
});
