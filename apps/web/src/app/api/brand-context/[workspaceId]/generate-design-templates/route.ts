/**
 * POST /api/brand-context/{workspaceId}/generate-design-templates
 *
 * HTTP shell only — generation lives in `@/lib/run-generate-design-templates`
 * so Next.js route type-check does not reject helper exports.
 */
import { NextRequest, NextResponse, after } from 'next/server';
import {
  runGenerateDesignTemplates,
  validateGenerationPrereqs,
  type GenerateBody,
} from '@/lib/run-generate-design-templates';
import {
  getDesignTemplateJobStatusByWorkspace,
  isDesignTemplateJobInFlight,
  setDesignTemplateJobStatus,
} from '@/lib/design-template-job-status';

export const runtime = 'nodejs';
export const maxDuration = 600;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params;
  const body = await req.json().catch(() => ({})) as GenerateBody;
  const background = body.background === true;

  if (background) {
    const existing = await getDesignTemplateJobStatusByWorkspace(workspaceId);
    if (isDesignTemplateJobInFlight(existing) && existing) {
      return NextResponse.json(
        {
          ok: true,
          queued: true,
          background: true,
          jobId: existing.jobId,
          workspaceId,
          reused: true,
        },
        { status: 202 },
      );
    }

    const prereq = await validateGenerationPrereqs(workspaceId);
    if (!prereq.ok) {
      return NextResponse.json(prereq.body, { status: prereq.status });
    }

    const jobId = crypto.randomUUID();
    await setDesignTemplateJobStatus({
      jobId,
      workspaceId,
      status: 'queued',
      generated: 0,
    });

    after(async () => {
      try {
        await setDesignTemplateJobStatus({
          jobId,
          workspaceId,
          status: 'running',
          generated: 0,
        });
        const result = await runGenerateDesignTemplates(workspaceId, body);
        if (result.generated === 0) {
          console.error(
            '[generate-design-templates] background job generated 0:',
            jobId,
            workspaceId,
          );
          await setDesignTemplateJobStatus({
            jobId,
            workspaceId,
            status: 'failed',
            generated: 0,
            error: 'Şablon üretilemedi',
          });
          return;
        }
        console.info(
          '[generate-design-templates] background job complete:',
          jobId,
          `generated=${result.generated}`,
        );
        await setDesignTemplateJobStatus({
          jobId,
          workspaceId,
          status: 'complete',
          generated: result.generated,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'background generation failed';
        console.error('[generate-design-templates] background job failed:', jobId, message);
        await setDesignTemplateJobStatus({
          jobId,
          workspaceId,
          status: 'failed',
          generated: 0,
          error: message,
        });
      }
    });

    return NextResponse.json(
      {
        ok: true,
        queued: true,
        background: true,
        jobId,
        workspaceId,
        reused: false,
      },
      { status: 202 },
    );
  }

  try {
    const result = await runGenerateDesignTemplates(workspaceId, body);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'generation_failed';
    if (message.startsWith('brand_context_unavailable')) {
      return NextResponse.json(
        { error: 'brand_context_unavailable', detail: message.split(':')[1] ?? null },
        { status: 502 },
      );
    }
    if (message === 'no_gallery_photos') {
      return NextResponse.json(
        {
          error: 'no_gallery_photos',
          message: 'Marka galerisinde kullanılabilir görsel yok.',
        },
        { status: 422 },
      );
    }
    console.error('[generate-design-templates] sync failed:', workspaceId, message);
    return NextResponse.json({ error: 'generation_failed', message }, { status: 500 });
  }
}
