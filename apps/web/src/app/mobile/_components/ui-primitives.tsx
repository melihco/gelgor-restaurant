'use client';
/** Premium UI primitive components — shared across all mobile screens */

import React from 'react';
import type { T } from './theme-context';
import { IcoClose } from './Icons';
import { nativeBridge } from '../_lib/native-bridge';
import { MobileBrandNavbar } from './MobileBrandNavbar';

// ─── Circular Progress Ring (SVG) ─────────────────────────────────────
export function CircleProgress({
  value,            // 0–100
  size = 80,
  strokeWidth = 6,
  color = '#9DBECE',
  trackColor,
  label,
  sublabel,
  isDark = true,
}: {
  value: number; size?: number; strokeWidth?: number;
  color?: string; trackColor?: string; label?: string; sublabel?: string; isDark?: boolean;
}) {
  const r     = (size - strokeWidth) / 2;
  const circ  = 2 * Math.PI * r;
  const dash  = (value / 100) * circ;

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={trackColor ?? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')}
          strokeWidth={strokeWidth}
        />
        {/* Progress */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${color}60)` }}
        />
      </svg>
      {/* Center text */}
      {(label || sublabel) && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          {label && <div style={{ fontSize: size * 0.22, fontWeight: 800, color: isDark ? '#f8fafc' : '#0f0f12', lineHeight: 1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{label}</div>}
          {sublabel && <div style={{ fontSize: size * 0.12, color: isDark ? 'rgba(148,163,184,0.5)' : '#8e8e93', marginTop: 2, lineHeight: 1, textAlign: 'center' }}>{sublabel}</div>}
        </div>
      )}
    </div>
  );
}

// ─── Agent Avatar ──────────────────────────────────────────────────────
const AGENT_COLORS: Record<string, string> = {
  '#9DBECE': '#9DBECE', '#f472b6': '#f472b6', '#60a5fa': '#60a5fa',
  '#34d399': '#34d399', '#f59e0b': '#f59e0b', '#818cf8': '#818cf8',
};

export function AgentAvatar({
  name, color, size = 34, showGlow = false,
}: { name: string; color: string; size?: number; showGlow?: boolean }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `linear-gradient(135deg, ${color}30, ${color}18)`,
      border: `1.5px solid ${color}40`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 700, color,
      boxShadow: showGlow ? `0 0 12px ${color}40` : 'none',
    }}>
      {initials}
    </div>
  );
}

// ─── Status Dot ────────────────────────────────────────────────────────
export function StatusDot({ color, pulse = false, size = 8 }: { color: string; pulse?: boolean; size?: number }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%',
      background: color, flexShrink: 0,
      boxShadow: `0 0 ${size}px ${color}80`,
      animation: pulse ? 'liveGlow 2s ease-in-out infinite' : 'none',
    }} />
  );
}

// ─── Section Header ────────────────────────────────────────────────────
export function SectionHeader({
  t, label, badge, action, onAction,
}: { t: T; label: string; badge?: number | string; action?: string; onAction?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: t.labelColor, letterSpacing: '0.12em', textTransform: 'uppercase' }} className="sa-chrome-eyebrow">{label}</span>
        {badge !== undefined && (
          <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 20, background: t.warningDim, color: t.warning, fontWeight: 700 }}>{badge}</span>
        )}
      </div>
      {action && onAction && (
        <button onClick={onAction} style={{ fontSize: 12, color: t.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          {action} →
        </button>
      )}
    </div>
  );
}

// ─── Theme toggle (header action) ──────────────────────────────────────
// Circular chrome button mirroring the back button. Sun ↔ moon icons
// cross-fade with a rotate+scale morph — Apple-style restrained motion.
export function ThemeToggleButton({ t, onToggle }: { t: T; onToggle: () => void }) {
  const iconBase: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 420ms cubic-bezier(0.22,1,0.36,1), opacity 260ms ease',
  };
  return (
    <button
      type="button"
      onClick={() => {
        nativeBridge.haptic('selection');
        onToggle();
      }}
      aria-label={t.isDark ? 'Açık temaya geç' : 'Koyu temaya geç'}
      style={{
        ...t.backBtn,
        width: 44,
        height: 44,
        borderRadius: '50%',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      {/* Sun — shown in dark mode (tap → light) */}
      <span
        aria-hidden
        style={{
          ...iconBase,
          opacity: t.isDark ? 1 : 0,
          transform: t.isDark ? 'rotate(0deg) scale(1)' : 'rotate(100deg) scale(0.35)',
        }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
          stroke={t.accent} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="4.4" />
          <line x1="12" y1="2.2" x2="12" y2="4.4" />
          <line x1="12" y1="19.6" x2="12" y2="21.8" />
          <line x1="4.9" y1="4.9" x2="6.5" y2="6.5" />
          <line x1="17.5" y1="17.5" x2="19.1" y2="19.1" />
          <line x1="2.2" y1="12" x2="4.4" y2="12" />
          <line x1="19.6" y1="12" x2="21.8" y2="12" />
          <line x1="4.9" y1="19.1" x2="6.5" y2="17.5" />
          <line x1="17.5" y1="6.5" x2="19.1" y2="4.9" />
        </svg>
      </span>
      {/* Moon — shown in light mode (tap → dark) */}
      <span
        aria-hidden
        style={{
          ...iconBase,
          opacity: t.isDark ? 0 : 1,
          transform: t.isDark ? 'rotate(-100deg) scale(0.35)' : 'rotate(0deg) scale(1)',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke={t.accent} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </span>
    </button>
  );
}

// ─── Visioner stack header — SA logo chrome + screen title eyebrow ─────
export function MobileStackHeader({
  t,
  title,
  onBack,
  right,
  sticky = true,
  closeButton = 'back',
  headerBackground,
}: {
  t: T;
  title: string;
  onBack: () => void;
  right?: React.ReactNode;
  sticky?: boolean;
  closeButton?: 'back' | 'x-right';
  headerBackground?: string;
}) {
  const headerBg = headerBackground ?? t.bg;
  const chromeBtn: React.CSSProperties = {
    width: 44,
    height: 44,
    borderRadius: 14,
    border: `0.5px solid ${t.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
    color: t.textSecondary,
    padding: 0,
  };

  const leftSlot = closeButton === 'back' ? (
    <button type="button" onClick={onBack} aria-label="Geri" style={chromeBtn}>
      <svg width="9" height="15" viewBox="0 0 9 15" fill="none" aria-hidden>
        <path d="M7.5 1.5 1.5 7.5l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  ) : undefined;

  const rightSlot = closeButton === 'x-right' ? (
    <button type="button" onClick={onBack} aria-label="Kapat" style={chromeBtn}>
      <IcoClose size={18} color={t.textSecondary} strokeWidth={2.2} />
    </button>
  ) : (
    right ?? <div style={{ width: 44, minHeight: 44 }} aria-hidden />
  );

  return (
    <div
      className="sa-chrome-header"
      style={sticky ? { position: 'sticky', top: 0, zIndex: 30 } : undefined}
    >
      <MobileBrandNavbar
        dark={t.isDark}
        logoCentered
        leftSlot={leftSlot}
        rightSlot={rightSlot}
        style={{
          background: headerBg,
          borderBottom: `0.5px solid ${t.separator}`,
        }}
      />
      {title.trim() ? (
        <div
          style={{
            padding: '10px 18px 4px',
            background: headerBg,
          }}
        >
          <div className="sa-chrome-eyebrow">{title}</div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Confirm sheet ─────────────────────────────────────────────────────
// Bottom sheet for destructive confirmations. Browser `confirm()` renders an
// OS dialog that names the host in a WebView and cannot be themed, so it reads
// as a website prompt inside the native app.
export function MobileConfirmSheet({
  t,
  open,
  title,
  body,
  confirmLabel = 'Onayla',
  cancelLabel = 'Vazgeç',
  destructive = false,
  pending = false,
  onConfirm,
  onCancel,
}: {
  t: T;
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  const accentColor = destructive ? '#F87171' : t.accent;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={pending ? undefined : onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-end',
        // Backdrop must not sit under the home indicator.
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          background: t.isDark ? '#16161c' : '#ffffff',
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          padding: '20px 18px 18px',
          borderTop: `0.5px solid ${t.separator}`,
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.02em', marginBottom: body ? 6 : 16 }}>
          {title}
        </div>
        {body && (
          <p style={{ fontSize: 14, color: t.textTertiary, lineHeight: 1.5, margin: '0 0 16px' }}>
            {body}
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            style={{
              width: '100%', minHeight: 50, borderRadius: 14, cursor: pending ? 'wait' : 'pointer',
              background: destructive ? 'rgba(239,68,68,0.14)' : t.accentDim,
              border: `0.5px solid ${destructive ? 'rgba(239,68,68,0.35)' : t.accentBorder}`,
              color: accentColor, fontSize: 16, fontWeight: 700,
              opacity: pending ? 0.6 : 1,
            }}
          >
            {pending ? 'İşleniyor…' : confirmLabel}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            style={{
              width: '100%', minHeight: 50, borderRadius: 14, cursor: pending ? 'default' : 'pointer',
              background: 'transparent', border: `0.5px solid ${t.separator}`,
              color: t.textSecondary, fontSize: 16, fontWeight: 600,
            }}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page Header ───────────────────────────────────────────────────────
export function PageHeader({ t, eyebrow, title, subtitle, right }: {
  t: T; eyebrow?: string; title: string; subtitle?: string; right?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
      <div>
        {eyebrow && (
          <p style={{ fontSize: 12, fontWeight: 500, color: t.textTertiary, marginBottom: 4 }}>
            {eyebrow}
          </p>
        )}
        <h1 style={{ fontSize: 28, fontWeight: 800, color: t.textPrimary, letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: subtitle ? 4 : 0 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 13, color: t.textTertiary }}>{subtitle}</p>}
      </div>
      {right && <div style={{ marginTop: 4 }}>{right}</div>}
    </div>
  );
}

// ─── Surface Card ──────────────────────────────────────────────────────
export function Card({ t, children, style, onClick }: {
  t: T; children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      style={{
        ...t.surfaceCard,
        padding: 18,
        width: onClick ? '100%' : undefined,
        textAlign: onClick ? 'left' as const : undefined,
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

// ─── Gradient accent line ──────────────────────────────────────────────
export function AccentLine({ color = '#9DBECE' }: { color?: string }) {
  return (
    <div style={{ height: 1, borderRadius: 1, background: `linear-gradient(90deg, transparent, ${color}60, transparent)`, margin: '12px 0' }} />
  );
}

// ─── Tag / Chip ────────────────────────────────────────────────────────
export function Tag({ t, label, color, active, onClick }: {
  t: T; label: string; color?: string; active?: boolean; onClick?: () => void;
}) {
  const c = color ?? t.accent;
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 14px', borderRadius: 30, cursor: onClick ? 'pointer' : 'default',
        fontSize: 12, fontWeight: active ? 600 : 400,
        ...(active ? t.pillActive(c) : t.pillIdle),
      }}
    >
      {label}
    </button>
  );
}

// ─── Metric Tile ───────────────────────────────────────────────────────
export function MetricTile({ t, label, value, color, sub, trend }: {
  t: T; label: string; value: string; color: string; sub?: string; trend?: string;
}) {
  return (
    <div style={{ ...t.surfaceCard, padding: '16px 14px' }}>
      <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1, marginBottom: 4, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{value}</div>
      {trend && <div style={{ fontSize: 11, color: trend.startsWith('+') ? t.success : t.danger, fontWeight: 600, marginBottom: 4 }}>{trend}</div>}
      <div style={{ fontSize: 11, color: t.labelColor, fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
