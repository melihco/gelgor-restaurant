'use client';

import { useState } from 'react';
import { resolveClientMediaUrl } from '@/lib/media-url';

export function BrandLogoAvatar({
  logoUrl,
  brandName,
  size,
  borderRadius = '50%',
}: {
  logoUrl?: string | null;
  brandName?: string;
  size: number;
  borderRadius?: string | number;
}) {
  const [failed, setFailed] = useState(false);
  const resolved = logoUrl ? (resolveClientMediaUrl(logoUrl) ?? logoUrl) : null;
  const initials = (brandName?.trim() || 'M').slice(0, 2).toUpperCase();

  if (resolved && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolved}
        alt=""
        onError={() => setFailed(true)}
        style={{
          width: size,
          height: size,
          objectFit: 'contain',
          objectPosition: 'center center',
          display: 'block',
          borderRadius,
        }}
      />
    );
  }

  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, rgba(77,112,136,0.35), rgba(157,190,206,0.2))',
        color: 'rgba(248,250,252,0.92)',
        fontSize: Math.max(10, size * 0.34),
        fontWeight: 800,
        letterSpacing: '-0.02em',
      }}
    >
      {initials}
    </div>
  );
}
