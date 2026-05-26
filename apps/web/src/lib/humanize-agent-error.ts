/**
 * Normalize agent / Crew / OpenAI API error strings for product UI (Turkish).
 * Avoids showing raw JSON, Python-style dict fragments, or HTTP dumps in lists.
 */

export type HumanizedAgentError = {
  /** Kısa başlık (detay sayfası şeridi) */
  title: string;
  /** Liste hücresi için tek satır */
  summary: string;
  /** Kullanıcıya 1–2 cümle açıklama */
  detail: string;
  /** Orijinal (teknik detay / destek) */
  raw: string;
};

function extractDoubleQuotedField(text: string, field: string): string | null {
  const re = new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'i');
  const m = re.exec(text);
  if (m?.[1]) {
    return m[1]
      .replace(/\\n/g, ' ')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .trim();
  }
  return null;
}

/** Python-ish single-quoted dict fragments from some backends */
function extractSingleQuotedField(text: string, field: string): string | null {
  const re = new RegExp(`'${field}'\\s*:\\s*'([^']*)'`, 'i');
  const m = re.exec(text);
  return m?.[1]?.trim() ?? null;
}

function extractNestedMessage(text: string): string | null {
  const fromJson = extractDoubleQuotedField(text, 'message');
  if (fromJson) return fromJson;
  const fromPy = extractSingleQuotedField(text, 'message');
  if (fromPy) return fromPy;

  const detail = extractDoubleQuotedField(text, 'detail');
  if (detail) {
    const inner = extractNestedMessage(detail) ?? extractSingleQuotedField(detail, 'message');
    if (inner) return inner;
    if (!/^\s*\{/.test(detail) && detail.length < 2000) return detail;
  }
  return null;
}

function tryParseTopLevelDetail(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  const slice = text.slice(start);
  try {
    const parsed = JSON.parse(slice) as Record<string, unknown>;
    if (typeof parsed.detail === 'string') return parsed.detail;
    if (typeof parsed.message === 'string') return parsed.message;
  } catch {
    /* JSON genelde gövde + ek metin veya hibrit dict ile bozulur; regex / anahtar kelime yolları devreye girer */
  }
  return null;
}

function friendlyFromInner(inner: string, low: string): Pick<HumanizedAgentError, 'title' | 'summary' | 'detail'> | null {
  const i = inner.toLowerCase();
  if (
    i.includes('insufficient_quota') ||
    i.includes('exceeded your current quota') ||
    (i.includes('billing') && i.includes('quota'))
  ) {
    return {
      title: 'OpenAI kotası',
      summary: 'OpenAI kullanım kotanız doldu.',
      detail:
        'Yapay zeka sağlayıcısı (OpenAI) hesabınızda kullanım limiti aşıldı. OpenAI panelinden faturalama ve plan ayarlarınızı kontrol edin; limit yükseltilince görevler yeniden çalıştırılabilir.',
    };
  }
  if (i.includes('rate_limit') || (low.includes('429') && (i.includes('rate') || i.includes('too many requests')))) {
    return {
      title: 'İstek limiti',
      summary: 'Çok sık istek gönderildi (429).',
      detail: 'Sağlayıcı geçici istek sınırına takıldınız. Bir süre sonra tekrar deneyin veya daha az paralel görev çalıştırın.',
    };
  }
  if (i.includes('invalid_api_key') || i.includes('incorrect api key')) {
    return {
      title: 'API anahtarı',
      summary: 'Geçersiz veya eksik API anahtarı.',
      detail: 'OpenAI veya ilgili servis API anahtarı yanlış ya da ortam değişkenlerinde tanımlı değil. Yönetici ayarlarını kontrol edin.',
    };
  }
  if (i.includes('context_length') || i.includes('maximum context')) {
    return {
      title: 'Bağlam çok uzun',
      summary: 'Model bağlam limiti aşıldı.',
      detail: 'Girdi veya geçmiş çok büyük. Görevi daha kısa veriyle tekrarlayın veya özetleyici bir adım ekleyin.',
    };
  }
  return null;
}

function stripLeadingServiceNoise(s: string): string {
  return s.replace(/^Crew\s+orchestration\s+failed:\s*/i, '').replace(/^Task\s+execution\s+failed:\s*/i, '').trim();
}

function shortenForList(s: string, max = 140): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * API / Crew ham hata metnini Türkçe başlık + özet + açıklama + orijinal olmak üzere dönüştürür.
 * Boş veya yalnızca whitespace için `null`.
 */
export function humanizeAgentError(raw: string | null | undefined): HumanizedAgentError | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const low = trimmed.toLowerCase();

  const parsedDetail = tryParseTopLevelDetail(trimmed);
  const nested = extractNestedMessage(trimmed);
  const inner = stripLeadingServiceNoise(nested ?? parsedDetail ?? '');

  const fromInner = inner ? friendlyFromInner(inner, low) : null;
  if (fromInner) {
    return { ...fromInner, raw: trimmed };
  }

  if (low.includes('insufficient_quota') || low.includes('exceeded your current quota')) {
    return {
      title: 'OpenAI kotası',
      summary: 'OpenAI kullanım kotanız doldu.',
      detail:
        'OpenAI hesabınızda kullanım limiti aşıldı. Faturalama ve planınızı platform.openai.com üzerinden kontrol edin.',
      raw: trimmed,
    };
  }

  if (low.includes('rate_limit') || (trimmed.includes('429') && (low.includes('quota') === false || low.includes('rate')))) {
    return {
      title: 'İstek limiti',
      summary: 'Sağlayıcı istek limiti (429).',
      detail: 'Çok sık veya çok hacimli istek algılandı. Kısa süre sonra yeniden deneyin.',
      raw: trimmed,
    };
  }

  if (low.includes('502') || low.includes('badgateway') || low.includes('bad gateway')) {
    return {
      title: 'AI servisi yanıt vermedi',
      summary: 'AI motoru geçici olarak erişilemedi (502).',
      detail:
        'Arka plandaki Crew / LLM servisi isteği tamamlayamadı. Servisin ayakta olduğundan emin olun; sorun devam ederse birkaç dakika sonra tekrar deneyin.',
      raw: trimmed,
    };
  }

  if (low.includes('503') || low.includes('service unavailable')) {
    return {
      title: 'Servis kullanılamıyor',
      summary: 'Servis geçici olarak kapalı (503).',
      detail: 'Altyapı geçici olarak yanıt vermiyor. Daha sonra tekrar deneyin.',
      raw: trimmed,
    };
  }

  if (low.includes('504') || low.includes('timeout') || low.includes('timed out')) {
    return {
      title: 'Zaman aşımı',
      summary: 'İşlem süresi doldu.',
      detail: 'Görev çok uzun sürdü veya ağ zaman aşımına uğradı. Daha sonra veya daha küçük veriyle tekrar deneyin.',
      raw: trimmed,
    };
  }

  if (low.includes('401') || low.includes('403') || low.includes('unauthorized') || low.includes('forbidden')) {
    return {
      title: 'Yetkilendirme',
      summary: 'İstek reddedildi (yetki).',
      detail: 'Oturum veya API anahtarı geçersiz olabilir. Çıkış yapıp tekrar giriş yapın veya yöneticiye başvurun.',
      raw: trimmed,
    };
  }

  if (low.includes('econnrefused') || low.includes('connection refused')) {
    return {
      title: 'Bağlantı reddedildi',
      summary: 'Backend servisine bağlanılamadı.',
      detail: 'AI veya API sunucusu çalışmıyor olabilir. Geliştirme ortamında servisleri başlatın.',
      raw: trimmed,
    };
  }

  const humanLine = nested ?? parsedDetail;
  if (humanLine && humanLine.length > 0 && humanLine.length < 500 && !/^\s*[\[{]/.test(humanLine)) {
    const cleaned = stripLeadingServiceNoise(humanLine);
    return {
      title: 'Görev hatası',
      summary: shortenForList(cleaned, 120),
      detail: cleaned,
      raw: trimmed,
    };
  }

  const cutJson = trimmed.replace(/\{[\s\S]*$/, '').replace(/\.$/, '').trim();
  const fallback = cutJson.length > 15 ? cutJson : 'Beklenmeyen bir hata oluştu.';

  return {
    title: 'Çalıştırma hatası',
    summary: shortenForList(fallback, 120),
    detail: `${fallback} Teknik ayrıntı destek veya geliştirici günlükleri için saklanır.`,
    raw: trimmed,
  };
}

export function humanizeAgentErrorSummary(raw: string | null | undefined): string | null {
  return humanizeAgentError(raw)?.summary ?? null;
}
