/**
 * UI view-models for Akış consumer experience.
 * Adapts OutputArtifact metadata — does not replace backend contracts.
 */

export type FeedMediaType = 'image' | 'video' | 'carousel_image';

export interface FeedMediaItem {
  id: string;
  type: FeedMediaType;
  url: string;
  thumbnailUrl?: string | null;
  width?: number | null;
  height?: number | null;
  aspectRatio?: number | null;
  duration?: number | null;
  altText?: string;
}

export interface FeedEngagementState {
  likeCount: number;
  commentCount: number;
  shareCount: number;
  isLiked: boolean;
  isSaved: boolean;
}

export interface FeedComment {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  isOwn?: boolean;
}

export interface FeedShareTarget {
  id: string;
  label: string;
  handle?: string;
  avatarUrl?: string | null;
}

/** Stable seed from id — deterministic fake engagement until backend exists. */
export function hashSeed(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function defaultEngagementForId(id: string): FeedEngagementState {
  const seed = hashSeed(id);
  return {
    likeCount: 120 + (seed % 4800),
    commentCount: 4 + (seed % 180),
    shareCount: 2 + (seed % 90),
    isLiked: false,
    isSaved: false,
  };
}
