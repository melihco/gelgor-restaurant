'use client';

/**
 * Premium Editorial Campaign — slot form + result view.
 * Ajans seviyesinde editorial kampanya görselleri.
 */

import React, { useMemo, useState } from 'react';
import type { T } from '@/app/mobile/_components/theme-context';
import {
  COPY_LIMITS,
  CREATIVE_VARIATION_KEYS,
  EDITORIAL_LAYOUT_FAMILIES,
  type CreativeVariationKey,
  type EditorialLayoutFamily,
} from '@/lib/premium-editorial/client';

type OutputFormat = 'post' | 'story' | 'square';

interface GenerationResult {
  status: string;
  backgroundImage: string | null;
  finalImage: string | null;
  thumbnail: string | null;
  creativeDirection?: { campaignConcept?: string; creativeVariationKey?: string };
  layoutSpecification?: { family?: string };
  qualityAssessment?: { overallScore?: number; isApproved?: boolean };
  warnings?: string[];
  generationId?: string;
}

export function BrandPremiumEditorialPanel({
  tenantId,
  t,
  galleryUrls = [],
  logoUrl,
}: {
  tenantId: string;
  t: T;
  galleryUrls?: string[];
  logoUrl?: string | null;
}) {
  const [contentTopic, setContentTopic] = useState('');
  const [campaignGoal, setCampaignGoal] = useState('');
  const [headline, setHeadline] = useState('');
  const [subheadline, setSubheadline] = useState('');
  const [cta, setCta] = useState('');
  const [outputType, setOutputType] = useState<OutputFormat>('post');
  const [selectedGallery, setSelectedGallery] = useState<string>('');
  const [layoutFamily, setLayoutFamily] = useState<EditorialLayoutFamily | ''>('');
  const [creativeVariation, setCreativeVariation] = useState<CreativeVariationKey | ''>('');
  const [variations, setVariations] = useState(1);
  const [addTextOverlay, setAddTextOverlay] = useState(true);
  const [addLogoOverlay, setAddLogoOverlay] = useState(true);
  const [forceNew, setForceNew] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);

  const aspectRatio = useMemo(() => {
    if (outputType === 'story') return '9:16';
    if (outputType === 'square') return '1:1';
    return '4:5';
  }, [outputType]);

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    fontSize: 16,
    padding: '12px 14px',
    borderRadius: 12,
    border: `0.5px solid ${t.separator}`,
    background: 'transparent',
    color: t.textPrimary,
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: t.labelColor,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    marginBottom: 6,
    marginTop: 14,
  };

  const counter = (len: number, ideal: number) => (
    <span style={{ fontSize: 11, color: len > ideal ? '#D97706' : t.textTertiary }}>
      {len}/{ideal}
    </span>
  );

  const submit = async (mode: 'new' | 'variation') => {
    if (!tenantId || !contentTopic.trim()) {
      setError('İçerik konusu gerekli');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/premium-editorial-campaign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({
          brandId: tenantId,
          workspaceId: tenantId,
          contentTopic: contentTopic.trim(),
          campaignGoal: campaignGoal.trim() || null,
          headline: headline.trim() || contentTopic.trim(),
          subheadline: subheadline.trim(),
          cta: cta.trim(),
          outputType,
          aspectRatio,
          selectedGalleryAssetUrl: selectedGallery || galleryUrls[0] || null,
          logoAssetUrl: logoUrl || null,
          preferredLayoutFamily: layoutFamily || null,
          preferredCreativeVariation: creativeVariation || null,
          numberOfVariations: variations,
          addTextOverlay,
          addLogoOverlay,
          forceNewComposition: mode === 'variation' ? true : forceNew,
        }),
      });
      const json = await res.json() as { error?: string; detail?: string; data?: GenerationResult };
      if (!res.ok) {
        setError(json.detail || json.error || 'Üretim başarısız');
        return;
      }
      setResult(json.data ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Üretim hatası');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ fontSize: 12, color: t.textTertiary, lineHeight: 1.6, marginBottom: 12 }}>
        Ajans seviyesinde editorial kampanya görselleri üretir. Marka DNA&apos;sı, yaratıcı yönlendirme,
        kompozisyon planı ve görsel kalite kontrolü kullanır.
      </div>

      <div style={labelStyle}>İçerik konusu *</div>
      <input
        value={contentTopic}
        onChange={(e) => setContentTopic(e.target.value)}
        placeholder="Örn. Yaz akşamı terrace ritüeli"
        style={fieldStyle}
        enterKeyHint="next"
      />

      <div style={labelStyle}>Kampanya hedefi</div>
      <input
        value={campaignGoal}
        onChange={(e) => setCampaignGoal(e.target.value)}
        placeholder="Örn. Premium brand awareness"
        style={fieldStyle}
      />

      <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between' }}>
        <span>Headline</span>
        {counter(headline.length, COPY_LIMITS.headlineIdeal)}
      </div>
      <input
        value={headline}
        onChange={(e) => setHeadline(e.target.value)}
        placeholder="İdeal ≤ 55 karakter"
        style={fieldStyle}
      />

      <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between' }}>
        <span>Subheadline</span>
        {counter(subheadline.length, COPY_LIMITS.subheadlineIdeal)}
      </div>
      <input
        value={subheadline}
        onChange={(e) => setSubheadline(e.target.value)}
        placeholder="İdeal ≤ 110 karakter"
        style={fieldStyle}
      />

      <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between' }}>
        <span>CTA</span>
        {counter(cta.length, COPY_LIMITS.ctaIdeal)}
      </div>
      <input
        value={cta}
        onChange={(e) => setCta(e.target.value)}
        placeholder="İdeal ≤ 24 karakter"
        style={fieldStyle}
      />

      <div style={labelStyle}>Çıktı formatı</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {([
          ['post', 'Post 4:5'],
          ['story', 'Story 9:16'],
          ['square', 'Kare 1:1'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setOutputType(id)}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: 12,
              border: `0.5px solid ${outputType === id ? t.accent : t.separator}`,
              background: outputType === id ? `${t.accent}22` : 'transparent',
              color: t.textPrimary,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {galleryUrls.length > 0 && (
        <>
          <div style={labelStyle}>Galeri referansı</div>
          <select
            value={selectedGallery}
            onChange={(e) => setSelectedGallery(e.target.value)}
            style={fieldStyle}
          >
            <option value="">Otomatik / ilk galeri</option>
            {galleryUrls.slice(0, 12).map((u) => (
              <option key={u} value={u}>{u.split('/').pop()?.slice(0, 40) ?? u}</option>
            ))}
          </select>
        </>
      )}

      <div style={labelStyle}>Layout tercihi</div>
      <select
        value={layoutFamily}
        onChange={(e) => setLayoutFamily(e.target.value as EditorialLayoutFamily | '')}
        style={fieldStyle}
      >
        <option value="">Otomatik</option>
        {EDITORIAL_LAYOUT_FAMILIES.map((f) => (
          <option key={f} value={f}>{f}</option>
        ))}
      </select>

      <div style={labelStyle}>Yaratıcı yön</div>
      <select
        value={creativeVariation}
        onChange={(e) => setCreativeVariation(e.target.value as CreativeVariationKey | '')}
        style={fieldStyle}
      >
        <option value="">Otomatik (tekrar etmeyen)</option>
        {CREATIVE_VARIATION_KEYS.map((k) => (
          <option key={k} value={k}>{k}</option>
        ))}
      </select>

      <div style={labelStyle}>Varyasyon sayısı (1–4)</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setVariations(n)}
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              border: `0.5px solid ${variations === n ? t.accent : t.separator}`,
              background: variations === n ? `${t.accent}22` : 'transparent',
              color: t.textPrimary,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {n}
          </button>
        ))}
      </div>

      {[
        { on: addTextOverlay, set: setAddTextOverlay, label: 'Metin overlay' },
        { on: addLogoOverlay, set: setAddLogoOverlay, label: 'Logo ekle' },
        { on: forceNew, set: setForceNew, label: 'Yeni kompozisyon zorla' },
      ].map((row) => (
        <div
          key={row.label}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 12,
            minHeight: 44,
          }}
        >
          <span style={{ fontSize: 13, color: t.textPrimary }}>{row.label}</span>
          <button
            type="button"
            aria-pressed={row.on}
            onClick={() => row.set(!row.on)}
            style={{
              width: 44,
              height: 26,
              borderRadius: 13,
              border: 'none',
              background: row.on ? t.accent : t.separator,
              position: 'relative',
              cursor: 'pointer',
            }}
          >
            <span style={{
              position: 'absolute',
              top: 3,
              left: row.on ? 21 : 3,
              width: 20,
              height: 20,
              borderRadius: 10,
              background: '#fff',
            }}
            />
          </button>
        </div>
      ))}

      <button
        type="button"
        disabled={busy || !contentTopic.trim()}
        onClick={() => void submit('new')}
        style={{
          width: '100%',
          minHeight: 48,
          marginTop: 18,
          borderRadius: 14,
          border: 'none',
          background: t.accent,
          color: '#fff',
          fontWeight: 700,
          fontSize: 15,
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? 'Üretiliyor…' : 'Premium Editorial üret'}
      </button>

      {error && (
        <div style={{ marginTop: 12, fontSize: 13, color: '#DC2626' }}>{error}</div>
      )}

      {result && (
        <div style={{ marginTop: 20 }}>
          <div style={labelStyle}>Sonuç</div>
          {result.finalImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={result.finalImage}
              alt="Premium editorial final"
              style={{ width: '100%', borderRadius: 16, display: 'block' }}
            />
          )}
          {result.backgroundImage && result.backgroundImage !== result.finalImage && (
            <>
              <div style={{ ...labelStyle, marginTop: 12 }}>Arka plan (metinsiz)</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.backgroundImage}
                alt="Background only"
                style={{ width: '100%', borderRadius: 16, opacity: 0.95 }}
              />
            </>
          )}
          <div style={{ fontSize: 12, color: t.textTertiary, marginTop: 10, lineHeight: 1.55 }}>
            <div>Konsept: {result.creativeDirection?.campaignConcept ?? '—'}</div>
            <div>Layout: {result.layoutSpecification?.family ?? '—'}</div>
            <div>
              QA: {result.qualityAssessment?.overallScore ?? '—'}
              {result.qualityAssessment?.isApproved ? ' · onay' : ' · eşik altı'}
            </div>
            {(result.warnings ?? []).slice(0, 3).map((w) => (
              <div key={w}>⚠ {w}</div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit('new')}
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 12,
                border: `0.5px solid ${t.separator}`,
                background: 'transparent',
                color: t.textPrimary,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Yeniden üret
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit('variation')}
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 12,
                border: `0.5px solid ${t.separator}`,
                background: 'transparent',
                color: t.textPrimary,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Yeni varyasyon
            </button>
            {result.finalImage && (
              <a
                href={result.finalImage}
                download
                target="_blank"
                rel="noreferrer"
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 12,
                  border: `0.5px solid ${t.accent}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: t.accent,
                  fontWeight: 600,
                  textDecoration: 'none',
                  fontSize: 13,
                }}
              >
                İndir
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
