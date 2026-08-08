/**
 * One-shot: fill missing keyed design templates for a workspace's enabled slots.
 * Usage: npx tsx --env-file=.env.local scripts/ensure-keyed-templates-once.mts <workspaceId> [sector]
 */
import { loadWorkspaceDesignTemplates, invalidateDesignTemplateCache } from '../src/lib/brand-design-template-matcher';
import { loadBrandActiveSlotSet } from '../src/lib/brand-active-slot-resolver';
import { ensureKeyedDesignTemplatesForEnabledSlots } from '../src/lib/ensure-keyed-design-templates';

async function main() {
  const workspaceId = String(process.argv[2] ?? '').trim();
  const sector = String(process.argv[3] ?? 'beach_club').trim();
  if (!workspaceId) {
    console.error('Usage: ensure-keyed-templates-once.mts <workspaceId> [sector]');
    process.exit(1);
  }

  invalidateDesignTemplateCache(workspaceId);
  let templates = await loadWorkspaceDesignTemplates(workspaceId);
  const before = await loadBrandActiveSlotSet(workspaceId, sector, templates);
  const storyGapsBefore = before.slots
    .filter((s) => s.format === 'story' && !s.hasTemplate)
    .map((s) => s.slotKey);
  console.log(JSON.stringify({ storyGapsBefore, hardPinReady: before.slots.filter((s) => s.hasTemplate).length }, null, 2));

  const res = await ensureKeyedDesignTemplatesForEnabledSlots({
    workspaceId,
    enabledSlots: before.slots,
    activeTemplates: templates,
  });
  console.log(JSON.stringify({ cloned: res }, null, 2));

  templates = await loadWorkspaceDesignTemplates(workspaceId);
  const after = await loadBrandActiveSlotSet(workspaceId, sector, templates);
  const storyGapsAfter = after.slots
    .filter((s) => s.format === 'story' && !s.hasTemplate)
    .map((s) => s.slotKey);
  console.log(JSON.stringify({
    storyGapsAfter,
    hardPinReady: after.slots.filter((s) => s.hasTemplate).length,
    storyHardPin: after.slots.filter((s) => s.format === 'story' && s.hasTemplate).length,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
