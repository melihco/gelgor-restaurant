import { NextRequest, NextResponse } from 'next/server';
import {
  selectCanvaTemplate,
  type CanvaTemplateDecisionInput,
} from '@/lib/canva-template-selection';
import { getCanvaTenantId } from '@/lib/canva-template-registry';
import { getRendererAdapter, RendererAuthError, type RendererProvider } from '@/lib/renderer-adapters';
import { auditTemplateDecision, categorizeRendererFailure, recordRendererMetric } from '@/lib/renderer-observability';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      tenantId?: string;
      officeId?: string;
      rendererProvider?: RendererProvider;
      items?: Array<{ key: string; signal: CanvaTemplateDecisionInput }>;
    };
    const rendererProvider = body.rendererProvider ?? 'canva';
    const renderer = await getRendererAdapter(rendererProvider);
    const tenantId = getCanvaTenantId(body.tenantId ?? request.nextUrl.searchParams.get('tenantId'));
    const officeId = body.officeId ?? request.nextUrl.searchParams.get('officeId');
    const items = body.items?.filter((item) => item.key && item.signal?.title && item.signal?.kind) ?? [];
    if (items.length === 0) {
      return NextResponse.json({ tenantId, matches: {}, templateCount: 0 });
    }

    let templates: Awaited<ReturnType<typeof renderer.listTemplates>> = [];
    try {
      const startedAt = Date.now();
      templates = await renderer.listTemplates({ tenantId, officeId });
      recordRendererMetric({
        operation: 'template_list',
        tenantId,
        officeId,
        rendererProvider: renderer.provider,
        status: 'success',
        durationMs: Date.now() - startedAt,
      });
    } catch (err) {
      const failure = categorizeRendererFailure(err, 'provider_error');
      recordRendererMetric({
        operation: 'template_list',
        tenantId,
        officeId,
        rendererProvider: renderer.provider,
        status: 'failed',
        failure,
      });
      return NextResponse.json({
        tenantId,
        rendererProvider: renderer.provider,
        matches: {},
        templateCount: 0,
        error: failure.message,
        failure,
      });
    }
    const matches = items.reduce<Record<string, unknown>>((acc, item) => {
      const decision = selectCanvaTemplate(item.signal, templates);
      auditTemplateDecision({
        tenantId,
        officeId,
        rendererProvider: renderer.provider,
        signal: item.signal,
        decision,
        selectedBy: 'ai_match',
      });
      acc[item.key] = decision ? {
        template: {
          id: decision.template.id,
          title: decision.template.title,
          contentKinds: decision.template.contentKinds,
          objectives: decision.template.objectives,
          aspectRatio: decision.template.aspectRatio,
          templateFamilyId: decision.template.templateFamilyId,
          riskTier: decision.template.riskTier,
          status: decision.template.status,
          previewUrl: decision.template.previewUrl,
          previewUpdatedAt: decision.template.previewUpdatedAt,
          previewStale: decision.template.previewStale,
        },
        score: decision.score,
        eligibility: decision.eligibility,
        riskTier: decision.riskTier,
        approvalRequired: decision.approvalRequired,
        reasons: decision.reasons,
        blockedReasons: decision.blockedReasons,
        policyWarnings: decision.policyWarnings,
        missingFields: decision.missingFields,
        missingAssetIntents: decision.missingAssetIntents,
        requiredAssetIntents: decision.requiredAssetIntents,
        riskSignals: decision.riskSignals,
        validationWarnings: decision.validationWarnings,
        filledFields: Object.keys(decision.autofillData),
        autofillData: decision.autofillData,
        templateDatasetKeys: Object.keys(decision.template.dataset ?? {}),
      } : null;
      return acc;
    }, {});
    recordRendererMetric({
      operation: 'template_match',
      tenantId,
      officeId,
      rendererProvider: renderer.provider,
      status: 'success',
      durationMs: 0,
    });

    return NextResponse.json({ tenantId, rendererProvider: renderer.provider, matches, templateCount: templates.length });
  } catch (error) {
    if (error instanceof RendererAuthError) {
      return NextResponse.json(
        { error: error.message, connectUrl: error.connectUrl, matches: {} },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Renderer template matching failed.', matches: {} },
      { status: 500 },
    );
  }
}
