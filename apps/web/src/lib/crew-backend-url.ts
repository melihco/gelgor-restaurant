import { serverConfig } from './server-config';

/**
 * Python crew backend base URL for server-side BFF routes.
 * Prefer 127.0.0.1 over localhost — on macOS, localhost can resolve to ::1 while uvicorn binds IPv4 only.
 *
 * Thin wrapper over {@link serverConfig.crewBackend.baseUrl}; kept for the many
 * existing call sites that import this helper.
 */
export function getCrewBackendBaseUrl(): string {
  return serverConfig.crewBackend.baseUrl;
}
