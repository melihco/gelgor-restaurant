'use client';
/**
 * NEW BRIEF — Real brief creation connected to Nexus API.
 * Creates a brief via /api/briefs, then submits it to decompose into tasks.
 */
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { apiClient } from '@/lib/api-client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useBriefs } from '@/hooks/use-briefs';
import {
  mergeRecentBriefDrafts,
  saveRecentBriefDraft,
  loadRecentBriefDrafts,
  formatBriefDraftAge,
  outputTypeLabel,
  type RecentBriefDraft,
  type BriefOutputType,
  type BriefPriority,
} from '@/lib/recent-brief-history';
import type { Brief, BriefDecomposedResponse } from '@/types';
import { invalidateMobileArtifactPool } from '../../_lib/mobile-artifacts';
import type { PendingBriefOutputType } from '@/lib/pending-brief-job';

const MAX_PHOTOS = 5;

type OutputType = 'story' | 'reel' | 'post' | 'caption' | 'ad' | 'report';
type Priority = 'normal' | 'high' | 'urgent';

const VISUAL_OUTPUT_TYPES = new Set<OutputType>(['story', 'post', 'reel']);
const TEXT_OUTPUT_TYPES = new Set<OutputType>(['caption', 'ad', 'report']);

const VISUAL_OUTPUT_TYPES_LIST: {
  id: OutputType;
  label: string;
  icon: string;
  desc: string;
  format: string;
}[] = [
  {
    id: 'story',
    label: 'Hikaye',
    icon: '▋',
    desc: '9:16 dikey tasarım + hareket',
    format: '9:16',
  },
  {
    id: 'reel',
    label: 'Reel',
    icon: '▶',
    desc: 'Tasarımlı kapak + video animasyon',
    format: '9:16 video',
  },
  {
    id: 'post',
    label: 'Gönderi',
    icon: '■',
    desc: 'Feed için marka tasarımlı görsel',
    format: '1:1 / 4:5',
  },
];

const TEXT_OUTPUT_TYPES_LIST: {
  id: OutputType;
  label: string;
  icon: string;
  desc: string;
}[] = [
  { id: 'caption', label: 'Metin', icon: 'T', desc: 'Metin & hashtag seti' },
  { id: 'ad', label: 'Reklam', icon: '◈', desc: 'Google / Meta reklam brief\'i' },
  { id: 'report', label: 'Rapor', icon: '↗', desc: 'Performans analizi talebi' },
];

const VISUAL_COUNTS = ['1', '2', '3', '5'];
const TEXT_COUNTS = ['1', '3', '5', '10'];

export function NewBrief() {
  const { t } = useTheme();
  const { goBack, navigate, enqueueBriefProduction } = useMobileStore();
  const { officeId, tenantId } = useWorkspaceStore();
  const queryClient = useQueryClient();

  function refreshFeedArtifacts() {
    if (!tenantId) return;
    invalidateMobileArtifactPool(queryClient, tenantId);
    void queryClient.invalidateQueries({ queryKey: ['artifacts'] });
  }

  const { data: missionsData } = useQuery({
    queryKey: ['missions-brief-select', tenantId],
    queryFn: () => apiClient.listMissions(tenantId!, 'in_flight'),
    enabled: Boolean(tenantId),
    staleTime: 60_000,
  });

  const { data: apiBriefs = [] } = useBriefs(officeId);
  const [localDrafts, setLocalDrafts] = useState<RecentBriefDraft[]>([]);
  const [appliedDraftId, setAppliedDraftId] = useState<string | null>(null);

  const { data: brandCtx } = useQuery({
    queryKey: ['brand-context-brief', tenantId],
    queryFn: () => apiClient.getBrandContextData(tenantId!),
    enabled: Boolean(tenantId),
    staleTime: 120_000,
  });

  const brandName = brandCtx?.business_name ?? null;

  useEffect(() => {
    if (tenantId) setLocalDrafts(loadRecentBriefDrafts(tenantId));
  }, [tenantId]);

  const recentDrafts = useMemo(
    () => mergeRecentBriefDrafts(apiBriefs, localDrafts, 12),
    [apiBriefs, localDrafts],
  );

  const campaignOptions = useMemo(() => {
    const missions = (missionsData as { missions?: { title?: string }[] } | undefined)?.missions ?? [];
    const titles = missions.map((m) => m.title).filter(Boolean) as string[];
    return titles.length > 0 ? titles : ['Yeni kampanya'];
  }, [missionsData]);

  const [title, setTitle]           = useState('');
  const [description, setDescription] = useState('');
  const [outputType, setOutputType] = useState<OutputType | null>('story');
  const [campaign, setCampaign]     = useState('');
  const [priority, setPriority]     = useState<Priority>('normal');
  const [count, setCount]           = useState('1');
  const [photos, setPhotos]         = useState<{ dataUrl: string; uploadedUrl?: string; uploading?: boolean }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [createdBrief, setCreatedBrief] = useState<Brief | null>(null);
  const [decomposed, setDecomposed]     = useState<BriefDecomposedResponse | null>(null);
  const [step, setStep] = useState<'form' | 'submitting' | 'done' | 'error'>('form');
  const [errorMsg, setErrorMsg] = useState('');
  const [directionLoading, setDirectionLoading] = useState(false);
  const [directionError, setDirectionError] = useState('');

  const isVisualOutput = outputType !== null && VISUAL_OUTPUT_TYPES.has(outputType);
  const countOptions = isVisualOutput ? VISUAL_COUNTS : TEXT_COUNTS;

  useEffect(() => {
    if (!outputType) return;
    if (VISUAL_OUTPUT_TYPES.has(outputType) && !VISUAL_COUNTS.includes(count)) {
      setCount('1');
    }
    if (TEXT_OUTPUT_TYPES.has(outputType) && !TEXT_COUNTS.includes(count)) {
      setCount('3');
    }
  }, [outputType, count]);

  // Upload a single photo file to the server, return its final URL
  async function uploadPhoto(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const dataUrl = reader.result as string;
          const res = await fetch('/api/upload-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataUrl, mimeType: file.type || 'image/jpeg' }),
          });
          const json = await res.json() as { imageUrl?: string; error?: string };
          if (!res.ok || !json.imageUrl) throw new Error(json.error ?? 'Upload failed');
          resolve(json.imageUrl);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('File read failed'));
      reader.readAsDataURL(file);
    });
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS - photos.length);
    if (!files.length) return;
    e.target.value = '';

    const previews = files.map((f) => ({ dataUrl: URL.createObjectURL(f), uploading: true }));
    setPhotos((prev) => [...prev, ...previews]);

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const previewDataUrl = previews[i]!.dataUrl;
      try {
        const uploadedUrl = await uploadPhoto(file);
        setPhotos((prev) =>
          prev.map((p) => (p.dataUrl === previewDataUrl ? { ...p, uploadedUrl, uploading: false } : p))
        );
      } catch {
        setPhotos((prev) =>
          prev.map((p) => (p.dataUrl === previewDataUrl ? { ...p, uploading: false } : p))
        );
      }
    }
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  async function suggestDirection() {
    if (!tenantId || !title.trim() || !isVisualOutput || !outputType) return;
    setDirectionLoading(true);
    setDirectionError('');
    try {
      const res = await fetch('/api/brief-suggest-direction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}),
        },
        body: JSON.stringify({
          workspaceId: tenantId,
          title: title.trim(),
          outputType,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const data = await res.json() as { ok?: boolean; direction?: string; error?: string };
      if (!res.ok || !data.direction) {
        setDirectionError(data.error ?? 'Öneri oluşturulamadı');
        return;
      }
      setDescription(data.direction);
    } catch {
      setDirectionError('Öneri alınamadı — tekrar deneyin');
    } finally {
      setDirectionLoading(false);
    }
  }

  const persistCurrentDraft = useCallback(() => {
    if (!tenantId || !title.trim()) return;
    const draftId = appliedDraftId ?? crypto.randomUUID();
    saveRecentBriefDraft(tenantId, {
      id: draftId,
      title: title.trim(),
      extraDirection: description.trim(),
      outputType,
      count,
      campaign: campaign || undefined,
      priority,
      photoUrls: photos.map((p) => p.uploadedUrl).filter(Boolean) as string[],
      savedAt: new Date().toISOString(),
    });
    setLocalDrafts(loadRecentBriefDrafts(tenantId));
    setAppliedDraftId(draftId);
  }, [tenantId, title, description, outputType, count, campaign, priority, photos, appliedDraftId]);

  function applyDraft(draft: RecentBriefDraft) {
    setTitle(draft.title);
    setDescription(draft.extraDirection ?? '');
    if (draft.outputType) setOutputType(draft.outputType as OutputType);
    if (draft.count) setCount(draft.count);
    setCampaign(draft.campaign ?? '');
    if (draft.priority) setPriority(draft.priority as Priority);
    if (draft.photoUrls?.length) {
      setPhotos(
        draft.photoUrls.map((url) => ({ dataUrl: url, uploadedUrl: url })),
      );
    } else {
      setPhotos([]);
    }
    setAppliedDraftId(draft.id);
  }

  // Build full description from form fields
  function buildDescription(): string {
    const parts: string[] = [];
    if (outputType) parts.push(`Çıktı tipi: ${outputType}`);
    if (count)      parts.push(`Adet: ${count}`);
    if (campaign)   parts.push(`Kampanya: ${campaign}`);
    parts.push(`Öncelik: ${priority}`);
    if (description.trim()) parts.push(`\n${description.trim()}`);
    const readyUrls = photos.map((p) => p.uploadedUrl).filter(Boolean) as string[];
    if (readyUrls.length > 0) {
      parts.push(`\n📷 Fotoğraflar:\n${readyUrls.join('\n')}`);
    }
    return parts.join('\n');
  }

  // Visual production path: brief → /api/brief-produce (background) → feed polling
  async function startVisualProduction() {
    if (!tenantId) { setErrorMsg('Workspace bulunamadı'); setStep('error'); return; }
    if (!outputType || !VISUAL_OUTPUT_TYPES.has(outputType)) return;
    setStep('submitting');
    try {
      const readyPhotoUrls = photos
        .filter((p) => p.uploadedUrl && !p.uploading)
        .map((p) => p.uploadedUrl!) as string[];
      if (photos.some((p) => p.uploading)) {
        setErrorMsg('Fotoğraflar hâlâ yükleniyor — lütfen bekleyin.');
        setStep('error');
        return;
      }
      if (photos.length > 0 && readyPhotoUrls.length === 0) {
        setErrorMsg('Yüklenen fotoğraflar kullanılamadı — lütfen tekrar yükleyin.');
        setStep('error');
        return;
      }
      const res = await fetch('/api/brief-produce', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}),
        },
        body: JSON.stringify({
          workspaceId: tenantId,
          title: title.trim(),
          extraDirection: description.trim(),
          outputType,
          count: parseInt(count) || 1,
          photoUrls: readyPhotoUrls,
          background: true,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await res.json() as {
        ok?: boolean;
        queued?: boolean;
        jobId?: string;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.jobId) {
        setErrorMsg(data.error ?? 'Brief kuyruğa alınamadı.');
        setStep('error');
        return;
      }
      persistCurrentDraft();
      enqueueBriefProduction({
        id: data.jobId,
        title: title.trim(),
        outputType: outputType as PendingBriefOutputType,
        count: parseInt(count) || 1,
        startedAt: Date.now(),
      });
      refreshFeedArtifacts();
      setStep('form');
      navigate('feed');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Brief gönderilemedi — tekrar deneyin.');
      setStep('error');
    }
  }

  // Text/report path: create brief → decompose into tasks (existing flow)
  const createMutation = useMutation({
    mutationFn: () => apiClient.createBrief(officeId, {
      title: title.trim() || `${outputType ?? 'içerik'} — ${count} adet`,
      description: buildDescription(),
    }),
    onSuccess: async (brief) => {
      setCreatedBrief(brief);
      persistCurrentDraft();
      setStep('submitting');
      try {
        const decomposedResult = await apiClient.submitBrief(brief.id);
        setDecomposed(decomposedResult);
        setStep('done');
      } catch {
        setStep('done');
      }
    },
    onError: (err: any) => {
      setErrorMsg(err?.message ?? 'Brief oluşturulamadı. Lütfen tekrar deneyin.');
      setStep('error');
    },
  });

  function handleSubmit() {
    if (!canSubmit || isLoading) return;
    persistCurrentDraft();
    if (outputType && VISUAL_OUTPUT_TYPES.has(outputType)) {
      startVisualProduction();
    } else {
      createMutation.mutate();
    }
  }

  const canSubmit = title.trim().length > 0 && outputType !== null;
  const isLoading = step === 'submitting' || createMutation.isPending;

  // ── Done state (text/report brief flow) ─────────────────────────────
  if (step === 'done') {
    const taskCount = decomposed?.tasks?.length ?? 0;
    return (
      <div style={{ height: '100dvh', background: '#07090F', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, fontFamily: '-apple-system, "SF Pro Display", sans-serif' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(157,190,206,0.10)', border: '1px solid rgba(157,190,206,0.25)' }}>
          <span style={{ fontSize: 28 }}>⚡</span>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#f8fafc', marginBottom: 8, letterSpacing: '-0.02em', textAlign: 'center' }}>
          {createdBrief?.title ?? 'Tamamlandı'}
        </div>
        <div style={{ fontSize: 14, color: 'rgba(148,163,184,0.55)', textAlign: 'center', lineHeight: 1.65, marginBottom: 6 }}>
          Talebiniz alındı — AI ekibiniz 24 saat içinde haftalık plana ekleyecek.
        </div>
        {taskCount > 0 && (
          <div style={{ fontSize: 13, color: '#9DBECE', fontWeight: 600, marginBottom: 36 }}>
            {taskCount} görev oluşturuldu
          </div>
        )}
        {taskCount === 0 && <div style={{ marginBottom: 36 }} />}

        {createdBrief && (
          <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.25)', marginBottom: 36, fontFamily: 'monospace' }}>
            {createdBrief.id.slice(0, 8)}…
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <button onClick={goBack} style={{ flex: 1, padding: '14px', borderRadius: 14, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.09)', color: 'rgba(226,232,240,0.65)', fontSize: 13, fontWeight: 500 }}>
            Kapat
          </button>
          <button onClick={() => navigate('missions')} style={{ flex: 2, padding: '14px', borderRadius: 14, cursor: 'pointer', background: 'rgba(157,190,206,0.12)', border: '0.5px solid rgba(157,190,206,0.25)', color: '#9DBECE', fontSize: 13, fontWeight: 700 }}>
            İçerik planına git →
          </button>
        </div>
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────
  if (step === 'error') {
    return (
      <div style={{ height: '100dvh', background: '#07090F', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>⚠</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fb7185', marginBottom: 8 }}>
          {outputType && VISUAL_OUTPUT_TYPES.has(outputType) ? 'Üretim Başarısız' : 'Brief Oluşturulamadı'}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(148,163,184,0.5)', textAlign: 'center', lineHeight: 1.6, marginBottom: 32 }}>{errorMsg}</div>
        <button onClick={() => setStep('form')} style={{ padding: '13px 28px', borderRadius: 30, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
          Tekrar Dene
        </button>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100dvh', background: '#07090F', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: '-apple-system, "SF Pro Display", sans-serif' }}>

      {/* Header */}
      <div style={{ flexShrink: 0, padding: 'calc(env(safe-area-inset-top,0px) + 14px) 20px 14px', background: 'rgba(5,5,8,0.9)', backdropFilter: 'blur(20px)', borderBottom: '0.5px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={goBack} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M10 6l-5 6 5 6"/></svg>
        </button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.01em' }}>Yeni Brief</div>
          <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)', marginTop: 1 }}>
            {brandName
              ? `${brandName} · marka DNA + galeri ile tasarla`
              : 'Brief\'i markanıza özel yorumla → tasarla & üret'}
          </div>
        </div>
      </div>

      {/* Scrollable form */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px', paddingBottom: 130 }}>

        {/* Previous briefs */}
        {recentDrafts.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <Label text="Önceki Briefler" />
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, margin: '0 -4px', scrollbarWidth: 'none' }}>
              {recentDrafts.map((draft) => {
                const selected = appliedDraftId === draft.id;
                return (
                  <button
                    key={draft.id}
                    type="button"
                    onClick={() => applyDraft(draft)}
                    style={{
                      flexShrink: 0,
                      width: 168,
                      padding: '12px 13px',
                      borderRadius: 14,
                      cursor: 'pointer',
                      textAlign: 'left',
                      background: selected ? 'rgba(157,190,206,0.14)' : 'rgba(255,255,255,0.04)',
                      border: `0.5px solid ${selected ? 'rgba(157,190,206,0.4)' : 'rgba(255,255,255,0.08)'}`,
                      transition: 'all 140ms',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: selected ? '#9DBECE' : '#f8fafc', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {draft.title}
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.45)', marginBottom: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span>{outputTypeLabel(draft.outputType as BriefOutputType | null)}</span>
                      {draft.count && <span>· {draft.count} adet</span>}
                    </div>
                    {draft.extraDirection && (
                      <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 6 }}>
                        {draft.extraDirection}
                      </div>
                    )}
                    <div style={{ fontSize: 9, color: 'rgba(148,163,184,0.28)' }}>
                      {formatBriefDraftAge(draft.savedAt)}
                      {draft.source === 'api' ? ' · API' : ''}
                    </div>
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(148,163,184,0.35)', lineHeight: 1.5 }}>
              Daha önce gönderdiğiniz brief&apos;lerden birini seçerek formu otomatik doldurun.
            </div>
          </div>
        )}

        {/* Title */}
        <div style={{ marginBottom: 22 }}>
          <Label text="Ne üretmek istiyorsunuz?" />
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="örn. Full Moon, Yaz Menüsü, Cuma Gecesi DJ"
            style={{ width: '100%', padding: '14px 16px', borderRadius: 14, outline: 'none', boxSizing: 'border-box', fontSize: 15, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${title ? 'rgba(157,190,206,0.3)' : 'rgba(255,255,255,0.09)'}`, color: '#f8fafc', transition: 'border-color 150ms' }}
          />
          <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(148,163,184,0.35)', lineHeight: 1.5 }}>
            Kısa bir konu yeterli — marka yaratıcı direktörünüz bunu sektörünüze ve marka dilinize göre yorumlar.
          </div>
        </div>

        {/* Visual output types */}
        <div style={{ marginBottom: 22 }}>
          <Label text="Tasarım Formatı" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {VISUAL_OUTPUT_TYPES_LIST.map(ot => {
              const sel = outputType === ot.id;
              return (
                <button key={ot.id} onClick={() => setOutputType(ot.id)} style={{ padding: '14px 10px', borderRadius: 14, cursor: 'pointer', textAlign: 'center', background: sel ? 'rgba(157,190,206,0.12)' : 'rgba(255,255,255,0.04)', border: `0.5px solid ${sel ? 'rgba(157,190,206,0.35)' : 'rgba(255,255,255,0.08)'}`, transition: 'all 140ms' }}>
                  <div style={{ fontSize: 20, marginBottom: 6, color: sel ? '#9DBECE' : 'rgba(255,255,255,0.35)' }}>{ot.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: sel ? 700 : 500, color: sel ? '#9DBECE' : 'rgba(148,163,184,0.6)' }}>{ot.label}</div>
                  <div style={{ fontSize: 10, color: sel ? 'rgba(157,190,206,0.6)' : 'rgba(148,163,184,0.3)', marginTop: 2 }}>{ot.desc}</div>
                  <div style={{ fontSize: 9, color: sel ? 'rgba(157,190,206,0.45)' : 'rgba(148,163,184,0.25)', marginTop: 4 }}>{ot.format}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Pipeline explainer — visible when visual type selected */}
        {isVisualOutput && (
          <div style={{ marginBottom: 22, padding: '14px 16px', borderRadius: 14, background: 'rgba(157,190,206,0.05)', border: '0.5px solid rgba(157,190,206,0.12)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(157,190,206,0.7)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
              Nasıl çalışır?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                'Brief markanıza özel headline, caption ve vibe ile yorumlanır',
                'Marka galerisinden en uygun fotoğraf seçilir',
                'Logo + renkler + sektör tasarım diliyle görsel oluşturulur',
                outputType !== 'post' ? 'Story/Reel için hareket animasyonu eklenir' : null,
              ].filter(Boolean).map((line, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 11, color: 'rgba(157,190,206,0.5)', flexShrink: 0, marginTop: 1 }}>{i + 1}.</span>
                  <span style={{ fontSize: 12, color: 'rgba(148,163,184,0.55)', lineHeight: 1.45 }}>{line}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Text output types — secondary */}
        <div style={{ marginBottom: 22 }}>
          <Label text="Metin & Analiz (opsiyonel)" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {TEXT_OUTPUT_TYPES_LIST.map(ot => {
              const sel = outputType === ot.id;
              return (
                <button key={ot.id} onClick={() => setOutputType(ot.id)} style={{ padding: '12px 8px', borderRadius: 14, cursor: 'pointer', textAlign: 'center', background: sel ? 'rgba(157,190,206,0.12)' : 'rgba(255,255,255,0.04)', border: `0.5px solid ${sel ? 'rgba(157,190,206,0.35)' : 'rgba(255,255,255,0.08)'}`, transition: 'all 140ms' }}>
                  <div style={{ fontSize: 18, marginBottom: 5, color: sel ? '#9DBECE' : 'rgba(255,255,255,0.35)' }}>{ot.icon}</div>
                  <div style={{ fontSize: 11, fontWeight: sel ? 700 : 500, color: sel ? '#9DBECE' : 'rgba(148,163,184,0.6)' }}>{ot.label}</div>
                  <div style={{ fontSize: 9, color: sel ? 'rgba(157,190,206,0.6)' : 'rgba(148,163,184,0.3)', marginTop: 2 }}>{ot.desc}</div>
                </button>
              );
            })}
          </div>
          {!isVisualOutput && outputType && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(148,163,184,0.35)', lineHeight: 1.5 }}>
              Bu tip AI ekibine görev olarak atanır — anında görsel üretilmez.
            </div>
          )}
        </div>

        {/* Count */}
        <div style={{ marginBottom: 22 }}>
          <Label text={isVisualOutput ? 'Kaç tasarım?' : 'Adet'} />
          <div style={{ display: 'flex', gap: 8 }}>
            {countOptions.map(n => (
              <button key={n} onClick={() => setCount(n)} style={{ flex: 1, padding: '12px', borderRadius: 12, cursor: 'pointer', fontSize: 16, fontWeight: 600, background: count === n ? 'rgba(157,190,206,0.12)' : 'rgba(255,255,255,0.04)', border: `0.5px solid ${count === n ? 'rgba(157,190,206,0.35)' : 'rgba(255,255,255,0.08)'}`, color: count === n ? '#9DBECE' : 'rgba(148,163,184,0.5)' }}>
                {n}
              </button>
            ))}
          </div>
          {isVisualOutput && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(148,163,184,0.35)' }}>
              Her adet farklı galeri fotoğrafı ve tasarım diliyle üretilir.
            </div>
          )}
        </div>

        {/* Campaign & Priority — only for text flow */}
        {!isVisualOutput && outputType && (
          <>
            <div style={{ marginBottom: 22 }}>
              <Label text="Kampanya (opsiyonel)" />
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {campaignOptions.map(c => {
                  const sel = campaign === c;
                  return (
                    <button key={c} onClick={() => setCampaign(sel ? '' : c)} style={{ padding: '7px 13px', borderRadius: 30, cursor: 'pointer', fontSize: 12, fontWeight: sel ? 600 : 400, background: sel ? 'rgba(157,190,206,0.12)' : 'rgba(255,255,255,0.04)', border: `0.5px solid ${sel ? 'rgba(157,190,206,0.3)' : 'rgba(255,255,255,0.08)'}`, color: sel ? '#9DBECE' : 'rgba(148,163,184,0.5)' }}>
                      {sel ? '✓ ' : ''}{c}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginBottom: 22 }}>
              <Label text="Öncelik" />
              <div style={{ display: 'flex', gap: 8 }}>
                {([
                  { id: 'normal'  as Priority, label: 'Normal',  color: '#60a5fa' },
                  { id: 'high'    as Priority, label: 'Yüksek',  color: '#f59e0b' },
                  { id: 'urgent'  as Priority, label: 'Acil',    color: '#fb7185' },
                ]).map(p => (
                  <button key={p.id} onClick={() => setPriority(p.id)} style={{ flex: 1, padding: '11px', borderRadius: 12, cursor: 'pointer', fontSize: 12, fontWeight: priority === p.id ? 700 : 400, background: priority === p.id ? `${p.color}14` : 'rgba(255,255,255,0.04)', border: `0.5px solid ${priority === p.id ? p.color + '35' : 'rgba(255,255,255,0.08)'}`, color: priority === p.id ? p.color : 'rgba(148,163,184,0.5)' }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Photos — only for visual flow */}
        {isVisualOutput && (
        <div style={{ marginBottom: 22 }}>
          <Label text={`Referans Fotoğraf (opsiyonel, maks ${MAX_PHOTOS})`} />

          {/* Thumbnail row */}
          {photos.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {photos.map((p, idx) => (
                <div key={idx} style={{ position: 'relative', width: 72, height: 72, borderRadius: 12, overflow: 'hidden', border: '0.5px solid rgba(255,255,255,0.12)', flexShrink: 0 }}>
                  <img
                    src={p.dataUrl}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                  {p.uploading && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', borderTop: '2px solid #fff', animation: 'spinSlow 1s linear infinite' }} />
                    </div>
                  )}
                  {!p.uploading && (
                    <button
                      onClick={() => removePhoto(idx)}
                      style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      ✕
                    </button>
                  )}
                  {!p.uploading && !p.uploadedUrl && (
                    <div style={{ position: 'absolute', bottom: 3, left: 3, right: 3, background: 'rgba(239,68,68,0.85)', borderRadius: 4, fontSize: 9, color: '#fff', textAlign: 'center', padding: '1px 0' }}>hata</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add button */}
          {photos.length < MAX_PHOTOS && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: '100%', padding: '13px', borderRadius: 14, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.03)', border: '0.5px dashed rgba(255,255,255,0.15)',
                  color: 'rgba(148,163,184,0.55)', fontSize: 13, fontWeight: 500,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <span style={{ fontSize: 16 }}>📷</span>
                {photos.length === 0 ? 'Fotoğraf Ekle' : 'Daha Fazla Ekle'}{photos.length > 0 ? ` (${photos.length}/${MAX_PHOTOS})` : ''}
              </button>
              {photos.length === 0 && (
                <div style={{ marginTop: 7, fontSize: 11, color: 'rgba(148,163,184,0.35)', lineHeight: 1.5 }}>
                  Eklemezseniz marka galerisinden otomatik seçilir. Yüklediğiniz fotoğraflar galeri yerine doğrudan tasarımda kullanılır — her üretim için bir fotoğraf (5 fotoğraf + 5 adet = her biri ayrı görsel).
                </div>
              )}
              {photos.length > 0 && (
                <div style={{ marginTop: 7, fontSize: 11, color: 'rgba(157,190,206,0.55)', lineHeight: 1.5 }}>
                  {photos.filter((p) => p.uploadedUrl).length}/{photos.length} fotoğraf hazır — marka galerisi devre dışı, yalnızca bu görseller kullanılacak.
                </div>
              )}
            </>
          )}
        </div>
        )}

        {/* Additional direction */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Label text={isVisualOutput ? 'Vibe & Yönlendirme (opsiyonel)' : 'Ek Yönlendirme (opsiyonel)'} />
            {isVisualOutput && (
              <button
                type="button"
                onClick={suggestDirection}
                disabled={!title.trim() || directionLoading}
                style={{
                  padding: '6px 12px',
                  borderRadius: 20,
                  cursor: !title.trim() || directionLoading ? 'not-allowed' : 'pointer',
                  fontSize: 11,
                  fontWeight: 600,
                  background: 'rgba(157,190,206,0.12)',
                  border: '0.5px solid rgba(157,190,206,0.25)',
                  color: !title.trim() || directionLoading ? 'rgba(148,163,184,0.35)' : '#9DBECE',
                  opacity: directionLoading ? 0.7 : 1,
                }}
              >
                {directionLoading ? 'Öneriliyor…' : '✦ Markaya göre öner'}
              </button>
            )}
          </div>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder={isVisualOutput
              ? 'örn. mistik ve sıcak bir vibe, neon gece atmosferi, samimi akşam...'
              : 'Ton, görsel yön, özel istekler, referans...'}
            rows={3}
            style={{ width: '100%', padding: '13px 15px', borderRadius: 14, resize: 'none', outline: 'none', boxSizing: 'border-box', fontSize: 14, lineHeight: 1.55, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', color: '#f8fafc' }}
          />
          {isVisualOutput && (
            <div style={{ marginTop: 8, fontSize: 11, color: directionError ? '#fb7185' : 'rgba(148,163,184,0.35)', lineHeight: 1.5 }}>
              {directionError || (title.trim()
                ? `"${title.trim()}" konusunu markanızın DNA'sına göre 4–5 cümleyle otomatik doldurmak için öner butonunu kullanın.`
                : 'Önce brief konusunu yazın, ardından markaya özel vibe önerisi alın.')}
            </div>
          )}
        </div>
      </div>

      {/* Submit */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 20px', paddingBottom: 'max(20px, env(safe-area-inset-bottom))', background: 'rgba(5,5,8,0.96)', backdropFilter: 'blur(24px)', borderTop: '0.5px solid rgba(255,255,255,0.07)' }}>

        {isVisualOutput && title.trim() && (
          <div style={{ marginBottom: 10, fontSize: 11, color: 'rgba(148,163,184,0.4)', textAlign: 'center', lineHeight: 1.45 }}>
            {brandName ? `${brandName} · ` : ''}{count} adet {outputType === 'story' ? 'story' : outputType === 'reel' ? 'reel' : 'gönderi'} · arka planda üretilir, feed&apos;de görünür
          </div>
        )}

        {/* Submitting progress indicator */}
        {step === 'submitting' && (
          <div style={{ textAlign: 'center', marginBottom: 10, fontSize: 12, color: 'rgba(157,190,206,0.7)' }}>
            <span style={{ animation: 'shimmer 1.2s ease-in-out infinite' }}>✦ Brief parçalanıyor ve AI ekibine atanıyor...</span>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit || isLoading}
          style={{
            width: '100%', padding: '17px', borderRadius: 16,
            cursor: canSubmit && !isLoading ? 'pointer' : 'not-allowed',
            background: canSubmit && !isLoading
              ? 'linear-gradient(135deg, rgba(77,112,136,0.90), rgba(45,80,104,0.85))'
              : 'rgba(255,255,255,0.05)',
            border: 'none',
            color: canSubmit ? '#fff' : 'rgba(148,163,184,0.35)',
            fontSize: 15, fontWeight: 700,
            boxShadow: canSubmit && !isLoading ? '0 4px 20px rgba(77,112,136,0.35)' : 'none',
            opacity: isLoading ? 0.7 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {isLoading ? (
            <>
              <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', borderTop: '2px solid #fff', animation: 'spinSlow 1s linear infinite' }} />
              {isVisualOutput ? 'Feed\'e yönlendiriliyor…' : step === 'submitting' ? 'Görevler Oluşturuluyor...' : 'Brief Oluşturuluyor...'}
            </>
          ) : (
            <>⚡ {isVisualOutput ? 'Tasarla & Üret' : 'AI Ekibine Gönder'}</>
          )}
        </button>
      </div>
    </div>
  );
}

function Label({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(148,163,184,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
      {text}
    </div>
  );
}
