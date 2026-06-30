import { readFileSync } from 'fs';
import { filterArtifactsForMission } from '../src/lib/mission-feed-package.ts';
import {
  buildWeeklySelectionFromMissionNodes,
  filterFeedPublishableArtifacts,
  formatWeeklyPackageSummary,
  isArtifactFeedReady,
} from '../src/lib/weekly-publish-package.ts';
import { isBundleRendering } from '../src/lib/production-bundle.ts';

const list = JSON.parse(readFileSync('/tmp/yula-artifacts.json', 'utf8'));
const arts = Array.isArray(list) ? list : list.items || list.data || [];
const mid = 'b2bcdec1-074b-42b3-92a0-3017c729eb9c';
const mission = filterArtifactsForMission(arts, mid);
const publishable = filterFeedPublishableArtifacts(mission);
const sel = buildWeeklySelectionFromMissionNodes(publishable, mid, []);

console.log({
  deduped: mission.length,
  publishable: publishable.length,
  primary: sel.primary.length,
  backup: sel.backup.length,
  slots: {
    stories: sel.slots.stories.length,
    posts: sel.slots.posts.length,
    reels: sel.slots.reels.length,
    carousels: sel.slots.carousels.length,
  },
  summary: formatWeeklyPackageSummary(sel),
  feedReady: mission.filter(isArtifactFeedReady).length,
  rendering: mission.filter(isBundleRendering).length,
});
