#!/usr/bin/env npx tsx
/**
 * Single mission story slot — fal_story smoke test with full production logs.
 *
 * Usage:
 *   npx tsx scripts/test-fal-story-mission.mts
 *   npx tsx scripts/test-fal-story-mission.mts --workspace 4278d8e0-... --mission f59f0649-...
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { buildManifestProductionQueue } from '../src/lib/production-pipeline-router';
import { fetchProductionContext } from '../src/app/api/auto-produce/production-context';
import { fetchGalleryContext } from '../src/app/api/auto-produce/gallery-context';
import { runProduction } from '../src/app/api/auto-produce/production-loop';

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]!]) {
        process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
      }
    }
  } catch { /* optional */ }
}
loadEnvLocal();

const WORKSPACE = process.argv.includes('--workspace')
  ? process.argv[process.argv.indexOf('--workspace') + 1]!
  : '4278d8e0-10b1-409d-a658-4101dcc22632';
const MISSION = process.argv.includes('--mission')
  ? process.argv[process.argv.indexOf('--mission') + 1]!
  : 'f59f0649-c1cd-4bcc-861a-65e1c094e95c';

function loadIdeation(missionId: string): Record<string, unknown>[] {
  const raw = execSync(
    `docker exec smart-agency-postgres-1 psql -U nexus -d nexus_db -t -A -c `
    + `"SELECT output_summary FROM mission_task_nodes WHERE mission_id = '${missionId}' AND task_type = 'content_ideation' LIMIT 1"`,
    { encoding: 'utf8' },
  ).trim();
  const jsonStart = raw.indexOf('[');
  if (jsonStart < 0) throw new Error('No ideation JSON in mission_task_nodes');
  return JSON.parse(raw.slice(jsonStart)) as Record<string, unknown>[];
}

async function main() {
  console.log('\n=== fal_story mission slot test ===');
  console.log(`workspace=${WORKSPACE}`);
  console.log(`mission=${MISSION}\n`);

  const ideas = loadIdeation(MISSION);
  console.log(`Ideation ideas: ${ideas.length}`);
  ideas.forEach((idea, i) => {
    console.log(`  [${i}] ${String(idea.headline ?? idea.concept_title ?? '').slice(0, 60)} (${idea.content_type ?? idea.format ?? '?'})`);
  });

  const queue = buildManifestProductionQueue({
    missionId: MISSION,
    ideas,
    report: null,
    manifestMissionType: 'opportunity',
    sector: 'beach_club',
  });
  const storyItem = queue.find((q) => q.assignment.slot_role === 'campaign_story_motion');
  if (!storyItem) {
    throw new Error('No campaign_story_motion slot in opportunity queue');
  }
  const slotKey = `${storyItem.ideaIndex}:${storyItem.assignment.slot_role}`;
  console.log('\nStory slot:', {
    slotKey,
    pipeline: storyItem.assignment.pipeline,
    ideaIndex: storyItem.ideaIndex,
    headline: String(storyItem.idea.headline ?? '').slice(0, 60),
  });

  if (storyItem.assignment.pipeline !== 'fal_story') {
    console.warn('WARN: expected pipeline fal_story, got', storyItem.assignment.pipeline);
  }

  const [pctx, gctx] = await Promise.all([
    fetchProductionContext(WORKSPACE),
    fetchGalleryContext(WORKSPACE, { missionId: MISSION }),
  ]);

  console.log('\nBrand:', pctx.brandName, '| gallery photos:', gctx.photos.length);
  console.log('FAL configured:', Boolean(process.env.FAL_API_KEY));
  console.log('OPENAI configured:', Boolean(process.env.OPENAI_API_KEY));

  const t0 = Date.now();
  console.log('\n--- runProduction (story backfill) ---\n');

  const galleryAssignKey = `${storyItem.ideaIndex}::campaign_story_motion`;
  const groundedGalleryUrl = 'https://yulabodrum.com/galeri/54.webp';

  const response = await runProduction({
    workspaceId: WORKSPACE,
    missionId: MISSION,
    nodeKey: 'fal_story_mission_test',
    ideas,
    visualDesignCards: [],
    galleryAnalysis: gctx.analysis,
    brandNameOverride: pctx.brandName,
    productionSnapshot: {
      workspaceId: WORKSPACE,
      brandName: pctx.brandName,
      businessType: pctx.brandBusinessType,
      galleryAnalysis: gctx.analysis,
    },
    brandThemeOverride: pctx.brandTheme,
    bundleCards: false,
    feedDirectorReport: null,
    strategistMissionType: 'opportunity',
    productionPackage: 'opportunity',
    missionTitle: 'fal_story mission test',
    creativeBrief: null,
    skipArtifactDedupe: true,
    slotBackfillPass: true,
    backfillSlotKeys: [slotKey],
    gallerySlotAssignments: {
      [galleryAssignKey]: { url: groundedGalleryUrl, score: 95 },
    },
  });

  const result = (await response.json()) as {
    produced?: number;
    results?: Array<{
      slotKey?: string;
      title?: string;
      error?: string;
      imageUrl?: string;
      metadata?: Record<string, unknown>;
    }>;
  };

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n--- done in ${elapsed}s ---\n`);
  console.log(JSON.stringify({
    produced: result.produced,
    results: result.results?.map((r) => ({
      slotKey: r.slotKey,
      title: r.title?.slice(0, 50),
      error: r.error?.slice(0, 200),
      imageUrl: r.imageUrl?.slice(0, 120),
      pipeline: r.metadata?.pipeline,
      fal_designer: r.metadata?.fal_designer_produced,
    })),
  }, null, 2));
}

main().catch((err) => {
  console.error('\nFAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
