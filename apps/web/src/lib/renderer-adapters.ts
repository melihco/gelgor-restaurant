import {
  type CanvaAutofillField,
  type CanvaTemplateDatasetField,
  type CanvaTemplateMetadata,
} from '@/lib/canva-template-selection';
import { canvaFetch } from '@/lib/canva-connect-api';
import { loadCanvaTemplates } from '@/lib/canva-template-catalog';
import { getCanvaAccessToken } from '@/lib/canva-oauth';

export type RendererProvider = 'canva' | 'internal';
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

export async function getRendererAdapter(provider: RendererProvider = 'canva'): Promise<RendererAdapter> {
  if (provider === 'internal') return new InternalRendererAdapter();

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
