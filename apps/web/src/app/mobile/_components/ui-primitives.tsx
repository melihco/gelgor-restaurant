'use client';
/** Premium UI primitive components — shared across all mobile screens */

import React from 'react';
import type { T } from './theme-context';
import { IcoBack, IcoClose } from './Icons';

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

// ─── Native stack header (iOS-style back + centered title) ─────────────
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
  const headerBg = headerBackground
    ?? (t.isDark ? 'rgba(5,7,12,0.78)' : 'rgba(247,249,251,0.84)');

  return (
    <header
      className="sa-chrome-header"
      style={{
        ...(sticky ? { position: 'sticky' as const, top: 0, zIndex: 30 } : {}),
        background: headerBg,
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        borderBottom: 'none',
        boxShadow: t.isDark
          ? 'inset 0 -0.5px 0 rgba(176,196,212,0.16)'
          : 'inset 0 -0.5px 0 rgba(30,63,85,0.14)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '44px 1fr 44px',
          alignItems: 'center',
          minHeight: 44,
          padding: '2px 10px',
        }}
      >
        {closeButton === 'back' ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="Geri"
            style={{
              ...t.backBtn,
              width: 44,
              height: 44,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              justifySelf: 'start',
            }}
          >
            <IcoBack color={t.textSecondary} />
          </button>
        ) : (
          <div aria-hidden style={{ width: 44, height: 44 }} />
        )}
        <h1
          style={{
            margin: 0,
            fontSize: 17,
            fontWeight: 600,
            color: t.textPrimary,
            letterSpacing: '-0.02em',
            textAlign: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </h1>
        <div style={{ justifySelf: 'end', minWidth: 44, display: 'flex', justifyContent: 'flex-end' }}>
          {closeButton === 'x-right' ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="Kapat"
              style={{
                ...t.backBtn,
                width: 44,
                height: 44,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <IcoClose size={18} color={t.textSecondary} strokeWidth={2.2} />
            </button>
          ) : right}
        </div>
      </div>
    </header>
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
