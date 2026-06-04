import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { getCanvaTenantId, upsertCanvaTemplateRegistryEntry } from '@/lib/canva-template-registry';
import { getRendererAdapter, RendererAuthError, type RendererProvider } from '@/lib/renderer-adapters';
import { buildTemplateDefaultAutofillData, templatePreviewHash } from '@/lib/template-preview-snapshot';
import { categorizeRendererFailure, recordRendererMetric } from '@/lib/renderer-observability';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const canvaBlocked = (await import('@/lib/canva-route-guard')).assertCanvaRouteEnabled();
  if (canvaBlocked) return canvaBlocked;

  const startedAt = Date.now();

  try {
    const body = await request.json() as {
      tenantId?: string;
      officeId?: string;
      rendererProvider?: RendererProvider;
      templateId?: string;
      brandName?: string;
      force?: boolean;
    };

    const tenantId = getCanvaTenantId(body.tenantId ?? request.nextUrl.searchParams.get('tenantId'));
    const officeId = body.officeId ?? request.nextUrl.searchParams.get('officeId');
    const renderer = await getRendererAdapter(body.rendererProvider ?? 'canva');

    if (!body.templateId) {
      return NextResponse.json({ error: 'templateId is required.' }, { status: 400 });
    }

    const templates = await renderer.listTemplates({ tenantId, officeId });
    const template = templates.find((item) => item.id === body.templateId);
    if (!template) {
      return NextResponse.json(
        {
          error: 'Template is not available for preview generation.',
          failure: {
            category: 'missing_template',
            retryable: false,
            message: 'Template is not available for preview generation.',
          },
        },
        { status: 404 },
      );
    }

    const autofillData = buildTemplateDefaultAutofillData(template, { brandName: body.brandName });
    const previewFormat = shouldExportVideoPreview(template) ? 'mp4' : 'png';
    const previewMimeType = previewFormat === 'mp4' ? 'video/mp4' : 'image/png';
    if (Object.keys(autofillData).length === 0) {
      return NextResponse.json(
        {
          error: 'Template has no text autofill fields for default preview.',
          failure: {
            category: 'missing_fields',
            retryable: false,
            message: 'Template has no text autofill fields for default preview.',
          },
        },
        { status: 422 },
      );
    }

    const previewHash = templatePreviewHash(template, autofillData);
    if (!body.force && template.previewUrl && template.previewHash === previewHash && template.previewStale === false && template.previewFormat === previewFormat) {
      return NextResponse.json({
        tenantId,
        rendererProvider: renderer.provider,
        templateId: template.id,
        previewUrl: template.previewUrl,
        previewUpdatedAt: template.previewUpdatedAt,
        previewHash,
        previewFormat,
        previewMimeType,
        cached: true,
      });
    }

    const renderResult = await renderer.render({
      templateId: template.id,
      title: `${template.title || 'Template'} - default preview`,
      data: autofillData,
    });
    const design = renderResult.design ?? renderResult.job?.result?.design;
    const designId = design?.id;
    if (!designId) {
      if (renderResult.job?.status === 'failed') {
        return NextResponse.json(
          {
            error: renderResult.job.error?.message ?? 'Renderer preview render job failed.',
            job: renderResult.job,
            failure: {
              category: 'provider_error',
              retryable: true,
              message: renderResult.job.error?.message ?? 'Renderer preview render job failed.',
            },
          },
          { status: 422 },
        );
      }

      return NextResponse.json(
        {
          error: 'Renderer preview job is still processing. Try refreshing preview again in a few seconds.',
          job: renderResult.job,
          pending: true,
          failure: {
            category: 'provider_error',
            retryable: true,
            message: 'Renderer preview job is still processing.',
          },
        },
        { status: 202 },
      );
    }

    const exportResult = await renderer.export({ designId, format: previewFormat });
    if (!exportResult.exportUrl) {
      return NextResponse.json(
        {
          error: 'Renderer export did not return a preview URL.',
          job: exportResult.job,
          failure: {
            category: 'export_failed',
            retryable: true,
            message: 'Renderer export did not return a preview URL.',
          },
        },
        { status: 202 },
      );
    }

    const previewUrl = await persistTemplatePreview(exportResult.exportUrl, renderer.provider, template.id, previewHash, previewFormat);
    const previewUpdatedAt = new Date().toISOString();
    const entry = await upsertCanvaTemplateRegistryEntry({
      tenantId,
      templateId: template.id,
      title: template.title,
      previewUrl,
      previewUpdatedAt,
      previewStale: false,
      previewRendererProvider: renderer.provider,
      previewDesignId: designId,
      previewJobId: renderResult.job?.id ?? exportResult.job?.id,
      previewHash,
      previewFormat,
      previewMimeType,
    });

    recordRendererMetric({
      operation: 'export',
      tenantId,
      officeId,
      rendererProvider: renderer.provider,
      status: 'success',
      durationMs: Date.now() - startedAt,
      templateId: template.id,
      designId,
      jobId: exportResult.job?.id,
    });

    return NextResponse.json({
      tenantId,
      rendererProvider: renderer.provider,
      templateId: template.id,
      previewUrl,
      previewUpdatedAt,
      previewHash,
      previewFormat,
      previewMimeType,
      entry,
      renderJob: renderResult.job,
      exportJob: exportResult.job,
    });
  } catch (error) {
    if (error instanceof RendererAuthError) {
      return NextResponse.json({ error: error.message, connectUrl: error.connectUrl }, { status: 401 });
    }

    const failure = categorizeRendererFailure(error, 'provider_error');
    recordRendererMetric({
      operation: 'export',
      rendererProvider: 'canva',
      status: 'failed',
      durationMs: Date.now() - startedAt,
      failure,
    });
    return NextResponse.json({ error: failure.message, failure }, { status: failure.status ?? 500 });
  }
}

async function persistTemplatePreview(exportUrl: string, provider: RendererProvider, templateId: string, previewHash: string, format: 'png' | 'mp4') {
  const response = await fetch(exportUrl);
  if (!response.ok) throw new Error(`Template preview download failed ${response.status}.`);

  const bytes = Buffer.from(await response.arrayBuffer());
  const directory = path.join(process.cwd(), 'public', 'generated', provider, 'template-previews');
  await mkdir(directory, { recursive: true });
  const fileName = `${sanitizeFileName(templateId)}-${previewHash}-${createHash('sha1').update(bytes).digest('hex').slice(0, 8)}.${format}`;
  await writeFile(path.join(directory, fileName), bytes);
  return `/generated/${provider}/template-previews/${fileName}`;
}

function shouldExportVideoPreview(template: { title?: string; contentKinds?: string[]; allowedChannels?: string[]; useCases?: string[]; tags?: string[]; templateFamilyId?: string }) {
  const text = [
    template.title,
    template.templateFamilyId,
    ...(template.contentKinds ?? []),
    ...(template.allowedChannels ?? []),
    ...(template.useCases ?? []),
    ...(template.tags ?? []),
  ].filter(Boolean).join(' ').toLowerCase();

  return /reel|video|tiktok|shorts/.test(text);
}

function sanitizeFileName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'template-preview';
}
