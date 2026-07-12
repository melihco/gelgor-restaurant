/**
 * Load apps/web/.env.local into process.env for standalone worker scripts.
 * Next.js loads this automatically; tsx workers do not.
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

function envFileCandidates(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    resolve(process.cwd(), '.env.local'),
    resolve(here, '../../.env.local'),
  ];
}

export function loadLocalEnv(): void {
  const envPath = envFileCandidates().find((p) => existsSync(p));
  if (!envPath) return;

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
