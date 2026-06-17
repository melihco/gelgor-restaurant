'use client';
/**
 * NEW BRIEF — Real brief creation connected to Nexus API.
 * Creates a brief via /api/briefs, then submits it to decompose into tasks.
 */
import { useState, useMemo, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { apiClient } from '@/lib/api-client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import type { Brief, BriefDecomposedResponse } from '@/types';

const MAX_PHOTOS = 5;

type OutputType = 'story' | 'reel' | 'post' | 'caption' | 'ad' | 'report';
type Priority = 'normal' | 'high' | 'urgent';

// These output types go to the direct production pipeline (brief-produce)
const VISUAL_OUTPUT_TYPES = new Set<OutputType>(['story', 'post', 'reel']);

const OUTPUT_TYPES: { id: OutputType; label: string; icon: string; desc: string }[] = [
  { id: 'story',   label: 'Story',   icon: '▋', desc: 'Instagram story seti'  },
  { id: 'reel',    label: 'Reel',    icon: '▶', desc: 'Video reel içeriği'    },
  { id: 'post',    label: 'Gönderi', icon: '■', desc: 'Feed paylaşımı'         },
  { id: 'caption', label: 'Caption', icon: 'T', desc: 'Metin & hashtag seti'  },
  { id: 'ad',      label: 'Reklam',  icon: '◈', desc: 'Google / Meta reklam'  },
  { id: 'report',  label: 'Rapor',   icon: '↗', desc: 'Performans analizi'    },
];

const COUNTS = ['1', '3', '5', '10'];

export function NewBrief() {
  const { t } = useTheme();
  const { goBack, navigate } = useMobileStore();
  const { officeId, tenantId } = useWorkspaceStore();

  const { data: missionsData } = useQuery({
    queryKey: ['missions-brief-select', tenantId],
    queryFn: () => apiClient.listMissions(tenantId!, 'in_flight'),
    enabled: Boolean(tenantId),
    staleTime: 60_000,
  });

  const campaignOptions = useMemo(() => {
    const missions = (missionsData as { missions?: { title?: string }[] } | undefined)?.missions ?? [];
    const titles = missions.map((m) => m.title).filter(Boolean) as string[];
    return titles.length > 0 ? titles : ['Yeni kampanya'];
  }, [missionsData]);

  const [title, setTitle]           = useState('');
  const [description, setDescription] = useState('');
  const [outputType, setOutputType] = useState<OutputType | null>(null);
  const [campaign, setCampaign]     = useState('');
  const [priority, setPriority]     = useState<Priority>('normal');
  const [count, setCount]           = useState('3');
  const [photos, setPhotos]         = useState<{ dataUrl: string; uploadedUrl?: string; uploading?: boolean }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [createdBrief, setCreatedBrief] = useState<Brief | null>(null);
  const [decomposed, setDecomposed]     = useState<BriefDecomposedResponse | null>(null);
  const [step, setStep] = useState<'form' | 'submitting' | 'producing' | 'done' | 'error'>('form');
  const [errorMsg, setErrorMsg] = useState('');
  const [producedCount, setProducedCount] = useState(0);

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

  // Visual production path: brief → /api/brief-produce → artifacts in feed
  async function startVisualProduction() {
    if (!tenantId) { setErrorMsg('Workspace bulunamadı'); setStep('error'); return; }
    setStep('producing');
    try {
      const readyPhotoUrls = photos.map((p) => p.uploadedUrl).filter(Boolean) as string[];
      const res = await fetch('/api/brief-produce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: tenantId,
          title: title.trim() || `${outputType} — ${count} adet`,
          description: buildDescription(),
          outputType,
          count: parseInt(count) || 3,
          photoUrls: readyPhotoUrls,
        }),
        signal: AbortSignal.timeout(280_000),
      });
      const data = await res.json() as { ok?: boolean; produced?: number; error?: string; code?: string };
      if (!res.ok || !data.ok) {
        setErrorMsg(data.error ?? 'İçerik üretimi başarısız.');
        setStep('error');
        return;
      }
      setProducedCount(data.produced ?? 0);
      setStep('done');
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'İstek zaman aşımına uğradı. İçerik arka planda üretilebilir.');
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
    if (outputType && VISUAL_OUTPUT_TYPES.has(outputType)) {
      startVisualProduction();
    } else {
      createMutation.mutate();
    }
  }

  const canSubmit = title.trim().length > 0 && outputType !== null;
  const isLoading = step === 'submitting' || step === 'producing' || createMutation.isPending;

  // ── Producing state ─────────────────────────────────────────────────
  if (step === 'producing') {
    return (
      <div style={{ height: '100dvh', background: '#07090F', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, fontFamily: '-apple-system, "SF Pro Display", sans-serif' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(157,190,206,0.08)', border: '1px solid rgba(157,190,206,0.2)' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid rgba(157,190,206,0.2)', borderTop: '3px solid #9DBECE', animation: 'spinSlow 1s linear infinite' }} />
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#f8fafc', marginBottom: 10, letterSpacing: '-0.02em', textAlign: 'center' }}>
          İçerik üretiliyor
        </div>
        <div style={{ fontSize: 13, color: 'rgba(148,163,184,0.5)', textAlign: 'center', lineHeight: 1.65, maxWidth: 260 }}>
          AI ekibiniz {count} adet {outputType} üretiyor. Bu işlem birkaç dakika sürebilir, lütfen ekranda kalın.
        </div>
      </div>
    );
  }

  // ── Done state ──────────────────────────────────────────────────────
  if (step === 'done') {
    const isVisual = outputType && VISUAL_OUTPUT_TYPES.has(outputType);
    const taskCount = decomposed?.tasks?.length ?? 0;
    return (
      <div style={{ height: '100dvh', background: '#07090F', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, fontFamily: '-apple-system, "SF Pro Display", sans-serif' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(157,190,206,0.10)', border: '1px solid rgba(157,190,206,0.25)' }}>
          <span style={{ fontSize: 28 }}>{isVisual ? '✦' : '⚡'}</span>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#f8fafc', marginBottom: 8, letterSpacing: '-0.02em', textAlign: 'center' }}>
          {isVisual ? 'İçerik hazır!' : (createdBrief?.title ?? 'Tamamlandı')}
        </div>
        <div style={{ fontSize: 14, color: 'rgba(148,163,184,0.55)', textAlign: 'center', lineHeight: 1.65, marginBottom: 6 }}>
          {isVisual
            ? `${producedCount} içerik feed'e eklendi.`
            : 'Talebiniz alındı — AI ekibiniz 24 saat içinde haftalık plana ekleyecek.'}
        </div>
        {!isVisual && taskCount > 0 && (
          <div style={{ fontSize: 13, color: '#9DBECE', fontWeight: 600, marginBottom: 36 }}>
            {taskCount} görev oluşturuldu
          </div>
        )}
        {(!isVisual && taskCount === 0) && <div style={{ marginBottom: 36 }} />}
        {isVisual && <div style={{ marginBottom: 36 }} />}

        {createdBrief && (
          <div style={{ fontSize: 10, color: 'rgba(148,163,184,0.25)', marginBottom: 36, fontFamily: 'monospace' }}>
            {createdBrief.id.slice(0, 8)}…
          </div>
        )}
        {!createdBrief && isVisual && <div style={{ marginBottom: 36 }} />}

        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <button onClick={goBack} style={{ flex: 1, padding: '14px', borderRadius: 14, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.09)', color: 'rgba(226,232,240,0.65)', fontSize: 13, fontWeight: 500 }}>
            Kapat
          </button>
          <button onClick={() => navigate(isVisual ? 'feed' : 'missions')} style={{ flex: 2, padding: '14px', borderRadius: 14, cursor: 'pointer', background: 'rgba(157,190,206,0.12)', border: '0.5px solid rgba(157,190,206,0.25)', color: '#9DBECE', fontSize: 13, fontWeight: 700 }}>
            {isVisual ? "Feed'e git →" : 'İçerik planına git →'}
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
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fb7185', marginBottom: 8 }}>Brief Oluşturulamadı</div>
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
          <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.4)', marginTop: 1 }}>AI ekibine yeni görev ver</div>
        </div>
      </div>

      {/* Scrollable form */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px', paddingBottom: 130 }}>

        {/* Title */}
        <div style={{ marginBottom: 22 }}>
          <Label text="Brief Başlığı" />
          <input value={title} onChange={e => setTitle(e.target.value)}
            placeholder="örn. Yaz kampanyası için 5 story seti"
            style={{ width: '100%', padding: '14px 16px', borderRadius: 14, outline: 'none', boxSizing: 'border-box', fontSize: 15, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${title ? 'rgba(157,190,206,0.3)' : 'rgba(255,255,255,0.09)'}`, color: '#f8fafc', transition: 'border-color 150ms' }}
          />
        </div>

        {/* Output type */}
        <div style={{ marginBottom: 22 }}>
          <Label text="Çıktı Tipi" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {OUTPUT_TYPES.map(ot => {
              const sel = outputType === ot.id;
              return (
                <button key={ot.id} onClick={() => setOutputType(ot.id)} style={{ padding: '14px 10px', borderRadius: 14, cursor: 'pointer', textAlign: 'center', background: sel ? 'rgba(157,190,206,0.12)' : 'rgba(255,255,255,0.04)', border: `0.5px solid ${sel ? 'rgba(157,190,206,0.35)' : 'rgba(255,255,255,0.08)'}`, transition: 'all 140ms' }}>
                  <div style={{ fontSize: 20, marginBottom: 6, color: sel ? '#9DBECE' : 'rgba(255,255,255,0.35)' }}>{ot.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: sel ? 700 : 500, color: sel ? '#9DBECE' : 'rgba(148,163,184,0.6)' }}>{ot.label}</div>
                  <div style={{ fontSize: 10, color: sel ? 'rgba(157,190,206,0.6)' : 'rgba(148,163,184,0.3)', marginTop: 2 }}>{ot.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Count */}
        <div style={{ marginBottom: 22 }}>
          <Label text="Adet" />
          <div style={{ display: 'flex', gap: 8 }}>
            {COUNTS.map(n => (
              <button key={n} onClick={() => setCount(n)} style={{ flex: 1, padding: '12px', borderRadius: 12, cursor: 'pointer', fontSize: 16, fontWeight: 600, background: count === n ? 'rgba(157,190,206,0.12)' : 'rgba(255,255,255,0.04)', border: `0.5px solid ${count === n ? 'rgba(157,190,206,0.35)' : 'rgba(255,255,255,0.08)'}`, color: count === n ? '#9DBECE' : 'rgba(148,163,184,0.5)' }}>
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Campaign */}
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

        {/* Priority */}
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

        {/* Photos */}
        <div style={{ marginBottom: 22 }}>
          <Label text={`Fotoğraflar (opsiyonel, maks ${MAX_PHOTOS})`} />

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
                  Ürün, mekan veya etkinlik fotoğrafları ekleyin. AI içerik üretiminde bu görselleri kullanır.
                </div>
              )}
            </>
          )}
        </div>

        {/* Additional direction */}
        <div>
          <Label text="Ek Yönlendirme (opsiyonel)" />
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Ton, görsel yön, özel istekler, referans..."
            rows={3}
            style={{ width: '100%', padding: '13px 15px', borderRadius: 14, resize: 'none', outline: 'none', boxSizing: 'border-box', fontSize: 14, lineHeight: 1.55, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)', color: '#f8fafc' }}
          />
        </div>
      </div>

      {/* Submit */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 20px', paddingBottom: 'max(20px, env(safe-area-inset-bottom))', background: 'rgba(5,5,8,0.96)', backdropFilter: 'blur(24px)', borderTop: '0.5px solid rgba(255,255,255,0.07)' }}>

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
              {step === 'submitting' ? 'Görevler Oluşturuluyor...' : 'Brief Oluşturuluyor...'}
            </>
          ) : (
            <>⚡ {outputType && VISUAL_OUTPUT_TYPES.has(outputType) ? 'İçerik Üret' : 'AI Ekibine Gönder'}</>
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
