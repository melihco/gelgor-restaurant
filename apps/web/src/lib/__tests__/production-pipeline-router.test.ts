/**
 * Golden tests — Feed Art Director assignment resolution (SSOT lock).
 *
 * These pin the behaviour of the assignment-resolution paths. After Faz 2.2 both
 * the gate path and the production queue resolve through the single producer
 * `resolveFinalMissionAssignments`, so the gate now validates exactly what the
 * queue renders:
 *   - `prepareMissionFdAssignments`  → gate + stack context (plan-phase)
 *   - `buildManifestProductionQueue` → the actual production queue
 * The `pins the gate and queue assignments are identical` test locks that SSOT.
 *
 * If a change here is intentional, update snapshots deliberately
 * (`npm run test -- -u`) and review the diff carefully — especially story roles.
 */
import { describe, it, expect } from 'vitest';
import { resolveProductionProfile } from '@/lib/production-profile';
import {
  parseProductionAssignments,
  inferProductionAssignment,
  resolveProductionAssignment,
  prepareMissionFdAssignments,
  buildManifestProductionQueue,
  normalizeVideoTrackAssignment,
  type ProductionAssignment,
} from '@/lib/production-pipeline-router';
import type { ManifestProductionQueueItem } from '@/lib/production-pipeline-router';
import type { FeedArtDirectorReport } from '@/lib/weekly-publish-package';

const MISSION = 'mission-golden-2026-06-21';
const SECTOR = 'restaurant';
const PROFILE = resolveProductionProfile({ packageSlug: 'agency' });

function ideaPool(): Record<string, unknown>[] {
  return [
    { headline: 'Şefin imza tabağı', content_type: 'post', treatment: 'editorial' },
    { headline: 'Hafta sonu brunch', content_type: 'story', treatment: 'warm' },
    { headline: 'Mutfaktan kareler', content_type: 'reel', treatment: 'energetic' },
    { headline: 'Büyük açılış kampanyası', content_type: 'post', template_use_case: 'campaign' },
    { headline: 'Misafir yorumları', content_type: 'carousel', treatment: 'minimal' },
    { headline: 'Akşam atmosferi', content_type: 'story', treatment: 'editorial' },
    { headline: 'Sezonun tatlısı', content_type: 'post', treatment: 'bold' },
    { headline: 'Mekan turu', content_type: 'reel', treatment: 'cinematic' },
  ];
}

function fdReport(): FeedArtDirectorReport {
  return {
    feed_score: 88,
    production_package: 'weekly',
    manifest_coverage_pct: 100,
    production_assignments: [
      { idea_index: 0, slot_role: 'organic_post', pipeline: 'gallery_photo' },
      { idea_index: 1, slot_role: 'campaign_story_motion', pipeline: 'remotion_story' },
      { idea_index: 2, slot_role: 'organic_reel', pipeline: 'runway_reel' },
      { idea_index: 3, slot_role: 'designed_post', pipeline: 'fal_design' },
      { idea_index: 4, slot_role: 'organic_carousel', pipeline: 'carousel_gallery' },
    ],
  } as unknown as FeedArtDirectorReport;
}

function assignmentFingerprint(a: ProductionAssignment) {
  return {
    idea_index: a.idea_index,
    slot_role: a.slot_role,
    pipeline: a.pipeline,
    publish_channel: a.publish_channel,
    library_slot_key: a.library_slot_key,
    catalog_slot_key: a.catalog_slot_key,
    rationale: a.rationale,
  };
}

function queueFingerprint(items: ManifestProductionQueueItem[]) {
  return items.map((q) => ({
    queueIndex: q.queueIndex,
    ideaIndex: q.ideaIndex,
    ...assignmentFingerprint(q.assignment),
  }));
}

describe('parseProductionAssignments', () => {
  it('drops malformed entries and backfills pipeline/channel', () => {
    const parsed = parseProductionAssignments({
      production_assignments: [
        { idea_index: 0, slot_role: 'organic_post' },
        { idea_index: -1, slot_role: 'organic_post' },
        { slot_role: 'organic_post' },
        { idea_index: 2 },
        null,
        'garbage',
      ],
    } as unknown as FeedArtDirectorReport);
    expect(parsed.map(assignmentFingerprint)).toMatchInlineSnapshot(`
      [
        {
          "catalog_slot_key": undefined,
          "idea_index": 0,
          "library_slot_key": undefined,
          "pipeline": "gallery_photo",
          "publish_channel": "instagram_organic",
          "rationale": undefined,
          "slot_role": "organic_post",
        },
      ]
    `);
  });

  it('preserves catalog_slot_key from FD report', () => {
    const parsed = parseProductionAssignments({
      production_assignments: [
        {
          idea_index: 1,
          slot_role: 'designed_post',
          pipeline: 'fal_design',
          catalog_slot_key: 'restaurant_cafe_brunch_offer_post',
        },
        {
          idea_index: 2,
          slot_role: 'campaign_story_motion',
          pipeline: 'fal_story',
          catalog_slot_key: 'restaurant_cafe_event_announcement_story',
        },
      ],
    } as unknown as FeedArtDirectorReport);
    expect(parsed.map(assignmentFingerprint)).toEqual([
      {
        idea_index: 1,
        slot_role: 'designed_post',
        pipeline: 'fal_design',
        publish_channel: 'instagram_organic',
        library_slot_key: undefined,
        catalog_slot_key: 'restaurant_cafe_brunch_offer_post',
        rationale: undefined,
      },
      {
        idea_index: 2,
        slot_role: 'campaign_story_motion',
        pipeline: 'fal_story',
        publish_channel: 'instagram_campaign',
        library_slot_key: undefined,
        catalog_slot_key: 'restaurant_cafe_event_announcement_story',
        rationale: undefined,
      },
    ]);
  });
});

describe('inferProductionAssignment (heuristic)', () => {
  it('pins the heuristic role/pipeline for each content format', () => {
    const ideas = ideaPool();
    const out = ideas.map((idea, i) =>
      assignmentFingerprint(inferProductionAssignment(i, idea, MISSION, i, 0, 0, SECTOR)),
    );
    expect(out).toMatchInlineSnapshot(`
      [
        {
          "catalog_slot_key": undefined,
          "idea_index": 0,
          "library_slot_key": undefined,
          "pipeline": "gallery_photo",
          "publish_channel": "instagram_organic",
          "rationale": "heuristic_organic_post",
          "slot_role": "organic_post",
        },
        {
          "catalog_slot_key": undefined,
          "idea_index": 1,
          "library_slot_key": undefined,
          "pipeline": "fal_story",
          "publish_channel": "instagram_campaign",
          "rationale": "heuristic_fal_story+mission_fal_story_0",
          "slot_role": "campaign_story_motion",
        },
        {
          "catalog_slot_key": undefined,
          "idea_index": 2,
          "library_slot_key": undefined,
          "pipeline": "fal_reel",
          "publish_channel": "instagram_organic",
          "rationale": "heuristic_reel",
          "slot_role": "organic_reel",
        },
        {
          "catalog_slot_key": undefined,
          "idea_index": 3,
          "library_slot_key": undefined,
          "pipeline": "fal_design",
          "publish_channel": "instagram_campaign",
          "rationale": "heuristic_campaign_post",
          "slot_role": "designed_post",
        },
        {
          "catalog_slot_key": undefined,
          "idea_index": 4,
          "library_slot_key": undefined,
          "pipeline": "carousel_gallery",
          "publish_channel": "instagram_organic",
          "rationale": "heuristic_carousel",
          "slot_role": "organic_carousel",
        },
        {
          "catalog_slot_key": undefined,
          "idea_index": 5,
          "library_slot_key": undefined,
          "pipeline": "fal_story",
          "publish_channel": "instagram_campaign",
          "rationale": "heuristic_fal_story+mission_fal_story_0",
          "slot_role": "campaign_story_motion",
        },
        {
          "catalog_slot_key": undefined,
          "idea_index": 6,
          "library_slot_key": undefined,
          "pipeline": "fal_design",
          "publish_channel": "instagram_organic",
          "rationale": "heuristic_designed_post",
          "slot_role": "designed_post",
        },
        {
          "catalog_slot_key": undefined,
          "idea_index": 7,
          "library_slot_key": undefined,
          "pipeline": "fal_reel",
          "publish_channel": "instagram_organic",
          "rationale": "heuristic_reel",
          "slot_role": "organic_reel",
        },
      ]
    `);
  });
});

describe('resolveProductionAssignment (per-idea, fallback queue)', () => {
  it('prefers the FD report assignment when present', () => {
    const ideas = ideaPool();
    const report = fdReport();
    const out = [0, 1, 2, 3, 4].map((i) =>
      assignmentFingerprint(
        resolveProductionAssignment({
          ideaIndex: i,
          idea: ideas[i]!,
          report,
          missionId: MISSION,
          postIndex: i,
          storyIndex: 0,
          reelIndex: 0,
          sector: SECTOR,
        }),
      ),
    );
    expect(out).toMatchInlineSnapshot(`
      [
        {
          "catalog_slot_key": undefined,
          "idea_index": 0,
          "library_slot_key": undefined,
          "pipeline": "gallery_photo",
          "publish_channel": "instagram_organic",
          "rationale": undefined,
          "slot_role": "organic_post",
        },
        {
          "catalog_slot_key": undefined,
          "idea_index": 1,
          "library_slot_key": "event_story",
          "pipeline": "fal_story",
          "publish_channel": "instagram_campaign",
          "rationale": "mission_fal_story_0",
          "slot_role": "campaign_story_motion",
        },
        {
          "catalog_slot_key": undefined,
          "idea_index": 2,
          "library_slot_key": undefined,
          "pipeline": "fal_reel",
          "publish_channel": "instagram_organic",
          "rationale": undefined,
          "slot_role": "organic_reel",
        },
        {
          "catalog_slot_key": undefined,
          "idea_index": 3,
          "library_slot_key": "campaign_post",
          "pipeline": "fal_design",
          "publish_channel": "instagram_organic",
          "rationale": undefined,
          "slot_role": "designed_post",
        },
        {
          "catalog_slot_key": undefined,
          "idea_index": 4,
          "library_slot_key": undefined,
          "pipeline": "carousel_gallery",
          "publish_channel": "instagram_organic",
          "rationale": undefined,
          "slot_role": "organic_carousel",
        },
      ]
    `);
  });

  it('assigns deterministic library_slot_key values only for remotion-managed slots', () => {
    const ideas = ideaPool();

    const firstStory = resolveProductionAssignment({
      ideaIndex: 1,
      idea: ideas[1]!,
      report: null,
      missionId: MISSION,
      postIndex: 0,
      storyIndex: 0,
      reelIndex: 0,
      sector: SECTOR,
    });
    const secondStory = resolveProductionAssignment({
      ideaIndex: 5,
      idea: ideas[5]!,
      report: null,
      missionId: MISSION,
      postIndex: 0,
      storyIndex: 1,
      reelIndex: 0,
      sector: SECTOR,
    });
    const firstPoster = resolveProductionAssignment({
      ideaIndex: 3,
      idea: ideas[3]!,
      report: null,
      missionId: MISSION,
      postIndex: 0,
      storyIndex: 0,
      reelIndex: 0,
      sector: SECTOR,
    });
    const organic = resolveProductionAssignment({
      ideaIndex: 0,
      idea: ideas[0]!,
      report: null,
      missionId: MISSION,
      postIndex: 0,
      storyIndex: 0,
      reelIndex: 0,
      sector: SECTOR,
    });

    expect(firstStory.library_slot_key).toBe('event_story');
    expect(secondStory.library_slot_key).toBe('editorial_story');
    expect(firstPoster.library_slot_key).toBe('campaign_post');
    expect(organic.library_slot_key).toBeUndefined();
  });
});

describe('prepareMissionFdAssignments — gate path', () => {
  it('pins assignments + validation + gate with an FD report', () => {
    const prepared = prepareMissionFdAssignments({
      missionId: MISSION,
      report: fdReport(),
      ideas: ideaPool(),
      manifestMissionType: 'weekly_content',
      sector: SECTOR,
      productionProfile: PROFILE,
      packageSlug: 'agency',
    });
    expect({
      assignments: prepared.assignments.map(assignmentFingerprint),
      rawAssignmentCount: prepared.rawAssignmentCount,
      validation: prepared.validation,
      gate: {
        allowed: prepared.gate.allowed,
        warnOnly: prepared.gate.warnOnly,
        code: prepared.gate.code,
        coveragePct: prepared.gate.coveragePct,
        assignmentCount: prepared.gate.assignmentCount,
        requiredSlots: prepared.gate.requiredSlots,
        filledRequired: prepared.gate.filledRequired,
      },
    }).toMatchInlineSnapshot(`
      {
        "assignments": [
          {
            "catalog_slot_key": undefined,
            "idea_index": 0,
            "library_slot_key": undefined,
            "pipeline": "gallery_photo",
            "publish_channel": "instagram_organic",
            "rationale": undefined,
            "slot_role": "organic_post",
          },
          {
            "catalog_slot_key": undefined,
            "idea_index": 1,
            "library_slot_key": "event_story",
            "pipeline": "fal_story",
            "publish_channel": "instagram_campaign",
            "rationale": "mission_fal_story_0",
            "slot_role": "campaign_story_motion",
          },
          {
            "catalog_slot_key": undefined,
            "idea_index": 2,
            "library_slot_key": undefined,
            "pipeline": "fal_reel",
            "publish_channel": "instagram_organic",
            "rationale": "runway_to_fal_reel",
            "slot_role": "organic_reel",
          },
          {
            "catalog_slot_key": undefined,
            "idea_index": 3,
            "library_slot_key": "campaign_post",
            "pipeline": "fal_design",
            "publish_channel": "instagram_organic",
            "rationale": undefined,
            "slot_role": "designed_post",
          },
          {
            "catalog_slot_key": undefined,
            "idea_index": 4,
            "library_slot_key": undefined,
            "pipeline": "carousel_gallery",
            "publish_channel": "instagram_organic",
            "rationale": undefined,
            "slot_role": "organic_carousel",
          },
          {
            "catalog_slot_key": undefined,
            "idea_index": 5,
            "library_slot_key": "editorial_story",
            "pipeline": "fal_story",
            "publish_channel": "instagram_campaign",
            "rationale": "heuristic_fal_story+mission_fal_story_1+mission_fal_story_1",
            "slot_role": "campaign_story_motion",
          },
          {
            "catalog_slot_key": undefined,
            "idea_index": 6,
            "library_slot_key": "campaign_post",
            "pipeline": "fal_design",
            "publish_channel": "instagram_organic",
            "rationale": "heuristic_designed_post",
            "slot_role": "designed_post",
          },
          {
            "catalog_slot_key": undefined,
            "idea_index": 7,
            "library_slot_key": undefined,
            "pipeline": "fal_reel",
            "publish_channel": "instagram_organic",
            "rationale": "heuristic_reel",
            "slot_role": "organic_reel",
          },
        ],
        "gate": {
          "allowed": true,
          "assignmentCount": 8,
          "code": undefined,
          "coveragePct": 100,
          "filledRequired": 8,
          "requiredSlots": 8,
          "warnOnly": true,
        },
        "rawAssignmentCount": 5,
        "validation": {
          "coveragePct": 100,
          "filledRequired": 8,
          "missingRoles": [],
          "requiredSlots": 8,
        },
      }
    `);
  });

  it('pins the empty-FD manifest-slot-map path (SSOT — enriched, matches queue)', () => {
    const prepared = prepareMissionFdAssignments({
      missionId: MISSION,
      report: null,
      ideas: ideaPool(),
      manifestMissionType: 'weekly_content',
      sector: SECTOR,
      productionProfile: PROFILE,
      packageSlug: 'agency',
    });
    expect(prepared.assignments.map(assignmentFingerprint)).toMatchInlineSnapshot(`
      [
        {
          "catalog_slot_key": undefined,
          "idea_index": 0,
          "library_slot_key": undefined,
          "pipeline": "gallery_photo",
          "publish_channel": "instagram_organic",
          "rationale": "heuristic_organic_post",
          "slot_role": "organic_post",
        },
        {
          "catalog_slot_key": undefined,
          "idea_index": 1,
          "library_slot_key": "event_story",
          "pipeline": "fal_story",
          "publish_channel": "instagram_campaign",
          "rationale": "heuristic_fal_story+mission_fal_story_0+mission_fal_story_0",
          "slot_role": "campaign_story_motion",
        },
        {
          "catalog_slot_key": undefined,
          "idea_index": 2,
          "library_slot_key": undefined,
          "pipeline": "fal_reel",
          "publish_channel": "instagram_organic",
          "rationale": "heuristic_reel",
          "slot_role": "organic_reel",
        },
        {
          "catalog_slot_key": undefined,
          "idea_index": 3,
          "library_slot_key": "campaign_post",
          "pipeline": "fal_design",
          "publish_channel": "instagram_campaign",
          "rationale": "heuristic_campaign_post",
          "slot_role": "designed_post",
        },
        {
          "catalog_slot_key": undefined,
          "idea_index": 4,
          "library_slot_key": undefined,
          "pipeline": "carousel_gallery",
          "publish_channel": "instagram_organic",
          "rationale": "heuristic_carousel",
          "slot_role": "organic_carousel",
        },
        {
          "catalog_slot_key": undefined,
          "idea_index": 5,
          "library_slot_key": "editorial_story",
          "pipeline": "fal_story",
          "publish_channel": "instagram_campaign",
          "rationale": "heuristic_fal_story+mission_fal_story_1+mission_fal_story_1",
          "slot_role": "campaign_story_motion",
        },
        {
          "catalog_slot_key": undefined,
          "idea_index": 6,
          "library_slot_key": "campaign_post",
          "pipeline": "fal_design",
          "publish_channel": "instagram_organic",
          "rationale": "heuristic_designed_post",
          "slot_role": "designed_post",
        },
        {
          "catalog_slot_key": undefined,
          "idea_index": 7,
          "library_slot_key": undefined,
          "pipeline": "fal_reel",
          "publish_channel": "instagram_organic",
          "rationale": "heuristic_reel",
          "slot_role": "organic_reel",
        },
      ]
    `);
  });
});

describe('buildManifestProductionQueue — production queue path', () => {
  it('pins the queue with an FD report (expand + enrich + story ordinal)', () => {
    const queue = buildManifestProductionQueue({
      missionId: MISSION,
      ideas: ideaPool(),
      report: fdReport(),
      manifestMissionType: 'weekly_content',
      sector: SECTOR,
      productionProfile: PROFILE,
      packageSlug: 'agency',
    });
    expect(queueFingerprint(queue)).toMatchInlineSnapshot(`
      [
        {
          "catalog_slot_key": undefined,
          "ideaIndex": 0,
          "idea_index": 0,
          "library_slot_key": undefined,
          "pipeline": "gallery_photo",
          "publish_channel": "instagram_organic",
          "queueIndex": 0,
          "rationale": undefined,
          "slot_role": "organic_post",
        },
        {
          "catalog_slot_key": undefined,
          "ideaIndex": 1,
          "idea_index": 1,
          "library_slot_key": "event_story",
          "pipeline": "fal_story",
          "publish_channel": "instagram_campaign",
          "queueIndex": 1,
          "rationale": "mission_fal_story_0",
          "slot_role": "campaign_story_motion",
        },
        {
          "catalog_slot_key": undefined,
          "ideaIndex": 2,
          "idea_index": 2,
          "library_slot_key": undefined,
          "pipeline": "fal_reel",
          "publish_channel": "instagram_organic",
          "queueIndex": 2,
          "rationale": "runway_to_fal_reel",
          "slot_role": "organic_reel",
        },
        {
          "catalog_slot_key": undefined,
          "ideaIndex": 3,
          "idea_index": 3,
          "library_slot_key": "campaign_post",
          "pipeline": "fal_design",
          "publish_channel": "instagram_organic",
          "queueIndex": 3,
          "rationale": undefined,
          "slot_role": "designed_post",
        },
        {
          "catalog_slot_key": undefined,
          "ideaIndex": 4,
          "idea_index": 4,
          "library_slot_key": undefined,
          "pipeline": "carousel_gallery",
          "publish_channel": "instagram_organic",
          "queueIndex": 4,
          "rationale": undefined,
          "slot_role": "organic_carousel",
        },
        {
          "catalog_slot_key": undefined,
          "ideaIndex": 5,
          "idea_index": 5,
          "library_slot_key": "editorial_story",
          "pipeline": "fal_story",
          "publish_channel": "instagram_campaign",
          "queueIndex": 5,
          "rationale": "heuristic_fal_story+mission_fal_story_1+mission_fal_story_1",
          "slot_role": "campaign_story_motion",
        },
        {
          "catalog_slot_key": undefined,
          "ideaIndex": 6,
          "idea_index": 6,
          "library_slot_key": "campaign_post",
          "pipeline": "fal_design",
          "publish_channel": "instagram_organic",
          "queueIndex": 6,
          "rationale": "heuristic_designed_post",
          "slot_role": "designed_post",
        },
        {
          "catalog_slot_key": undefined,
          "ideaIndex": 7,
          "idea_index": 7,
          "library_slot_key": undefined,
          "pipeline": "fal_reel",
          "publish_channel": "instagram_organic",
          "queueIndex": 7,
          "rationale": "heuristic_reel",
          "slot_role": "organic_reel",
        },
      ]
    `);
  });

  it('pins the empty-FD queue (SSOT producer — gate path resolves identically)', () => {
    const queue = buildManifestProductionQueue({
      missionId: MISSION,
      ideas: ideaPool(),
      report: null,
      manifestMissionType: 'weekly_content',
      sector: SECTOR,
      productionProfile: PROFILE,
      packageSlug: 'agency',
    });
    expect(queueFingerprint(queue)).toMatchInlineSnapshot(`
      [
        {
          "catalog_slot_key": undefined,
          "ideaIndex": 0,
          "idea_index": 0,
          "library_slot_key": undefined,
          "pipeline": "gallery_photo",
          "publish_channel": "instagram_organic",
          "queueIndex": 0,
          "rationale": "heuristic_organic_post",
          "slot_role": "organic_post",
        },
        {
          "catalog_slot_key": undefined,
          "ideaIndex": 1,
          "idea_index": 1,
          "library_slot_key": "event_story",
          "pipeline": "fal_story",
          "publish_channel": "instagram_campaign",
          "queueIndex": 1,
          "rationale": "heuristic_fal_story+mission_fal_story_0+mission_fal_story_0",
          "slot_role": "campaign_story_motion",
        },
        {
          "catalog_slot_key": undefined,
          "ideaIndex": 2,
          "idea_index": 2,
          "library_slot_key": undefined,
          "pipeline": "fal_reel",
          "publish_channel": "instagram_organic",
          "queueIndex": 2,
          "rationale": "heuristic_reel",
          "slot_role": "organic_reel",
        },
        {
          "catalog_slot_key": undefined,
          "ideaIndex": 3,
          "idea_index": 3,
          "library_slot_key": "campaign_post",
          "pipeline": "fal_design",
          "publish_channel": "instagram_campaign",
          "queueIndex": 3,
          "rationale": "heuristic_campaign_post",
          "slot_role": "designed_post",
        },
        {
          "catalog_slot_key": undefined,
          "ideaIndex": 4,
          "idea_index": 4,
          "library_slot_key": undefined,
          "pipeline": "carousel_gallery",
          "publish_channel": "instagram_organic",
          "queueIndex": 4,
          "rationale": "heuristic_carousel",
          "slot_role": "organic_carousel",
        },
        {
          "catalog_slot_key": undefined,
          "ideaIndex": 5,
          "idea_index": 5,
          "library_slot_key": "editorial_story",
          "pipeline": "fal_story",
          "publish_channel": "instagram_campaign",
          "queueIndex": 5,
          "rationale": "heuristic_fal_story+mission_fal_story_1+mission_fal_story_1",
          "slot_role": "campaign_story_motion",
        },
        {
          "catalog_slot_key": undefined,
          "ideaIndex": 6,
          "idea_index": 6,
          "library_slot_key": "campaign_post",
          "pipeline": "fal_design",
          "publish_channel": "instagram_organic",
          "queueIndex": 6,
          "rationale": "heuristic_designed_post",
          "slot_role": "designed_post",
        },
        {
          "catalog_slot_key": undefined,
          "ideaIndex": 7,
          "idea_index": 7,
          "library_slot_key": undefined,
          "pipeline": "fal_reel",
          "publish_channel": "instagram_organic",
          "queueIndex": 7,
          "rationale": "heuristic_reel",
          "slot_role": "organic_reel",
        },
      ]
    `);
  });
});

describe('SSOT — gate and queue agree (Faz 2.2)', () => {
  for (const scenario of ['with FD report', 'empty FD'] as const) {
    it(`gate path assignments match queue assignments (${scenario})`, () => {
      const report = scenario === 'with FD report' ? fdReport() : null;
      const common = {
        missionId: MISSION,
        ideas: ideaPool(),
        report,
        manifestMissionType: 'weekly_content' as const,
        sector: SECTOR,
        productionProfile: PROFILE,
        packageSlug: 'agency',
      };
      const prepared = prepareMissionFdAssignments(common);
      const queue = buildManifestProductionQueue(common);
      expect(prepared.assignments.map(assignmentFingerprint)).toEqual(
        queue.map((q) => assignmentFingerprint(q.assignment)),
      );
    });
  }
});

describe('normalizeVideoTrackAssignment', () => {
  it('canonicalizes legacy fal story slots to campaign_story_motion + fal_story', () => {
    expect(normalizeVideoTrackAssignment({
      idea_index: 0,
      slot_role: 'fal_story_motion',
      pipeline: 'fal_story',
      copy_bundle_id: 'x',
      publish_channel: 'instagram_organic',
    })).toMatchObject({ slot_role: 'campaign_story_motion', pipeline: 'fal_story' });

    expect(normalizeVideoTrackAssignment({
      idea_index: 1,
      slot_role: 'fal_only_story',
      pipeline: 'fal_only_story',
      copy_bundle_id: 'x',
      publish_channel: 'instagram_organic',
    })).toMatchObject({ slot_role: 'fal_only_story', pipeline: 'fal_only_story' });
  });
});
