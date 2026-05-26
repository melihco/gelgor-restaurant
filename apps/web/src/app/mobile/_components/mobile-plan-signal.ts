import type { ArtifactIdea, ArtifactSignal } from '@/components/artifacts/artifact-preview';
import type { ResolvedArtifact } from './artifact-utils';

/** Map resolveArtifact slot → desktop ArtifactIdea shape */
function resolvedIdeaToArtifactIdea(r: ResolvedArtifact['ideas'][number]): ArtifactIdea {
  return {
    headline: r.headline ?? undefined,
    title: r.headline ?? undefined,
    caption: r.caption ?? undefined,
    hashtags: r.hashtags?.length ? r.hashtags : undefined,
    imageUrl: r.imageUrl ?? undefined,
    cta: r.cta ?? undefined,
    contentType: r.contentType,
    postingTime: r.postingTime ?? undefined,
  };
}

/**
 * Mobile approval uses `resolveArtifact()` for useRichPlanPreview, but `MobileArtifactView`
 * only saw `signalFromArtifact()` — if the latter misses ideas/media, the plan preview was empty.
 * Merge resolved slots into the normalized signal (ideas + top-level media + text).
 */
export function mergeMobilePlanSignal(
  signal: ArtifactSignal,
  resolved: ResolvedArtifact | null | undefined,
): ArtifactSignal {
  if (!resolved?.ideas?.length) return signal;

  const fromResolved = resolved.ideas.map(resolvedIdeaToArtifactIdea);
  let ideas = signal.ideas ?? [];

  if (ideas.length === 0) {
    ideas = fromResolved;
  } else {
    ideas = ideas.map((idea, i) => {
      const r = fromResolved[i];
      if (!r) return idea;
      const img = idea.imageUrl?.trim();
      const cap = idea.caption?.trim();
      const head = idea.headline?.trim() || idea.title?.trim();
      return {
        ...idea,
        imageUrl: img || r.imageUrl || idea.imageUrl,
        caption: cap || r.caption || idea.caption,
        headline: head || r.headline || idea.headline,
        title: idea.title?.trim() || r.headline || idea.title,
        hashtags: idea.hashtags?.length ? idea.hashtags : r.hashtags?.length ? r.hashtags : idea.hashtags,
        contentType: idea.contentType ?? r.contentType,
        postingTime: idea.postingTime ?? r.postingTime,
      };
    });
  }

  let kind = signal.kind;
  if (ideas.length > 0 && kind === 'generic' && /calendar|plan|ideation/i.test(`${signal.title} ${signal.usageContext ?? ''}`)) {
    kind = 'instagram_plan';
  }

  return {
    ...signal,
    kind,
    ideas,
    imageUrl: signal.imageUrl ?? resolved.imageUrl ?? null,
    videoUrl: signal.videoUrl ?? resolved.videoUrl ?? null,
    caption: signal.caption ?? resolved.caption ?? undefined,
    summary: signal.summary ?? resolved.summary ?? resolved.headline ?? undefined,
  };
}
