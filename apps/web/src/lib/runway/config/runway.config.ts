/**
 * Runway API Configuration
 *
 * Reads all Runway-related environment variables, validates them,
 * and exports a frozen config object used across the Runway module.
 *
 * Environment variables (set in .env.local):
 *   RUNWAY_API_SECRET         — your Runway developer API key (required)
 *   RUNWAY_MODEL              — model slug, default: gen4.5
 *   RUNWAY_API_VERSION        — API version header, default: 2024-11-06
 *   RUNWAY_DEFAULT_DURATION   — 5 | 10, default: 10
 *   RUNWAY_DEFAULT_RATIO      — portrait ratio, default: 720:1280
 *   RUNWAY_TIMEOUT_MS         — polling/wait timeout in ms, default: 120000
 */

import type { ReelDuration, ReelRatio } from '../types/reel.types';

export interface RunwayConfig {
  /** Runway API secret key */
  readonly apiSecret: string;

  /** Model slug used for generation */
  readonly model: string;

  /** API version header value */
  readonly apiVersion: string;

  /** Default video duration (5 or 10 seconds) */
  readonly defaultDuration: ReelDuration;

  /** Default output ratio */
  readonly defaultRatio: ReelRatio;

  /** Timeout in ms for waiting on task completion */
  readonly timeoutMs: number;

  /** Base URL for the Runway API */
  readonly baseUrl: string;
}

const VALID_DURATIONS: ReelDuration[] = [5, 10];
const VALID_RATIOS: ReelRatio[] = ['720:1280', '832:1104', '672:1584'];

function parseDuration(raw: string | undefined): ReelDuration {
  const n = Number(raw);
  if (VALID_DURATIONS.includes(n as ReelDuration)) {
    return n as ReelDuration;
  }
  return 10;
}

function parseRatio(raw: string | undefined): ReelRatio {
  // Accept user-friendly "9:16" and map to correct Runway format
  if (raw === '9:16') return '720:1280';
  if (VALID_RATIOS.includes(raw as ReelRatio)) {
    return raw as ReelRatio;
  }
  return '720:1280';
}

/**
 * Returns the resolved Runway config.
 * Throws if RUNWAY_API_SECRET is missing (in non-test environments).
 */
export function getRunwayConfig(): RunwayConfig {
  const apiSecret =
    process.env.RUNWAY_API_SECRET ??
    process.env.RUNWAYML_API_SECRET ?? // also accept the SDK's default env var name
    '';

  if (!apiSecret && process.env.NODE_ENV !== 'test') {
    throw new Error(
      '[Runway] RUNWAY_API_SECRET is not set. ' +
        'Add it to your .env.local file. ' +
        'Get your key at https://dev.runwayml.com',
    );
  }

  return Object.freeze({
    apiSecret,
    model: process.env.RUNWAY_MODEL ?? 'gen4.5',
    apiVersion: process.env.RUNWAY_API_VERSION ?? '2024-11-06',
    defaultDuration: parseDuration(process.env.RUNWAY_DEFAULT_DURATION),
    defaultRatio: parseRatio(process.env.RUNWAY_DEFAULT_RATIO),
    timeoutMs: Number(process.env.RUNWAY_TIMEOUT_MS ?? 120_000),
    baseUrl: 'https://api.dev.runwayml.com/v1',
  });
}

/**
 * Validates the config at module load time in server contexts.
 * Call this in your service constructor to fail fast.
 */
export function assertRunwayConfigValid(config: RunwayConfig): void {
  if (!config.apiSecret) {
    throw new Error('[Runway] Missing API secret. Cannot initialize service.');
  }
  if (!VALID_DURATIONS.includes(config.defaultDuration)) {
    throw new Error(
      `[Runway] Invalid default duration: ${config.defaultDuration}. Must be 5 or 10.`,
    );
  }
  if (!VALID_RATIOS.includes(config.defaultRatio)) {
    throw new Error(
      `[Runway] Invalid default ratio: ${config.defaultRatio}. ` +
        `Must be one of: ${VALID_RATIOS.join(', ')}`,
    );
  }
}
