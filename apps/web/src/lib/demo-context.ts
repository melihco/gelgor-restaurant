/**
 * Demo tenant header injection — local/dev only.
 *
 * NEXT_PUBLIC_USE_DEMO_CONTEXT must never affect production builds even if
 * mis-set on Render/Vercel (MT-5). Mirrors platform-admin-auth prod guard.
 */

export function isProductionRuntime(): boolean {
  return (
    process.env.NODE_ENV === 'production'
    || process.env.VERCEL_ENV === 'production'
    || process.env.APP_ENV === 'production'
  );
}

/** True only when demo headers are allowed (non-production + env flag). */
export function isDemoContextEnabled(): boolean {
  if (isProductionRuntime()) return false;
  return process.env.NEXT_PUBLIC_USE_DEMO_CONTEXT === 'true';
}
