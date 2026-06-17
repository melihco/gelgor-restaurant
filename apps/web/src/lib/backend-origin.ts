/** Normalize Render hostport (`smartagency-api:10000`) or bare host to http(s) base URL. */
export function normalizeBackendOrigin(raw: string | undefined, fallback = 'http://127.0.0.1:5050'): string {
  const value = (raw ?? '').trim() || fallback;
  const withScheme = value.includes('://') ? value : `http://${value}`;
  return withScheme.replace(/\/$/, '');
}

/** Server-side Nexus REST base (runtime env — works in Docker/Render without rebuild). */
export function resolveServerApiBaseUrl(): string {
  const raw =
    process.env.NEXUS_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.BACKEND_ORIGIN ||
    undefined;
  return normalizeBackendOrigin(raw);
}

export function resolveServerSignalrBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SIGNALR_URL || process.env.NEXUS_API_URL || process.env.NEXT_PUBLIC_API_URL;
  return normalizeBackendOrigin(raw, resolveServerApiBaseUrl());
}
