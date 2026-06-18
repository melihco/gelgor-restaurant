'use client';

/** Instagram-style feed placeholder while artifacts load. */
export function FeedLoadingSkeleton({
  includeHeader = false,
  message = 'İçerikler yükleniyor…',
}: {
  includeHeader?: boolean;
  message?: string;
}) {
  return (
    <div className="feed-skel" role="status" aria-live="polite" aria-label={message}>
      {includeHeader && (
        <div className="feed-skel-header">
          <div className="feed-skel-header-spacer" aria-hidden />
          <div className="feed-skel-header-logo">Instagram</div>
          <div className="feed-skel-header-icons" aria-hidden>
            <div className="feed-skel-icon" />
            <div className="feed-skel-icon" />
          </div>
        </div>
      )}

      <div className="feed-skel-stories" aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="feed-skel-story">
            <div className="feed-skel-story-ring">
              <div className="feed-skel-story-avatar feed-skel-shimmer" />
            </div>
            <div className="feed-skel-story-label feed-skel-shimmer" />
          </div>
        ))}
      </div>

      {Array.from({ length: 2 }).map((_, i) => (
        <article key={i} className="feed-skel-post" aria-hidden>
          <div className="feed-skel-post-head">
            <div className="feed-skel-avatar feed-skel-shimmer" />
            <div className="feed-skel-post-meta">
              <div className="feed-skel-line feed-skel-line--md feed-skel-shimmer" />
              <div className="feed-skel-line feed-skel-line--sm feed-skel-shimmer" />
            </div>
          </div>
          <div className="feed-skel-media feed-skel-shimmer" />
          <div className="feed-skel-actions">
            <div className="feed-skel-action feed-skel-shimmer" />
            <div className="feed-skel-action feed-skel-shimmer" />
            <div className="feed-skel-action feed-skel-shimmer" />
          </div>
          <div className="feed-skel-caption">
            <div className="feed-skel-line feed-skel-line--lg feed-skel-shimmer" />
            <div className="feed-skel-line feed-skel-line--md feed-skel-shimmer" />
          </div>
        </article>
      ))}

      <p className="feed-skel-message">{message}</p>
    </div>
  );
}
