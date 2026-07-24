'use client';

import React, { useState } from 'react';
import type { T } from '@/app/mobile/_components/theme-context';
import { ResponsiveAppSheet } from '@/app/mobile/_components/responsive-app-sheet';

export type BrandChromeComboboxOption<V extends string = string> = {
  value: V;
  label: string;
  description?: string;
  badge?: string | number;
};

/**
 * Visioner combobox — chrome closed state + option sheet with label/description.
 * Avoids native OS picker which looks basic and hides option detail.
 */
export function BrandChromeCombobox<V extends string>({
  label,
  value,
  options,
  disabled,
  t,
  onChange,
  'aria-label': ariaLabel,
}: {
  label?: string;
  value: V;
  options: BrandChromeComboboxOption<V>[];
  disabled?: boolean;
  t: T;
  onChange: (value: V) => void;
  'aria-label'?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? options[0];
  const shellBg = t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
  const title = label || ariaLabel || 'Seçim';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <p style={{
          fontSize: 10,
          fontWeight: 700,
          color: t.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          margin: 0,
        }}
        >
          {label}
        </p>
      )}
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel ?? label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen(true)}
        style={{
          position: 'relative',
          width: '100%',
          borderRadius: 12,
          border: `1px solid ${t.separator}`,
          background: shellBg,
          opacity: disabled ? 0.6 : 1,
          minHeight: 48,
          padding: '10px 36px 10px 12px',
          cursor: disabled ? 'not-allowed' : 'pointer',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {selected?.badge != null && (
          <span style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 800,
            color: '#9DBECE',
            background: 'rgba(90,130,160,0.2)',
            border: '1px solid rgba(90,130,160,0.35)',
          }}
          >
            {selected.badge}
          </span>
        )}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 600,
            color: t.textPrimary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          >
            {selected?.label ?? '—'}
          </span>
          {selected?.description ? (
            <span style={{
              display: 'block',
              marginTop: 2,
              fontSize: 11,
              color: t.textMuted,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            >
              {selected.description}
            </span>
          ) : null}
        </span>
        <svg
          aria-hidden
          width="12"
          height="12"
          viewBox="0 0 12 12"
          style={{
            position: 'absolute',
            right: 14,
            top: '50%',
            transform: 'translateY(-50%)',
            opacity: 0.55,
          }}
        >
          <path
            d="M2.5 4.25 6 7.75l3.5-3.5"
            fill="none"
            stroke={t.textMuted}
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <ResponsiveAppSheet
          onClose={() => setOpen(false)}
          title={title}
          subtitle="Seçenek ve açıklama"
          ariaLabel={title}
          closeButton="x-right"
        >
          <div
            role="listbox"
            aria-label={title}
            style={{
              padding: '8px 16px calc(16px + env(safe-area-inset-bottom))',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {options.map((opt) => {
              const active = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  style={{
                    width: '100%',
                    minHeight: 52,
                    padding: '12px 14px',
                    borderRadius: 14,
                    border: `1px solid ${active ? 'rgba(138,171,189,0.45)' : t.separator}`,
                    background: active
                      ? (t.isDark ? 'rgba(138,171,189,0.14)' : 'rgba(90,160,214,0.1)')
                      : (t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                  }}
                >
                  {opt.badge != null && (
                    <span style={{
                      width: 26,
                      height: 26,
                      borderRadius: 8,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 800,
                      color: active ? '#9DBECE' : t.textMuted,
                      background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)',
                    }}
                    >
                      {opt.badge}
                    </span>
                  )}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      display: 'block',
                      fontSize: 14,
                      fontWeight: 700,
                      color: active ? '#9DBECE' : t.textPrimary,
                      letterSpacing: '-0.02em',
                    }}
                    >
                      {opt.label}
                    </span>
                    {opt.description ? (
                      <span style={{
                        display: 'block',
                        marginTop: 3,
                        fontSize: 12,
                        lineHeight: 1.4,
                        color: t.textMuted,
                      }}
                      >
                        {opt.description}
                      </span>
                    ) : null}
                  </span>
                  {active && (
                    <span style={{ color: '#9DBECE', fontWeight: 800, fontSize: 14 }} aria-hidden>✓</span>
                  )}
                </button>
              );
            })}
          </div>
        </ResponsiveAppSheet>
      )}
    </div>
  );
}
