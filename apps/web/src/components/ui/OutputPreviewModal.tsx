'use client';

import { useState } from 'react';
import { X, Copy, Download, Play, Instagram, FileText, Film, BookImage, FileImage, Layers, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { ActionButton } from '@/components/ui/primitives';

interface ContentIdea {
  contentType: string;
  title: string;
  caption: string;
  visualDirection: string;
  hashtags: string[];
  postingTime: string;
  engagement: string;
  purpose: string;
}

interface OutputPreviewModalProps {
  open: boolean;
  title: string;
  summary?: string;
  /** Static image preview URL */
  imageUrl?: string | null;
  /** Video URL (mp4). When present, renders a <video> player instead of <img> */
  videoUrl?: string | null;
  caption?: string;
  hashtags?: string[];
  /** Full content plan ideas (Instagram content plan) */
  ideas?: ContentIdea[];
  onClose: () => void;
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|mkv)(\?.*)?$/i.test(url) ||
    url.includes('runwayml.com') ||
    url.includes('runway-assets') ||
    url.startsWith('blob:');
}

const CONTENT_TYPE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  post:     { label: 'Post',     color: '#f472b6', icon: <FileText className="h-3 w-3" /> },
  story:    { label: 'Story',    color: '#a78bfa', icon: <Instagram className="h-3 w-3" /> },
  reel:     { label: 'Reel',     color: '#38bdf8', icon: <Film className="h-3 w-3" /> },
  carousel: { label: 'Carousel', color: '#fb923c', icon: <BookImage className="h-3 w-3" /> },
  blog:     { label: 'Blog',     color: '#34d399', icon: <FileImage className="h-3 w-3" /> },
};

const ENGAGEMENT_COLOR = (e: string) =>
  e?.startsWith('high') ? '#34d399' : e?.startsWith('medium') ? '#fbbf24' : '#6b7280';

type ReelGenState = {
  ideaIndex: number;
  status: 'idle' | 'generating' | 'done' | 'error';
  videoUrl?: string;
  /** Full promptText sent to Runway image-to-video API */
  runwayPrompt?: string;
  runwayModel?: string;
  error?: string;
};

export default function OutputPreviewModal({
  open,
  title,
  summary,
  imageUrl,
  videoUrl,
  caption,
  hashtags = [],
  ideas,
  onClose,
}: OutputPreviewModalProps) {
  const [reelGen, setReelGen] = useState<ReelGenState>({ ideaIndex: -1, status: 'idle' });

  async function handleGenerateReel(idea: ContentIdea, index: number) {
    setReelGen({ ideaIndex: index, status: 'generating' });
    try {
      const res = await fetch('/api/generate-reel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: idea.title,
          concept: idea.visualDirection || idea.caption || idea.title,
          platform: 'instagram',
          contentType: 'reel',
          promptText: idea.caption ? undefined : undefined,
          brandTone: 'professional',
          targetAudience: 'social media users',
          tags: idea.hashtags?.slice(0, 5),
          duration: 5,
        }),
      });
      const data = await res.json();
      if (data.success && data.outputUrls?.[0]) {
        setReelGen({
          ideaIndex: index,
          status: 'done',
          videoUrl: data.outputUrls[0],
          runwayPrompt: typeof data.promptText === 'string' ? data.promptText : undefined,
          runwayModel: typeof data.model === 'string' ? data.model : undefined,
        });
      } else {
        setReelGen({ ideaIndex: index, status: 'error', error: data.error ?? 'Reel üretilemedi' });
      }
    } catch (err) {
      setReelGen({ ideaIndex: index, status: 'error', error: 'Bağlantı hatası' });
    }
  }
  if (!open) return null;

  // If imageUrl is actually a video URL, treat it as video
  const resolvedVideoUrl =
    videoUrl ??
    (imageUrl && isVideoUrl(imageUrl) ? imageUrl : null);

  const resolvedImageUrl =
    resolvedVideoUrl ? null : imageUrl;

  const hasMedia = !!(resolvedVideoUrl || resolvedImageUrl);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl"
        style={{ background: '#0d0f18', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white">{title}</p>
              {resolvedVideoUrl && (
                <span className="inline-flex items-center gap-1 rounded-md bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-medium text-fuchsia-300">
                  <Play className="h-2.5 w-2.5 fill-fuchsia-300" />
                  Reel
                </span>
              )}
            </div>
            {summary && <p className="mt-0.5 text-[11px] text-zinc-500">{summary}</p>}
          </div>
          <div className="flex items-center gap-2">
            {resolvedVideoUrl && (
              <a
                href={resolvedVideoUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-300"
                title="Videoyu indir"
              >
                <Download className="h-3.5 w-3.5" />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="max-h-[calc(90vh-72px)] overflow-y-auto p-5 scrollbar-thin">

          {/* ── Content Plan Cards (Instagram content ideas) ── */}
          {ideas && ideas.length > 0 ? (
            <div className="space-y-3">
              {/* First idea image if available */}
              {resolvedImageUrl && (
                <div className="mb-1 overflow-hidden rounded-xl" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                  <img src={resolvedImageUrl} alt={title} className="h-48 w-full object-cover" />
                </div>
              )}

              {/* All idea cards */}
              {ideas.map((idea, i) => {
                const meta = CONTENT_TYPE_META[idea.contentType?.toLowerCase()] ??
                  { label: idea.contentType, color: '#6b7280', icon: <FileText className="h-3 w-3" /> };
                return (
                  <div
                    key={i}
                    className="rounded-xl p-4"
                    style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    {/* Type + title row */}
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold uppercase"
                        style={{ background: `${meta.color}18`, color: meta.color }}
                      >
                        {meta.icon}
                        {meta.label}
                      </span>
                      <p className="text-[13px] font-semibold text-zinc-200">{idea.title}</p>
                    </div>

                    {/* Caption */}
                    {idea.caption && (
                      <p className="mb-2 text-[12px] leading-relaxed text-zinc-400 line-clamp-4 whitespace-pre-wrap">
                        {idea.caption}
                      </p>
                    )}

                    {/* Visual direction */}
                    {idea.visualDirection && (
                      <p className="mb-2 text-[11px] italic text-zinc-600">
                        🎨 {idea.visualDirection}
                      </p>
                    )}

                    {/* Posting time */}
                    {idea.postingTime && (
                      <p className="mb-2 text-[11px] text-zinc-500">🕐 {idea.postingTime}</p>
                    )}

                    {/* Engagement */}
                    {idea.engagement && (
                      <p className="mb-2 text-[11px]" style={{ color: ENGAGEMENT_COLOR(idea.engagement) }}>
                        📈 {idea.engagement}
                      </p>
                    )}

                    {/* Hashtags */}
                    {idea.hashtags && idea.hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {idea.hashtags.slice(0, 6).map((tag) => (
                          <span key={tag} className="rounded bg-fuchsia-500/[0.08] px-1.5 py-0.5 text-[10px] text-fuchsia-400">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Action row */}
                    <div className="mt-3 flex items-center gap-2">
                      {/* Reel generation button — only for reel type */}
                      {idea.contentType?.toLowerCase() === 'reel' && (
                        <>
                          {reelGen.ideaIndex === i && reelGen.status === 'generating' ? (
                            <div className="flex items-center gap-1.5 rounded-lg bg-fuchsia-500/10 px-3 py-1.5 text-[11px] text-fuchsia-300">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Reel üretiliyor… (~2 dk)
                            </div>
                          ) : reelGen.ideaIndex === i && reelGen.status === 'done' ? (
                            <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-[11px] text-emerald-300">
                              <CheckCircle className="h-3 w-3" />
                              Reel hazır!
                            </div>
                          ) : reelGen.ideaIndex === i && reelGen.status === 'error' ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-[11px] text-red-400">
                                <AlertCircle className="h-3 w-3" />
                                {reelGen.error}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleGenerateReel(idea, i)}
                                className="text-[10px] text-zinc-500 hover:text-zinc-300 underline transition-colors"
                              >
                                Tekrar dene
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleGenerateReel(idea, i)}
                              disabled={reelGen.status === 'generating'}
                              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all disabled:opacity-40"
                              style={{ background: 'linear-gradient(135deg, #a855f7, #38bdf8)', color: '#fff' }}
                            >
                              <Film className="h-3 w-3" />
                              Reel Üret
                            </button>
                          )}
                        </>
                      )}

                      {/* Copy caption */}
                      {idea.caption && (
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(idea.caption)}
                          className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300 transition-colors"
                        >
                          <Copy className="h-3 w-3" />
                          Kopyala
                        </button>
                      )}
                    </div>

                    {/* Generated video inline player */}
                    {reelGen.ideaIndex === i && reelGen.status === 'done' && reelGen.videoUrl && (
                      <div className="mt-3 overflow-hidden rounded-xl" style={{ border: '1px solid rgba(167,139,250,0.3)', background: '#000' }}>
                        <video
                          src={reelGen.videoUrl}
                          controls
                          autoPlay
                          playsInline
                          loop
                          className="w-full"
                          style={{ maxHeight: '320px', objectFit: 'contain' }}
                        />
                        <div className="flex flex-col gap-2 px-3 py-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-zinc-500">
                              Runway {reelGen.runwayModel ?? 'gen4.5'} · 5 sn
                            </span>
                            <a
                              href={reelGen.videoUrl}
                              download
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-[10px] text-fuchsia-400 hover:text-fuchsia-300 transition-colors"
                            >
                              <Download className="h-3 w-3" />
                              İndir
                            </a>
                          </div>
                          {reelGen.runwayPrompt ? (
                            <div className="rounded-lg border border-white/10 bg-black/40 p-2">
                              <p className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">Runway prompt (tam)</p>
                              <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-snug text-zinc-300 scrollbar-thin">
                                {reelGen.runwayPrompt}
                              </pre>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              {/* ── Video Player ── */}
              {resolvedVideoUrl && (
                <div
                  className="mb-4 overflow-hidden rounded-xl"
                  style={{ border: '1px solid rgba(255,255,255,0.08)', background: '#000' }}
                >
                  <video
                    src={resolvedVideoUrl}
                    controls
                    autoPlay={false}
                    loop
                    playsInline
                    className="h-auto w-full"
                    style={{ maxHeight: '60vh', objectFit: 'contain' }}
                  >
                    Tarayıcınız video oynatmayı desteklemiyor.
                  </video>
                </div>
              )}

              {/* ── Image Preview ── */}
              {resolvedImageUrl && (
                <div
                  className="mb-4 overflow-hidden rounded-xl"
                  style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <img src={resolvedImageUrl} alt={title} className="h-auto w-full object-cover" />
                </div>
              )}

              {/* ── No media placeholder (only if nothing at all) ── */}
              {!hasMedia && !caption && (
                <div
                  className="mb-4 flex h-40 flex-col items-center justify-center gap-2 rounded-xl text-zinc-600"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px dashed rgba(255,255,255,0.08)',
                  }}
                >
                  <FileText className="h-7 w-7 opacity-20" />
                  <span className="text-[12px] text-zinc-600">Bu aksiyon türü için görsel önizleme yok</span>
                  <span className="text-[11px] text-zinc-700">Onaylandığında sistem otomatik uygular</span>
                </div>
              )}

              {/* ── Caption ── */}
              {caption && (
                <div
                  className="mb-3 rounded-xl bg-white/[0.02] p-4"
                  style={{ border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <p className="text-[12px] leading-relaxed text-zinc-300 whitespace-pre-wrap">{caption}</p>
                </div>
              )}

              {/* ── Hashtags ── */}
              {hashtags.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {hashtags.map((tag) => (
                    <span key={tag} className="rounded-md bg-fuchsia-500/[0.08] px-2 py-0.5 text-[10px] text-fuchsia-300">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* ── Copy action ── */}
              {caption && (
                <div className="flex justify-end">
                  <ActionButton
                    variant="secondary"
                    size="xs"
                    icon={<Copy className="h-3 w-3" />}
                    onClick={() => navigator.clipboard.writeText(caption)}
                  >
                    Metni kopyala
                  </ActionButton>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

