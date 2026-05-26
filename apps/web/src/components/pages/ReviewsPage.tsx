'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Eye,
  Loader2,
  MessageSquare,
  Pencil,
  RefreshCw,
  Send,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  AlertTriangle,
  CircleDot,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import type { OutputArtifact } from '@/types';
import {
  DetailDrawer,
  EmptyState,
  GlassPanel,
  LoadingSkeleton,
  MetricsGrid,
  MetricCard,
  RiskBadge,
  SectionHeader,
  StatusPill,
} from '@/tailadmin/components/application/PageElements';

interface CustomerReviewRow {
  author: string;
  rating: number;
  date?: string;
  text: string;
  language?: string;
}

interface ReviewCardModel {
  id: string;
  artifactId: string;
  author: string;
  rating: number;
  sentiment: 'positive' | 'negative' | 'neutral';
  status: 'pending' | 'sent';
  dateLabel: string;
  text: string;
  aiDraft: string;
  /** Birden fazla yorum içeren analiz çıktıları için (JSON yerine kartlarda gösterilir). */
  customerReviews?: CustomerReviewRow[];
}

function isReviewResponseArtifact(a: OutputArtifact): boolean {
  const t = a.artifactType?.toLowerCase() ?? '';
  return t === '8' || t === 'reviewresponse';
}

function stripNoise(input: string): string {
  return input.replace(/^#+\s*/gm, '').replace(/\*\*/g, '').trim();
}

/**
 * Duygu: yalnızca müşteri yorumu + puan (AI taslağındaki "teşekkür" vb. yanlış pozitif üretmesin).
 */
function inferSentiment(rating: number, customerText: string): 'positive' | 'negative' | 'neutral' {
  const t = customerText.toLowerCase();
  const strongNegative =
    rating <= 2 ||
    /kötü|berbat|hayal kırıklığı|şikayet|rezalet|bir daha gelmem|memnun değil|berbat|ısrarla|beklet|yanlış geldi/.test(
      t,
    );
  const strongPositive =
    rating >= 4 &&
    /harika|muhteşem|mükemmel|wonderful|amazing|love|great experience|definitely come back|teşekkür|çok beğendim/.test(
      t,
    );

  if (rating <= 2 || strongNegative) return 'negative';
  if (rating >= 4 && strongPositive) return 'positive';
  if (rating >= 4) return 'positive';
  if (rating === 3) return 'neutral';
  return 'neutral';
}

function sentimentPresentation(sentiment: ReviewCardModel['sentiment']): {
  label: string;
  tone: 'emerald' | 'amber' | 'rose';
  icon: typeof ThumbsUp;
} {
  if (sentiment === 'negative') return { label: 'Olumsuz', tone: 'rose', icon: ThumbsDown };
  if (sentiment === 'neutral') return { label: 'Nötr', tone: 'amber', icon: MessageSquare };
  return { label: 'Olumlu', tone: 'emerald', icon: ThumbsUp };
}

function mapReviewRowFromUnknown(r: unknown): CustomerReviewRow | null {
  if (!r || typeof r !== 'object') return null;
  const o = r as Record<string, unknown>;
  const author = String(o.reviewer_name ?? o.author ?? o.name ?? 'Müşteri').trim() || 'Müşteri';
  const ratingRaw = o.rating;
  const rating =
    typeof ratingRaw === 'number' && ratingRaw >= 1 && ratingRaw <= 5
      ? ratingRaw
      : typeof ratingRaw === 'string' && !Number.isNaN(Number(ratingRaw))
        ? Math.min(5, Math.max(1, Math.round(Number(ratingRaw))))
        : 5;
  const text = String(o.text ?? o.review_text ?? o.body ?? o.comment ?? '').trim();
  const date = typeof o.date === 'string' ? o.date : undefined;
  const language = typeof o.language === 'string' ? o.language : undefined;
  if (!text) return null;
  return { author, rating, date, text, language };
}

function looksLikeJsonObjectString(s: string): boolean {
  const t = s.trim();
  return t.startsWith('{') || t.startsWith('[');
}

function collectDraftStrings(body: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim() && !looksLikeJsonObjectString(v)) out.push(v.trim());
  };
  push(body.draft_reply);
  push(body.draft_response);
  push(body.response);
  push(body.reply);
  push(body.reply_text);
  const payload = body.payload;
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    push(p.reply_text);
    push(p.draft_response);
    push(p.response);
  }
  return out;
}

function extractFieldsFromParsedContent(
  parsed: unknown,
  artifact: OutputArtifact,
  titleAuthor: string,
): {
  author: string;
  rating: number;
  reviewText: string;
  aiDraft: string;
  customerReviews?: CustomerReviewRow[];
} {
  const bodies: Record<string, unknown>[] = [];

  const pushBody = (b: unknown) => {
    if (b && typeof b === 'object' && !Array.isArray(b)) bodies.push(b as Record<string, unknown>);
  };

  if (Array.isArray(parsed)) {
    const rows = parsed.map(mapReviewRowFromUnknown).filter(Boolean) as CustomerReviewRow[];
    if (rows.length > 0) {
      const worst = [...rows].sort((a, b) => a.rating - b.rating)[0]!;
      return {
        author: worst.author,
        rating: worst.rating,
        reviewText: rows.map((r) => `${r.author} (${r.rating}★)\n${r.text}`).join('\n\n—\n\n'),
        aiDraft:
          'Bu kayıt yalnızca yorum listesi içeriyor. Hangi yoruma yanıt vereceğinizi seçip metni yazın; tek yorum için Review Responder ajanını çalıştırmanız önerilir.',
        customerReviews: rows,
      };
    }
  }

  pushBody(parsed);

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const root = parsed as Record<string, unknown>;
    const inner = root.content;
    if (typeof inner === 'string' && inner.trim()) {
      try {
        const innerParsed = JSON.parse(inner);
        if (Array.isArray(innerParsed)) {
          const rows = innerParsed.map(mapReviewRowFromUnknown).filter(Boolean) as CustomerReviewRow[];
          if (rows.length) {
            const worst = [...rows].sort((a, b) => a.rating - b.rating)[0]!;
            pushBody(root);
            return {
              author: worst.author,
              rating: worst.rating,
              reviewText: rows.map((r) => `${r.author} (${r.rating}★)\n${r.text}`).join('\n\n—\n\n'),
              aiDraft: collectDraftStrings(root).join('\n\n') || '',
              customerReviews: rows,
            };
          }
        } else pushBody(innerParsed);
      } catch {
        /* ignore */
      }
    }
    pushBody(root.payload);
  }

  let author = titleAuthor;
  let rating = 5;
  let reviewText = '';
  let aiDraft = '';
  let customerReviews: CustomerReviewRow[] | undefined;

  for (const body of bodies) {
    const revs = body.reviews;
    if (Array.isArray(revs) && revs.length > 0) {
      const rows = revs.map(mapReviewRowFromUnknown).filter(Boolean) as CustomerReviewRow[];
      if (rows.length) {
        customerReviews = rows;
        const primary = [...rows].sort((a, b) => a.rating - b.rating)[0]!;
        author = primary.author;
        rating = primary.rating;
        reviewText = rows.map((r) => `${r.author} (${r.rating}★)\n${r.text}`).join('\n\n—\n\n');
      }
    }

    const ctx = body.review_context;
    if (ctx && typeof ctx === 'object') {
      const c = ctx as Record<string, unknown>;
      const name = String(c.reviewer_name ?? c.author ?? '').trim();
      const rt = String(c.review_text ?? c.text ?? '').trim();
      const rr = c.rating;
      if (name) author = name;
      if (typeof rr === 'number' && rr >= 1 && rr <= 5) rating = rr;
      if (rt) reviewText = stripNoise(rt);
    }

    const drafts = collectDraftStrings(body);
    if (drafts.length > 0) aiDraft = drafts.join('\n\n');
  }

  if (!reviewText && customerReviews?.length) {
    reviewText = customerReviews.map((r) => `${r.author} (${r.rating}★)\n${r.text}`).join('\n\n—\n\n');
  }

  if (!aiDraft.trim()) {
    aiDraft =
      'Önerilen yanıt metni bulunamadı. Aşağıya profesyonel bir yanıt yazın veya ajanı yeniden çalıştırın.';
  } else {
    aiDraft = stripNoise(aiDraft);
  }

  if (!reviewText.trim()) {
    reviewText = stripNoise(artifact.content);
    if (looksLikeJsonObjectString(reviewText)) {
      reviewText = customerReviews?.length
        ? customerReviews.map((r) => `${r.author}: ${r.text}`).join('\n\n')
        : 'Yorum metni bu kayıtta düz metin olarak bulunamadı.';
    }
  } else {
    reviewText = stripNoise(reviewText);
  }

  return { author, rating, reviewText, aiDraft, customerReviews };
}

function parseReviewFromArtifact(artifact: OutputArtifact): ReviewCardModel {
  const meta = artifact.metadata ?? {};
  const metaRatingRaw = meta.rating as number | undefined;
  const metaReviewer =
    typeof meta.reviewerName === 'string' ? meta.reviewerName : undefined;

  const titleMatch = /^Review response for\s+(.+)$/i.exec(artifact.title.trim());
  const titleAuthor =
    metaReviewer?.trim() || titleMatch?.[1]?.trim() || artifact.title.trim() || 'Değerlendirme';

  let rating =
    typeof metaRatingRaw === 'number' && metaRatingRaw >= 1 && metaRatingRaw <= 5 ? metaRatingRaw : 5;
  let author = titleAuthor;
  let reviewText = stripNoise(artifact.content ?? '');
  let aiDraft = reviewText;
  let customerReviews: CustomerReviewRow[] | undefined;

  try {
    const parsed = JSON.parse(artifact.content) as unknown;
    const extracted = extractFieldsFromParsedContent(parsed, artifact, titleAuthor);
    author = extracted.author || author;
    rating = extracted.rating;
    reviewText = extracted.reviewText;
    aiDraft = extracted.aiDraft;
    customerReviews = extracted.customerReviews;
    if (metaReviewer?.trim()) author = metaReviewer.trim();
  } catch {
    reviewText = stripNoise(artifact.content ?? '');
    aiDraft = reviewText;
    if (looksLikeJsonObjectString(reviewText)) {
      reviewText = 'Bu kayıt yapılandırılmış veri içeriyor; düzgün açılamadı.';
      aiDraft =
        'Önerilen yanıt metni bulunamadı. Aşağıya profesyonel bir yanıt yazın veya ajanı yeniden çalıştırın.';
    }
  }

  const sentiment = inferSentiment(rating, reviewText);

  let dateLabel = '—';
  try {
    const d = new Date(artifact.createdAt);
    if (!Number.isNaN(d.getTime())) {
      const diffMs = Date.now() - d.getTime();
      const minutes = Math.floor(diffMs / 60000);
      if (minutes < 1) dateLabel = 'Az önce';
      else if (minutes < 60) dateLabel = `${minutes} dk önce`;
      else if (minutes < 1440) dateLabel = `${Math.floor(minutes / 60)} sa. önce`;
      else dateLabel = `${Math.floor(minutes / 1440)} gün önce`;
    }
  } catch {
    dateLabel = '—';
  }

  const status = artifact.status === 'approved' ? 'sent' : 'pending';

  return {
    id: artifact.id,
    artifactId: artifact.id,
    author,
    rating,
    sentiment,
    status,
    dateLabel,
    text: reviewText,
    aiDraft,
    customerReviews,
  };
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((item) => (
        <Star
          key={item}
          className="h-3.5 w-3.5"
          fill={item <= rating ? '#fbbf24' : 'transparent'}
          color={item <= rating ? '#fbbf24' : '#d0d5dd'}
        />
      ))}
    </div>
  );
}

function defaultReplyTargetIndex(review: ReviewCardModel): number | null {
  const rows = review.customerReviews;
  if (!rows?.length) return null;
  if (rows.length === 1) return 0;
  let best = 0;
  for (let i = 1; i < rows.length; i++) {
    const curr = rows[i];
    const prev = rows[best];
    if (curr && prev && curr.rating < prev.rating) best = i;
  }
  return best;
}

export default function ReviewsPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftEdit, setDraftEdit] = useState<string>('');
  /** Çoklu yorum listesinde hangi satırın yanıt odağı olduğu (yalnızca UX / netlik). */
  const [replyTargetIndex, setReplyTargetIndex] = useState<number | null>(null);

  const { data: artifacts, isLoading, isError, error } = useQuery({
    queryKey: ['artifacts', 'review-responses'],
    queryFn: () => apiClient.getArtifacts(),
    select: (list) => list.filter(isReviewResponseArtifact).map(parseReviewFromArtifact),
  });

  const reviews = useMemo(() => artifacts ?? [], [artifacts]);
  const selected = reviews.find((review) => review.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) {
      setReplyTargetIndex(null);
      return;
    }
    setReplyTargetIndex(defaultReplyTargetIndex(selected));
  }, [selected]);

  const pending = reviews.filter((review) => review.status === 'pending').length;
  const negative = reviews.filter((review) => review.sentiment === 'negative').length;
  const sent = reviews.filter((review) => review.status === 'sent').length;
  const avg =
    reviews.length === 0
      ? '—'
      : (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1);

  const approveMutation = useMutation({
    mutationFn: async (payload: { artifactId: string; finalized: string }) =>
      apiClient.approveArtifact(payload.artifactId, 'Yorum yanıtı onaylandı (Review Management).', payload.finalized),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      setSelectedId(null);
      setDraftEdit('');
    },
  });

  function openReview(review: ReviewCardModel) {
    setSelectedId(review.id);
    setDraftEdit(review.aiDraft);
    setReplyTargetIndex(defaultReplyTargetIndex(review));
  }

  function closeDrawer() {
    setSelectedId(null);
    setDraftEdit('');
    setReplyTargetIndex(null);
  }

  function approveAndSend() {
    if (!selected) return;
    approveMutation.mutate({ artifactId: selected.artifactId, finalized: draftEdit.trim() || selected.aiDraft });
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin" style={{ background: '#07080f' }}>
    <div className="relative mx-auto max-w-[1600px] space-y-5 px-5 py-6 pb-12">

      {/* Header */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1" style={{ background: 'rgba(251,113,133,0.1)', border: '1px solid rgba(251,113,133,0.2)' }}>
            <MessageSquare className="h-3.5 w-3.5 text-rose-400" />
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-rose-400">Reputation Intelligence</span>
          </div>
          <h1 className="text-3xl font-light tracking-[-0.035em] text-white">
            Review <span className="font-semibold" style={{ color: '#fb7185' }}>Management</span>
          </h1>
          <p className="mt-1.5 max-w-xl text-[13px] text-slate-600">AI-drafted review responses — edit, approve and publish to Google Business Profile.</p>
        </div>
        <StatusPill label="Live data · API" tone="emerald" icon={Sparkles} />
      </div>

      <MetricsGrid>
        <MetricCard label="Average Rating" value={String(avg)} helper="from artifact outputs" icon={Star} tone="amber" />
        <MetricCard label="Pending Replies" value={pending} helper="awaiting approval" icon={MessageSquare} tone={pending > 0 ? 'amber' : 'emerald'} />
        <MetricCard label="Negative Risk" value={negative} helper="negative sentiment signals" icon={ThumbsDown} tone={negative > 0 ? 'rose' : 'emerald'} />
        <MetricCard label="Approved" value={sent} helper="approved artifacts" icon={Send} tone="emerald" />
      </MetricsGrid>

      {isLoading ? (
        <LoadingSkeleton label="Loading review artifacts…" />
      ) : isError ? (
        <GlassPanel tone="rose">
          <div className="flex items-start gap-3 rounded-xl border border-rose-300/25 bg-rose-500/[0.08] p-4 text-sm text-rose-50">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Artifact listesi alınamadı</p>
              <p className="mt-1 text-xs text-rose-100/80">
                {error instanceof Error ? error.message : 'Bilinmeyen hata'}
              </p>
            </div>
          </div>
        </GlassPanel>
      ) : reviews.length === 0 ? (
        <EmptyState
          title="Henüz yorum yanıtı yok"
          description="Customer Review Responder ajanını çalıştırdığınızda burada ReviewResponse artifact'ları görünecek."
        />
      ) : (
        <GlassPanel tone="rose">
          <SectionHeader
            title="Yanıt kuyruğu"
            subtitle="Kartı açın; müşteri yorumunu okuyun, metni düzenleyin ve onaylayın."
            count={reviews.length}
          />
          <div className="grid gap-6 xl:grid-cols-2">
            {reviews.map((review) => {
              const sentUi = sentimentPresentation(review.sentiment);
              return (
                <button
                  key={review.id}
                  type="button"
                  onClick={() => openReview(review)}
                  className="group block w-full rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-theme-xs transition hover:border-brand-200 hover:shadow-theme-md dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-brand-500/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-gray-800 dark:text-white/90">{review.author}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <Stars rating={review.rating} />
                        <span className="text-xs text-gray-500 dark:text-gray-400">{review.dateLabel}</span>
                      </div>
                    </div>
                    {review.sentiment === 'negative' ? (
                      <RiskBadge risk="high" />
                    ) : (
                      <StatusPill label={sentUi.label} tone={sentUi.tone} icon={sentUi.icon} />
                    )}
                  </div>
                  <p className="mt-4 line-clamp-3 break-words text-sm leading-6 text-gray-500 dark:text-gray-400">
                    {review.text}
                  </p>
                  <div className="mt-4 rounded-2xl border border-blue-light-200 bg-blue-light-50 p-4 dark:border-blue-light-500/20 dark:bg-blue-light-500/15">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-blue-light-500">
                      <Sparkles className="h-3.5 w-3.5" /> AI cevap taslağı
                    </div>
                    <p className="line-clamp-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{review.aiDraft}</p>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <StatusPill
                      label={review.status === 'sent' ? 'Onaylandı' : 'Onay bekliyor'}
                      tone={review.status === 'sent' ? 'emerald' : 'amber'}
                    />
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-[11px] font-semibold text-gray-600 transition group-hover:bg-gray-100 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300">
                      <Eye className="h-3 w-3" /> Detayı aç
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </GlassPanel>
      )}

      <DetailDrawer
        open={Boolean(selected)}
        onClose={closeDrawer}
        tone="rose"
        width="max-w-xl"
        eyebrow={selected ? `Yorum yönetimi · ${selected.dateLabel}` : ''}
        title={
          selected
            ? selected.customerReviews && selected.customerReviews.length > 1
              ? `${selected.customerReviews.length} müşteri yorumu`
              : selected.author
            : ''
        }
        footer={
          selected && selected.status === 'pending' ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="order-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400 sm:order-1 sm:max-w-[55%]">
                Onay sonrası metin artifact olarak kaydedilir. Google'a canlı gönderim için{' '}
                <strong className="text-gray-700 dark:text-gray-200">Onaylar</strong> üzerinden ilgili aksiyonu çalıştırın.
              </p>
              <div className="order-1 flex w-full flex-col gap-2 sm:order-2 sm:w-auto sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => selected && setDraftEdit(selected.aiDraft)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-white/[0.06] dark:text-gray-200 dark:hover:bg-white/[0.09]"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Taslağı sıfırla
                </button>
                <button
                  type="button"
                  disabled={approveMutation.isPending}
                  onClick={approveAndSend}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-900/20 transition hover:bg-emerald-500 disabled:opacity-50 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                >
                  {approveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Yanıtı onayla
                </button>
              </div>
            </div>
          ) : selected ? (
            <div className="flex items-center justify-end">
              <StatusPill label="Kayıt onaylandı" tone="emerald" icon={CheckCircle2} />
            </div>
          ) : undefined
        }
      >
        {selected && (
          <div className="space-y-6">
            {approveMutation.isError && (
              <div className="rounded-xl border border-rose-300/30 bg-rose-950/30 p-4 text-sm text-rose-100 dark:border-rose-500/25 dark:bg-rose-950/40">
                Onay isteği başarısız. Rol izinleri ve oturumu kontrol edin.
              </div>
            )}

            <section className="rounded-2xl border border-gray-200 bg-gray-50/50 p-5 dark:border-gray-700 dark:bg-gray-950/40">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200/80 pb-4 dark:border-white/10">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                    1 · Müşteri yorumu
                  </p>
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                    {selected.customerReviews && selected.customerReviews.length > 1
                      ? 'Yanıt yazacağınız yorumu seçin (vurgulu kart).'
                      : 'Tek yorum — aşağıdaki metni yanıtlıyorsunuz.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Stars rating={selected.rating} />
                  {selected.sentiment === 'negative' ? (
                    <RiskBadge risk="high" />
                  ) : (
                    <StatusPill
                      label={sentimentPresentation(selected.sentiment).label}
                      tone={sentimentPresentation(selected.sentiment).tone}
                      icon={sentimentPresentation(selected.sentiment).icon}
                    />
                  )}
                </div>
              </div>

              {selected.customerReviews && selected.customerReviews.length > 0 ? (
                <ul className="mt-4 space-y-3">
                  {selected.customerReviews.map((row, idx) => {
                    const active = replyTargetIndex === idx;
                    return (
                      <li key={`${row.author}-${idx}`}>
                        <button
                          type="button"
                          onClick={() => setReplyTargetIndex(idx)}
                          className={cn(
                            'w-full rounded-xl border p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
                            active
                              ? 'border-brand-400/50 bg-brand-500/[0.08] ring-2 ring-brand-500/30 dark:border-brand-500/40 dark:bg-brand-500/10'
                              : 'border-gray-200 bg-white hover:border-gray-300 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/20',
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white/90">
                              {active ? (
                                <CircleDot className="h-4 w-4 shrink-0 text-brand-500" aria-hidden />
                              ) : (
                                <span className="flex h-4 w-4 shrink-0 rounded-full border border-gray-300 dark:border-gray-600" aria-hidden />
                              )}
                              {row.author}
                            </span>
                            <Stars rating={row.rating} />
                          </div>
                          {row.date ? (
                            <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                              {new Date(row.date).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}
                              {row.language ? ` · ${row.language.toUpperCase()}` : ''}
                            </p>
                          ) : null}
                          <p className="mt-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">{row.text}</p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-4 break-words text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                  {selected.text}
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-cyan-200/30 bg-white p-5 dark:border-cyan-500/20 dark:bg-cyan-950/20">
              <div className="mb-3 flex flex-wrap items-baseline gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-700 dark:text-cyan-300/90">
                  2 · Yanıt metni
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">Düzenleyebilirsiniz</span>
              </div>
              {selected.customerReviews && selected.customerReviews.length > 1 && replyTargetIndex != null && (
                <p className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-300">
                  <Sparkles className="h-3.5 w-3.5 text-brand-500" />
                  <span>
                    Odağınız:{' '}
                    <strong className="text-gray-900 dark:text-white">
                      {selected.customerReviews[replyTargetIndex]?.author ?? '—'}
                    </strong>
                  </span>
                </p>
              )}
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-800 dark:text-cyan-100/90">
                <Sparkles className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                Onaylanacak yanıt
              </div>
              <textarea
                value={draftEdit}
                onChange={(event) => setDraftEdit(event.target.value)}
                rows={7}
                disabled={selected.status !== 'pending'}
                placeholder="Müşteriye gönderilecek nazik ve net yanıtı buraya yazın…"
                className="min-h-[160px] w-full resize-y rounded-xl border border-gray-200 bg-white p-4 text-sm leading-7 text-gray-900 outline-none ring-0 transition placeholder:text-gray-400 focus:border-cyan-500/50 focus:shadow-[0_0_0_3px_rgba(6,182,212,0.15)] disabled:opacity-60 dark:border-white/15 dark:bg-black/30 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-cyan-400/40"
              />
              <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Onayladığınızda bu metin kayda geçer; müşterinin göreceği içerik budur (Google yayını ayrı adımdır).
              </p>
            </section>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                  Duygu (özet)
                </p>
                <div className="mt-2">
                  <StatusPill
                    label={sentimentPresentation(selected.sentiment).label}
                    tone={sentimentPresentation(selected.sentiment).tone}
                    icon={sentimentPresentation(selected.sentiment).icon}
                  />
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400">
                  Kayıt durumu
                </p>
                <p className="mt-2 text-sm font-semibold text-gray-800 dark:text-white/90">
                  {selected.status === 'sent' ? 'Onaylı' : 'İnceleme bekliyor'}
                </p>
              </div>
            </div>

            {selected.sentiment === 'negative' && (
              <div
                role="status"
                className="flex gap-3 rounded-2xl border border-amber-400/35 bg-amber-950/50 p-4 dark:border-amber-500/30 dark:bg-amber-950/60"
              >
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden />
                <p className="text-sm leading-relaxed text-amber-50 dark:text-amber-100">
                  <span className="font-semibold text-white dark:text-amber-50">Dikkat — olumsuz yorum:</span>{' '}
                  Göndermeden önce tonu ve gerçekleri doğrulayın. Canlı Google yanıtı paket kotası ve aksiyon akışına
                  bağlıdır; test için önce dry-run kullanın.
                </p>
              </div>
            )}
          </div>
        )}
      </DetailDrawer>
    </div>
    </div>
  );
}
