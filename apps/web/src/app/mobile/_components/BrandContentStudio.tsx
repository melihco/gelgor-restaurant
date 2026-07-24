'use client';

/**
 * İçerik detay ekranları — editorial studio chrome (not SCard form stacks).
 */
import React, { useEffect, useState } from 'react';
import type { T } from './theme-context';
import type { BrandTonePreset } from '@/lib/sync-company-profile-from-python';
import { BrandToneSigil } from './BrandToneSigil';
import { SA_CHROME } from './sa-chrome';

const TONE_OPTIONS: { value: BrandTonePreset; label: string }[] = [
  { value: 'professional', label: 'Profesyonel' },
  { value: 'friendly', label: 'Samimi' },
  { value: 'energetic', label: 'Enerjik' },
  { value: 'luxury', label: 'Lüks' },
  { value: 'casual', label: 'Rahat' },
];

export function ContentStudioShell({
  t,
  brandPrimary,
  children,
}: {
  t: T;
  brandPrimary?: string;
  children: React.ReactNode;
}) {
  const primary = brandPrimary || SA_CHROME.steel300;
  return (
    <div
      className="content-studio"
      style={{
        ['--cs-brand' as string]: primary,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}

export function ContentStudioPanel({
  t,
  eyebrow,
  children,
}: {
  t: T;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="content-studio-panel sa-chrome-card"
      style={{
        background: t.isDark
          ? 'linear-gradient(165deg, rgba(14,18,24,0.98) 0%, rgba(7,9,14,1) 100%)'
          : 'linear-gradient(165deg, rgba(255,255,255,0.98) 0%, rgba(244,247,250,0.98) 100%)',
      }}
    >
      {eyebrow ? (
        <div className="sa-chrome-eyebrow content-studio-panel__eyebrow">{eyebrow}</div>
      ) : null}
      {children}
    </section>
  );
}

export function ContentStudioProseField({
  t,
  label,
  value,
  hint,
  onSave,
  rows = 6,
}: {
  t: T;
  label: string;
  value: string;
  hint?: string;
  onSave: (v: string) => void;
  rows?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  if (editing) {
    return (
      <div className="content-studio-prose content-studio-prose--edit">
        <div className="sa-chrome-eyebrow" style={{ marginBottom: 8 }}>{label}</div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={rows}
          autoFocus
          style={{
            width: '100%',
            boxSizing: 'border-box',
            minHeight: rows * 24,
            padding: '12px 14px',
            borderRadius: 14,
            border: 'none',
            outline: 'none',
            resize: 'vertical',
            fontSize: 16,
            lineHeight: 1.5,
            color: t.textPrimary,
            background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)',
          }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            type="button"
            onClick={() => { onSave(draft); setEditing(false); }}
            style={{
              flex: 1, minHeight: 44, borderRadius: 12, border: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: 700, color: '#fff',
              background: `linear-gradient(135deg, ${SA_CHROME.steel400}, ${SA_CHROME.steel600})`,
            }}
          >
            Kaydet
          </button>
          <button
            type="button"
            onClick={() => { setDraft(value); setEditing(false); }}
            style={{
              minHeight: 44, padding: '0 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: 600, color: t.textSecondary,
              background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
            }}
          >
            İptal
          </button>
        </div>
      </div>
    );
  }

  const empty = !value.trim();
  return (
    <button
      type="button"
      className="content-studio-prose"
      onClick={() => setEditing(true)}
      style={{
        borderColor: t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
        background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.03)',
        color: t.textPrimary,
      }}
    >
      <span className="content-studio-prose__head">
        <span className="sa-chrome-eyebrow" style={{ marginBottom: 0 }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: t.textMuted }}>Düzenle</span>
      </span>
      <span
        className="content-studio-prose__body"
        style={{ color: empty ? t.textMuted : t.textSecondary }}
      >
        {empty ? (hint || 'Dokunarak yaz…') : value}
      </span>
    </button>
  );
}

export function ContentStudioTonePicker({
  t,
  selected,
  onSelect,
  rawHint,
}: {
  t: T;
  selected: BrandTonePreset | string;
  onSelect: (tone: BrandTonePreset) => void;
  rawHint?: string | null;
}) {
  return (
    <div className="content-studio-tones">
      <div className="content-studio-tones__grid">
        {TONE_OPTIONS.map((opt) => {
          const active = selected === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              className="content-studio-tone"
              data-active={active ? '1' : '0'}
              onClick={() => onSelect(opt.value)}
              style={{
                borderColor: active
                  ? 'rgba(200,168,106,0.45)'
                  : (t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)'),
                background: active
                  ? (t.isDark
                    ? 'linear-gradient(145deg, rgba(200,168,106,0.16), rgba(255,255,255,0.03))'
                    : 'linear-gradient(145deg, rgba(200,168,106,0.14), #fff)')
                  : (t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(15,23,42,0.02)'),
              }}
            >
              <BrandToneSigil t={t} tone={opt.value} label={opt.label} />
            </button>
          );
        })}
      </div>
      {rawHint ? (
        <p className="content-studio-tones__hint" style={{ color: t.textMuted }}>
          Kayıtlı ifade · <span style={{ color: t.textSecondary }}>{rawHint}</span>
        </p>
      ) : null}
    </div>
  );
}

export function ContentStudioAction({
  t,
  label,
  pendingLabel,
  pending,
  onClick,
}: {
  t: T;
  label: string;
  pendingLabel: string;
  pending?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="content-studio-action"
      disabled={pending}
      onClick={onClick}
      style={{
        borderColor: t.isDark ? 'rgba(200,168,106,0.35)' : 'rgba(200,168,106,0.4)',
        background: t.isDark
          ? 'linear-gradient(135deg, rgba(200,168,106,0.16), rgba(255,255,255,0.03))'
          : 'linear-gradient(135deg, rgba(200,168,106,0.14), #fff)',
        color: t.isDark ? SA_CHROME.warmGold : SA_CHROME.steel700,
        cursor: pending ? 'wait' : 'pointer',
        opacity: pending ? 0.75 : 1,
      }}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export function ContentStudioEntityBoard({
  t,
  confirmed,
  suggestions,
  draft,
  onDraftChange,
  onAdd,
  onRemove,
  emptyHint,
}: {
  t: T;
  confirmed: string[];
  suggestions: string[];
  draft: string;
  onDraftChange: (v: string) => void;
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  emptyHint: string;
}) {
  return (
    <div className="content-studio-entities">
      {confirmed.length > 0 && (
        <div className="content-studio-entities__chips">
          {confirmed.map((name) => (
            <span
              key={name}
              className="content-studio-entity"
              data-kind="on"
              style={{
                borderColor: 'rgba(138,171,189,0.4)',
                background: 'rgba(138,171,189,0.12)',
                color: SA_CHROME.steel200,
              }}
            >
              {name}
              <button
                type="button"
                aria-label={`${name} kaldır`}
                onClick={() => onRemove(name)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'inherit', fontSize: 16, lineHeight: 1, padding: 0, marginLeft: 4,
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <div>
          <div className="sa-chrome-eyebrow" style={{ marginBottom: 8 }}>Öneriler</div>
          <div className="content-studio-entities__chips">
            {suggestions.map((name) => (
              <button
                key={name}
                type="button"
                className="content-studio-entity"
                data-kind="suggest"
                onClick={() => onAdd(name)}
                style={{
                  borderColor: t.isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.12)',
                  background: 'transparent',
                  color: t.textSecondary,
                  cursor: 'pointer',
                }}
              >
                + {name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="content-studio-entities__add">
        <input
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) {
              onAdd(draft.trim());
              onDraftChange('');
            }
          }}
          placeholder="Ekle… (Enter)"
          enterKeyHint="done"
          style={{
            flex: 1,
            minHeight: 44,
            padding: '0 12px',
            borderRadius: 12,
            border: 'none',
            outline: 'none',
            fontSize: 16,
            color: t.textPrimary,
            background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.04)',
          }}
        />
        <button
          type="button"
          onClick={() => {
            if (draft.trim()) {
              onAdd(draft.trim());
              onDraftChange('');
            }
          }}
          style={{
            minWidth: 44,
            minHeight: 44,
            borderRadius: 12,
            border: 'none',
            cursor: 'pointer',
            fontSize: 18,
            fontWeight: 700,
            color: '#fff',
            background: SA_CHROME.steel500,
          }}
        >
          +
        </button>
      </div>

      {confirmed.length === 0 && suggestions.length === 0 && (
        <p style={{ margin: 0, fontSize: 12, color: t.textMuted, lineHeight: 1.4 }}>{emptyHint}</p>
      )}
    </div>
  );
}
