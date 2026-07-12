/**
 * Story slot resolution — catalog SSOT (no Remotion template IDs).
 */
import { describe, it, expect } from 'vitest';
import {
  resolveMissionStorySlot,
  resolveMissionStoryTemplate,
  missionStoryLibrarySlotKey,
  listEnabledStorySlots,
} from '@/lib/mission-story-template';
import { ensureBrandTemplateLibrary } from '@/lib/brand-template-library';

const TENANT = '11111111-2222-3333-4444-555555555555';
const SECTOR = 'restaurant';

const STORY_VARIANTS: Array<Record<string, unknown>> = [
  { treatment: 'editorial', mood: 'warm', template_use_case: 'daily_moment', headline: 'Günün lezzeti' },
  { treatment: 'bold', mood: 'energetic', template_use_case: 'announcement', headline: 'Büyük açılış' },
  { treatment: 'minimal', mood: 'calm', template_use_case: 'quote', headline: 'Sade bir an' },
  { treatment: 'promo', mood: 'urgent', template_use_case: 'promotion', headline: 'Haftaya özel' },
  { treatment: 'testimonial', mood: 'warm', template_use_case: 'social_proof', headline: 'Misafir yorumu' },
];

function storyIdea(index: number): Record<string, unknown> {
  return STORY_VARIANTS[index % STORY_VARIANTS.length]!;
}

function pickFingerprint(p: ReturnType<typeof resolveMissionStorySlot>) {
  return {
    kitId: p.kitId,
    intent: p.intent,
    slotKey: p.slot.key,
    slotLabel: p.slot.labelTr,
  };
}

describe('resolveMissionStorySlot', () => {
  it('is deterministic for a fixed tenant + idea + index', () => {
    const a = resolveMissionStorySlot({
      theme: null,
      sector: SECTOR,
      tenantId: TENANT,
      idea: storyIdea(0),
      ideaIndex: 0,
    });
    const b = resolveMissionStorySlot({
      theme: null,
      sector: SECTOR,
      tenantId: TENANT,
      idea: storyIdea(0),
      ideaIndex: 0,
    });
    expect(pickFingerprint(a)).toEqual(pickFingerprint(b));
  });

  it('always resolves a story slot + kit', () => {
    for (let i = 0; i < 5; i++) {
      const pick = resolveMissionStorySlot({
        theme: null,
        sector: SECTOR,
        tenantId: TENANT,
        idea: storyIdea(i),
        ideaIndex: i,
      });
      expect(pick.kitId).toBeTruthy();
      expect(pick.slot.format).toBe('story');
    }
  });

  it('pins slot-key routing for the seed (golden)', () => {
    const fingerprints = [0, 1, 2, 3, 4].map((i) => pickFingerprint(
      resolveMissionStorySlot({
        theme: null,
        sector: SECTOR,
        tenantId: TENANT,
        idea: storyIdea(i),
        ideaIndex: i,
      }),
    ));
    expect(fingerprints).toMatchInlineSnapshot(`
      [
        {
          "intent": "daily_moment",
          "kitId": "kit_16_mediterranean",
          "slotKey": "daily_story",
          "slotLabel": "Günlük Story",
        },
        {
          "intent": "announcement",
          "kitId": "kit_16_mediterranean",
          "slotKey": "editorial_story",
          "slotLabel": "Editorial Story",
        },
        {
          "intent": "daily_moment",
          "kitId": "kit_16_mediterranean",
          "slotKey": "editorial_story",
          "slotLabel": "Editorial Story",
        },
        {
          "intent": "campaign_offer",
          "kitId": "kit_16_mediterranean",
          "slotKey": "social_proof",
          "slotLabel": "Sosyal Kanıt",
        },
        {
          "intent": "social_proof",
          "kitId": "kit_16_mediterranean",
          "slotKey": "daily_story",
          "slotLabel": "Günlük Story",
        },
      ]
    `);
  });
});

describe('resolveMissionStoryTemplate (compat)', () => {
  it('returns slot label as templateName without Remotion IDs', () => {
    const pick = resolveMissionStoryTemplate({
      theme: null,
      sector: SECTOR,
      tenantId: TENANT,
      idea: storyIdea(0),
      ideaIndex: 0,
    });
    expect(pick.storyTemplateId).toBeUndefined();
    expect(pick.templateName).toBe(pick.slot.labelTr);
  });
});

describe('missionStoryLibrarySlotKey', () => {
  it('rotates across enabled story slots deterministically', () => {
    const library = ensureBrandTemplateLibrary(null, {
      sector: SECTOR,
      tenantId: TENANT,
    });
    const slots = listEnabledStorySlots(library);
    expect(slots.length).toBeGreaterThan(0);
    const k0 = missionStoryLibrarySlotKey(library, 0);
    const kWrap = missionStoryLibrarySlotKey(library, slots.length);
    expect(k0).toBe(kWrap);
  });
});
