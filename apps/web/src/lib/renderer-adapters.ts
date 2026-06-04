import {
  type CanvaAutofillField,
  type CanvaTemplateDatasetField,
  type CanvaTemplateMetadata,
} from '@/lib/canva-template-selection';
import { canvaFetch } from '@/lib/canva-connect-api';
import { loadCanvaTemplates } from '@/lib/canva-template-catalog';
import { getCanvaAccessToken } from '@/lib/canva-oauth';
import { isCanvaEnabled } from '@/lib/canva-config';

export type RendererProvider = 'canva' | 'creatomate' | 'internal';
export { isCanvaEnabled, isCanvaEnabledClient } from './canva-config';
export type RendererExportFormat = 'png' | 'jpg' | 'pdf' | 'mp4';
export type RendererJobKind = 'render' | 'export';

export interface RendererDesign {
  id?: string;
  url?: string;
  urls?: { edit_url?: string; view_url?: string };
  thumbnail?: { url?: string };
}

export interface RendererJob {
  id?: string;
  status?: string;
  result?: {
    type?: string;
    design?: RendererDesign;
  };
  urls?: string[];
  error?: { code?: string; message?: string };
}

export interface RendererRenderResult {
  job?: RendererJob;
  design?: RendererDesign;
}

export interface RendererExportResult {
  job?: RendererJob;
  exportUrl?: string;
}

export interface RendererAdapter {
  provider: RendererProvider;
  listTemplates(input?: {
    tenantId?: string;
    officeId?: string | null;
    templateCatalog?: CanvaTemplateMetadata[];
  }): Promise<CanvaTemplateMetadata[]>;
  getTemplateDataset(templateId: string): Promise<Record<string, CanvaTemplateDatasetField>>;
  render(input: {
    templateId: string;
    title: string;
    data: Record<string, CanvaAutofillField>;
  }): Promise<RendererRenderResult>;
  export(input: {
    designId: string;
    format: RendererExportFormat;
  }): Promise<RendererExportResult>;
  getJobStatus(jobId: string, kind?: RendererJobKind): Promise<RendererJob>;
}

export async function getRendererAdapter(provider: RendererProvider = 'internal'): Promise<RendererAdapter> {
  if (provider === 'internal') return new InternalRendererAdapter();
  if (provider === 'creatomate') {
    const apiKey = process.env.CREATOMATE_API_KEY ?? '';
    if (!apiKey) throw new RendererAuthError('Creatomate API key not configured. Set CREATOMATE_API_KEY.', '/settings/integrations');
    return new CreatomateRendererAdapter(apiKey);
  }
  // Canva kill-switch — return a stub that surfaces a clear message everywhere
  if (!isCanvaEnabled()) {
    throw new RendererAuthError(
      'Canva entegrasyonu kapalı. Remotion + ajans SVG poster motoru kullanılır.',
      '/brand',
    );
  }
  const token = await getCanvaAccessToken();
  if (!token) {
    throw new RendererAuthError('Canva is not connected. Connect your Canva account first.', '/api/canva/oauth/login');
  }
  return new CanvaRendererAdapter(token);
}

export class RendererAuthError extends Error {
  connectUrl?: string;

  constructor(message: string, connectUrl?: string) {
    super(message);
    this.name = 'RendererAuthError';
    this.connectUrl = connectUrl;
  }
}

class CanvaRendererAdapter implements RendererAdapter {
  provider: RendererProvider = 'canva';

  constructor(private readonly token: string) {}

  listTemplates(input?: {
    tenantId?: string;
    officeId?: string | null;
    templateCatalog?: CanvaTemplateMetadata[];
  }) {
    return loadCanvaTemplates(this.token, input?.templateCatalog, input?.tenantId, input?.officeId);
  }

  async getTemplateDataset(templateId: string) {
    const result = await canvaFetch<{ dataset?: Record<string, CanvaTemplateDatasetField> }>(
      this.token,
      `/brand-templates/${encodeURIComponent(templateId)}/dataset`,
    );
    return result.dataset ?? {};
  }

  async render(input: {
    templateId: string;
    title: string;
    data: Record<string, CanvaAutofillField>;
  }) {
    let response = await canvaFetch<{ job?: RendererJob }>(this.token, '/autofills', {
      method: 'POST',
      body: JSON.stringify({
        brand_template_id: input.templateId,
        title: input.title,
        data: input.data,
      }),
    });

    if (response.job?.id) {
      response = { job: await this.pollJob(response.job.id, 'render', response.job) };
    }

    return {
      job: response.job,
      design: response.job?.result?.design,
    };
  }

  async export(input: {
    designId: string;
    format: RendererExportFormat;
  }) {
    let response = await canvaFetch<{ job?: RendererJob }>(this.token, '/exports', {
      method: 'POST',
      body: JSON.stringify({
        design_id: input.designId,
        format: exportFormat(input.format),
      }),
    });

    if (response.job?.id) {
      response = { job: await this.pollJob(response.job.id, 'export', response.job, 8) };
    }

    return {
      job: response.job,
      exportUrl: response.job?.urls?.[0],
    };
  }

  async getJobStatus(jobId: string, kind: RendererJobKind = 'render') {
    const endpoint = kind === 'export' ? 'exports' : 'autofills';
    const response = await canvaFetch<{ job?: RendererJob }>(
      this.token,
      `/${endpoint}/${encodeURIComponent(jobId)}`,
    );
    return response.job ?? { id: jobId, status: 'unknown' };
  }

  private async pollJob(jobId: string, kind: RendererJobKind, initial: RendererJob, attempts = 12) {
    let latest = initial;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (latest.status === 'success' || latest.status === 'failed') return latest;
      await new Promise((resolve) => setTimeout(resolve, 900));
      latest = await this.getJobStatus(jobId, kind);
    }
    return latest;
  }
}

// ── Creatomate Renderer ──────────────────────────────────────────────────────
// Creatomate API v1 — template-based image/video rendering.
// Templates are created once via /api/v1/brand-context/templates/seed (Python)
// then referenced by ID for every render. No Enterprise subscription needed.
const CREATOMATE_API = 'https://api.creatomate.com/v1';
const CREATOMATE_POLL_MAX = 60;
const CREATOMATE_POLL_INTERVAL = 4000;

class CreatomateRendererAdapter implements RendererAdapter {
  provider: RendererProvider = 'creatomate';

  constructor(private readonly apiKey: string) {}

  private get headers() {
    return { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' };
  }

  async listTemplates() {
    try {
      const res = await fetch(`${CREATOMATE_API}/templates`, {
        headers: this.headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return [];
      const all = await res.json() as Array<{ id: string; name: string; thumbnail_url?: string; output_format?: string }>;
      // Only expose SmartAgency templates
      const sa = all.filter((t) => t.name?.startsWith('SmartAgency'));
      return sa.map((t) => ({
        id: t.id,
        title: t.name,
        enabled: true,
        contentKinds: t.output_format === 'mp4'
          ? ['instagram_reel' as const, 'instagram_story' as const]
          : ['instagram_post' as const, 'instagram_story' as const],
        previewUrl: t.thumbnail_url,
        registryUpdatedAt: new Date().toISOString(),
      } satisfies CanvaTemplateMetadata));
    } catch {
      return [];
    }
  }

  async getTemplateDataset(templateId: string) {
    try {
      const res = await fetch(`${CREATOMATE_API}/templates/${encodeURIComponent(templateId)}`, {
        headers: this.headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return {};
      const data = await res.json() as { source?: { elements?: Array<{ name?: string; type?: string }> } };
      const elements = data.source?.elements ?? [];
      return Object.fromEntries(
        elements
          .filter((el) => el.name && (el.type === 'text' || el.type === 'image' || el.type === 'video'))
          .map((el) => [el.name!, { type: (el.type === 'text' ? 'text' : 'image') as 'text' | 'image' }]),
      );
    } catch {
      return {};
    }
  }

  async render(input: { templateId: string; title: string; data: Record<string, CanvaAutofillField> }) {
    // Convert CanvaAutofillField → Creatomate modifications
    const modifications: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(input.data)) {
      if (field.type === 'text') modifications[`${key}.text`] = field.text;
      else if (field.type === 'image') modifications[`${key}.source`] = field.asset_id;
    }

    const res = await fetch(`${CREATOMATE_API}/renders`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ template_id: input.templateId, modifications }),
      signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(`Creatomate render failed ${res.status}: ${err.slice(0, 200)}`);
    }
    const data = await res.json() as Array<{ id: string; status: string }> | { id: string; status: string };
    const render = Array.isArray(data) ? data[0]! : data;
    const renderId = render.id;

    // Poll to completion
    const final = await this.pollRender(renderId);
    const outputUrl = final.url ?? '';

    const job: RendererJob = {
      id: renderId,
      status: final.status === 'succeeded' ? 'success' : 'failed',
      urls: outputUrl ? [outputUrl] : [],
      result: {
        type: 'create_design',
        design: { id: renderId, url: outputUrl, urls: { edit_url: outputUrl } },
      },
    };
    return { job, design: job.result?.design };
  }

  async export(input: { designId: string; format: RendererExportFormat }) {
    // Creatomate renders ARE the export — the render URL is the final asset.
    // Re-poll to return the existing render URL.
    const data = await this.pollRender(input.designId);
    return {
      job: { id: input.designId, status: data.status === 'succeeded' ? 'success' : 'completed', urls: data.url ? [data.url] : [] },
      exportUrl: data.url,
    };
  }

  async getJobStatus(jobId: string) {
    try {
      const res = await fetch(`${CREATOMATE_API}/renders/${encodeURIComponent(jobId)}`, {
        headers: this.headers,
        signal: AbortSignal.timeout(10_000),
      });
      const data = (await res.json()) as { id?: string; status?: string; url?: string };
      return {
        id: jobId,
        status: data.status === 'succeeded' ? 'success' : data.status ?? 'in_progress',
        urls: data.url ? [data.url] : [],
      };
    } catch {
      return { id: jobId, status: 'unknown' };
    }
  }

  private async pollRender(renderId: string): Promise<{ status: string; url?: string }> {
    for (let i = 0; i < CREATOMATE_POLL_MAX; i++) {
      await new Promise((r) => setTimeout(r, CREATOMATE_POLL_INTERVAL));
      try {
        const res = await fetch(`${CREATOMATE_API}/renders/${renderId}`, {
          headers: this.headers,
          signal: AbortSignal.timeout(10_000),
        });
        const d = (await res.json()) as { status?: string; url?: string };
        if (d.status === 'succeeded') return { status: 'succeeded', url: d.url };
        if (d.status === 'failed') return { status: 'failed' };
      } catch { /* retry */ }
    }
    return { status: 'timeout' };
  }
}

class InternalRendererAdapter implements RendererAdapter {
  provider: RendererProvider = 'internal';

  async listTemplates() {
    return [];
  }

  async getTemplateDataset() {
    return {};
  }

  async render() {
    return {
      job: {
        id: `internal-render-${Date.now()}`,
        status: 'not_implemented',
      },
    };
  }

  async export() {
    return {
      job: {
        id: `internal-export-${Date.now()}`,
        status: 'not_implemented',
      },
    };
  }

  async getJobStatus(jobId: string) {
    return {
      id: jobId,
      status: 'not_implemented',
    };
  }
}

function exportFormat(format: RendererExportFormat) {
  if (format === 'jpg') return { type: 'jpg', quality: 'regular' };
  if (format === 'pdf') return { type: 'pdf' };
  if (format === 'mp4') return { type: 'mp4' };
  // PNG: explicitly include quality so Canva never receives null
  return { type: 'png', quality: 'regular' };
}
