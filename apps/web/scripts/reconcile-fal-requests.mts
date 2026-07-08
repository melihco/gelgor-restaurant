#!/usr/bin/env npx tsx
/**
 * Reconcile fal.ai dashboard request IDs against Nexus artifacts.
 *
 * Usage (from apps/web):
 *   npx tsx scripts/reconcile-fal-requests.mts \
 *     --tenant 431b2901-a2dc-4df6-abe3-3670d9844851 \
 *     --requests "ideogram/v4:abc-123,fal-ai/kling-video/v1.6/pro/image-to-video:def-456"
 *
 * Optional:
 *   --mission 813654cc-fb4f-44e9-aaee-96d042846d91
 *   --nexus http://localhost:5050
 *   --file ./fal-ids.txt   # one "model:requestId" per line
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  artifactContainsMediaUrl,
  fetchFalQueueRequest,
} from '../src/lib/fal-request-tracker';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');

function loadEnvLocal(): void {
  const envPath = path.join(webRoot, '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    let val = trimmed.slice(eq + 1);
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

interface ParsedRequest {
  model: string;
  requestId: string;
}

interface NexusArtifact {
  id: string;
  title?: string;
  contentUrl?: string;
  status?: string;
  createdAt?: string;
  metadata?: unknown;
  content?: unknown;
}

function parseArgs(argv: string[]): {
  tenantId: string;
  missionId?: string;
  nexusBase: string;
  requests: ParsedRequest[];
} {
  let tenantId = '';
  let missionId: string | undefined;
  let nexusBase = process.env.NEXUS_API_URL || 'http://localhost:5050';
  let requestsRaw = '';
  let filePath = '';

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--tenant') tenantId = argv[++i] ?? '';
    else if (arg === '--mission') missionId = argv[++i];
    else if (arg === '--nexus') nexusBase = argv[++i] ?? nexusBase;
    else if (arg === '--requests') requestsRaw = argv[++i] ?? '';
    else if (arg === '--file') filePath = argv[++i] ?? '';
  }

  const lines: string[] = [];
  if (requestsRaw) lines.push(...requestsRaw.split(',').map((s) => s.trim()).filter(Boolean));
  if (filePath) {
    lines.push(
      ...fs.readFileSync(filePath, 'utf8')
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith('#')),
    );
  }

  const requests = lines.map((line) => {
    const sep = line.lastIndexOf(':');
    if (sep <= 0) throw new Error(`Invalid request spec "${line}" — use model:requestId`);
    return {
      model: line.slice(0, sep).trim(),
      requestId: line.slice(sep + 1).trim(),
    };
  });

  if (!tenantId) throw new Error('--tenant is required');
  if (!requests.length) throw new Error('Pass --requests or --file with model:requestId entries');

  return { tenantId, missionId, nexusBase, requests };
}

function parseMeta(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return typeof parsed === 'object' && parsed ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' && raw ? raw as Record<string, unknown> : {};
}

async function fetchArtifacts(nexusBase: string, tenantId: string): Promise<NexusArtifact[]> {
  const res = await fetch(`${nexusBase.replace(/\/$/, '')}/api/artifacts?limit=200`, {
    headers: { 'X-Tenant-Id': tenantId },
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`Nexus artifacts ${res.status}`);
  const data = await res.json() as NexusArtifact[] | { items?: NexusArtifact[] };
  return Array.isArray(data) ? data : (data.items ?? []);
}

async function main(): Promise<void> {
  const { tenantId, missionId, nexusBase, requests } = parseArgs(process.argv.slice(2));
  const apiKey = process.env.FAL_API_KEY?.trim();
  if (!apiKey) throw new Error('FAL_API_KEY missing in apps/web/.env.local');

  console.log(`Tenant: ${tenantId}`);
  if (missionId) console.log(`Mission filter: ${missionId}`);
  console.log(`Nexus: ${nexusBase}`);
  console.log(`Requests to check: ${requests.length}\n`);

  const artifacts = await fetchArtifacts(nexusBase, tenantId);
  const scopedArtifacts = missionId
    ? artifacts.filter((a) => {
        const meta = parseMeta(a.metadata);
        const mid = String(meta.mission_id ?? meta.missionId ?? '');
        return mid === missionId;
      })
    : artifacts;

  console.log(`Artifacts loaded: ${artifacts.length} (scope: ${scopedArtifacts.length})\n`);

  for (const req of requests) {
    console.log('─'.repeat(72));
    console.log(`model:     ${req.model}`);
    console.log(`requestId: ${req.requestId}`);

    try {
      const fal = await fetchFalQueueRequest(req.model, req.requestId, apiKey);
      console.log(`fal status: ${fal.status}`);
      if (fal.error) console.log(`fal error:  ${fal.error}`);
      if (fal.outputUrls.length === 0) {
        console.log('outputs:   (none yet)');
        console.log('verdict:   PENDING or FAILED on fal.ai');
        continue;
      }

      console.log('outputs:');
      for (const url of fal.outputUrls) console.log(`  - ${url.slice(0, 120)}`);

      const matches = scopedArtifacts.filter((artifact) =>
        fal.outputUrls.some((url) => artifactContainsMediaUrl(artifact, url)),
      );

      if (matches.length === 0) {
        const globalMatches = artifacts.filter((artifact) =>
          fal.outputUrls.some((url) => artifactContainsMediaUrl(artifact, url)),
        );
        if (globalMatches.length > 0) {
          console.log('verdict:   ORPHAN for mission scope — matched other artifact(s):');
          for (const m of globalMatches.slice(0, 5)) {
            const meta = parseMeta(m.metadata);
            console.log(`  artifact ${m.id} mission=${String(meta.mission_id ?? meta.missionId ?? 'n/a').slice(0, 8)} title="${(m.title ?? '').slice(0, 40)}"`);
          }
        } else {
          console.log('verdict:   ORPHAN — fal output not found in Nexus artifacts');
          console.log('hint:      downstream failed after fal (gallery mirror, grafiker, persist) or retry discard');
        }
        continue;
      }

      console.log(`verdict:   LINKED — ${matches.length} artifact(s)`);
      for (const m of matches.slice(0, 5)) {
        const meta = parseMeta(m.metadata);
        const tracked = Array.isArray(meta.fal_requests)
          ? (meta.fal_requests as Array<{ requestId?: string }>).some((r) => r.requestId === req.requestId)
          : false;
        console.log(
          `  artifact ${m.id} title="${(m.title ?? '').slice(0, 40)}" `
          + `tracked=${tracked ? 'yes' : 'no (pre-tracking run)'}`,
        );
      }
    } catch (err) {
      console.log(`verdict:   LOOKUP FAILED — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
