/**
 * Golden test — per-brand Remotion story template resolution.
 *
 * Pins the deterministic template/composition picked for a given brand seed +
 * idea so the Assignment-SSOT refactor (Faz 2.2) cannot silently change which
 * Remotion story template a brand renders. Update snapshots deliberately if a
 * template-selection change is intended (`npm run test -- -u`).
 */
import { describe, it, expect } from 'vitest';
import {
  resolveMissionStoryTemplate,
  missionStoryLibrarySlotKey,
  listEnabledStorySlots,
} from '@/lib/mission-story-template';
import { ensureBrandTemplateLibrary } from '@/lib/brand-template-library';

const TENANT = '11111111-2222-3333-4444-555555555555';
const SECTOR = 'restaurant';

// Distinct story content types so the golden exercises the brand→template
// mapping across different intents/treatments (not one repeated template).
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

function pickFingerprint(p: ReturnType<typeof resolveMissionStoryTemplate>) {
  return {
    storyTemplateId: p.storyTemplateId,
    compositionId: p.compositionId,
    kitId: p.kitId,
    intent: p.intent,
    templateName: p.templateName,
    collection: p.collection,
    slotKey: p.slot.key,
  };
}

describe('resolveMissionStoryTemplate', () => {
  it('is deterministic for a fixed tenant + idea + index', () => {
    const a = resolveMissionStoryTemplate({
      theme: null,
      sector: SECTOR,
      tenantId: TENANT,
      idea: storyIdea(0),
      ideaIndex: 0,
    });
    const b = resolveMissionStoryTemplate({
      theme: null,
      sector: SECTOR,
      tenantId: TENANT,
      idea: storyIdea(0),
      ideaIndex: 0,
    });
    expect(pickFingerprint(a)).toEqual(pickFingerprint(b));
  });

  it('always resolves a valid story composition + kit', () => {
    for (let i = 0; i < 5; i++) {
      const pick = resolveMissionStoryTemplate({
        theme: null,
        sector: SECTOR,
        tenantId: TENANT,
        idea: storyIdea(i),
        ideaIndex: i,
      });
      expect(pick.compositionId).toBeTruthy();
      expect(pick.kitId).toBeTruthy();
      expect(pick.slot.format).toBe('story');
    }
  });

  it('pins the brand story template rotation for the seed (golden)', () => {
    // Mirror production-loop: usedTemplateIds accumulates so successive story
    // slots rotate across the brand library rather than repeating one template.
    const usedTemplateIds: string[] = [];
    const fingerprints = [0, 1, 2, 3, 4].map((i) => {
      const pick = resolveMissionStoryTemplate({
        theme: null,
        sector: SECTOR,
        tenantId: TENANT,
        idea: storyIdea(i),
        ideaIndex: i,
        usedTemplateIds,
      });
      if (pick.storyTemplateId) usedTemplateIds.push(pick.storyTemplateId);
      return pickFingerprint(pick);
    });
    expect(fingerprints).toMatchInlineSnapshot(`
      [
        {
          "collection": "Agency",
          "compositionId": "SpecStory",
          "intent": "daily_moment",
          "kitId": "kit_16_mediterranean",
          "slotKey": "editorial_story",
          "storyTemplateId": "remotion_editorial_left_08",
          "templateName": "Magazin Sol · Minimal Etiket",
        },
        {
          "collection": "Agency",
          "compositionId": "SpecStory",
          "intent": "announcement",
          "kitId": "kit_16_mediterranean",
          "slotKey": "event_story",
          "storyTemplateId": "remotion_event_ticket_06",
          "templateName": "Etkinlik Bileti · Geniş",
        },
        {
          "collection": "Agency",
          "compositionId": "SpecStory",
          "intent": "daily_moment",
          "kitId": "kit_16_mediterranean",
          "slotKey": "editorial_story",
          "storyTemplateId": "remotion_editorial_left_08",
          "templateName": "Magazin Sol · Minimal Etiket",
        },
        {
          "collection": "Agency",
          "compositionId": "SpecStory",
          "intent": "campaign_offer",
          "kitId": "kit_16_mediterranean",
          "slotKey": "event_story",
          "storyTemplateId": "remotion_event_ticket_06",
          "templateName": "Etkinlik Bileti · Geniş",
        },
        {
          "collection": "Agency",
          "compositionId": "SpecStory",
          "intent": "social_proof",
          "kitId": "kit_16_mediterranean",
          "slotKey": "social_proof",
          "storyTemplateId": "remotion_quote_card_04",
          "templateName": "Quote Card · Fısıltı",
        },
      ]
    `);
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
