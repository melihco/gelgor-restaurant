import { dedupeProductionBundles } from '../src/lib/production-bundle.ts';
import {
  filterFeedPublishableArtifacts,
  isArtifactFeedPublishable,
} from '../src/lib/weekly-publish-package.ts';
import { parseArtifactMissionId } from '../src/lib/mission-feed-package.ts';

const tenantId = process.argv[2] || '5feb36f7-def7-4b4a-834f-353457de57bf';
const res = await fetch('http://127.0.0.1:5050/api/artifacts', {
  headers: {
    'X-Tenant-Id': tenantId,
    'X-Internal-Api-Key': process.env.INTERNAL_API_KEY || 'smartagency-internal-dev-key',
  },
});
if (!res.ok) {
  console.error('API', res.status, await res.text());
  process.exit(1);
}
const raw = await res.json();

function mapArtifact(a) {
  const reviewStatusToken = String(a.reviewStatus ?? '0');
  const status =
    reviewStatusToken === '1' || String(reviewStatusToken).toLowerCase() === 'approved'
      ? 'approved'
      : 'pending_review';
  let metadata = {};
  try {
    metadata = typeof a.metadata === 'string' ? JSON.parse(a.metadata) : (a.metadata ?? {});
  } catch {
    metadata = {};
  }
  return { ...a, status, metadata, content: a.content, createdAt: a.createdAt };
}

const mapped = raw.map(mapArtifact);
const deduped = dedupeProductionBundles(mapped);
const publishable = filterFeedPublishableArtifacts(deduped);
const pending = mapped.filter((a) => a.status === 'pending_review');
const pendingPub = publishable.filter((a) => a.status === 'pending_review');

console.log({
  tenantId,
  total: mapped.length,
  auto_produced: mapped.filter((a) => a.metadata?.auto_produced).length,
  pending_review: pending.length,
  deduped: deduped.length,
  publishable: publishable.length,
  pending_publishable: pendingPub.length,
  hidden_pending: pending.length - pendingPub.length,
});

const stuckRendering = pending.filter((a) => {
  const b = a.metadata?.bundle_status;
  return b === 'rendering' && !isArtifactFeedPublishable(a);
});
console.log('stuck_rendering_pending', stuckRendering.length);
for (const a of stuckRendering.slice(0, 5)) {
  console.log('STUCK', a.title?.slice(0, 40), {
    auto: a.metadata?.auto_produced,
    source: a.metadata?.source,
    role: a.metadata?.production_role,
    contentUrl: String(a.contentUrl || '').slice(0, 80),
    poster: String(a.metadata?.poster_url || a.metadata?.posterUrl || '').slice(0, 80),
  });
}

const hidden = pending.filter((a) => !publishable.some((p) => p.id === a.id));
for (const a of hidden.slice(0, 8)) {
  console.log('HIDDEN', a.title?.slice(0, 45), {
    auto: a.metadata?.auto_produced,
    source: a.metadata?.source,
    bundle: a.metadata?.bundle_status,
    role: a.metadata?.production_role,
    contentUrl: String(a.contentUrl || '').slice(0, 80),
    imageUrl: String(a.metadata?.imageUrl || '').slice(0, 80),
    publishable: isArtifactFeedPublishable(a),
  });
}

const missionCounts = new Map();
for (const a of mapped.filter((x) => x.metadata?.auto_produced)) {
  const mid = parseArtifactMissionId(a) || 'no-mission';
  if (!missionCounts.has(mid)) missionCounts.set(mid, { total: 0, pub: 0 });
  const c = missionCounts.get(mid);
  c.total += 1;
  if (isArtifactFeedPublishable(a)) c.pub += 1;
}
console.log('missions (auto_produced):', [...missionCounts.entries()].slice(-5));

const missionId = process.argv[3];
if (missionId) {
  const mission = mapped.filter((a) => parseArtifactMissionId(a) === missionId);
  const dedupedMission = dedupeProductionBundles(mission);
  console.log('\nMission', missionId);
  console.log('raw', mission.length, 'deduped', dedupedMission.length);
  for (const a of dedupedMission) {
    console.log(
      ' -',
      a.title?.slice(0, 40),
      a.status,
      a.metadata?.production_role,
      a.metadata?.bundle_status,
      'ai_enh=' + a.metadata?.ai_gallery_enhanced,
      'pub=' + isArtifactFeedPublishable(a),
    );
  }
}
