'use client';

import { buildTemplateColorPreview, type TemplateColorTokensLike } from '@/lib/template-color-policy';

interface PreviewTheme {
  accent?: string;
  separator?: string;
  textPrimary?: string;
  textMuted?: string;
  textTertiary?: string;
  isDark?: boolean;
}

export function TemplateColorBehaviorPreview({
  templateId,
  posterTemplateId,
  tokens,
  isMobile = false,
  theme,
  compact = false,
}: {
  templateId?: string;
  posterTemplateId?: string;
  tokens?: TemplateColorTokensLike | null;
  isMobile?: boolean;
  theme?: PreviewTheme;
  compact?: boolean;
}) {
  const preview = buildTemplateColorPreview({
    templateId,
    posterTemplateId,
    tokens,
  });

  const border = isMobile
    ? `0.5px solid ${theme?.separator ?? 'rgba(255,255,255,0.1)'}`
    : '1px solid rgba(255,255,255,0.08)';
  const muted = isMobile ? (theme?.textMuted ?? '#94a3b8') : '#94a3b8';
  const tertiary = isMobile ? (theme?.textTertiary ?? muted) : '#64748b';
  const primary = isMobile ? (theme?.textPrimary ?? '#f1f5f9') : '#e2e8f0';

  return (
    <div
      style={{
        marginTop: compact ? 0 : 8,
        padding: compact ? 0 : '10px 12px',
        borderRadius: compact ? 0 : 10,
        border: compact ? 'none' : border,
        background: compact ? 'transparent' : (isMobile ? (theme?.isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)') : 'rgba(255,255,255,0.02)'),
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: muted,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        Renk davranisi
      </div>
      <div style={{ fontSize: 11, color: tertiary, lineHeight: 1.5 }}>
        {preview.summary}
      </div>
      {preview.items.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {preview.items.map((item) => (
            <div
              key={item.role}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 8px',
                borderRadius: 999,
                border,
                color: primary,
                fontSize: 11,
                lineHeight: 1,
                background: isMobile ? (theme?.isDark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.7)') : 'rgba(0,0,0,0.16)',
              }}
            >
              <span
                title={item.color ?? item.tokenLabel}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: item.color ?? 'transparent',
                  border: item.color ? border : `1px dashed ${muted}`,
                  flexShrink: 0,
                }}
              />
              <span>
                {item.label}: {item.tokenLabel}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
