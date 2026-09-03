/**
 * When house identity (font / palette / vibe / logo treatment) changes,
 * stamp library shells stale and queue a background regen if none is in flight.
 */

import { after } from 'next/server';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import { invalidateDesignTemplateCache } from '@/lib/brand-design-template-matcher';
import {
  getDesignTemplateJobStatusByWorkspace,
  isDesignTemplateJobInFlight,
  setDesignTemplateJobStatus,
} from '@/lib/design-template-job-status';
import type { HouseIdentityField } from '@/lib/house-style-fidelity';

export interface StaleTemplateStampResult {
  stamped: number;
  fields: HouseIdentityField[];
}

export async function stampDesignTemplatesStale(
  workspaceId: string,
  fields: HouseIdentityField[],
): Promise<StaleTemplateStampResult> {
  if (!fields.length) return { stamped: 0, fields };
  const list = await fetchCrewBackendJson<Array<{
    id: string;
    design_spec?: Record<string, unknown>;
    status?: string;
  }>>(
    `/api/v1/design-templates/${workspaceId}`,
    { workspaceId, timeoutMs: 15_000 },
  );
  if (!list.ok || !Array.isArray(list.data)) return { stamped: 0, fields };

  const now = new Date().toISOString();
  const actives = list.data.filter((row) => String(row.status ?? 'active') !== 'archived');
  let stamped = 0;
  await Promise.all(actives.slice(0, 24).map(async (row) => {
    const spec = row.design_spec && typeof row.design_spec === 'object'
      ? { ...row.design_spec }
      : {};
    spec.stale = true;
    spec.stale_reason = 'house_identity';
    spec.stale_at = now;
    spec.stale_fields = fields;
    const patch = await fetchCrewBackendJson(
      `/api/v1/design-templates/${workspaceId}/${row.id}`,
      {
        workspaceId,
        method: 'PATCH',
        timeoutMs: 10_000,
        body: { design_spec: spec },
      },
    );
    if (patch.ok) stamped += 1;
  }));
  if (stamped > 0) invalidateDesignTemplateCache(workspaceId);
  return { stamped, fields };
}

/**
 * Stamp stale then regenerate. Safe to call from `after()` — does not nest after().
 */
export async function runDesignTemplateIdentityRegen(
  workspaceId: string,
  fields: HouseIdentityField[],
): Promise<{ queued: boolean; reused: boolean; jobId?: string; stamped: number }> {
  const stamped = await stampDesignTemplatesStale(workspaceId, fields);
  if (!fields.length) return { queued: false, reused: false, stamped: stamped.stamped };

  const existing = await getDesignTemplateJobStatusByWorkspace(workspaceId);
  if (isDesignTemplateJobInFlight(existing) && existing) {
    return { queued: false, reused: true, jobId: existing.jobId, stamped: stamped.stamped };
  }

  const jobId = crypto.randomUUID();
  await setDesignTemplateJobStatus({
    jobId,
    workspaceId,
    status: 'queued',
    generated: 0,
  });
  try {
    await setDesignTemplateJobStatus({
      jobId,
      workspaceId,
      status: 'running',
      generated: 0,
    });
    const { runGenerateDesignTemplates } = await import(
      '@/lib/run-generate-design-templates'
    );
    const result = await runGenerateDesignTemplates(workspaceId, {
      archiveExisting: true,
    });
    if (result.generated === 0) {
      await setDesignTemplateJobStatus({
        jobId,
        workspaceId,
        status: 'failed',
        generated: 0,
        error: 'identity regen produced 0 templates',
      });
      return { queued: true, reused: false, jobId, stamped: stamped.stamped };
    }
    await setDesignTemplateJobStatus({
      jobId,
      workspaceId,
      status: 'complete',
      generated: result.generated,
    });
    console.info(
      `[design-template-identity] regen complete workspace=${workspaceId} `
      + `fields=${fields.join(',')} generated=${result.generated}`,
    );
    return { queued: true, reused: false, jobId, stamped: stamped.stamped };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'identity regen failed';
    console.error('[design-template-identity] regen failed', workspaceId, message);
    await setDesignTemplateJobStatus({
      jobId,
      workspaceId,
      status: 'failed',
      generated: 0,
      error: message,
    });
    return { queued: true, reused: false, jobId, stamped: stamped.stamped };
  }
}

/** Schedule regen after the HTTP response. Do not call from inside after(). */
export function queueDesignTemplateIdentityRegen(
  workspaceId: string,
  fields: HouseIdentityField[],
): void {
  if (!fields.length) return;
  after(() => {
    void runDesignTemplateIdentityRegen(workspaceId, fields);
  });
}
