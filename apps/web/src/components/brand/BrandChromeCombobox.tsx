'use client';

import React from 'react';
import type { T } from '@/app/mobile/_components/theme-context';

export type BrandChromeComboboxOption<V extends string = string> = {
  value: V;
  label: string;
  description?: string;
  badge?: string | number;
};

/**
 * Compact chrome-styled select for brand settings (mobile WebView first).
 * Custom closed state + native picker for touch platforms.
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
  const selected = options.find((o) => o.value === value) ?? options[0];
  const shellBg = t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';

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
      <div
        style={{
          position: 'relative',
          borderRadius: 12,
          border: `1px solid ${t.separator}`,
          background: shellBg,
          opacity: disabled ? 0.6 : 1,
          minHeight: 48,
        }}
      >
        <div
          aria-hidden
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 36px 10px 12px',
            pointerEvents: 'none',
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
          </span>
        </div>
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
            pointerEvents: 'none',
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
        <select
          aria-label={ariaLabel ?? label}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value as V)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: 16,
            border: 'none',
            background: 'transparent',
            colorScheme: t.isDark ? 'dark' : 'light',
          }}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.badge != null
                ? `${opt.badge} · ${opt.label}${opt.description ? ` — ${opt.description}` : ''}`
                : `${opt.label}${opt.description ? ` — ${opt.description}` : ''}`}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
