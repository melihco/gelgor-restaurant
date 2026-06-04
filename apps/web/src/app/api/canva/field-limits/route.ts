/**
 * GET /api/canva/field-limits?tenantId=&kind=instagram_post
 *
 * Canonical character limits for Mission Hub / agents:
 * - Dictionary defaults (+ reel caps)
 * - Registry minimum across enabled templates (when synced)
 */
import { NextRequest, NextResponse } from 'next/server';
import { normalizeCanvaFieldName, type CanvaStandardFieldName } from '@/lib/canva-field-dictionary';
import { getDictionaryFieldLimits } from '@/lib/canva-mission-signal';
import type { CanvaContentKind } from '@/lib/canva-template-selection';
import { getCanvaTenantId, readCanvaTemplateRegistry } from '@/lib/canva-template-registry';

export const runtime = 'nodejs';

function aggregateRegistryMin(
  entries: Awaited<ReturnType<typeof readCanvaTemplateRegistry>>,
  kind: CanvaContentKind,
): Partial<Record<CanvaStandardFieldName, number>> {
  const minByStd: Partial<Record<CanvaStandardFieldName, number>> = {};

  for (const entry of entries) {
    if (entry.enabled === false || entry.status === 'disabled') continue;
    const kinds = entry.contentKinds ?? [];
    if (kinds.length > 0 && !kinds.includes(kind) && kind !== 'instagram_post') {
      if (kind === 'instagram_reel' && !kinds.includes('instagram_reel')) continue;
      if (kind === 'instagram_story' && !kinds.includes('instagram_story')) continue;
    }

    for (const contract of entry.fieldContracts ?? []) {
      if (contract.type !== 'text' || !contract.maxLength) continue;
      const std =
        (contract.standardName as CanvaStandardFieldName | null) ??
        normalizeCanvaFieldName(contract.fieldName);
      if (!std) continue;
      const prev = minByStd[std];
      if (!prev || contract.maxLength < prev) {
        minByStd[std] = contract.maxLength;
      }
    }
  }

  return minByStd;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tenantId = getCanvaTenantId(searchParams.get('tenantId'));
  const kindParam = searchParams.get('kind') ?? 'instagram_post';
  const kind = (
    kindParam.includes('reel') ? 'instagram_reel'
      : kindParam.includes('story') ? 'instagram_story'
        : kindParam.includes('plan') ? 'instagram_plan'
          : 'instagram_post'
  ) as CanvaContentKind;

  const entries = await readCanvaTemplateRegistry(tenantId);
  const registryMin = aggregateRegistryMin(entries, kind);
  const limits = getDictionaryFieldLimits(kind, registryMin);

  const templatesWithContracts = entries.filter(
    (e) => (e.fieldContracts?.length ?? 0) > 0 && e.enabled !== false,
  ).length;

  return NextResponse.json({
    tenantId,
    kind,
    limits,
    registryMin,
    templatesWithContracts,
    registryEntryCount: entries.length,
    /** Instagram feed caption — not limited by Canva design fields */
    instagramCaptionMax: 2200,
    note:
      'limits[].maxChars = güvenli üst sınır (sözlük + reel cap + kayıtlı şablonların minimumu). ' +
      'Feed caption ayrı tutulur; Canva tasarım metinleri canvaFieldCopy ile doldurulur.',
  });
}
