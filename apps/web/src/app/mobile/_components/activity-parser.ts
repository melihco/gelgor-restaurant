/**
 * Parses raw agent run summaries into structured, UX-friendly data.
 * Handles all real backend agent types.
 */

export interface ParsedActivityContent {
  kind:
    | 'card_designs'        // BlogWriter / SocialMediaDesigner → array of visual cards
    | 'content_calendar'    // InstagramContentGenerator → array of day plans
    | 'performance_report'  // AiCeo / GoogleAdsAnalyst → analytics/performance object
    | 'analytics_report'    // AnalyticsAnalyst → website/social analytics
    | 'review_replies'      // CustomerReviewResponder → reply drafts
    | 'action_result'       // Execution job result
    | 'text'                // Plain text output
    | 'empty';              // No meaningful content

  // Preview (for card)
  previewTitle: string | null;
  previewSub: string | null;
  previewCount: number | null;      // number of items in array

  // Full structured data for detail view
  items: ParsedItem[];
  summary: string | null;
  raw: unknown;
}

export interface ParsedItem {
  title: string;
  subtitle?: string | null;
  body?: string | null;
  tags?: string[];
  meta?: { label: string; value: string }[];
}

// ─── Strip ```json wrapper ────────────────────────────────────────────
function stripCodeBlock(s: string): string {
  return s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

function safeParseJson(raw: string | null | undefined): unknown {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = stripCodeBlock(raw.trim());
  if (!cleaned || cleaned === '[]' || cleaned === '{}' || cleaned === 'null') return null;
  try { return JSON.parse(cleaned); } catch { return null; }
}

function pickStr(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (v && typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

// ─── Agent-specific parsers ───────────────────────────────────────────

function parseCardDesigns(arr: unknown[]): ParsedItem[] {
  return arr.map((item: any) => ({
    title: pickStr(item.concept_title, item.headline, item.title, item.card_type) ?? 'Kart Tasarımı',
    subtitle: pickStr(item.format, item.card_type),
    body: pickStr(item.caption, item.copy_main, item.copy_secondary, item.cta_text, item.background_intent),
    tags: [item.format, item.card_type, item.background_intent].filter(Boolean) as string[],
    meta: [
      item.format         && { label: 'Format',     value: item.format },
      item.cta_text       && { label: 'CTA',         value: item.cta_text },
      item.posting_time   && { label: 'Yayın Zamanı',value: item.posting_time },
    ].filter(Boolean) as { label: string; value: string }[],
  }));
}

function parseContentCalendar(arr: unknown[]): ParsedItem[] {
  return arr.map((item: any) => {
    const ct = pickStr(item.content_type, item.content_kind, item.format)?.replace(/_/g, ' ');
    const useCase = pickStr(item.template_use_case, item.use_case)?.replace(/_/g, ' ');
    return {
      title:
        pickStr(
          item.headline,
          item.concept_title,
          item.hook,
          item.idea_title,
          item.theme,
          item.title,
          typeof item.day === 'number' ? `Gün ${item.day}` : null,
        ) ?? 'İçerik fikri',
      subtitle: pickStr(useCase, ct),
      body: pickStr(
        item.caption_draft,
        item.caption,
        item.brief,
        item.description,
        item.script,
        item.visual_direction,
        item.visualDirection,
        item.body,
      ),
      tags: [
        ct,
        useCase,
        pickStr(item.posting_time_suggestion, item.postingTime, item.date_suggestion),
        item.event_date,
        item.location,
      ].filter(Boolean) as string[],
      meta: [
        typeof item.day === 'number' && { label: 'Gün', value: String(item.day) },
        item.date_suggestion && { label: 'Tarih', value: item.date_suggestion },
        item.content_type && { label: 'Format', value: String(item.content_type).replace(/_/g, ' ') },
        item.content_kind && { label: 'Kanal', value: String(item.content_kind).replace(/_/g, ' ') },
        item.template_use_case && { label: 'Şablon', value: String(item.template_use_case).replace(/_/g, ' ') },
        item.location && { label: 'Konum', value: item.location },
        item.cta && { label: 'CTA', value: item.cta },
      ].filter(Boolean) as { label: string; value: string }[],
    };
  });
}

/** İçerik takvimi / ideation slot dizisi (headline, content_type, template_use_case vb.) */
function firstItemLooksLikeContentSlot(first: unknown): boolean {
  if (!first || typeof first !== 'object') return false;
  const o = first as Record<string, unknown>;
  return (
    typeof o.headline === 'string' ||
    typeof o.content_type === 'string' ||
    typeof o.template_use_case === 'string' ||
    typeof o.content_kind === 'string' ||
    typeof o.caption_draft === 'string'
  );
}

/**
 * İlk parse boş kaldıysa (agent adı eşleşmezse): özet + log alanlarını farklı agent ipuçlarıyla yeniden dene.
 */
export function coerceParsedActivityContent(
  agentType: string,
  primarySummary: string | null | undefined,
  fallbackSummary?: string | null | undefined,
): ParsedActivityContent {
  const raws = [primarySummary, fallbackSummary].filter((s): s is string => typeof s === 'string' && stripCodeBlock(s).length > 2);
  const hints = [
    agentType,
    'InstagramContentGenerator',
    'SocialMediaDesigner',
    'content',
    'instagram',
    'ContentAgent',
  ].filter(Boolean);
  for (const raw of raws) {
    for (const hint of hints) {
      const c = parseAgentSummary(hint, raw);
      if (c.kind !== 'empty') return c;
    }
  }
  return parseAgentSummary(agentType, primarySummary ?? '');
}

function parsePerformanceReport(obj: Record<string, unknown>): ParsedItem[] {
  const items: ParsedItem[] = [];

  // Performance summary
  const summary = pickStr(obj.performance_summary, obj.summary, obj.executive_summary, obj.overview);
  if (summary) {
    items.push({ title: 'Performans Özeti', body: summary.slice(0, 600) });
  }

  // Campaigns
  const campaigns = Array.isArray(obj.campaigns) ? obj.campaigns : Array.isArray(obj.campaign_recommendations) ? obj.campaign_recommendations : [];
  for (const c of campaigns.slice(0, 5)) {
    if (!c || typeof c !== 'object') continue;
    const co = c as Record<string, unknown>;
    items.push({
      title: pickStr(co.name, co.campaign_name, co.title) ?? 'Kampanya',
      subtitle: pickStr(co.status),
      body: pickStr(co.recommendation, co.insight, co.notes),
      meta: [
        co.budget       && { label: 'Bütçe',   value: String(co.budget) },
        co.roas         && { label: 'ROAS',     value: String(co.roas) },
        co.clicks       && { label: 'Tıklama',  value: String(co.clicks) },
        co.conversions  && { label: 'Dönüşüm',  value: String(co.conversions) },
      ].filter(Boolean) as { label: string; value: string }[],
    });
  }

  // Top recommendations
  const recs = Array.isArray(obj.recommendations) ? obj.recommendations : Array.isArray(obj.action_items) ? obj.action_items : [];
  for (const r of recs.slice(0, 4)) {
    const text = typeof r === 'string' ? r : pickStr((r as any)?.action, (r as any)?.recommendation, (r as any)?.text);
    if (text) items.push({ title: 'Öneri', body: text.slice(0, 300) });
  }

  return items;
}

function parseAnalyticsReport(obj: Record<string, unknown>): ParsedItem[] {
  const items: ParsedItem[] = [];

  const summary = pickStr(obj.executive_summary, obj.summary, obj.overview, obj.insights);
  if (summary) items.push({ title: 'Yönetici Özeti', body: summary.slice(0, 600) });

  // Key metrics
  const metricsObj = (obj.key_metrics ?? obj.metrics ?? obj.traffic_overview ?? {}) as Record<string, unknown>;
  const metaList = Object.entries(metricsObj)
    .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
    .slice(0, 6)
    .map(([k, v]) => ({ label: k.replace(/_/g, ' '), value: String(v) }));
  if (metaList.length > 0) {
    items.push({ title: 'Metrikler', meta: metaList });
  }

  // Top pages / recommendations
  const recs = Array.isArray(obj.recommendations) ? obj.recommendations : [];
  for (const r of recs.slice(0, 3)) {
    const text = typeof r === 'string' ? r : pickStr((r as any)?.recommendation, (r as any)?.action);
    if (text) items.push({ title: 'Öneri', body: text.slice(0, 250) });
  }

  return items;
}

function parseReviewReplies(arr: unknown[]): ParsedItem[] {
  return arr.map((item: any) => ({
    title: pickStr(item.reviewer, item.author, item.name) ?? 'Müşteri Yorumu',
    subtitle: item.rating ? `${'★'.repeat(Math.round(Number(item.rating)))} ${item.rating}` : null,
    body: pickStr(item.reply, item.response, item.draft),
    meta: [
      item.sentiment && { label: 'Duygu', value: item.sentiment },
      item.platform  && { label: 'Platform', value: item.platform },
    ].filter(Boolean) as { label: string; value: string }[],
  }));
}

// ─── Execution job result parser ─────────────────────────────────────
export function parseJobResult(resultDataStr: string | null | undefined): ParsedActivityContent {
  const parsed = safeParseJson(resultDataStr);
  if (!parsed || typeof parsed !== 'object') {
    return { kind: 'empty', previewTitle: null, previewSub: null, previewCount: null, items: [], summary: null, raw: null };
  }
  const obj = parsed as Record<string, unknown>;
  const count = Number(obj.itemCount ?? obj.count ?? 0);
  const isDryRun = obj.wouldCreateDrafts === true;

  return {
    kind: 'action_result',
    previewTitle: count > 0 ? `${count} öğe işlendi` : 'İşlem tamamlandı',
    previewSub: isDryRun ? 'Test modu — gerçek gönderim yapılmadı' : 'Canlı gönderim tamamlandı',
    previewCount: count || null,
    items: [{
      title: count > 0 ? `${count} öğe başarıyla işlendi` : 'İşlem tamamlandı',
      body: isDryRun ? 'Bu işlem dry-run modunda çalıştırıldı. Gerçek veriye dokunulmadı.' : 'İşlem başarıyla tamamlandı.',
      meta: [
        count > 0 && { label: 'İşlenen', value: String(count) },
        { label: 'Mod', value: isDryRun ? 'Dry-run' : 'Canlı' },
      ].filter(Boolean) as { label: string; value: string }[],
    }],
    summary: null,
    raw: parsed,
  };
}

// ─── Main export ──────────────────────────────────────────────────────
export function parseAgentSummary(
  agentType: string,
  summaryRaw: string | null | undefined,
): ParsedActivityContent {
  const parsed = safeParseJson(summaryRaw);
  const type = (agentType ?? '').toLowerCase();

  // Empty
  if (parsed === null || (Array.isArray(parsed) && parsed.length === 0)) {
    return {
      kind: 'empty',
      previewTitle: null,
      previewSub: null,
      previewCount: null,
      items: [],
      summary: null,
      raw: null,
    };
  }

  // ── Array outputs ──
  if (Array.isArray(parsed) && parsed.length > 0) {
    const first = parsed[0] as Record<string, unknown> | undefined;
    const slotShape =
      type.includes('instagram') ||
      type.includes('content') ||
      typeof (first as any)?.day === 'number' ||
      firstItemLooksLikeContentSlot(first);

    // Takvim + content ideation (Social Guru vb. — agent adında "content" geçmeyebilir)
    if (slotShape) {
      const items = parseContentCalendar(parsed);
      const first = items[0];
      return {
        kind: 'content_calendar',
        previewTitle: `${parsed.length} içerik planlandı`,
        previewSub: first?.title ?? null,
        previewCount: parsed.length,
        items,
        summary: null,
        raw: parsed,
      };
    }

    // Card designs (BlogWriter / SocialMediaDesigner)
    if ((parsed[0] as any)?.card_type !== undefined || type.includes('blog') || type.includes('designer') || type.includes('writer')) {
      const items = parseCardDesigns(parsed);
      const first = items[0];
      return {
        kind: 'card_designs',
        previewTitle: `${parsed.length} tasarım kartı üretildi`,
        previewSub: first?.title ?? null,
        previewCount: parsed.length,
        items,
        summary: null,
        raw: parsed,
      };
    }

    // Review replies
    if (type.includes('review') || (parsed[0] as any)?.reply !== undefined || (parsed[0] as any)?.reviewer !== undefined) {
      const items = parseReviewReplies(parsed);
      return {
        kind: 'review_replies',
        previewTitle: `${parsed.length} yorum yanıtı oluşturuldu`,
        previewSub: items[0]?.title ?? null,
        previewCount: parsed.length,
        items,
        summary: null,
        raw: parsed,
      };
    }

    // Generic array
    const items = parsed.slice(0, 10).map((item: any) => ({
      title: (pickStr(item?.title, item?.name, item?.headline, item?.theme, String(item)) ?? 'Öğe').slice(0, 80),
      body: pickStr(
        item?.caption_draft,
        item?.caption,
        item?.visual_direction,
        item?.description,
        item?.brief,
        item?.body,
      )?.slice(0, 400),
      tags: [item?.content_type, item?.template_use_case, item?.location].filter(Boolean).map((x: unknown) => String(x).replace(/_/g, ' ')),
    }));
    return {
      kind: 'card_designs',
      previewTitle: `${parsed.length} öğe üretildi`,
      previewSub: items[0]?.title ?? null,
      previewCount: parsed.length,
      items,
      summary: null,
      raw: parsed,
    };
  }

  // ── Object outputs ──
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;

    // Analytics report
    if (type.includes('analytics') || obj.executive_summary !== undefined || obj.traffic_overview !== undefined) {
      const items = parseAnalyticsReport(obj);
      const summaryText = pickStr(obj.executive_summary, obj.summary, obj.overview);
      return {
        kind: 'analytics_report',
        previewTitle: 'Analytics raporu hazır',
        previewSub: summaryText ? summaryText.slice(0, 80) + '...' : null,
        previewCount: null,
        items,
        summary: summaryText,
        raw: parsed,
      };
    }

    // Performance / CEO report
    if (type.includes('ceo') || type.includes('ads') || obj.performance_summary !== undefined || obj.campaigns !== undefined) {
      const items = parsePerformanceReport(obj);
      const summaryText = pickStr(obj.performance_summary, obj.summary, obj.executive_summary);
      return {
        kind: 'performance_report',
        previewTitle: type.includes('ads') ? 'Google Ads raporu hazır' : 'Performans raporu hazır',
        previewSub: summaryText ? summaryText.slice(0, 80) + '...' : null,
        previewCount: null,
        items,
        summary: summaryText,
        raw: parsed,
      };
    }

    // Generic object — show key fields
    const items: ParsedItem[] = Object.entries(obj)
      .filter(([, v]) => v && (typeof v === 'string' || typeof v === 'number') && String(v).length > 2)
      .slice(0, 6)
      .map(([k, v]) => ({ title: k.replace(/_/g, ' '), body: String(v).slice(0, 200) }));

    return {
      kind: 'text',
      previewTitle: pickStr(obj.title, obj.summary, obj.headline)?.slice(0, 80) ?? 'Çıktı hazır',
      previewSub: null,
      previewCount: null,
      items,
      summary: null,
      raw: parsed,
    };
  }

  // ── Plain text ──
  const text = typeof summaryRaw === 'string' ? stripCodeBlock(summaryRaw) : '';
  return {
    kind: 'text',
    previewTitle: text.slice(0, 80) || 'Çıktı hazır',
    previewSub: null,
    previewCount: null,
    items: [{ title: 'Çıktı', body: text.slice(0, 2000) }],
    summary: text,
    raw: text,
  };
}
