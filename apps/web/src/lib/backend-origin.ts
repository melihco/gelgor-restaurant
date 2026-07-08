/** Normalize Render hostport (`smartagency-api:10000`) or bare host to http(s) base URL. */
export function normalizeBackendOrigin(raw: string | undefined, fallback = 'http://127.0.0.1:5050'): string {
  const value = (raw ?? '').trim() || fallback;
  const withScheme = value.includes('://') ? value : `http://${value}`;
  return withScheme.replace(/\/$/, '');
}

/** Server-side Nexus REST base (runtime env — works in Docker/Render without rebuild). */
export function resolveServerApiBaseUrl(): string {
  const internal = process.env.BACKEND_ORIGIN?.trim();
  // On Render/Railway, prefer private service hostport — avoids 502s during public API deploys.
  if (internal && (process.env.RENDER || process.env.RAILWAY_ENVIRONMENT)) {
    return normalizeBackendOrigin(internal);
  }
  const raw =
    process.env.NEXUS_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    internal ||
    undefined;
  return normalizeBackendOrigin(raw);
}

const LOCAL_BACKEND_RE = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/i;

/** True when the web app runs in a hosted environment but still points at localhost API. */
export function isHostedBackendMisconfigured(): boolean {
  const hosted =
    process.env.VERCEL === '1'
    || Boolean(process.env.RAILWAY_ENVIRONMENT)
    || Boolean(process.env.RENDER)
    || process.env.NODE_ENV === 'production';
  if (!hosted) return false;
  return LOCAL_BACKEND_RE.test(resolveServerApiBaseUrl());
}

export function resolveServerSignalrBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SIGNALR_URL || process.env.NEXUS_API_URL || process.env.NEXT_PUBLIC_API_URL;
  return normalizeBackendOrigin(raw, resolveServerApiBaseUrl());
}
