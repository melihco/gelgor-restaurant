'use client';

import React, { useMemo, useState } from 'react';

type Props = {
  src: string | null | undefined;
  fallbacks?: Array<string | null | undefined>;
  alt?: string;
  style?: React.CSSProperties;
  className?: string;
  placeholder?: React.ReactNode;
};

/** Tries primary src then fallbacks on load error — avoids broken-image icon in Feed/Story UI. */
export function SafeCoverImage({
  src,
  fallbacks = [],
  alt = '',
  style,
  className,
  placeholder,
}: Props) {
  const candidates = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const u of [src, ...fallbacks]) {
      const t = (u ?? '').trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
    return out;
  }, [src, fallbacks]);

  const [idx, setIdx] = useState(0);
  const current = candidates[idx];

  if (!current) {
    return (
      <div className={className} style={{ ...style, background: '#111' }}>
        {placeholder ?? null}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={current}
      alt={alt}
      referrerPolicy="no-referrer"
      className={className}
      style={style}
      onError={() => {
        setIdx((i) => (i + 1 < candidates.length ? i + 1 : i));
      }}
    />
  );
}
