'use client';

import { useEffect } from 'react';

function isBenignDomRejection(reason: unknown): boolean {
  if (typeof reason === 'undefined' || reason === null) return true;
  if (typeof Event !== 'undefined' && reason instanceof Event) return true;
  if (typeof ProgressEvent !== 'undefined' && reason instanceof ProgressEvent) return true;
  return false;
}

/**
 * Dev-only: Next.js overlay shows "[object Event]" for script/img load failures
 * and some webpack HMR rejections that are not real Error instances.
 */
export function DevRuntimeGuards() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    const onRejection = (ev: PromiseRejectionEvent) => {
      if (!isBenignDomRejection(ev.reason)) return;
      ev.preventDefault();
      console.debug('[dev] Ignored non-Error rejection (resource/HMR):', ev.reason);
    };

    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, []);

  return null;
}
