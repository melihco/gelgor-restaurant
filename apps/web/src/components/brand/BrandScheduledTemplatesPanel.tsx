/**
 * Planlanmış şablonlar — Canva'dan indirilen story/reel medyası, zamanlanmış feed.
 *
 * Akış:
 *  1. Video/görsel yükle (Canva export)
 *  2. Ad + format + kategori
 *  3. Zamanlama (günler + saat penceresi)
 *  4. Kaydet → feed'de planlanan saatte görünür
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { T } from '@/app/mobile/_components/theme-context';
import { getTenantBffHeaders } from '@/lib/runtime-config';
import { SECTOR_TEMPLATE_PRESETS } from '@/lib/scheduled-template-feed';

interface ScheduledMediaItem {
  url: string;
  key?: string;
  type: 'image' | 'video';
  thumbnail_url?: string;
  duration_ms?: number;
  uploaded_at?: string;
}

interface ScheduledTemplate {
  id: string;
  workspace_id: string;
  slot_index: number;
  name: string;
  description?: string;
  format: 'story' | 'reel';
  media_items: ScheduledMediaItem[];
  schedule_type: 'daily' | 'specific_days';
  schedule_days: number[];
  schedule_time: string;
  schedule_end_time?: string;
  timezone: string;
  status: 'active' | 'paused' | 'archived';
  category?: string;
}

const DAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const CATEGORY_OPTIONS = [
  { value: 'morning_greeting', label: 'Günaydın / Sabah' },
  { value: 'happy_hour', label: 'Happy Hour' },
  { value: 'menu_special', label: 'Menü / Özel' },
  { value: 'event_promo', label: 'Etkinlik / Parti' },
  { value: 'closing_time', label: 'Kapanış' },
  { value: 'weekend_vibe', label: 'Hafta sonu' },
  { value: 'daily_special', label: 'Günün özel' },
  { value: 'custom', label: 'Özel' },
];

function firstFreeSlot(templates: ScheduledTemplate[]): number {
  const used = new Set(templates.map((t) => t.slot_index));
  for (let i = 1; i <= 10; i++) {
    if (!used.has(i)) return i;
  }
  return 10;
}

async function uploadMediaFiles(tenantId: string, files: File[]): Promise<ScheduledMediaItem[]> {
  const items: ScheduledMediaItem[] = [];
  for (const file of files) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('tenantId', tenantId);
    formData.append('type', file.type.startsWith('video/') ? 'video' : 'image');
    const resp = await fetch('/api/media/upload', { method: 'POST', body: formData });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({})) as { error?: string };
      throw new Error(err.error || 'Medya yüklenemedi');
    }
    const result = await resp.json() as { key: string; url?: string };
    items.push({
      url: result.url || `/api/media?key=${encodeURIComponent(result.key)}`,
      key: result.key,
      type: file.type.startsWith('video/') ? 'video' : 'image',
      uploaded_at: new Date().toISOString(),
    });
  }
  return items;
}

export function BrandScheduledTemplatesPanel({
  tenantId,
  t,
  sector = 'restaurant',
}: {
  tenantId: string;
  t: T;
  sector?: string;
}) {
  const [templates, setTemplates] = useState<ScheduledTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const border = `0.5px solid ${t.separator}`;
  const cardBg = t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    fontSize: 15,
    borderRadius: 12,
    border,
    background: t.isDark ? 'rgba(0,0,0,0.25)' : '#fff',
    color: t.textPrimary,
  };

  const loadTemplates = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(`/api/brand-context/${tenantId}/scheduled-templates`, {
        headers: getTenantBffHeaders(tenantId),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string; message?: string };
        throw new Error(body.error || body.message || res.statusText);
      }
      setTemplates(await res.json());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Liste yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { void loadTemplates(); }, [loadTemplates]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleCreate = async (payload: {
    slot_index: number;
    name: string;
    format: 'story' | 'reel';
    media_items: ScheduledMediaItem[];
    schedule_type: 'daily' | 'specific_days';
    schedule_days: number[];
    schedule_time: string;
    schedule_end_time?: string;
    category?: string;
  }) => {
    const res = await fetch(`/api/brand-context/${tenantId}/scheduled-templates`, {
      method: 'POST',
      headers: { ...getTenantBffHeaders(tenantId), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as {
        error?: string;
        detail?: string | { detail?: string };
        message?: string;
      };
      const detail =
        (typeof body.detail === 'string' ? body.detail : null)
        || (typeof body.detail === 'object' && body.detail && 'detail' in body.detail
          ? String((body.detail as { detail?: string }).detail)
          : null)
        || body.message
        || body.error
        || 'Kayıt başarısız';
      throw new Error(detail === 'crew_backend_unreachable' ? 'Sunucuya bağlanılamadı — Python servisini kontrol edin' : detail);
    }
    setShowCreateForm(false);
    await loadTemplates();
    showToast('Plan kaydedildi — feed\'de zamanı gelince görünür');
  };

  const handleUpdate = async (templateId: string, updates: Partial<ScheduledTemplate>) => {
    const res = await fetch(`/api/brand-context/${tenantId}/scheduled-templates/${templateId}`, {
      method: 'PATCH',
      headers: { ...getTenantBffHeaders(tenantId), 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Güncelleme başarısız');
    await loadTemplates();
    showToast('Güncellendi');
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm('Bu plan silinecek. Emin misiniz?')) return;
    const res = await fetch(`/api/brand-context/${tenantId}/scheduled-templates/${templateId}`, {
      method: 'DELETE',
      headers: getTenantBffHeaders(tenantId),
    });
    if (!res.ok) throw new Error('Silme başarısız');
    await loadTemplates();
    showToast('Silindi');
  };

  const sectorPresets = useMemo(
    () => SECTOR_TEMPLATE_PRESETS[sector] ?? SECTOR_TEMPLATE_PRESETS.restaurant ?? [],
    [sector],
  );

  if (loading) {
    return <p style={{ fontSize: 13, color: t.textMuted, padding: 16 }}>Yükleniyor…</p>;
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      {loadError && (
        <div style={{
          marginBottom: 14, padding: '12px 14px', borderRadius: 12,
          background: 'rgba(239,68,68,0.12)', border: '0.5px solid rgba(239,68,68,0.35)',
          fontSize: 13, color: '#fca5a5', lineHeight: 1.5,
        }}>
          {loadError}
        </div>
      )}

      {toast && (
        <div style={{
          marginBottom: 14, padding: '10px 14px', borderRadius: 12,
          background: `${t.success}22`, border: `0.5px solid ${t.success}55`,
          fontSize: 13, color: t.success, fontWeight: 600,
        }}>
          {toast}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 13, color: t.textMuted }}>
          {templates.length}/10 plan aktif
        </span>
        {templates.length < 10 && !showCreateForm && (
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            style={{
              padding: '10px 16px', borderRadius: 12, border: 'none',
              background: t.accent, color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            + Yeni plan
          </button>
        )}
      </div>

      {showCreateForm && (
        <CreatePlanForm
          t={t}
          tenantId={tenantId}
          slotIndex={firstFreeSlot(templates)}
          sectorPresets={sectorPresets}
          onSubmit={handleCreate}
          onCancel={() => setShowCreateForm(false)}
          inputStyle={inputStyle}
          border={border}
          cardBg={cardBg}
        />
      )}

      {templates.length === 0 && !showCreateForm && (
        <div style={{
          padding: 24, borderRadius: 14, border: `1px dashed ${t.separator}`,
          textAlign: 'center',
        }}>
          <p style={{ fontSize: 14, color: t.textPrimary, fontWeight: 600, marginBottom: 6 }}>
            Henüz plan yok
          </p>
          <p style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.5, marginBottom: 16 }}>
            Önce video veya görsel yükleyin, sonra hangi gün/saatte feed&apos;de çıkacağını ayarlayın.
          </p>
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            style={{
              padding: '12px 20px', borderRadius: 12, border: 'none',
              background: t.accent, color: '#fff', fontSize: 14, fontWeight: 700,
            }}
          >
            İlk planı oluştur
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: showCreateForm ? 16 : 0 }}>
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            t={t}
            border={border}
            cardBg={cardBg}
            onDelete={() => handleDelete(template.id)}
            onToggleStatus={() => handleUpdate(template.id, {
              status: template.status === 'active' ? 'paused' : 'active',
            })}
            onMediaUpload={async (files) => {
              const uploaded = await uploadMediaFiles(tenantId, files);
              await handleUpdate(template.id, {
                media_items: [...template.media_items, ...uploaded],
              } as Partial<ScheduledTemplate>);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function CreatePlanForm({
  t,
  tenantId,
  slotIndex,
  sectorPresets,
  onSubmit,
  onCancel,
  inputStyle,
  border,
  cardBg,
}: {
  t: T;
  tenantId: string;
  slotIndex: number;
  sectorPresets: Array<{
    name: string;
    category: string;
    schedule_type: 'daily' | 'specific_days';
    schedule_days: number[];
    schedule_time: string;
    schedule_end_time?: string;
  }>;
  onSubmit: (payload: {
    slot_index: number;
    name: string;
    format: 'story' | 'reel';
    media_items: ScheduledMediaItem[];
    schedule_type: 'daily' | 'specific_days';
    schedule_days: number[];
    schedule_time: string;
    schedule_end_time?: string;
    category?: string;
  }) => Promise<void>;
  onCancel: () => void;
  inputStyle: React.CSSProperties;
  border: string;
  cardBg: string;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState('');
  const [format, setFormat] = useState<'story' | 'reel'>('story');
  const [category, setCategory] = useState('');
  const [scheduleType, setScheduleType] = useState<'daily' | 'specific_days'>('daily');
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [time, setTime] = useState('10:00');
  const [endTime, setEndTime] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyPreset = (preset: typeof sectorPresets[0]) => {
    setName(preset.name);
    setCategory(preset.category);
    setScheduleType(preset.schedule_type);
    setDays(preset.schedule_days);
    setTime(preset.schedule_time);
    setEndTime(preset.schedule_end_time ?? '');
  };

  const onFilesSelected = (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    setPendingFiles((prev) => [...prev, ...list]);
    list.forEach((f) => {
      setPreviewUrls((prev) => [...prev, URL.createObjectURL(f)]);
    });
  };

  const toggleDay = (d: number) => {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  };

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Plan adı gerekli');
      return;
    }
    if (pendingFiles.length === 0) {
      setError('En az bir video veya görsel yükleyin');
      setStep(1);
      return;
    }
    setUploading(true);
    try {
      const media_items = await uploadMediaFiles(tenantId, pendingFiles);
      await onSubmit({
        slot_index: slotIndex,
        name: name.trim(),
        format,
        media_items,
        schedule_type: scheduleType,
        schedule_days: days,
        schedule_time: time,
        schedule_end_time: endTime || undefined,
        category: category || undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kayıt başarısız');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ borderRadius: 14, border, background: cardBg, overflow: 'hidden' }}>
      {/* Step indicator */}
      <div style={{ display: 'flex', borderBottom: border }}>
        {(['Medya yükle', 'Plan & saat'] as const).map((label, i) => {
          const n = (i + 1) as 1 | 2;
          const active = step === n;
          return (
            <button
              key={label}
              type="button"
              onClick={() => setStep(n)}
              style={{
                flex: 1, padding: '12px 8px', border: 'none', cursor: 'pointer',
                background: active ? `${t.accent}22` : 'transparent',
                color: active ? t.accent : t.textMuted,
                fontSize: 13, fontWeight: active ? 700 : 500,
                borderBottom: active ? `2px solid ${t.accent}` : '2px solid transparent',
              }}
            >
              {i + 1}. {label}
            </button>
          );
        })}
      </div>

      <div style={{ padding: 16 }}>
        {step === 1 && (
          <>
            <p style={{ fontSize: 13, color: t.textMuted, marginBottom: 12, lineHeight: 1.5 }}>
              Canva&apos;dan indirdiğiniz MP4 veya PNG/JPG dosyalarını seçin. Bu içerik olduğu gibi story/reel olarak paylaşılır.
            </p>

            <label
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                minHeight: 140, borderRadius: 14, border: `2px dashed ${t.accent}66`,
                background: `${t.accent}08`, cursor: 'pointer', marginBottom: 12,
              }}
            >
              <span style={{ fontSize: 32, marginBottom: 8 }}>📁</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary }}>
                Video / görsel seç
              </span>
              <span style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>
                MP4, MOV, PNG, JPG — birden fazla dosya
              </span>
              <input
                type="file"
                multiple
                accept="image/*,video/*,.mp4,.mov"
                style={{ display: 'none' }}
                onChange={(e) => onFilesSelected(e.target.files)}
              />
            </label>

            {previewUrls.length > 0 && (
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 12 }}>
                {previewUrls.map((url, i) => (
                  <div key={url} style={{
                    flexShrink: 0, width: 72, height: 96, borderRadius: 10,
                    overflow: 'hidden', background: '#111',
                  }}>
                    {pendingFiles[i]?.type.startsWith('video/') ? (
                      <video src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                    ) : (
                      <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                  </div>
                ))}
              </div>
            )}

            {sectorPresets.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <p style={{ fontSize: 12, color: t.textMuted, marginBottom: 8 }}>Hızlı şablon (sadece zamanlama doldurur):</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {sectorPresets.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => applyPreset(p)}
                      style={{
                        padding: '8px 12px', borderRadius: 20, border,
                        background: 'transparent', color: t.textPrimary, fontSize: 12,
                      }}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={pendingFiles.length === 0}
              onClick={() => setStep(2)}
              style={{
                width: '100%', marginTop: 16, padding: '14px', borderRadius: 12, border: 'none',
                background: pendingFiles.length ? t.accent : t.separator,
                color: '#fff', fontSize: 15, fontWeight: 700,
                opacity: pendingFiles.length ? 1 : 0.5,
              }}
            >
              Devam — plan & saat ({pendingFiles.length} dosya)
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <input
              style={{ ...inputStyle, marginBottom: 10 }}
              placeholder="Plan adı (ör: Günaydın Story)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as 'story' | 'reel')}
                style={{ ...inputStyle, flex: 1 }}
              >
                <option value="story">Story</option>
                <option value="reel">Reel</option>
              </select>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              >
                <option value="">Kategori</option>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: t.textMuted, display: 'block', marginBottom: 6 }}>
                Ne zaman feed&apos;de görünsün?
              </label>
              <select
                value={scheduleType}
                onChange={(e) => setScheduleType(e.target.value as 'daily' | 'specific_days')}
                style={inputStyle}
              >
                <option value="daily">Her gün</option>
                <option value="specific_days">Belirli günler</option>
              </select>
            </div>

            {scheduleType === 'specific_days' && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {DAY_LABELS.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleDay(i)}
                    style={{
                      padding: '8px 12px', borderRadius: 10, border,
                      background: days.includes(i) ? t.accent : 'transparent',
                      color: days.includes(i) ? '#fff' : t.textMuted,
                      fontSize: 13, fontWeight: 600,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: t.textMuted }}>Başlangıç</label>
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: t.textMuted }}>Bitiş (opsiyonel)</label>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={inputStyle} />
              </div>
            </div>

            {error && (
              <p style={{ fontSize: 13, color: '#f87171', marginBottom: 10 }}>{error}</p>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                style={{
                  flex: 1, padding: '14px', borderRadius: 12, border,
                  background: 'transparent', color: t.textMuted, fontSize: 14,
                }}
              >
                Geri
              </button>
              <button
                type="button"
                disabled={uploading}
                onClick={() => void handleSave()}
                style={{
                  flex: 2, padding: '14px', borderRadius: 12, border: 'none',
                  background: t.success, color: '#fff', fontSize: 15, fontWeight: 800,
                  opacity: uploading ? 0.7 : 1,
                }}
              >
                {uploading ? 'Kaydediliyor…' : 'Kaydet ve planla'}
              </button>
            </div>
          </>
        )}

        <button
          type="button"
          onClick={onCancel}
          style={{
            width: '100%', marginTop: 12, padding: 10, border: 'none',
            background: 'transparent', color: t.textMuted, fontSize: 13,
          }}
        >
          İptal
        </button>
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  t,
  border,
  cardBg,
  onDelete,
  onToggleStatus,
  onMediaUpload,
}: {
  template: ScheduledTemplate;
  t: T;
  border: string;
  cardBg: string;
  onDelete: () => Promise<void>;
  onToggleStatus: () => Promise<void>;
  onMediaUpload: (files: File[]) => Promise<void>;
}) {
  const scheduleLabel = template.schedule_type === 'daily'
    ? `Her gün ${template.schedule_time}`
    : `${template.schedule_days.map((d) => DAY_LABELS[d]).join(', ')} · ${template.schedule_time}`;
  const endLabel = template.schedule_end_time ? ` → ${template.schedule_end_time}` : '';
  const hasMedia = template.media_items.length > 0;

  return (
    <div style={{
      borderRadius: 14, border,
      background: template.status === 'active' ? `${t.success}08` : cardBg,
      padding: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: template.status === 'active' ? t.success : t.textMuted,
            }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary }}>{template.name}</span>
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 6,
              background: t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
              color: t.textMuted, textTransform: 'uppercase',
            }}>
              {template.format}
            </span>
          </div>
          <p style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>
            {scheduleLabel}{endLabel}
          </p>
          {!hasMedia && (
            <p style={{ fontSize: 12, color: '#fbbf24', marginTop: 4 }}>
              ⚠ Medya yok — feed&apos;de görünmez
            </p>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 12 }}>
        {template.media_items.map((media, i) => (
          <div key={i} style={{
            flexShrink: 0, width: 64, height: 86, borderRadius: 10, overflow: 'hidden', background: '#111',
          }}>
            {media.type === 'video' ? (
              <video src={media.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
            ) : (
              <img src={media.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
          </div>
        ))}
        <label style={{
          flexShrink: 0, width: 64, height: 86, borderRadius: 10,
          border: `1px dashed ${t.separator}`, display: 'flex',
          alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <span style={{ fontSize: 22, color: t.textMuted }}>+</span>
          <input
            type="file"
            multiple
            accept="image/*,video/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files?.length) void onMediaUpload(Array.from(e.target.files));
            }}
          />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <ActionBtn label={template.status === 'active' ? 'Duraklat' : 'Aktif et'} onClick={() => void onToggleStatus()} t={t} />
        <ActionBtn label="Sil" onClick={() => void onDelete()} t={t} danger />
      </div>
    </div>
  );
}

function ActionBtn({
  label,
  onClick,
  t,
  danger,
}: {
  label: string;
  onClick: () => void;
  t: T;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '8px 14px', borderRadius: 10, border: `0.5px solid ${t.separator}`,
        background: danger ? 'rgba(239,68,68,0.12)' : 'transparent',
        color: danger ? '#f87171' : t.textPrimary,
        fontSize: 13, fontWeight: 600,
      }}
    >
      {label}
    </button>
  );
}

export default BrandScheduledTemplatesPanel;
