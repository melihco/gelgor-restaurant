/**
 * Python crew backend base URL for server-side BFF routes.
 * Prefer 127.0.0.1 over localhost — on macOS, localhost can resolve to ::1 while uvicorn binds IPv4 only.
 */
export function getCrewBackendBaseUrl(): string {
  const raw = process.env.CREW_BACKEND_URL?.trim() || 'http://127.0.0.1:8000';
  return raw.replace(/\/$/, '').replace('://localhost', '://127.0.0.1');
}
