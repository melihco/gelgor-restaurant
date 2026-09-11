'use client';

/**
 * Native Instagram story chrome — progress, avatar/handle, close, reply + like + send.
 * Media + tap zones stay in the parent; this is overlay only.
 */
import { useState } from 'react';
import { IgCloseX, IgHeart, IgMoreDots, IgPaperPlane, igIconHit } from './ig-native-icons';

export type IgStoryMoreAction = {
  id: string;
  label: string;
  onClick: () => void;
};

export function IgStoryChrome({
  barCount,
  activeIndex,
  activeProgress,
  avatarUrl,
  title,
  subtitle,
  liked,
  onClose,
  onLike,
  onShare,
  onReply,
  moreActions,
}: {
  barCount: number;
  activeIndex: number;
  /** 0–100 */
  activeProgress: number;
  avatarUrl?: string;
  title: string;
  subtitle?: string;
  liked?: boolean;
  onClose: () => void;
  onLike?: () => void;
  onShare?: () => void;
  onReply?: () => void;
  moreActions?: IgStoryMoreAction[];
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const bars = Math.max(1, barCount);
  const handle = title.startsWith('@') ? title : title;

  return (
    <>
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 30,
        padding: 'max(10px, env(safe-area-inset-top)) 8px 0',
        pointerEvents: 'none',
      }}>
        <div style={{ display: 'flex', gap: 3, padding: '0 4px' }}>
          {Array.from({ length: bars }, (_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 2,
                borderRadius: 2,
                background: 'rgba(255,255,255,0.35)',
                overflow: 'hidden',
              }}
            >
              <div style={{
                height: '100%',
                width: i < activeIndex ? '100%' : i === activeIndex ? `${Math.min(100, Math.max(0, activeProgress))}%` : '0%',
                background: '#fff',
                borderRadius: 2,
              }} />
            </div>
          ))}
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 4px 0 6px',
          pointerEvents: 'auto',
        }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            overflow: 'hidden',
            background: '#2a2a2a',
            flexShrink: 0,
            boxShadow: '0 0 0 1.5px rgba(255,255,255,0.85)',
          }}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" referrerPolicy="no-referrer"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{
                width: '100%', height: '100%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700,
              }}>
                {handle.replace('@', '').slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              color: '#fff',
              letterSpacing: '-0.01em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textShadow: '0 1px 3px rgba(0,0,0,0.45)',
            }}>
              {handle}
            </div>
            {subtitle && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', marginTop: 1 }}>
                {subtitle}
              </div>
            )}
          </div>
          {moreActions && moreActions.length > 0 && (
            <button
              type="button"
              aria-label="Diğer"
              onClick={() => setMoreOpen(true)}
              style={igIconHit}
            >
              <IgMoreDots />
            </button>
          )}
          <button type="button" aria-label="Kapat" onClick={onClose} style={igIconHit}>
            <IgCloseX />
          </button>
        </div>
      </div>

      <div style={{
        position: 'absolute',
        left: 10,
        right: 10,
        bottom: 'max(12px, env(safe-area-inset-bottom))',
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <button
          type="button"
          onClick={onReply}
          style={{
            flex: 1,
            minHeight: 44,
            borderRadius: 22,
            border: '1.5px solid rgba(255,255,255,0.55)',
            background: 'transparent',
            color: 'rgba(255,255,255,0.72)',
            fontSize: 14,
            fontWeight: 500,
            textAlign: 'left',
            padding: '0 16px',
            cursor: onReply ? 'pointer' : 'default',
          }}
        >
          Mesaj gönder…
        </button>
        <button
          type="button"
          aria-label={liked ? 'Beğeniyi kaldır' : 'Beğen'}
          onClick={onLike}
          style={igIconHit}
        >
          <IgHeart filled={liked} />
        </button>
        <button type="button" aria-label="Gönder" onClick={onShare} style={igIconHit}>
          <IgPaperPlane />
        </button>
      </div>

      {moreOpen && moreActions && moreActions.length > 0 && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
        }}>
          <button
            type="button"
            aria-label="Kapat"
            onClick={() => setMoreOpen(false)}
            style={{ flex: 1, border: 'none', background: 'rgba(0,0,0,0.45)', cursor: 'pointer' }}
          />
          <div style={{
            background: '#1c1c1e',
            borderRadius: '16px 16px 0 0',
            padding: '8px 0 max(12px, env(safe-area-inset-bottom))',
          }}>
            {moreActions.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  a.onClick();
                }}
                style={{
                  width: '100%',
                  minHeight: 48,
                  border: 'none',
                  background: 'transparent',
                  color: '#fff',
                  fontSize: 16,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
