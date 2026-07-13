'use client';

import React, { useEffect, useState } from 'react';

export function DoubleTapHeart({ visible }: { visible: boolean }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setShow(true);
    const t = window.setTimeout(() => setShow(false), 700);
    return () => window.clearTimeout(t);
  }, [visible]);

  if (!show) return null;

  return (
    <div
      aria-hidden
      className="sa-double-tap-heart"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 40,
      }}
    >
      <svg
        width="88"
        height="88"
        viewBox="0 0 24 24"
        fill="#fff"
        style={{
          filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.45))',
          animation: 'saHeartPop 700ms cubic-bezier(0.22,1,0.36,1) both',
        }}
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </div>
  );
}
