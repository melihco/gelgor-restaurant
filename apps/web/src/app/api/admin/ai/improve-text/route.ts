import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { assertPlatformAdminAccess } from '@/lib/platform-admin-auth';
import { fetchCrewBackendJson } from '@/lib/crew-proxy';
import { serverConfig } from '@/lib/server-config';

export const runtime = 'nodejs';
export const maxDuration = 60;

const FIELD_LABELS: Record<string, string> = {
  description: 'marka açıklaması',
  brand_tone: 'marka tonu',
  visual_style: 'görsel stil',
  target_audience: 'hedef kitle',
  content_pillars: 'içerik sütunları',
  custom_rules: 'özel kurallar',
  instagram_bio: 'Instagram bio',
  website_summary: 'web sitesi özeti',
  location: 'konum',
  visual_dna: 'görsel DNA',
  brand_dna: 'marka DNA',
};

export async function POST(req: NextRequest) {
  const access = await assertPlatformAdminAccess(req);
  if (access instanceof Response) return access;

  const body = await req.json().catch(() => ({})) as {
    workspaceId?: string;
    field?: string;
    currentText?: string;
    instruction?: string;
  };

  const workspaceId = String(body.workspaceId ?? '').trim();
  const field = String(body.field ?? 'description').trim();
  const currentText = String(body.currentText ?? '').trim();
  const instruction = String(body.instruction ?? '').trim();

  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });
  }
  if (!currentText) {
    return NextResponse.json({ error: 'currentText required' }, { status: 400 });
  }

  const brandRes = await fetchCrewBackendJson<Record<string, unknown>>(
    `/api/v1/brand-context/${workspaceId}`,
    { workspaceId, timeoutMs: 10_000 },
  );
  const brand = brandRes.data ?? {};
  const brandName = String(brand.business_name ?? brand.brand_name ?? 'Marka');
  const businessType = String(brand.business_type ?? '');

  const apiKey = serverConfig.openai.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 503 });
  }

  const openai = new OpenAI({ apiKey });
  const fieldLabel = FIELD_LABELS[field] ?? field;

  const system = [
    'Sen Smart Agency operatör asistanısın.',
    'Görev: tenant marka metnini operatör onayı için düzeltmek — kısa, net, sektöre uygun Türkçe veya markanın dilinde.',
    'Uydurma adres/telefon ekleme. Mevcut gerçekleri koru, stili iyileştir.',
    `Marka: ${brandName}. Sektör/tip: ${businessType || 'bilinmiyor'}.`,
  ].join(' ');

  const userPrompt = [
    `Alan: ${fieldLabel} (${field})`,
    instruction ? `Operatör talimatı: ${instruction}` : 'Metni daha profesyonel ve tutarlı hale getir.',
    '',
    'Mevcut metin:',
    currentText,
    '',
    'Yanıtı yalnızca düzeltilmiş metin olarak ver — açıklama veya markdown ekleme.',
  ].join('\n');

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_ADMIN_EDIT_MODEL ?? 'gpt-4o-mini',
      temperature: 0.35,
      max_tokens: 1200,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userPrompt },
      ],
    });

    const improvedText = completion.choices[0]?.message?.content?.trim() ?? '';
    if (!improvedText) {
      return NextResponse.json({ error: 'Empty model response' }, { status: 502 });
    }

    return NextResponse.json({
      field,
      improvedText,
      model: completion.model,
      tokensUsed: completion.usage?.total_tokens ?? 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 502 });
  }
}
