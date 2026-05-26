'use client';

import type { ComponentType, ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Loader2,
  ServerCog,
  Terminal,
  X,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusPill } from '@/tailadmin/components/application/PageElements';
import type { OperationsSummary } from '@/types';

type AgentRun = OperationsSummary['recentAgentRuns'][number];
type ExecutionJob = OperationsSummary['recentExecutionJobs'][number];

function formatTimeFull(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatDuration(ms: number) {
  if (!ms) return '—';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} sn`;
  return `${Math.round(ms / 60_000)} dk`;
}

function safeParseJson(raw: string | undefined | null): Record<string, unknown> | null {
  if (!raw || !raw.trim()) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function prettyJson(raw: string | undefined | null): string {
  const o = safeParseJson(raw);
  if (o) {
    try {
      return JSON.stringify(o, null, 2);
    } catch {
      /* fallthrough */
    }
  }
  return raw?.trim() || '—';
}

function strVal(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}

/** JSON parçası / kısaltılmış log içinden "key": "value" string değerini çıkarır */
function extractJsonStringValue(text: string, key: string): string | undefined {
  const needle = `"${key}"`;
  const i = text.indexOf(needle);
  if (i === -1) return undefined;
  const colon = text.indexOf(':', i + needle.length);
  if (colon === -1) return undefined;
  let j = colon + 1;
  while (j < text.length && /\s/.test(text[j]!)) j++;
  if (text[j] !== '"') return undefined;
  j++;
  let out = '';
  while (j < text.length) {
    const c = text[j]!;
    if (c === '\\') {
      j++;
      if (j < text.length) {
        out += text[j]!;
        j++;
      }
      continue;
    }
    if (c === '"') break;
    out += c;
    j++;
  }
  const v = out.trim();
  return v.length > 0 ? v : undefined;
}

function humanizeSnake(s: string): string {
  return s.replace(/_/g, ' ');
}

function formatContentKindLabel(kind?: string): string | undefined {
  if (!kind) return undefined;
  const map: Record<string, string> = {
    instagram_post: 'Instagram gönderisi',
    instagram_story: 'Instagram hikâye',
    instagram_reel: 'Instagram Reels',
    post: 'Gönderi',
    story: 'Hikâye',
    reel: 'Reels',
  };
  const k = kind.toLowerCase();
  return map[k] ?? humanizeSnake(kind);
}

interface ContentIdeaPreview {
  headline?: string;
  conceptTitle?: string;
  contentType?: string;
  contentKind?: string;
  templateUseCase?: string;
  eventDate?: string;
  location?: string;
  captionSnippet?: string;
  cta?: string;
  hashtags: string[];
}

function mapIdeaRecord(o: Record<string, unknown>): ContentIdeaPreview {
  const hashtagsRaw = o.hashtags;
  let hashtags: string[] = [];
  if (Array.isArray(hashtagsRaw)) {
    hashtags = hashtagsRaw.map((x) => String(x)).filter(Boolean).slice(0, 12);
  } else if (typeof hashtagsRaw === 'string') {
    hashtags = hashtagsRaw
      .split(/[,\n]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 12);
  }
  const cap = strVal(o.caption_draft) ?? strVal(o.caption);
  return {
    headline: strVal(o.headline) ?? strVal(o.hook) ?? strVal(o.concept_title) ?? strVal(o.title),
    conceptTitle: strVal(o.concept_title) ?? strVal(o.title),
    contentType: strVal(o.content_type) ?? strVal(o.type),
    contentKind: strVal(o.content_kind),
    templateUseCase: strVal(o.template_use_case),
    eventDate: strVal(o.event_date) ?? strVal(o.date) ?? strVal(o.date_suggestion),
    location: strVal(o.location) ?? strVal(o.venue_name) ?? strVal(o.venue),
    captionSnippet: cap ? (cap.length > 360 ? `${cap.slice(0, 360)}…` : cap) : undefined,
    cta: strVal(o.cta) ?? strVal(o.call_to_action),
    hashtags,
  };
}

function tryParseContentIdeaPreview(summary: string | undefined | null): ContentIdeaPreview | null {
  if (!summary || !summary.trim()) return null;
  const t = summary.trim();

  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      const parsed = JSON.parse(t) as unknown;
      if (Array.isArray(parsed) && parsed[0] && typeof parsed[0] === 'object' && parsed[0] !== null) {
        return mapIdeaRecord(parsed[0] as Record<string, unknown>);
      }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const rec = parsed as Record<string, unknown>;
        for (const k of ['ideas', 'content_ideas', 'posts', 'content', 'items']) {
          const arr = rec[k];
          if (Array.isArray(arr) && arr[0] && typeof arr[0] === 'object' && arr[0] !== null) {
            return mapIdeaRecord(arr[0] as Record<string, unknown>);
          }
        }
        return mapIdeaRecord(rec);
      }
    } catch {
      /* kısaltılmış veya geçersiz JSON — gevşek çıkarma dene */
    }
  }

  const headline =
    extractJsonStringValue(t, 'headline') ??
    extractJsonStringValue(t, 'hook') ??
    extractJsonStringValue(t, 'concept_title') ??
    extractJsonStringValue(t, 'title');
  const contentKind = extractJsonStringValue(t, 'content_kind');
  const contentType = extractJsonStringValue(t, 'content_type');
  const templateUseCase = extractJsonStringValue(t, 'template_use_case');
  const eventDate = extractJsonStringValue(t, 'event_date') ?? extractJsonStringValue(t, 'date');
  const location =
    extractJsonStringValue(t, 'location') ??
    extractJsonStringValue(t, 'venue_name') ??
    extractJsonStringValue(t, 'venue');
  const captionDraft = extractJsonStringValue(t, 'caption_draft') ?? extractJsonStringValue(t, 'caption');
  const cta = extractJsonStringValue(t, 'cta') ?? extractJsonStringValue(t, 'call_to_action');

  if (!headline && !contentKind && !templateUseCase && !captionDraft && !contentType) return null;

  return {
    headline,
    conceptTitle: extractJsonStringValue(t, 'concept_title'),
    contentType,
    contentKind,
    templateUseCase,
    eventDate,
    location,
    captionSnippet: captionDraft ? (captionDraft.length > 360 ? `${captionDraft.slice(0, 360)}…` : captionDraft) : undefined,
    cta,
    hashtags: [],
  };
}

function mergeContentIdeaPreview(runSummary: string, logSummary?: string): ContentIdeaPreview | null {
  return tryParseContentIdeaPreview(runSummary) ?? tryParseContentIdeaPreview(logSummary ?? null);
}

function looksLikeJsonFragment(s: string): boolean {
  const t = s.trim();
  return t.startsWith('{') || t.startsWith('[');
}

function buildCompletedOutcomeDescription(
  run: AgentRun,
  log: Record<string, unknown> | null,
  ideaPreview: ContentIdeaPreview | null,
): string {
  const suggestedActionCount =
    log && typeof log.suggestedActionCount === 'number' ? log.suggestedActionCount : undefined;
  if (ideaPreview?.headline) {
    return suggestedActionCount && suggestedActionCount > 1
      ? `${ideaPreview.headline} · +${suggestedActionCount - 1} öneri daha`
      : ideaPreview.headline;
  }
  if (ideaPreview?.conceptTitle) {
    return suggestedActionCount && suggestedActionCount > 1
      ? `${ideaPreview.conceptTitle} · +${suggestedActionCount - 1} öneri daha`
      : ideaPreview.conceptTitle;
  }
  if (suggestedActionCount !== undefined && suggestedActionCount > 0) {
    return `${suggestedActionCount} içerik önerisi oluşturuldu · ${strVal(log?.artifactTitle) ?? 'Çalıştırma tamamlandı.'}`;
  }
  const raw = run.summary || strVal(log?.summary);
  if (raw && !looksLikeJsonFragment(raw)) {
    return raw.length > 220 ? `${raw.slice(0, 220)}…` : raw;
  }
  return strVal(log?.artifactTitle) || 'Çalıştırma tamamlandı.';
}

function humanizeStage(stage: string | undefined): string {
  if (!stage) return 'CrewAI: LLM ve araç döngüsü (Python’da aktif)';
  const s: Record<string, string> = {
    delegated_to_crew_service:
      'CrewAI çalışıyor (Python / LLM). Süre modele ve araç sayısına bağlı; ayrıntılar aşağıda canlı güncellenir.',
    agent_execution: 'Ajan yürütmesi',
  };
  return s[stage] ?? stage.replace(/_/g, ' ');
}

function formatElapsedSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '—';
  const s = Math.floor(sec);
  if (s < 60) return `${s} sn`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m} dk ${r} sn`;
}

/** Duvar saati: kayıt hâlâ InProgress iken API durationMs bunu kullanır. */
function wallElapsedSeconds(startedAt?: string | null): number | undefined {
  if (!startedAt) return undefined;
  const t = Date.parse(startedAt);
  if (Number.isNaN(t)) return undefined;
  return Math.max(0, Math.floor((Date.now() - t) / 1000));
}

/** Logdaki kalp atışı (elapsedSeconds) duvar saatinden çok gerideyse veya hiç yoksa — süreç takılı / API yeniden başlamış olabilir. */
function crewProgressLooksStale(
  inProgress: boolean,
  startedAt: string | null | undefined,
  log: Record<string, unknown> | null,
): boolean {
  if (!inProgress || !startedAt) return false;
  const wall = wallElapsedSeconds(startedAt);
  if (wall === undefined || wall < 120) return false;
  const logSec = log?.elapsedSeconds;
  if (typeof logSec === 'number' && Number.isFinite(logSec)) {
    return wall - Math.floor(logSec) > 120;
  }
  return wall > 300;
}

/** Crew adımı: sunucu kalp atışı (crewActivity, elapsedSeconds) varsa öncelikli gösterir. */
function buildCrewServiceDescription(log: Record<string, unknown> | null, stageKey: string | undefined): string {
  const activity = strVal(log?.crewActivity);
  const elapsedRaw = log?.elapsedSeconds;
  const elapsed =
    typeof elapsedRaw === 'number' && Number.isFinite(elapsedRaw) ? Math.floor(elapsedRaw) : undefined;
  const taskT = strVal(log?.taskType);
  const parts: string[] = [];
  if (activity) parts.push(activity);
  if (elapsed !== undefined) parts.push(`Geçen süre: ${formatElapsedSeconds(elapsed)}`);
  if (taskT) parts.push(`Görev: ${taskT.replace(/_/g, ' ')}`);
  if (elapsed !== undefined && elapsed >= 120) {
    parts.push(
      'Token sayısı işlem bitince yazılır. ~5 dk aşıyorsa Python Crew (8000), OPENAI_API_KEY ve dev’de next.config proxyTimeout kontrol edin.',
    );
  }
  if (parts.length > 0) return parts.join(' · ');
  return humanizeStage(stageKey);
}

function statusToneAgent(status: string): 'cyan' | 'emerald' | 'amber' | 'rose' | 'neutral' {
  if (status === 'Failed') return 'rose';
  if (status === 'Completed') return 'emerald';
  if (status === 'InProgress' || status === 'Running') return 'cyan';
  return 'neutral';
}

function statusToneJob(status: string, success?: boolean): 'cyan' | 'emerald' | 'amber' | 'rose' | 'neutral' {
  if (success === false || status === 'Failed') return 'rose';
  if (status === 'Completed' || status === 'Executed') return 'emerald';
  return 'neutral';
}

type FlowState = 'done' | 'current' | 'error' | 'pending';

interface FlowStep {
  id: string;
  title: string;
  description: string;
  state: FlowState;
}

function buildAgentFlowSteps(
  run: AgentRun,
  log: Record<string, unknown> | null,
  ideaPreview: ContentIdeaPreview | null,
): FlowStep[] {
  const failed = run.status === 'Failed' || strVal(log?.status) === 'failed';
  const inProgress = run.status === 'InProgress' || run.status === 'Running';
  const completed = run.status === 'Completed' && !failed;

  const stage = strVal(log?.stage);
  const logError = strVal(log?.error) ?? run.errorMessage;

  return [
    {
      id: 'queue',
      title: 'Görev oluşturuldu',
      description: `Başlangıç: ${formatTimeFull(run.startedAt)}`,
      state: 'done',
    },
    {
      id: 'crew',
      title: 'Crew servisi',
      description: buildCrewServiceDescription(log, stage),
      state: inProgress ? 'current' : 'done',
    },
    {
      id: 'outcome',
      title: failed ? 'Sonuç: hata' : completed ? 'Sonuç: başarılı' : inProgress ? 'Sonuç bekleniyor' : 'Sonuç',
      description: failed
        ? (logError || 'Bilinmeyen hata')
        : completed
          ? buildCompletedOutcomeDescription(run, log, ideaPreview)
          : 'İşlem sürüyor…',
      state: failed ? 'error' : inProgress ? 'pending' : 'done',
    },
  ];
}

function FlowTimeline({ steps }: { steps: FlowStep[] }) {
  const weight = steps.reduce((acc, s) => {
    if (s.state === 'done' || s.state === 'error') return acc + 1;
    if (s.state === 'current') return acc + 0.5;
    return acc;
  }, 0);
  const progressPct = Math.round((weight / Math.max(steps.length, 1)) * 100);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">İlerleme</p>
        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{progressPct}%</p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 transition-all"
          style={{ width: `${Math.min(100, progressPct)}%` }}
        />
      </div>

      {/* Yatay stepper (sipariş takibi / ödeme akışı düzeni) */}
      <ol className="flex w-full min-w-0 list-none gap-0 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {steps.map((step, i) => {
          const leftLinkDone = i > 0 && steps[i - 1]!.state === 'done';
          const rightLinkDone = i < steps.length - 1 && step.state === 'done';

          const icon =
            step.state === 'error' ? (
              <XCircle className="h-4 w-4 text-rose-500" aria-hidden />
            ) : step.state === 'current' ? (
              <Loader2 className="h-4 w-4 animate-spin text-cyan-500" aria-hidden />
            ) : step.state === 'pending' ? (
              <CircleDot className="h-4 w-4 text-gray-400" aria-hidden />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
            );

          const ring =
            step.state === 'error'
              ? 'border-rose-500/80 ring-rose-500/20'
              : step.state === 'current'
                ? 'border-cyan-500 ring-cyan-500/25'
                : step.state === 'pending'
                  ? 'border-gray-300 dark:border-gray-600'
                  : 'border-emerald-500/80 ring-emerald-500/15';

          return (
            <li key={step.id} className="flex min-w-[100px] flex-1 flex-col">
              <div className="flex w-full items-center">
                <div
                  className={cn(
                    'h-0.5 min-w-[6px] shrink-0 transition-colors',
                    i === 0 ? 'w-0 min-w-0' : 'flex-1',
                    leftLinkDone
                      ? 'rounded-full bg-gradient-to-r from-cyan-500 to-violet-500'
                      : 'rounded-full bg-gray-200 dark:bg-white/12',
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    'mx-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 bg-white shadow-sm ring-2 dark:bg-gray-900',
                    ring,
                  )}
                >
                  {icon}
                </span>
                <div
                  className={cn(
                    'h-0.5 min-w-[6px] shrink-0 transition-colors',
                    i === steps.length - 1 ? 'w-0 min-w-0' : 'flex-1',
                    rightLinkDone
                      ? 'rounded-full bg-gradient-to-r from-cyan-500 to-violet-500'
                      : 'rounded-full bg-gray-200 dark:bg-white/12',
                  )}
                  aria-hidden
                />
              </div>
              <div className="mt-3 min-w-0 px-0.5 text-center">
                <p className="text-sm font-semibold leading-snug text-gray-900 dark:text-white/90">{step.title}</p>
                <p
                  className={cn(
                    'mt-1 line-clamp-4 text-xs leading-relaxed',
                    step.state === 'error' ? 'text-rose-600 dark:text-rose-400' : 'text-gray-600 dark:text-gray-400',
                  )}
                >
                  {step.description}
                </p>
                <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                  Adım {i + 1} / {steps.length}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function hasRenderableIdeaPreview(p: ContentIdeaPreview | null): boolean {
  if (!p) return false;
  return Boolean(
    p.headline ||
      p.conceptTitle ||
      p.captionSnippet ||
      p.templateUseCase ||
      p.contentKind ||
      p.contentType ||
      p.location ||
      p.eventDate ||
      p.cta ||
      p.hashtags.length > 0,
  );
}

function ContentIdeaPreviewCard({
  preview,
  suggestedCount,
}: {
  preview: ContentIdeaPreview;
  suggestedCount?: number;
}) {
  const primaryTitle = preview.headline ?? preview.conceptTitle;
  const kindLabel = formatContentKindLabel(preview.contentKind) ?? (preview.contentType ? humanizeSnake(preview.contentType) : undefined);

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-emerald-200/90 bg-gradient-to-b from-emerald-50/90 to-white p-4 dark:border-emerald-500/25 dark:from-emerald-500/[0.12] dark:to-white/[0.02]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-900/80 dark:text-emerald-200/90">
          Önerilen aksiyon özeti
        </p>
        {suggestedCount != null && suggestedCount > 1 ? (
          <span className="shrink-0 rounded-full bg-emerald-600/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-100">
            +{suggestedCount - 1} ek fikir
          </span>
        ) : null}
      </div>
      {primaryTitle ? (
        <p className="text-lg font-semibold leading-snug tracking-tight text-gray-900 dark:text-white">{primaryTitle}</p>
      ) : null}
      {(kindLabel || preview.templateUseCase) ? (
        <div className="flex flex-wrap gap-2">
          {kindLabel ? (
            <span className="rounded-lg border border-gray-200/90 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-gray-800 shadow-sm dark:border-white/10 dark:bg-white/[0.08] dark:text-white/90">
              {kindLabel}
            </span>
          ) : null}
          {preview.templateUseCase ? (
            <span className="rounded-lg border border-gray-200/90 bg-white/90 px-2.5 py-1 text-[11px] font-medium text-gray-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-gray-200">
              Senaryo: {humanizeSnake(preview.templateUseCase)}
            </span>
          ) : null}
        </div>
      ) : null}
      {(preview.eventDate || preview.location) ? (
        <dl className="grid gap-2 sm:grid-cols-2">
          {preview.eventDate ? (
            <div className="rounded-lg border border-gray-100 bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
              <dt className="text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Etkinlik tarihi</dt>
              <dd className="mt-0.5 text-sm text-gray-900 dark:text-gray-100">{preview.eventDate}</dd>
            </div>
          ) : null}
          {preview.location ? (
            <div className="rounded-lg border border-gray-100 bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
              <dt className="text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Konum / mekân</dt>
              <dd className="mt-0.5 text-sm text-gray-900 dark:text-gray-100">{preview.location}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {preview.captionSnippet ? (
        <div className="rounded-lg border border-gray-200/80 bg-white/80 p-3 dark:border-white/10 dark:bg-white/[0.05]">
          <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-gray-500 dark:text-gray-400">Taslak metin</p>
          <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-gray-700 dark:text-gray-300">{preview.captionSnippet}</p>
        </div>
      ) : null}
      {preview.cta ? (
        <p className="text-xs text-gray-600 dark:text-gray-400">
          <span className="font-semibold text-gray-700 dark:text-gray-300">CTA: </span>
          {preview.cta}
        </p>
      ) : null}
      {preview.hashtags.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Etiketler</p>
          <div className="flex flex-wrap gap-1.5">
            {preview.hashtags.map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-700 dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-300"
              >
                {tag.startsWith('#') ? tag : `#${tag}`}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ModalChrome({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center bg-gray-950/60 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="execution-detail-title"
        className="max-h-[min(90vh,880px)] w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <div className="min-w-0">
            <h2 id="execution-detail-title" className="truncate text-lg font-semibold text-gray-900 dark:text-white/90">
              {title}
            </h2>
            {subtitle ? <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-white/10 dark:hover:text-white"
            aria-label="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[min(75vh,720px)] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon?: ComponentType<{ className?: string }>; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="mb-3 flex items-center gap-2">
        {Icon ? <Icon className="h-4 w-4 text-cyan-600 dark:text-cyan-400" /> : null}
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">{title}</h3>
      </div>
      {children}
    </section>
  );
}

export function AgentRunDetailModal({ run, onClose }: { run: AgentRun; onClose: () => void }) {
  const log = safeParseJson(run.executionLog);
  const logSummary = strVal(log?.summary);
  const ideaPreview = mergeContentIdeaPreview(run.summary, logSummary);
  const steps = buildAgentFlowSteps(run, log, ideaPreview);
  const artifactTitle = log ? strVal(log.artifactTitle) : undefined;
  const contentLength = log && typeof log.contentLength === 'number' ? log.contentLength : undefined;
  const suggestedActionCount = log && typeof log.suggestedActionCount === 'number' ? log.suggestedActionCount : undefined;
  const inProgressRun = run.status === 'InProgress' || run.status === 'Running';
  const wallSec = wallElapsedSeconds(run.startedAt);
  const logElapsedSec =
    log && typeof log.elapsedSeconds === 'number' && Number.isFinite(log.elapsedSeconds)
      ? Math.floor(log.elapsedSeconds)
      : undefined;
  const staleCrewHeartbeat = crewProgressLooksStale(inProgressRun, run.startedAt, log);

  return (
    <ModalChrome
      title={run.agentName}
      subtitle={run.taskTitle || 'Ajan çalıştırması'}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill label={run.status} tone={statusToneAgent(run.status)} icon={Terminal} />
          {run.providerModel ? (
            <span className="rounded-lg bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-700 dark:text-violet-300">
              {run.providerModel}
            </span>
          ) : null}
        </div>

        <Section title="Özet" icon={Terminal}>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[11px] text-gray-500">Ajan türü</dt>
              <dd className="font-medium text-gray-800 dark:text-gray-200">{run.agentType}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-gray-500">{inProgressRun ? 'Geçen süre (kayıt açık)' : 'Süre'}</dt>
              <dd className="font-medium text-gray-800 dark:text-gray-200">{formatDuration(run.durationMs)}</dd>
              {inProgressRun ? (
                <p className="mt-1 text-[10px] leading-relaxed text-gray-500 dark:text-gray-400">
                  Bitiş zamanı olmadığı için bu süre, görevin başlatıldığı andan beri geçen duvar saati süresidir. Normal Crew
                  çağrısı OrchestrationService zaman aşımında (ör. ~5 dk) biter veya hata döner; yüzlerce dakika &quot;sürüyor&quot;
                  görünmesi genelde kayıt güncellenmediği (zombi) veya Python/Nexus sürecinin koptuğu anlamına gelir.
                </p>
              ) : null}
            </div>
            {inProgressRun && (wallSec !== undefined || logElapsedSec !== undefined) ? (
              <div className="sm:col-span-2">
                <dt className="text-[11px] text-gray-500">Teknik süre karşılaştırması</dt>
                <dd className="mt-0.5 text-xs text-gray-700 dark:text-gray-300">
                  Duvar saati: {wallSec !== undefined ? formatElapsedSeconds(wallSec) : '—'}
                  {logElapsedSec !== undefined ? (
                    <>
                      {' '}
                      · executionLog <code className="rounded bg-gray-200/80 px-1 font-mono text-[10px] dark:bg-white/10">elapsedSeconds</code>:{' '}
                      {formatElapsedSeconds(logElapsedSec)}
                    </>
                  ) : (
                    <>
                      {' '}
                      · logda <code className="rounded bg-gray-200/80 px-1 font-mono text-[10px] dark:bg-white/10">elapsedSeconds</code> yok
                    </>
                  )}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-[11px] text-gray-500">Token</dt>
              <dd className="font-medium text-gray-800 dark:text-gray-200">{run.tokensUsed ?? 0}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-gray-500">Bitiş</dt>
              <dd className="font-medium text-gray-800 dark:text-gray-200">{formatTimeFull(run.completedAt)}</dd>
            </div>
          </dl>
          {staleCrewHeartbeat ? (
            <div className="mt-3 flex gap-2 rounded-xl border border-amber-200/80 bg-amber-50/90 p-3 text-xs leading-relaxed text-amber-950 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <p>
                <span className="font-semibold">Bu çalıştırma büyük olasılıkla takılı veya kopuk.</span> Teknik logdaki süre
                güncellenmiyor; gerçek bir Crew yanıtı bu kadar uzun sürmez. Python servisini (port 8000), Nexus.Api ve{' '}
                <code className="rounded bg-black/10 px-1 font-mono text-[10px] dark:bg-white/10">OrchestrationService:TimeoutSeconds</code>{' '}
                değerini kontrol edin. Çalışma merkezinde &quot;Takılı ajan çalıştırmalarını temizle (10 dk+)&quot; ile eski
                InProgress kayıtlarını iptal edebilirsiniz; ardından görevi yeniden başlatın.
              </p>
            </div>
          ) : null}
        </Section>

        <Section title="Akış ve durum" icon={CircleDot}>
          <FlowTimeline steps={steps} />
        </Section>

        {(artifactTitle ||
          contentLength !== undefined ||
          suggestedActionCount !== undefined ||
          hasRenderableIdeaPreview(ideaPreview)) &&
        run.status === 'Completed' ? (
          <Section title="Çıktı özeti" icon={CheckCircle2}>
            <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
              {artifactTitle ? <li><span className="text-gray-500">Artifact: </span>{artifactTitle}</li> : null}
              {contentLength !== undefined ? <li><span className="text-gray-500">İçerik uzunluğu: </span>{contentLength} karakter</li> : null}
              {suggestedActionCount !== undefined ? (
                <li><span className="text-gray-500">Önerilen aksiyon: </span>{suggestedActionCount}</li>
              ) : null}
            </ul>
            {hasRenderableIdeaPreview(ideaPreview) ? (
              <ContentIdeaPreviewCard preview={ideaPreview!} suggestedCount={suggestedActionCount} />
            ) : run.summary && !looksLikeJsonFragment(run.summary) ? (
              <p className="mt-3 rounded-lg border border-gray-200 bg-white p-3 text-xs leading-relaxed text-gray-600 dark:border-gray-700 dark:bg-gray-950/40 dark:text-gray-400">
                {run.summary}
              </p>
            ) : run.summary && looksLikeJsonFragment(run.summary) ? (
              <p className="mt-3 rounded-lg border border-amber-200/80 bg-amber-50/80 p-3 text-xs leading-relaxed text-amber-950 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100">
                Bu çalıştırmanın metin özeti sunucuda kısaltılmış yapılandırılmış veri olarak saklanıyor. Tam çıktı ve ek
                fikirler için ilgili artifact kaydını veya içerik ekranını kullanın; ham kayıt altta &quot;Teknik: executionLog&quot;
                bölümündedir.
              </p>
            ) : null}
          </Section>
        ) : run.summary ? (
          <Section title="Özet metin" icon={CheckCircle2}>
            {hasRenderableIdeaPreview(ideaPreview) ? (
              <ContentIdeaPreviewCard preview={ideaPreview!} suggestedCount={suggestedActionCount} />
            ) : looksLikeJsonFragment(run.summary) ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Yapılandırılmış çıktı — ayrıntılar için alttaki teknik executionLog bölümünü açın.
              </p>
            ) : (
              <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">{run.summary}</p>
            )}
          </Section>
        ) : null}

        {run.errorMessage ? (
          <Section title="Hata detayı" icon={AlertTriangle}>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-rose-50 p-3 text-xs text-rose-900 dark:bg-rose-500/10 dark:text-rose-100">
              {run.errorMessage}
            </pre>
          </Section>
        ) : null}

        <details className="rounded-xl border border-dashed border-gray-200 p-3 text-sm dark:border-gray-700">
          <summary className="cursor-pointer font-medium text-gray-600 dark:text-gray-400">Teknik: executionLog (JSON)</summary>
          <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-gray-900 p-3 text-[11px] text-gray-100">
            {prettyJson(run.executionLog)}
          </pre>
        </details>
      </div>
    </ModalChrome>
  );
}

function buildJobFlowSteps(job: ExecutionJob, audit: Record<string, unknown> | null): FlowStep[] {
  const failed = !job.success || job.status === 'Failed';
  const mode = strVal(audit?.mode) ?? job.mode;

  return [
    {
      id: 'queued',
      title: 'İş tanımlandı',
      description: `Aksiyon türü kayıtlı; mod: ${mode || '—'}`,
      state: 'done',
    },
    {
      id: 'run',
      title: 'Sağlayıcı çağrısı',
      description: job.startedAt ? `Çalıştırıldı: ${formatTimeFull(job.startedAt)}` : 'Başlangıç zamanı yok',
      state: failed ? 'error' : 'done',
    },
    {
      id: 'result',
      title: failed ? 'Sonuç: başarısız' : 'Sonuç: tamamlandı',
      description:
        job.providerError ||
        job.errorMessage ||
        job.providerStatus ||
        (job.success ? 'İş başarıyla tamamlandı.' : 'Ayrıntılar için aşağıdaki yanıt bölümüne bakın.'),
      state: failed ? 'error' : 'done',
    },
  ];
}

export function ProviderJobDetailModal({ job, friendlyAction, friendlyProv, onClose }: {
  job: ExecutionJob;
  friendlyAction: string;
  friendlyProv: string;
  onClose: () => void;
}) {
  const audit = safeParseJson(job.auditLog);
  const steps = buildJobFlowSteps(job, audit);

  return (
    <ModalChrome
      title={friendlyAction}
      subtitle={`${friendlyProv} · ${job.actionType}`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill
            label={job.status}
            tone={statusToneJob(job.status, job.success)}
            icon={job.success ? CheckCircle2 : AlertTriangle}
          />
          <span className="text-xs text-gray-500">Yeniden deneme: {job.retryCount}</span>
        </div>

        <Section title="Özet" icon={ServerCog}>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[11px] text-gray-500">Sağlayıcı</dt>
              <dd className="font-medium text-gray-800 dark:text-gray-200">{friendlyProv}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-gray-500">Süre</dt>
              <dd className="font-medium text-gray-800 dark:text-gray-200">{formatDuration(job.durationMs)}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-gray-500">Önerilen aksiyon ID</dt>
              <dd className="break-all font-mono text-[11px] text-gray-700 dark:text-gray-300">{job.suggestedActionId}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-gray-500">Job ID</dt>
              <dd className="break-all font-mono text-[11px] text-gray-700 dark:text-gray-300">{job.id}</dd>
            </div>
          </dl>
        </Section>

        <Section title="Akış" icon={CircleDot}>
          <FlowTimeline steps={steps} />
        </Section>

        {(job.providerStatus || job.providerError || job.errorMessage) ? (
          <Section title="Sağlayıcı mesajı" icon={AlertTriangle}>
            <ul className="space-y-2 text-sm">
              {job.providerStatus ? (
                <li><span className="text-gray-500">Durum: </span>{job.providerStatus}</li>
              ) : null}
              {(job.providerError || job.errorMessage) ? (
                <li>
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-amber-50 p-3 text-xs text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
                    {job.providerError || job.errorMessage}
                  </pre>
                </li>
              ) : null}
            </ul>
          </Section>
        ) : null}

        <details className="rounded-xl border border-dashed border-gray-200 p-3 text-sm dark:border-gray-700">
          <summary className="cursor-pointer font-medium text-gray-600 dark:text-gray-400">Teknik: auditLog</summary>
          <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-gray-900 p-3 text-[11px] text-gray-100">
            {prettyJson(job.auditLog)}
          </pre>
        </details>
        <details className="rounded-xl border border-dashed border-gray-200 p-3 text-sm dark:border-gray-700">
          <summary className="cursor-pointer font-medium text-gray-600 dark:text-gray-400">Teknik: provider yanıtı</summary>
          <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-gray-900 p-3 text-[11px] text-gray-100">
            {prettyJson(job.providerResponseJson)}
          </pre>
        </details>
        <details className="rounded-xl border border-dashed border-gray-200 p-3 text-sm dark:border-gray-700">
          <summary className="cursor-pointer font-medium text-gray-600 dark:text-gray-400">Teknik: resultData</summary>
          <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-gray-900 p-3 text-[11px] text-gray-100">
            {prettyJson(job.resultData)}
          </pre>
        </details>
      </div>
    </ModalChrome>
  );
}
