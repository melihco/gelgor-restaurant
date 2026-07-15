'use client';
/**
 * NEW BRIEF — Customer idea → brand-specific fal.ai production → Feed.
 * Minimal form: topic + format + optional photos/vibe. Per-tenant workspace + brand DNA.
 */
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
} from '@/lib/recent-brief-history';
import { invalidateMobileArtifactPool } from '../../_lib/mobile-artifacts';
import type { PendingBriefOutputType } from '@/lib/pending-brief-job';

const MAX_PHOTOS = 5;

type OutputType = 'story' | 'reel' | 'post';

const OUTPUT_TYPES: {
  id: OutputType;
  label: string;
  icon: string;
  desc: string;
  format: string;
}[] = [
  {
    id: 'post',
    label: 'Gönderi',
    icon: '■',
    desc: 'Feed için marka tasarımlı görsel',
    format: '1:1 / 4:5',
  },
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
    desc: 'Tasarımlı kapak + video',
    format: '9:16 video',
  },
];

const COUNT_OPTIONS = ['1', '2', '3'] as const;

export function NewBrief() {
  const { goBack, navigate, enqueueBriefProduction } = useMobileStore();
  const { officeId, tenantId } = useWorkspaceStore();
  const queryClient = useQueryClient();

  function refreshFeedArtifacts() {
    if (!tenantId) return;
    invalidateMobileArtifactPool(queryClient, tenantId);
    void queryClient.invalidateQueries({ queryKey: ['artifacts'] });
  }

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

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [outputType, setOutputType] = useState<OutputType>('post');
  const [count, setCount] = useState('1');
  const [photos, setPhotos] = useState<{ dataUrl: string; uploadedUrl?: string; uploading?: boolean }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'form' | 'submitting' | 'error'>('form');
  const [errorMsg, setErrorMsg] = useState('');
  const [directionLoading, setDirectionLoading] = useState(false);
  const [directionError, setDirectionError] = useState('');

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
          prev.map((p) => (p.dataUrl === previewDataUrl ? { ...p, uploadedUrl, uploading: false } : p)),
        );
      } catch {
        setPhotos((prev) =>
          prev.map((p) => (p.dataUrl === previewDataUrl ? { ...p, uploading: false } : p)),
        );
      }
    }
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  async function suggestDirection() {
    if (!tenantId || !title.trim()) return;
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
      photoUrls: photos.map((p) => p.uploadedUrl).filter(Boolean) as string[],
      savedAt: new Date().toISOString(),
    });
    setLocalDrafts(loadRecentBriefDrafts(tenantId));
    setAppliedDraftId(draftId);
  }, [tenantId, title, description, outputType, count, photos, appliedDraftId]);

  function applyDraft(draft: RecentBriefDraft) {
    setTitle(draft.title);
    setDescription(draft.extraDirection ?? '');
    if (draft.outputType === 'story' || draft.outputType === 'reel' || draft.outputType === 'post') {
      setOutputType(draft.outputType);
    }
    if (draft.count && COUNT_OPTIONS.includes(draft.count as typeof COUNT_OPTIONS[number])) {
      setCount(draft.count);
    }
    if (draft.photoUrls?.length) {
      setPhotos(draft.photoUrls.map((url) => ({ dataUrl: url, uploadedUrl: url })));
    } else {
      setPhotos([]);
    }
    setAppliedDraftId(draft.id);
  }

  async function startProduction() {
    if (!tenantId) {
      setErrorMsg('Workspace bulunamadı');
      setStep('error');
      return;
    }
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
          ...(officeId ? { 'X-Office-Id': officeId } : {}),
        },
        body: JSON.stringify({
          workspaceId: tenantId,
          title: title.trim(),
          extraDirection: description.trim(),
          outputType,
          count: parseInt(count, 10) || 1,
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
        count: parseInt(count, 10) || 1,
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

  function handleSubmit() {
    if (!canSubmit || isLoading) return;
    void startProduction();
  }

  const canSubmit = title.trim().length > 0;
  const isLoading = step === 'submitting';

  if (step === 'error') {
    return (
      <div style={{ height: '100dvh', background: '#07090F', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>⚠</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fb7185', marginBottom: 8 }}>Üretim Başarısız</div>
        <div style={{ fontSize: 13, color: 'rgba(148,163,184,0.5)', textAlign: 'center', lineHeight: 1.6, marginBottom: 32 }}>{errorMsg}</div>
        <button type="button" onClick={() => setStep('form')} style={{ padding: '13px 28px', borderRadius: 30, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
          Tekrar Dene
        </button>
      </div>
    );
  }

  return (
    <div style={{ height: '100dvh', background: '#07090F', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: '-apple-system, "SF Pro Display", sans-serif' }}>

      <div style={{ flexShrink: 0, padding: 'calc(env(safe-area-inset-top,0px) + 14px) 20px 14px', background: 'rgba(5,5,8,0.9)', backdropFilter: 'blur(20px)', borderBottom: '0.5px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" onClick={goBack} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M10 6l-5 6 5 6"/></svg>
        </button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.01em' }}>Yeni Fikir</div>
          <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)', marginTop: 1 }}>
            {brandName
              ? `${brandName} · markanıza özel üretim → Akış`
              : 'Fikrinizi marka DNA + galeri ile tasarlayıp Akış\'a ekleyin'}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px', paddingBottom: 130 }}>

        {recentDrafts.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <Label text="Son fikirler" />
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
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: selected ? '#9DBECE' : '#f8fafc', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {draft.title}
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.45)', marginBottom: 6 }}>
                      {outputTypeLabel(draft.outputType as BriefOutputType | null)}
                      {draft.count ? ` · ${draft.count} adet` : ''}
                    </div>
                    <div style={{ fontSize: 9, color: 'rgba(148,163,184,0.28)' }}>
                      {formatBriefDraftAge(draft.savedAt)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 22 }}>
          <Label text="Ne üretmek istiyorsunuz?" />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="örn. Yaz Kokteylleri, Cuma Gecesi DJ, Taze Menü"
            style={{ width: '100%', padding: '14px 16px', borderRadius: 14, outline: 'none', boxSizing: 'border-box', fontSize: 15, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${title ? 'rgba(157,190,206,0.3)' : 'rgba(255,255,255,0.09)'}`, color: '#f8fafc' }}
          />
          <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(148,163,184,0.35)', lineHeight: 1.5 }}>
            Kısa bir konu yeterli — marka yaratıcı direktörünüz bunu sektörünüze ve marka dilinize göre yorumlar.
          </div>
        </div>

        <div style={{ marginBottom: 22 }}>
          <Label text="Format" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {OUTPUT_TYPES.map((ot) => {
              const sel = outputType === ot.id;
              return (
                <button key={ot.id} type="button" onClick={() => setOutputType(ot.id)} style={{ padding: '14px 10px', borderRadius: 14, cursor: 'pointer', textAlign: 'center', background: sel ? 'rgba(157,190,206,0.12)' : 'rgba(255,255,255,0.04)', border: `0.5px solid ${sel ? 'rgba(157,190,206,0.35)' : 'rgba(255,255,255,0.08)'}` }}>
                  <div style={{ fontSize: 20, marginBottom: 6, color: sel ? '#9DBECE' : 'rgba(255,255,255,0.35)' }}>{ot.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: sel ? 700 : 500, color: sel ? '#9DBECE' : 'rgba(148,163,184,0.6)' }}>{ot.label}</div>
                  <div style={{ fontSize: 9, color: sel ? 'rgba(157,190,206,0.45)' : 'rgba(148,163,184,0.25)', marginTop: 4 }}>{ot.format}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 22 }}>
          <Label text="Kaç tasarım?" />
          <div style={{ display: 'flex', gap: 8 }}>
            {COUNT_OPTIONS.map((n) => (
              <button key={n} type="button" onClick={() => setCount(n)} style={{ flex: 1, padding: '12px', borderRadius: 12, cursor: 'pointer', fontSize: 16, fontWeight: 600, background: count === n ? 'rgba(157,190,206,0.12)' : 'rgba(255,255,255,0.04)', border: `0.5px solid ${count === n ? 'rgba(157,190,206,0.35)' : 'rgba(255,255,255,0.08)'}`, color: count === n ? '#9DBECE' : 'rgba(148,163,184,0.5)' }}>
                {n}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(148,163,184,0.35)' }}>
            Her adet farklı galeri fotoğrafı ve tasarım diliyle üretilir.
          </div>
        </div>

        <div style={{ marginBottom: 22 }}>
          <Label text={`Referans fotoğraf (opsiyonel, en fazla ${MAX_PHOTOS})`} />
          {photos.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {photos.map((p, idx) => (
                <div key={idx} style={{ position: 'relative', width: 72, height: 72, borderRadius: 12, overflow: 'hidden', border: '0.5px solid rgba(255,255,255,0.12)', flexShrink: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  {p.uploading && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', borderTop: '2px solid #fff', animation: 'spinSlow 1s linear infinite' }} />
                    </div>
                  )}
                  {!p.uploading && (
                    <button type="button" onClick={() => removePhoto(idx)} style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff', fontSize: 11, cursor: 'pointer' }}>✕</button>
                  )}
                </div>
              ))}
            </div>
          )}
          {photos.length < MAX_PHOTOS && (
            <>
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} style={{ display: 'none' }} />
              <button type="button" onClick={() => fileInputRef.current?.click()} style={{ width: '100%', padding: '13px', borderRadius: 14, cursor: 'pointer', background: 'rgba(255,255,255,0.03)', border: '0.5px dashed rgba(255,255,255,0.15)', color: 'rgba(148,163,184,0.55)', fontSize: 13, fontWeight: 500 }}>
                {photos.length === 0 ? 'Fotoğraf ekle' : `Daha fazla ekle (${photos.length}/${MAX_PHOTOS})`}
              </button>
              {photos.length === 0 && (
                <div style={{ marginTop: 7, fontSize: 11, color: 'rgba(148,163,184,0.35)', lineHeight: 1.5 }}>
                  Eklemezseniz marka galerisinden otomatik seçilir.
                </div>
              )}
            </>
          )}
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Label text="Vibe & yönlendirme (opsiyonel)" />
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
              }}
            >
              {directionLoading ? 'Öneriliyor…' : '✦ Markaya göre öner'}
            </button>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="örn. mistik gece atmosferi, samimi akşam vibe'ı…"
            rows={3}
            style={{ width: '100%', padding: '13px 15px', borderRadius: 14, resize: 'none', outline: 'none', boxSizing: 'border-box', fontSize: 14, lineHeight: 1.55, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', color: '#f8fafc' }}
          />
          {directionError && (
            <div style={{ marginTop: 8, fontSize: 11, color: '#fb7185' }}>{directionError}</div>
          )}
        </div>
      </div>

      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 20px', paddingBottom: 'max(20px, env(safe-area-inset-bottom))', background: 'rgba(5,5,8,0.96)', backdropFilter: 'blur(24px)', borderTop: '0.5px solid rgba(255,255,255,0.07)' }}>
        {title.trim() && (
          <div style={{ marginBottom: 10, fontSize: 11, color: 'rgba(148,163,184,0.4)', textAlign: 'center', lineHeight: 1.45 }}>
            {brandName ? `${brandName} · ` : ''}{count} adet {outputType === 'story' ? 'hikaye' : outputType === 'reel' ? 'reel' : 'gönderi'} · Akış&apos;ta görünür
          </div>
        )}
        <button
          type="button"
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
            opacity: isLoading ? 0.7 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {isLoading ? (
            <>
              <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', borderTop: '2px solid #fff', animation: 'spinSlow 1s linear infinite' }} />
              Üretim başlatılıyor…
            </>
          ) : (
            <>⚡ Tasarla &amp; Üret</>
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
