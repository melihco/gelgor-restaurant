import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { API_BASE_URL, getRequestContextHeaders } from '@/lib/runtime-config';

const CANVA_AUTHORIZE_URL = 'https://www.canva.com/api/oauth/authorize';
const CANVA_TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token';
const TOKEN_REFRESH_SKEW_MS = 60_000;
const DEFAULT_CANVA_SCOPES = [
  'asset:read',
  'asset:write',
  'brandtemplate:content:read',
  'brandtemplate:meta:read',
  'design:content:read',
  'design:content:write',
  'design:meta:read',
  'profile:read',
].join(' ');

interface CanvaOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
}

interface CanvaTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

interface StoredCanvaToken extends CanvaTokenResponse {
  expires_at: number;
}

/** Next dev serves HTTP; `https://localhost` causes ERR_SSL_PROTOCOL_ERROR after OAuth. */
export function normalizePublicAppOrigin(origin: string): string {
  try {
    const u = new URL(origin);
    const h = u.hostname.toLowerCase();
    const loopback =
      h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.localhost');
    if (loopback && u.protocol === 'https:') {
      u.protocol = 'http:';
      return u.origin;
    }
  } catch {
    /* keep origin */
  }
  return origin;
}

function resolveCanvaRedirectUri(origin?: string): string | undefined {
  const envUri = process.env.CANVA_REDIRECT_URI?.trim();
  const useEnvOnly =
    process.env.CANVA_REDIRECT_URI_USE_ENV === '1' ||
    process.env.CANVA_REDIRECT_URI_USE_ENV === 'true';

  if (useEnvOnly && envUri) return envUri;

  /** When the UI is opened via ngrok/preview URL, `origin` is that host; set this to force localhost (must match Canva portal). */
  const publicRedirect = process.env.CANVA_OAUTH_PUBLIC_REDIRECT_URI?.trim();
  if (publicRedirect) return publicRedirect;

  if (origin) {
    const base = origin.replace(/\/$/, '');
    return `${base}/api/canva/oauth/callback`;
  }
  if (envUri) return envUri;
  const appOrigin = process.env.CANVA_APP_ORIGIN?.trim();
  if (appOrigin) return `${appOrigin.replace(/\/$/, '')}/api/canva/oauth/callback`;
  return undefined;
}

export function getCanvaOAuthConfig(origin?: string): CanvaOAuthConfig {
  const clientId = process.env.CANVA_CLIENT_ID;
  const clientSecret = process.env.CANVA_CLIENT_SECRET;
  const redirectUri = resolveCanvaRedirectUri(origin);

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'CANVA_CLIENT_ID and CANVA_CLIENT_SECRET must be set. Set CANVA_REDIRECT_URI (and optional CANVA_APP_ORIGIN) for server-only flows, or use CANVA_REDIRECT_URI_USE_ENV=true to force CANVA_REDIRECT_URI for browser OAuth.',
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes: process.env.CANVA_SCOPES ?? DEFAULT_CANVA_SCOPES,
  };
}

/** Prefer the host that initiated the request (e.g. OAuth callback) so post-login redirect matches the browser. */
export function getCanvaAppOrigin(fallbackOrigin?: string): string {
  const raw = fallbackOrigin ?? process.env.CANVA_APP_ORIGIN ?? redirectOriginFromEnv() ?? 'http://localhost:3000';
  return normalizePublicAppOrigin(raw);
}

function redirectOriginFromEnv(): string | undefined {
  const u = process.env.CANVA_REDIRECT_URI?.trim();
  if (!u) return undefined;
  try {
    return new URL(u).origin;
  } catch {
    return undefined;
  }
}

export function createCanvaOAuthState() {
  const codeVerifier = base64Url(randomBytes(64));
  const codeChallenge = base64Url(createHash('sha256').update(codeVerifier).digest());
  const state = base64Url(randomBytes(32));

  return { codeVerifier, codeChallenge, state };
}

export function buildCanvaAuthorizeUrl(config: CanvaOAuthConfig, state: string, codeChallenge: string): string {
  const url = new URL(CANVA_AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('scope', config.scopes);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 's256');
  return url.toString();
}

export async function exchangeCanvaCodeForToken(code: string, codeVerifier: string, config: CanvaOAuthConfig) {
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    redirect_uri: config.redirectUri,
  });

  return requestCanvaToken(form, config);
}

export async function getCanvaAccessToken(): Promise<string | null> {
  if (process.env.CANVA_ACCESS_TOKEN) return process.env.CANVA_ACCESS_TOKEN;

  try {
    if (useNexusTokenStorage()) {
      const stored = await readNexusCanvaToken();
      if (!stored) return null;
      if (stored.expires_at > Date.now() + TOKEN_REFRESH_SKEW_MS) {
        return stored.access_token;
      }
      if (!stored.refresh_token) return null;
      const refreshed = await refreshCanvaToken(stored.refresh_token, getCanvaOAuthConfig());
      await saveCanvaToken(refreshed);
      return refreshed.access_token;
    }

    const stored = await readStoredCanvaToken();
    if (!stored) return null;

    if (stored.expires_at > Date.now() + TOKEN_REFRESH_SKEW_MS) {
      return stored.access_token;
    }

    if (!stored.refresh_token) return null;

    const config = getCanvaOAuthConfig();
    const refreshed = await refreshCanvaToken(stored.refresh_token, config);
    await saveCanvaToken(refreshed);
    return refreshed.access_token;
  } catch {
    return null;
  }
}

export async function saveCanvaToken(token: CanvaTokenResponse) {
  if (useNexusTokenStorage()) {
    await saveNexusCanvaToken(token);
    return;
  }

  const stored: StoredCanvaToken = {
    ...token,
    expires_at: Date.now() + token.expires_in * 1000,
  };
  const tokenPath = getCanvaTokenPath();
  await mkdir(path.dirname(tokenPath), { recursive: true });
  await writeFile(tokenPath, JSON.stringify(stored, null, 2), { mode: 0o600 });
}

async function refreshCanvaToken(refreshToken: string, config: CanvaOAuthConfig) {
  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  return requestCanvaToken(form, config);
}

async function requestCanvaToken(form: URLSearchParams, config: CanvaOAuthConfig): Promise<CanvaTokenResponse> {
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const response = await fetch(CANVA_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Canva OAuth ${response.status}: ${detail.slice(0, 500)}`);
  }

  return response.json() as Promise<CanvaTokenResponse>;
}

async function readStoredCanvaToken(): Promise<StoredCanvaToken | null> {
  try {
    const raw = await readFile(getCanvaTokenPath(), 'utf8');
    const parsed = JSON.parse(raw) as StoredCanvaToken;
    return parsed.access_token ? parsed : null;
  } catch {
    return null;
  }
}

function getCanvaTokenPath() {
  return process.env.CANVA_TOKEN_PATH ?? path.join(process.cwd(), '.canva-token.json');
}

function useNexusTokenStorage() {
  return process.env.CANVA_TOKEN_STORAGE?.toLowerCase() === 'nexus';
}

async function readNexusCanvaToken(): Promise<StoredCanvaToken | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/integrations/canva/token`, {
      headers: getRequestContextHeaders(),
    });
    if (!response.ok) return null;
    const data = await response.json() as {
      accessToken?: string;
      refreshToken?: string;
      tokenType?: string;
      expiresAt?: string;
      scope?: string;
    };
    if (!data.accessToken) return null;
    return {
      access_token: data.accessToken,
      refresh_token: data.refreshToken,
      token_type: data.tokenType ?? 'Bearer',
      expires_in: 0,
      scope: data.scope,
      expires_at: data.expiresAt ? new Date(data.expiresAt).getTime() : Date.now(),
    };
  } catch {
    return null;
  }
}

async function saveNexusCanvaToken(token: CanvaTokenResponse) {
  const response = await fetch(`${API_BASE_URL}/api/integrations/canva/token`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getRequestContextHeaders(),
    },
    body: JSON.stringify({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresIn: token.expires_in,
      scope: token.scope,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Canva token storage failed ${response.status}: ${detail.slice(0, 500)}`);
  }
}

function base64Url(value: Buffer) {
  return value.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
