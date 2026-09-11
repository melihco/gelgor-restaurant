'use client';

import type { CSSProperties } from 'react';

const stroke = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function IgChevronLeft({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M15.5 19.5 8 12l7.5-7.5" {...stroke} strokeWidth="2.2" />
    </svg>
  );
}

export function IgCloseX({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" {...stroke} strokeWidth="2.2" />
    </svg>
  );
}

export function IgMoreDots({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
    </svg>
  );
}

export function IgHeart({
  size = 28,
  filled = false,
}: {
  size?: number;
  filled?: boolean;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
        fill={filled ? '#FF3040' : 'none'}
        stroke={filled ? '#FF3040' : 'currentColor'}
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IgComment({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M21 11.5a8.4 8.4 0 0 1-8.5 8.4c-1.3 0-2.6-.3-3.7-.8L3.5 21l1.9-4.3A8.3 8.3 0 1 1 21 11.5z"
        {...stroke}
      />
    </svg>
  );
}

export function IgPaperPlane({ size = 25 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M22 2 11 13" {...stroke} />
      <path d="M22 2 15 22l-4-9-9-4 20-7z" {...stroke} />
    </svg>
  );
}

export function IgBookmark({
  size = 24,
  filled = false,
}: {
  size?: number;
  filled?: boolean;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5v16L12 16.8 6 20.5v-16z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IgCamera({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h2.1l1.2-1.8h4.4L15.4 6h2.1A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8z" {...stroke} />
      <circle cx="12" cy="12.2" r="3.1" {...stroke} />
    </svg>
  );
}

export function IgAudioDisc({
  size = 44,
  spinning = false,
  coverUrl,
}: {
  size?: number;
  spinning?: boolean;
  coverUrl?: string;
}) {
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.35)',
        background: '#111',
        overflow: 'hidden',
        position: 'relative',
        boxShadow: '0 2px 10px rgba(0,0,0,0.45)',
        animation: spinning ? 'saReelDisc 4.5s linear infinite' : undefined,
      }}
    >
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{
          width: '100%', height: '100%',
          background: 'conic-gradient(from 90deg, #222, #666, #222)',
        }} />
      )}
      <div style={{
        position: 'absolute',
        inset: '36%',
        borderRadius: '50%',
        background: '#0a0a0a',
        border: '1.5px solid rgba(255,255,255,0.35)',
      }} />
    </div>
  );
}

export const igIconHit: CSSProperties = {
  width: 44,
  height: 44,
  minWidth: 44,
  minHeight: 44,
  padding: 0,
  border: 'none',
  background: 'transparent',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  flexShrink: 0,
};
