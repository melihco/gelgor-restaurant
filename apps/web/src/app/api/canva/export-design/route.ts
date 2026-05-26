import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { API_BASE_URL, getRequestContextHeaders } from '@/lib/runtime-config';
import { getRendererAdapter, RendererAuthError, type RendererExportFormat, type RendererProvider } from '@/lib/renderer-adapters';
import { categorizeRendererFailure, recordRendererMetric } from '@/lib/renderer-observability';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      tenantId?: string;
      officeId?: string;
      rendererProvider?: RendererProvider;
      designId?: string;
      title?: string;
      format?: RendererExportFormat;
    };
    const tenantId = body.tenantId?.trim() || undefined;
    const officeId = body.officeId?.trim() || undefined;
    const rendererProvider = body.rendererProvider ?? 'canva';
    const renderer = await getRendererAdapter(rendererProvider);

    if (!body.designId) {
      return NextResponse.json({ error: 'designId is required.' }, { status: 400 });
    }

    const entitlement = await checkCanvaExportEntitlement();
    if (!entitlement.allowed) {
      return NextResponse.json(
        { error: 'Canva export is not available for the current subscription.', entitlement },
        { status: 402 },
      );
    }

    const format = body.format ?? 'png';
    const startedAt = Date.now();
    let exportResponse;
    try {
      exportResponse = await renderer.export({
        designId: body.designId,
        format,
      });
    } catch (error) {
      const failure = categorizeRendererFailure(error, 'export_failed');
      recordRendererMetric({
        operation: 'export',
        tenantId,
        officeId,
        rendererProvider: renderer.provider,
        status: 'failed',
        durationMs: Date.now() - startedAt,
        designId: body.designId,
        failure,
      });
      return NextResponse.json(
        { error: failure.message, rendererProvider: renderer.provider, failure },
        { status: failure.status && failure.status >= 400 ? failure.status : 500 },
      );
    }

    const exportUrl = exportResponse.exportUrl;
    if (exportResponse.job?.status === 'failed') {
      const failure = {
        category: 'export_failed' as const,
        retryable: true,
        message: exportResponse.job.error?.message ?? 'Renderer export failed.',
      };
      recordRendererMetric({
        operation: 'export',
        tenantId,
        officeId,
        rendererProvider: renderer.provider,
        status: 'failed',
        durationMs: Date.now() - startedAt,
        designId: body.designId,
        jobId: exportResponse.job.id,
        failure,
      });
      return NextResponse.json(
        { error: failure.message, rendererProvider: renderer.provider, failure, job: exportResponse.job },
        { status: 422 },
      );
    }
    if (!exportUrl) {
      recordRendererMetric({
        operation: 'export',
        tenantId,
        officeId,
        rendererProvider: renderer.provider,
        status: 'pending',
        durationMs: Date.now() - startedAt,
        designId: body.designId,
        jobId: exportResponse.job?.id,
      });
      return NextResponse.json({ error: 'Renderer export did not return a download URL yet.', rendererProvider: renderer.provider, job: exportResponse.job }, { status: 202 });
    }

    const permanentPreviewUrl = await persistExportedPreview(exportUrl, body.designId, body.title, format, renderer.provider);
    recordRendererMetric({
      operation: 'export',
      tenantId,
      officeId,
      rendererProvider: renderer.provider,
      status: 'success',
      durationMs: Date.now() - startedAt,
      designId: body.designId,
      jobId: exportResponse.job?.id,
    });
    return NextResponse.json({
      rendererProvider: renderer.provider,
      job: exportResponse.job,
      exportUrl,
      permanentPreviewUrl,
    });
  } catch (error) {
    if (error instanceof RendererAuthError) {
      return NextResponse.json(
        { error: error.message, connectUrl: error.connectUrl },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Renderer export failed.' },
      { status: 500 },
    );
  }
}

async function checkCanvaExportEntitlement(): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/packages/entitlements/canva_export`, {
      headers: getRequestContextHeaders(),
    });
    if (!response.ok) return { allowed: true, reason: 'entitlement_service_unavailable' };
    const result = await response.json() as { allowed?: boolean; reason?: string };
    return { allowed: result.allowed !== false, reason: result.reason };
  } catch {
    return { allowed: true, reason: 'entitlement_service_unavailable' };
  }
}

async function persistExportedPreview(exportUrl: string, designId: string, title = 'renderer-preview', format: string, provider: RendererProvider) {
  const response = await fetch(exportUrl);
  if (!response.ok) throw new Error(`Renderer export download failed ${response.status}.`);

  const bytes = Buffer.from(await response.arrayBuffer());
  const hash = createHash('sha256').update(`${designId}:${title}:${Date.now()}`).digest('hex').slice(0, 12);
  const extension = format === 'jpg' ? 'jpg' : format === 'pdf' ? 'pdf' : format === 'mp4' ? 'mp4' : 'png';
  const directory = path.join(process.cwd(), 'public', 'generated', provider);
  await mkdir(directory, { recursive: true });

  const fileName = `${sanitizeFileName(title)}-${hash}.${extension}`;
  await writeFile(path.join(directory, fileName), bytes);
  return `/generated/${provider}/${fileName}`;
}

function sanitizeFileName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'canva-preview';
}
