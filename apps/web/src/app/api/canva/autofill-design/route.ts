import { NextRequest, NextResponse } from 'next/server';
import {
  buildFieldConstraintPromptBlock,
  createManualCanvaTemplateDecision,
  extractTemplateFieldContracts,
  selectCanvaTemplate,
  type CanvaAutofillField,
  type CanvaTemplateDecision,
  type CanvaTemplateDecisionInput,
  type CanvaTemplateMetadata,
} from '@/lib/canva-template-selection';
import { getCanvaTenantId } from '@/lib/canva-template-registry';
import { canvaExportFormatForKind, persistCanvaExportFile } from '@/lib/canva-export-helper';
import { resolveNexusCanvaAssetIds } from '@/lib/nexus-brand-context';
import { API_BASE_URL } from '@/lib/runtime-config';
import { getRendererAdapter, RendererAuthError, type RendererExportFormat, type RendererProvider } from '@/lib/renderer-adapters';
import { auditTemplateDecision, categorizeRendererFailure, recordRendererMetric } from '@/lib/renderer-observability';
import { fetchRecentTemplateIds } from '@/lib/template-usage-tracker';

export const runtime = 'nodejs';

interface CanvaArtifactLineage {
  contentItemKey?: string;
  source?: 'ai' | 'action' | 'template' | string;
  artifactId?: string;
  actionId?: string;
  parentArtifactId?: string;
  parentActionId?: string;
  parentTitle?: string;
  selectedTemplateId?: string;
  selectedBy?: 'ai_match' | 'manual_override' | string;
  rendererProvider?: RendererProvider | string;
  auditId?: string;
}

export async function GET(request: NextRequest) {
  try {
    const canvaBlocked = (await import('@/lib/canva-route-guard')).assertCanvaRouteEnabled();
    if (canvaBlocked) return canvaBlocked;

    const jobId = request.nextUrl.searchParams.get('jobId');
    if (!jobId) {
      return NextResponse.json({ error: 'Missing renderer jobId.' }, { status: 400 });
    }

    const rendererProvider = (request.nextUrl.searchParams.get('rendererProvider') as RendererProvider | null) ?? 'canva';
    const renderer = await getRendererAdapter(rendererProvider);
    const job = await renderer.getJobStatus(jobId, 'render');
    return NextResponse.json({
      rendererProvider: renderer.provider,
      job,
      design: job.result?.design,
    });
  } catch (error) {
    if (error instanceof RendererAuthError) {
      return NextResponse.json(
        { error: error.message, connectUrl: error.connectUrl },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Renderer job lookup failed.' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const canvaBlocked = (await import('@/lib/canva-route-guard')).assertCanvaRouteEnabled();
    if (canvaBlocked) return canvaBlocked;

    const body = await request.json() as {
      tenantId?: string;
      officeId?: string;
      rendererProvider?: RendererProvider;
      signal: CanvaTemplateDecisionInput;
      title?: string;
      templateCatalog?: CanvaTemplateMetadata[];
      templateId?: string;
      lineage?: CanvaArtifactLineage;
    };
    const rendererProvider = body.rendererProvider ?? 'canva';
    const renderer = await getRendererAdapter(rendererProvider);
    const tenantId = getCanvaTenantId(body.tenantId ?? request.nextUrl.searchParams.get('tenantId'));
    const officeId = body.officeId ?? request.nextUrl.searchParams.get('officeId');

    if (!body.signal?.title || !body.signal?.kind) {
      return NextResponse.json({ error: 'Missing Canva signal title or kind.' }, { status: 400 });
    }

    const resolvedAssets = await resolveNexusCanvaAssetIds(body.signal, tenantId, officeId);
    const recentTemplateIds = await fetchRecentTemplateIds(tenantId);
    let signal: CanvaTemplateDecisionInput = {
      ...resolvedAssets,
      ...body.signal,
      recentlyUsedTemplateIds: recentTemplateIds,
    };

    const templates = await renderer.listTemplates({ templateCatalog: body.templateCatalog, tenantId, officeId });
    if (templates.length === 0) {
      return NextResponse.json(
        {
          error: renderer.provider === 'canva'
            ? 'Canva is connected, but no Brand Templates are visible to the API yet. Publish at least one Canva design as a Brand Template with autofill fields, then refresh Brand Hub.'
            : 'Selected renderer has no templates available yet.',
          action: 'publish_brand_template',
          rendererProvider: renderer.provider,
        },
        { status: 409 },
      );
    }

    const selectedTemplate = body.templateId
      ? templates.find((template) => template.id === body.templateId)
      : undefined;
    if (body.templateId && !selectedTemplate) {
      return NextResponse.json(
        { error: 'Selected Canva template is not available in the current Brand Template inventory.' },
        { status: 400 },
      );
    }

    let decision = selectedTemplate
      ? createManualCanvaTemplateDecision(signal, selectedTemplate)
      : selectCanvaTemplate(signal, templates);
    const selectedBy = body.templateId ? 'manual_override' : 'ai_match';

    if (!decision) {
      recordRendererMetric({
        operation: 'render',
        tenantId,
        officeId,
        rendererProvider: renderer.provider,
        status: 'failed',
        failure: {
          category: 'missing_template',
          retryable: false,
          message: 'No renderer templates are available for selection.',
        },
      });
      return NextResponse.json(
        { error: 'No Canva brand templates are available for selection.' },
        { status: 409 },
      );
    }

    // Sync signal.kind to the ACTUAL selected template's contentKind.
    // If a Reel content item picks a Post template (no Reel template available) or vice-versa,
    // the artifact's contentType should reflect the real template format, not the requested one.
    const templateKind = decision.template.contentKinds?.[0];
    if (templateKind && templateKind !== signal.kind) {
      signal = { ...signal, kind: templateKind };
    }

    const fieldContracts = extractTemplateFieldContracts(decision.template, signal.kind);

    const auditEvent = auditTemplateDecision({
      tenantId,
      officeId,
      rendererProvider: renderer.provider,
      signal,
      decision,
      selectedBy,
    });

    // LLM-constrained field rewrite: regenerate truncated fields with gpt-4o-mini
    // so copy fits the template's ACTUAL visual character limits without awkward cuts
    if (decision.validationWarnings?.length && process.env.OPENAI_API_KEY) {
      const rewritten = await rewriteTruncatedFieldsWithLLM(signal, decision);
      if (rewritten) {
        decision = {
          ...decision,
          autofillData: { ...decision.autofillData, ...rewritten },
          validationWarnings: decision.validationWarnings?.filter(w => !w.includes('trimmed to')),
        };
      }
    }

    if (decision.eligibility === 'blocked') {
      recordRendererMetric({
        operation: 'render',
        tenantId,
        officeId,
        rendererProvider: renderer.provider,
        status: 'blocked',
        templateId: decision.template.id,
        failure: {
          category: 'policy_blocked',
          retryable: false,
          message: decision.blockedReasons.join(' · ') || 'Selected template is blocked by template policy.',
        },
      });
      return NextResponse.json(
        {
          error: 'Selected Canva template is blocked by template policy.',
          decision,
          auditId: auditEvent.id,
        },
        { status: 422 },
      );
    }

    if (Object.keys(decision.autofillData).length === 0) {
      recordRendererMetric({
        operation: 'render',
        tenantId,
        officeId,
        rendererProvider: renderer.provider,
        status: 'blocked',
        templateId: decision.template.id,
        failure: {
          category: 'missing_fields',
          retryable: false,
          message: 'Selected template has no autofillable fields that match this artifact.',
        },
      });
      return NextResponse.json(
        {
          error: 'Selected Canva template has no autofillable fields that match this artifact.',
          decision,
          auditId: auditEvent.id,
        },
        { status: 422 },
      );
    }

    const renderStartedAt = Date.now();
    let renderResult;
    try {
      renderResult = await renderer.render({
        templateId: decision.template.id,
        title: body.title ?? `SmartAgency - ${signal.title}`,
        data: decision.autofillData,
      });
      recordRendererMetric({
        operation: 'render',
        tenantId,
        officeId,
        rendererProvider: renderer.provider,
        status: renderResult.job?.status === 'failed' ? 'failed' : 'success',
        durationMs: Date.now() - renderStartedAt,
        templateId: decision.template.id,
        jobId: renderResult.job?.id,
        failure: renderResult.job?.status === 'failed'
          ? {
              category: 'provider_error',
              retryable: true,
              message: renderResult.job.error?.message ?? 'Renderer render job failed.',
            }
          : undefined,
      });
    } catch (error) {
      const failure = categorizeRendererFailure(error, 'provider_error');
      recordRendererMetric({
        operation: 'render',
        tenantId,
        officeId,
        rendererProvider: renderer.provider,
        status: 'failed',
        durationMs: Date.now() - renderStartedAt,
        templateId: decision.template.id,
        failure,
      });
      return NextResponse.json(
        { error: failure.message, failure, auditId: auditEvent.id },
        { status: failure.status && failure.status >= 400 ? failure.status : 500 },
      );
    }

    const design = renderResult.design ?? renderResult.job?.result?.design;
    const editUrl = design?.url ?? design?.urls?.edit_url;
    const thumbnailUrl = design?.thumbnail?.url;

    // Export downloadable file (PNG for post/story, MP4 for reel) — required for Instagram publish
    let exportMeta: { format: RendererExportFormat; permanentPreviewUrl?: string; exportUrl?: string } | undefined;
    if (design?.id) {
      const exportFormat = canvaExportFormatForKind(signal.kind);
      try {
        const exportResponse = await renderer.export({ designId: design.id, format: exportFormat });
        const exportedUrl = exportResponse.exportUrl;
        if (exportedUrl) {
          const permanentPreviewUrl = await persistCanvaExportFile(
            exportedUrl,
            design.id,
            body.title ?? `SmartAgency - ${signal.title}`,
            exportFormat,
            renderer.provider,
          );
          exportMeta = { format: exportFormat, permanentPreviewUrl, exportUrl: exportedUrl };
        }
      } catch {
        // Autofill succeeds even if export fails — client can retry via /api/canva/export-design
      }

      void persistCanvaArtifact({
        title: body.title ?? `SmartAgency - ${signal.title}`,
        signal,
        tenantId,
        lineage: {
          ...body.lineage,
          selectedTemplateId: decision.template.id,
          selectedBy,
          rendererProvider: renderer.provider,
          auditId: auditEvent.id,
        },
        rendererProvider: renderer.provider,
        templateId: decision.template.id,
        templateTitle: decision.template.title,
        score: decision.score,
        decision,
        designId: design.id,
        editUrl,
        thumbnailUrl,
        jobId: renderResult.job?.id,
        exportMeta,
      });
    }

    // Build field diagnostics: what was filled, what was empty, which are image fields
    const filledFields = Object.entries(decision.autofillData).map(([k, v]) => ({
      field: k,
      type: v.type,
      filled: v.type === 'text' ? Boolean((v as { text?: string }).text?.trim()) : Boolean((v as { asset_id?: string }).asset_id),
      preview: v.type === 'text'
        ? ((v as { text?: string }).text ?? '').slice(0, 60)
        : `[image asset_id: ${(v as { asset_id?: string }).asset_id ?? '—'}]`,
    }));
    const templateDatasetFields = Object.keys(decision.template.dataset ?? {});
    const unfilledFields = templateDatasetFields.filter(f => !decision.autofillData[f]);
    const imageFieldsInTemplate = templateDatasetFields.filter(
      f => (decision.template.dataset?.[f]?.type === 'image'),
    );
    const imageFieldsFilled = imageFieldsInTemplate.filter(f => Boolean(decision.autofillData[f]));

    return NextResponse.json({
      decision: {
        template: decision.template,
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
      },
      // Debug diagnostics — visible in UI Tanı Paneli
      debug: {
        signalKind: signal.kind,
        signalHasImageUrl: Boolean(signal.imageAssetId ?? signal.heroImageAssetId),
        templateDatasetFields,
        filledFields,
        unfilledFields,
        imageFieldsInTemplate,
        imageFieldsFilled,
        imageFieldsMissing: imageFieldsInTemplate.filter(f => !decision.autofillData[f]),
        autofillFieldCount: Object.keys(decision.autofillData).length,
        templateFieldCount: templateDatasetFields.length,
        fillRate: templateDatasetFields.length > 0
          ? Math.round((Object.keys(decision.autofillData).length / templateDatasetFields.length) * 100)
          : 0,
      },
      tenantId,
      rendererProvider: renderer.provider,
      auditId: auditEvent.id,
      job: renderResult.job,
      design,
      export: exportMeta ?? null,
      fieldContracts: fieldContracts.map((c) => ({
        field: c.fieldName,
        std: c.standardName,
        maxChars: c.maxLength,
        source: c.limitSource,
        required: c.required,
      })),
    });
  } catch (error) {
    if (error instanceof RendererAuthError) {
      return NextResponse.json(
        {
          error: error.message,
          connectUrl: error.connectUrl,
        },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Renderer render failed.' },
      { status: 500 },
    );
  }
}

/**
 * Uses gpt-4o-mini to regenerate fields that were word-boundary truncated.
 * Input copy is already synthesized; this pass makes it semantically coherent at the exact limit.
 * Graceful: returns null on any error so the truncated version is used as fallback.
 */
async function rewriteTruncatedFieldsWithLLM(
  signal: CanvaTemplateDecisionInput,
  decision: CanvaTemplateDecision,
): Promise<Record<string, CanvaAutofillField> | null> {
  try {
    const warnings = decision.validationWarnings ?? [];
    // Parse which fieldNames were truncated: "headline trimmed to 36 chars"
    const truncatedFieldNames = new Set(
      warnings
        .filter(w => w.includes('trimmed to'))
        .map(w => w.split(' ')[0])
        .filter(Boolean),
    );
    if (truncatedFieldNames.size === 0) return null;

    const contracts = extractTemplateFieldContracts(decision.template, signal.kind)
      .filter(c => c.type === 'text' && truncatedFieldNames.has(c.fieldName));
    if (contracts.length === 0) return null;

    const promptBlock = buildFieldConstraintPromptBlock(decision.template, signal);

    // Build JSON schema for response
    const properties: Record<string, { type: string; description: string; maxLength: number }> = {};
    for (const c of contracts) {
      properties[c.fieldName] = {
        type: 'string',
        description: c.purpose || c.label,
        maxLength: c.maxLength,
      };
    }

    const { OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Sen bir Canva şablon metin uzmanısın. Her alan için tam olarak belirtilen karakter sınırına sığan, anlamlı ve çarpıcı metin üret. Asla sınırı aşma. JSON döndür.',
        },
        { role: 'user', content: promptBlock },
      ],
      temperature: 0.35,
      response_format: { type: 'json_object' },
      max_tokens: 400,
    });

    const raw = resp.choices[0]?.message?.content ?? '{}';
    const result = JSON.parse(raw) as Record<string, unknown>;

    const rewritten: Record<string, CanvaAutofillField> = {};
    for (const contract of contracts) {
      const val = result[contract.fieldName] ?? result[contract.standardName ?? ''];
      if (typeof val === 'string' && val.trim()) {
        // Hard-cap to the visual limit (LLM rarely exceeds, but guard anyway)
        const text = val.trim().slice(0, contract.maxLength);
        rewritten[contract.fieldName] = { type: 'text', text };
      }
    }

    return Object.keys(rewritten).length > 0 ? rewritten : null;
  } catch {
    return null; // Fallback to existing truncated version
  }
}

async function persistCanvaArtifact(data: {
  title: string;
  signal: CanvaTemplateDecisionInput;
  tenantId: string;
  lineage?: CanvaArtifactLineage;
  rendererProvider: RendererProvider;
  templateId: string;
  templateTitle: string;
  score: number;
  decision: CanvaTemplateDecision;
  designId?: string;
  editUrl?: string;
  thumbnailUrl?: string;
  jobId?: string;
  exportMeta?: { format: RendererExportFormat; permanentPreviewUrl?: string; exportUrl?: string };
}) {
  if (!data.editUrl && !data.thumbnailUrl && !data.exportMeta?.permanentPreviewUrl) return;

  const isReel = data.signal.kind.includes('reel');
  const downloadUrl = data.exportMeta?.permanentPreviewUrl;
  const publishUrl = downloadUrl ?? data.thumbnailUrl ?? data.editUrl;

  try {
    await fetch(`${API_BASE_URL}/api/artifacts/creative`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: data.title,
        contentUrl: publishUrl,
        content: JSON.stringify({
          renderedPreview: {
            kind: data.signal.kind,
            title: data.signal.title,
            summary: data.signal.summary ?? data.signal.caption,
            caption: data.signal.caption,
            imageUrl: isReel ? undefined : (downloadUrl ?? data.thumbnailUrl),
            videoUrl: isReel ? downloadUrl : undefined,
            cta: data.signal.cta,
            hashtags: data.signal.hashtags,
            canvaDesign: {
              rendererProvider: data.rendererProvider,
              designId: data.designId,
              editUrl: data.editUrl,
              thumbnailUrl: data.thumbnailUrl,
              exportUrl: data.exportMeta?.exportUrl,
              permanentPreviewUrl: data.exportMeta?.permanentPreviewUrl,
              exportFormat: data.exportMeta?.format,
              templateId: data.templateId,
              templateTitle: data.templateTitle,
              score: data.score,
              jobId: data.jobId,
              eligibility: data.decision.eligibility,
              riskTier: data.decision.riskTier,
              approvalRequired: data.decision.approvalRequired,
              selectedBy: data.lineage?.selectedBy,
              assetIds: collectCanvaAssetIds(data.signal),
              lineage: data.lineage,
            },
          },
          imageUrl: isReel ? undefined : (downloadUrl ?? data.thumbnailUrl),
          videoUrl: isReel ? downloadUrl : undefined,
          canvaDownloadUrl: downloadUrl,
          canvaEditUrl: data.editUrl,
        }),
        platform: 'canva',
        contentType: data.signal.kind,
        metadata: {
          source: 'canva-autofill',
          provider: data.rendererProvider,
          rendererProvider: data.rendererProvider,
          lineage: data.lineage,
          tenantId: data.tenantId,
          canvaDesignId: data.designId,
          canvaTemplateId: data.templateId,
          canvaTemplateTitle: data.templateTitle,
          canvaScore: data.score,
          canvaJobId: data.jobId,
          canvaEditUrl: data.editUrl,
          canvaExportUrl: data.exportMeta?.exportUrl,
          permanentPreviewUrl: data.exportMeta?.permanentPreviewUrl,
          canvaExportFormat: data.exportMeta?.format,
          imageUrl: isReel ? undefined : (downloadUrl ?? data.thumbnailUrl),
          videoUrl: isReel ? downloadUrl : undefined,
          canvaEligibility: data.decision.eligibility,
          canvaRiskTier: data.decision.riskTier,
          canvaApprovalRequired: data.decision.approvalRequired,
          canvaPolicyWarnings: data.decision.policyWarnings,
          canvaRiskSignals: data.decision.riskSignals,
          canvaRequiredAssetIntents: data.decision.requiredAssetIntents,
          canvaMissingAssetIntents: data.decision.missingAssetIntents,
          canvaAssetIds: collectCanvaAssetIds(data.signal),
          selectedBy: data.lineage?.selectedBy,
          generatedAt: new Date().toISOString(),
        },
      }),
    });
  } catch {
    // Canva design creation should still succeed even if local persistence is unavailable.
  }
}

function collectCanvaAssetIds(signal: CanvaTemplateDecisionInput) {
  return Object.fromEntries(
    ([
      ['imageAssetId', signal.imageAssetId],
      ['heroImageAssetId', signal.heroImageAssetId],
      ['productImageAssetId', signal.productImageAssetId],
      ['backgroundImageAssetId', signal.backgroundImageAssetId],
      ['logoAssetId', signal.logoAssetId],
      ['avatarAssetId', signal.avatarAssetId],
      ['qrCodeAssetId', signal.qrCodeAssetId],
    ] as const).filter(([, value]) => typeof value === 'string' && value.trim().length > 0),
  );
}
