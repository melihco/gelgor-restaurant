/**
 * GET /api/canva/template-field-contracts?templateId=X&kind=instagram_story
 *
 * Returns the resolved field contracts (char limits) for a given template.
 * Used by agents and UI to know exactly how many characters each field accepts.
 * Reads from registry (persisted) first; falls back to live Canva API fetch.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCanvaAccessToken } from '@/lib/canva-oauth';
import { canvaFetch } from '@/lib/canva-connect-api';
import {
  extractTemplateFieldContracts,
  buildFieldConstraintPromptBlock,
  type CanvaContentKind,
  type CanvaTemplateDatasetField,
  type CanvaTemplateMetadata,
} from '@/lib/canva-template-selection';
import {
  getCanvaTenantId,
  readCanvaTemplateRegistry,
  syncTemplateFieldContracts,
} from '@/lib/canva-template-registry';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const templateId = searchParams.get('templateId');
  const kind = (searchParams.get('kind') ?? 'instagram_post') as CanvaContentKind;
  const tenantId = getCanvaTenantId(searchParams.get('tenantId'));

  if (!templateId) {
    return NextResponse.json({ error: 'templateId param required' }, { status: 400 });
  }

  // Try registry first (persisted from previous dataset sync)
  const entries = await readCanvaTemplateRegistry(tenantId);
  const registryEntry = entries.find(e => e.templateId === templateId);

  let dataset: Record<string, CanvaTemplateDatasetField> | null = null;

  if (registryEntry?.fieldContracts?.length) {
    // Reconstruct a minimal dataset from persisted contracts (no Canva API call needed)
    dataset = Object.fromEntries(
      registryEntry.fieldContracts.map(c => [
        c.fieldName,
        {
          type: c.type,
          characterLimit: c.limitSource === 'api_characterLimit' ? c.maxLength : undefined,
          defaultText: c.defaultText,
          required: c.required,
          purpose: c.purpose,
        } satisfies CanvaTemplateDatasetField,
      ]),
    );
  } else {
    // Live fetch from Canva API
    const token = await getCanvaAccessToken();
    if (!token) {
      return NextResponse.json({ error: 'Canva not connected', connectUrl: '/api/canva/oauth/login' }, { status: 401 });
    }
    try {
      const result = await canvaFetch<{ dataset?: Record<string, CanvaTemplateDatasetField> }>(
        token,
        `/brand-templates/${encodeURIComponent(templateId)}/dataset`,
      );
      dataset = result.dataset ?? {};
      // Persist for next time
      if (Object.keys(dataset).length > 0) {
        void syncTemplateFieldContracts(templateId, dataset, tenantId);
      }
    } catch (err) {
      return NextResponse.json(
        { error: `Failed to fetch template dataset: ${err instanceof Error ? err.message : err}` },
        { status: 502 },
      );
    }
  }

  const templateMeta: CanvaTemplateMetadata = {
    id: templateId,
    title: registryEntry?.title ?? templateId,
    contentKinds: registryEntry?.contentKinds,
    aspectRatio: registryEntry?.aspectRatio,
    dataset: dataset ?? {},
  };

  const contracts = extractTemplateFieldContracts(templateMeta, kind);
  const promptBlock = buildFieldConstraintPromptBlock(templateMeta, {
    kind,
    headline: undefined,
    caption: undefined,
    summary: undefined,
    cta: undefined,
    brandName: undefined,
    location: undefined,
    date: undefined,
    offer: undefined,
    price: undefined,
  });

  const textFields = contracts.filter(c => c.type === 'text');
  const imageFields = contracts.filter(c => c.type === 'image');

  return NextResponse.json({
    templateId,
    templateTitle: registryEntry?.title ?? templateId,
    kind,
    aspectRatio: registryEntry?.aspectRatio,
    contentKinds: registryEntry?.contentKinds,
    fieldContractsSyncedAt: registryEntry?.fieldContractsSyncedAt,
    fromRegistry: Boolean(registryEntry?.fieldContracts?.length),
    contracts,
    textFields,
    imageFields,
    /** Agent-ready prompt block — inject into any LLM that generates copy for this template */
    agentPromptBlock: promptBlock,
    /** Summary table for quick inspection */
    summary: textFields.map(c => ({
      field: c.fieldName,
      std: c.standardName,
      maxChars: c.maxLength,
      source: c.limitSource,
      required: c.required,
      defaultText: c.defaultText ?? null,
    })),
  });
}
