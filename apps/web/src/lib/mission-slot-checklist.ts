/**
 * Mission Hub — manifest slot checklist (APO-5)
 *
 * Tenant-agnostic: matches FD `production_assignments` to artifacts for one mission
 * via `metadata.production_role` + `metadata.idea_index` + `metadata.mission_id`.
 */
import type { OutputArtifact } from '@/types';
import { parseArtifactContent } from '@/app/mobile/_components/artifact-utils';
import type { GptEnhanceSkipCode } from '@/lib/gpt-enhance-policy';
import {
  labelAiEnhanceStatus,
  type AiEnhanceUiStatus,
} from '@/lib/ai-enhance-ui-labels';
import {
  artifactProductionRole,
  buildMissionProductionManifest,
  type MissionProductionManifest,
  type ProductionAssignment,
  type ProductionSlotRole,
} from '@/lib/mission-production-manifest';
import {
  getProductionBundleStatus,
  isBundleFailed,
  isBundleRendering,
  isProductionBundleStory,
  parseArtifactMissionId,
  resolveStoryVideoUrl,
} from '@/lib/production-bundle';
import { nodeOutputObject } from '@/lib/mission-node-output';

export type SlotDeliveryStatus = 'ready' | 'rendering' | 'failed' | 'missing' | 'pending';

export interface MissionSlotChecklistItem {
  assignmentIndex: number;
  ideaIndex: number | null;
  role: ProductionSlotRole;
  pipeline: string;
  label: string;
  required: boolean;
  status: SlotDeliveryStatus;
  artifactId: string | null;
  headline: string | null;
  /** AI Fotoğraf İyileştirme — artifact metadata'dan */
  aiEnhanceStatus?: AiEnhanceUiStatus;
  aiEnhanceLabel?: string;
  aiEnhanceSkipCode?: GptEnhanceSkipCode;
}

export interface MissionSlotChecklist {
  missionId: string;
  missionType: MissionProductionManifest['missionType'];
  items: MissionSlotChecklistItem[];
  requiredTotal: number;
  readyRequired: number;
  readyTotal: number;
  failedCount: number;
  renderingCount: number;
  coveragePct: number;
}

export const SLOT_ROLE_LABEL_TR: Record<ProductionSlotRole, string> = {
  organic_post: 'Organik post',
  designed_post: 'Tasarım post',
  organic_story_still: 'Story (galeri)',
  campaign_story_motion: 'Kampanya story',
  organic_reel: 'Organik reel',
  campaign_reel_motion: 'Kampanya reel',
  organic_carousel: 'Carousel',
  paid_ad_creative: 'Meta reklam kreatifi',
  paid_ad_google_creative: 'Google Ads kreatifi',
};

const STATUS_TR: Record<SlotDeliveryStatus, string> = {
  ready: 'Hazır',
  rendering: 'Render',
  failed: 'Hata',
  missing: 'Eksik',
  pending: 'Bekliyor',
};

export function slotStatusLabel(status: SlotDeliveryStatus): string {
  return STATUS_TR[status] ?? status;
}

export function inferManifestMissionType(input: {
  missionType?: string;
  title?: string | null;
  assignments: ProductionAssignment[];
}): MissionProductionManifest['missionType'] {
  if (String(input.missionType ?? '').trim().toLowerCase() === 'opportunity') return 'opportunity';
  if (input.assignments.some((a) => a.slot_role === 'paid_ad_creative')) return 'ads_focus';
  if (input.assignments.some((a) => a.slot_role.includes('campaign'))) return 'campaign';
  const t = `${input.missionType ?? ''} ${input.title ?? ''}`.toLowerCase();
  if (t.includes('campaign') || t.includes('kampanya') || t.includes('event') || t.includes('etkinlik')) {
    return 'campaign';
  }
  return 'weekly_content';
}

function parseFdAssignments(raw: unknown): ProductionAssignment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is Record<string, unknown> => Boolean(a && typeof a === 'object'))
    .map((a) => ({
      idea_index: typeof a.idea_index === 'number' ? a.idea_index : Number(a.idea_index ?? -1),
      slot_role: String(a.slot_role ?? '') as ProductionSlotRole,
      pipeline: (a.pipeline as ProductionAssignment['pipeline']) ?? 'gallery_photo',
      copy_bundle_id: String(a.copy_bundle_id ?? ''),
      publish_channel: (a.publish_channel as ProductionAssignment['publish_channel']) ?? 'instagram_organic',
      layout_family_hint: a.layout_family_hint as string | undefined,
      library_slot_key: a.library_slot_key as string | undefined,
      rationale: a.rationale as string | undefined,
    }))
    .filter((a) => Boolean(a.slot_role));
}

export function extractFeedDirectorReportFromNodes(
  nodes: Array<{ task_type?: string; output_summary?: string | null; output_payload?: unknown }>,
): Record<string, unknown> | null {
  const node = nodes.find((n) => n.task_type === 'feed_cohesion_review');
  return nodeOutputObject(node);
}

function resolveArtifactSlotStatus(
  artifact: OutputArtifact,
  role: ProductionSlotRole,
): SlotDeliveryStatus {
  if (isBundleFailed(artifact)) return 'failed';
  const bundle = getProductionBundleStatus(artifact);
  if (bundle === 'rendering' || isBundleRendering(artifact)) return 'rendering';

  if (role.includes('reel')) {
    const video = resolveStoryVideoUrl(artifact);
    const url = String(artifact.contentUrl ?? '').trim();
    if (video || /\.(mp4|mov|webm)(\?|$)/i.test(url)) return 'ready';
    return 'missing';
  }

  if (role === 'campaign_story_motion' || (role.includes('story') && isProductionBundleStory(artifact))) {
    if (resolveStoryVideoUrl(artifact)) return 'ready';
    return 'missing';
  }

  if (role === 'designed_post') {
    const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
    if (meta.grafiker_pass === false) return 'failed';
    if (isBundleRendering(artifact)) return 'rendering';
    const url = String(artifact.contentUrl ?? '').trim();
    if (!url) return 'missing';
    const ref = String(meta.reference_photo_url ?? '').trim();
    if (ref && url === ref) return 'failed';
    return 'ready';
  }

  const url = String(artifact.contentUrl ?? '').trim();
  if (!url) return 'missing';
  return 'ready';
}

function resolveAiEnhanceFromArtifact(
  artifact: OutputArtifact | null,
  debugMode: boolean,
): Pick<MissionSlotChecklistItem, 'aiEnhanceStatus' | 'aiEnhanceLabel' | 'aiEnhanceSkipCode'> {
  if (!artifact) return {};
  const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
  const enabled = meta.ai_visual_standard_enabled !== false
    && meta.ai_enhance_attempted !== false;
  if (!enabled && !meta.ai_gallery_enhanced) {
    return {
      aiEnhanceStatus: 'off',
      aiEnhanceLabel: labelAiEnhanceStatus('off', null, debugMode),
    };
  }
  if (meta.ai_gallery_enhanced === true) {
    const vs = meta.ai_visual_standard as Record<string, unknown> | undefined;
    const adaptive = vs?.adaptive_scene === true || meta.ai_adaptive_scene === true;
    return {
      aiEnhanceStatus: 'applied',
      aiEnhanceLabel: adaptive
        ? (debugMode ? 'GPT adaptive scene uygulandı' : 'Sahne caption\'a uyarlandı')
        : labelAiEnhanceStatus('applied', null, debugMode),
    };
  }
  const rawSkip = String(meta.ai_enhance_skip_reason ?? '').trim();
  const skipCode = rawSkip as GptEnhanceSkipCode;
  const validCodes: GptEnhanceSkipCode[] = [
    'disabled', 'format_excluded', 'remotion_story', 'remotion_post', 'gallery_match_ok', 'stock_only',
  ];
  const code = validCodes.includes(skipCode) ? skipCode : undefined;
  if (meta.ai_enhance_api_failed) {
    return {
      aiEnhanceStatus: 'failed',
      aiEnhanceLabel: labelAiEnhanceStatus('failed', code, debugMode),
      ...(code ? { aiEnhanceSkipCode: code } : {}),
    };
  }
  return {
    aiEnhanceStatus: 'skipped',
    aiEnhanceLabel: labelAiEnhanceStatus('skipped', code ?? 'remotion_story', debugMode),
    ...(code ? { aiEnhanceSkipCode: code } : {}),
  };
}

function matchArtifactForAssignment(
  missionId: string,
  assignment: ProductionAssignment,
  artifacts: OutputArtifact[],
  usedIds: Set<string>,
): OutputArtifact | null {
  const role = assignment.slot_role;
  const ideaIdx = assignment.idea_index;

  const candidates = artifacts.filter((a) => {
    if (usedIds.has(a.id)) return false;
    if (parseArtifactMissionId(a) !== missionId) return false;
    const meta = (a.metadata ?? {}) as Record<string, unknown>;
    const content = parseArtifactContent(a.content);
    const metaIdx = meta.idea_index ?? content.idea_index;
    if (typeof ideaIdx === 'number' && ideaIdx >= 0 && typeof metaIdx === 'number') {
      if (metaIdx !== ideaIdx) return false;
      const artifactRole = artifactProductionRole(meta)
        ?? (String(meta.production_role ?? '') as ProductionSlotRole | null);
      if (!artifactRole || artifactRole === role) return true;
      if (role === 'organic_post' && artifactRole === 'organic_carousel') return true;
      if (role === 'campaign_story_motion' && isProductionBundleStory(a)) return true;
      if (role.includes('reel') && artifactRole.includes('reel')) return true;
      return false;
    }
    const artifactRole = artifactProductionRole(meta)
      ?? (String(meta.production_role ?? '') as ProductionSlotRole | null);
    if (artifactRole !== role) {
      if (role === 'organic_post' && artifactRole === 'organic_carousel') return true;
      if (role === 'campaign_story_motion' && isProductionBundleStory(a)) return true;
      return false;
    }
    return true;
  });

  if (!candidates.length) return null;
  candidates.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return candidates[0] ?? null;
}

export function buildMissionSlotChecklist(input: {
  missionId: string;
  missionType?: string;
  missionTitle?: string | null;
  assignments?: ProductionAssignment[] | unknown;
  artifacts: OutputArtifact[];
  /** Mission still running — unfilled slots show pending instead of missing */
  missionInFlight?: boolean;
  /** Operator UI — teknik enhance etiketleri */
  debugMode?: boolean;
}): MissionSlotChecklist {
  const debugMode = Boolean(input.debugMode);
  const assignments = Array.isArray(input.assignments)
    ? (input.assignments as ProductionAssignment[])
    : parseFdAssignments(input.assignments);

  const manifestType = inferManifestMissionType({
    missionType: input.missionType,
    title: input.missionTitle,
    assignments,
  });
  const manifest = buildMissionProductionManifest({
    missionId: input.missionId,
    missionType: manifestType,
    includeAds: manifestType === 'ads_focus',
  });
  const requiredRoles = new Set(
    manifest.slots.filter((s) => s.required).map((s) => s.role),
  );

  const missionArtifacts = input.artifacts.filter(
    (a) => parseArtifactMissionId(a) === input.missionId,
  );
  const usedIds = new Set<string>();
  const items: MissionSlotChecklistItem[] = [];

  if (assignments.length > 0) {
    assignments.forEach((assignment, assignmentIndex) => {
      const artifact = matchArtifactForAssignment(
        input.missionId,
        assignment,
        missionArtifacts,
        usedIds,
      );
      if (artifact) usedIds.add(artifact.id);

      let status: SlotDeliveryStatus = 'missing';
      if (artifact) {
        status = resolveArtifactSlotStatus(artifact, assignment.slot_role);
      } else if (input.missionInFlight) {
        status = 'pending';
      }

      const meta = (artifact?.metadata ?? {}) as Record<string, unknown>;
      const content = artifact ? parseArtifactContent(artifact.content) : {};
      const headline = String(
        meta.headline || content.headline || artifact?.title || '',
      ).trim() || null;

      items.push({
        assignmentIndex,
        ideaIndex: typeof assignment.idea_index === 'number' ? assignment.idea_index : null,
        role: assignment.slot_role,
        pipeline: assignment.pipeline,
        label: SLOT_ROLE_LABEL_TR[assignment.slot_role] ?? assignment.slot_role,
        required: requiredRoles.has(assignment.slot_role),
        status,
        artifactId: artifact?.id ?? null,
        headline,
        ...resolveAiEnhanceFromArtifact(artifact, debugMode),
      });
    });
  }

  // FD < 7 slot atasa bile manifest zorunlu rolleri göster (pending).
  const coveredRoles = new Set(items.map((i) => i.role));
  for (const slot of manifest.slots.filter((s) => s.required)) {
    if (coveredRoles.has(slot.role)) continue;
    items.push({
      assignmentIndex: items.length,
      ideaIndex: null,
      role: slot.role,
      pipeline: slot.pipeline,
      label: SLOT_ROLE_LABEL_TR[slot.role] ?? slot.role,
      required: true,
      status: input.missionInFlight ? 'pending' : 'missing',
      artifactId: null,
      headline: null,
    });
    coveredRoles.add(slot.role);
  }

  if (items.length === 0) {
    for (const slot of manifest.slots.filter((s) => s.required)) {
      const artifact = missionArtifacts.find((a) => {
        const role = artifactProductionRole((a.metadata ?? {}) as Record<string, unknown>);
        return role === slot.role && !usedIds.has(a.id);
      });
      if (artifact) usedIds.add(artifact.id);
      let status: SlotDeliveryStatus = artifact
        ? resolveArtifactSlotStatus(artifact, slot.role)
        : (input.missionInFlight ? 'pending' : 'missing');
      items.push({
        assignmentIndex: items.length,
        ideaIndex: null,
        role: slot.role,
        pipeline: slot.pipeline,
        label: SLOT_ROLE_LABEL_TR[slot.role] ?? slot.role,
        required: true,
        status,
        artifactId: artifact?.id ?? null,
        headline: artifact?.title ?? null,
      });
    }
  }

  const requiredItems = items.filter((i) => i.required);
  const requiredTotal = requiredItems.length || manifest.slots.filter((s) => s.required).length;
  const readyRequired = requiredItems.filter((i) => i.status === 'ready').length;
  const readyTotal = items.filter((i) => i.status === 'ready').length;
  const failedCount = items.filter((i) => i.status === 'failed').length;
  const renderingCount = items.filter((i) => i.status === 'rendering').length;
  const coveragePct = requiredTotal
    ? Math.round((readyRequired / requiredTotal) * 100)
    : (items.length ? Math.round((readyTotal / items.length) * 100) : 0);

  return {
    missionId: input.missionId,
    missionType: manifestType,
    items,
    requiredTotal,
    readyRequired,
    readyTotal,
    failedCount,
    renderingCount,
    coveragePct,
  };
}

export function formatSlotChecklistSummary(checklist: MissionSlotChecklist): string {
  if (checklist.requiredTotal > 0) {
    return `${checklist.readyRequired}/${checklist.requiredTotal} zorunlu slot hazır`;
  }
  return `${checklist.readyTotal}/${checklist.items.length} slot hazır`;
}
