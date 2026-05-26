const CANVA_API_BASE = 'https://api.canva.com/rest/v1';

export class CanvaApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(`Canva API ${status}: ${detail.slice(0, 500)}`);
    this.name = 'CanvaApiError';
    this.status = status;
    this.detail = detail;
  }
}

export interface CanvaBrandTemplateSummary {
  id: string;
  title: string;
}

interface CanvaBrandTemplateResponse {
  items?: Array<{
    id?: string;
    title?: string;
    name?: string;
  }>;
  brand_templates?: Array<{
    id?: string;
    title?: string;
    name?: string;
  }>;
}

export async function canvaFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${CANVA_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new CanvaApiError(response.status, detail);
  }

  return response.json() as Promise<T>;
}

export async function listCanvaBrandTemplates(token: string): Promise<CanvaBrandTemplateSummary[]> {
  const response = await canvaFetch<CanvaBrandTemplateResponse>(token, '/brand-templates');
  const items = response.items ?? response.brand_templates ?? [];

  return items
    .filter((item): item is { id: string; title?: string; name?: string } => Boolean(item.id))
    .map((item) => ({
      id: item.id,
      title: item.title ?? item.name ?? item.id,
    }));
}
