'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getMobilePortalRoot } from '../mobile-client-config';
import { useTheme } from '../theme-context';
import type { FeedComment } from './types';

export function CommentsBottomSheet({
  open,
  onClose,
  comments,
  onSubmit,
  title = 'Yorumlar',
}: {
  open: boolean;
  onClose: () => void;
  comments: FeedComment[];
  onSubmit: (text: string) => void | Promise<void>;
  title?: string;
}) {
  const { t } = useTheme();
  const [text, setText] = useState('');
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setText('');
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 280);
    return () => {
      document.body.style.overflow = prev;
      window.clearTimeout(focusTimer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [comments.length, open]);

  if (!mounted || !open || typeof window === 'undefined') return null;

  const surface = t.isDark ? '#121212' : '#f7f7f8';
  const textColor = t.isDark ? '#f5f5f5' : '#111';
  const muted = t.isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';

  const sheet = (
    <div
      className="sa-feed-sheet-root"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button type="button" className="sa-feed-sheet-backdrop" aria-label="Kapat" onClick={onClose} />
      <div
        className="sa-feed-sheet-panel sa-feed-comments-panel"
        style={{ background: surface, color: textColor }}
      >
        <div className="sa-feed-sheet-handle" aria-hidden />
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '4px 16px 12px', borderBottom: `0.5px solid ${t.separator}`,
        }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            style={{
              width: 44, height: 44, border: 'none', background: 'none',
              color: textColor, fontSize: 20, cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <div
          ref={listRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            padding: '12px 16px',
          }}
        >
          {comments.length === 0 ? (
            <div style={{ padding: '40px 12px', textAlign: 'center', color: muted, fontSize: 14 }}>
              Henüz yorum yok — ilk yorumu sen yaz.
            </div>
          ) : (
            comments.map((c) => (
              <div key={c.id} style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: t.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, color: muted,
                }}>
                  {c.author.slice(0, 1).toUpperCase()}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, lineHeight: 1.45 }}>
                    <span style={{ fontWeight: 700 }}>{c.author}</span>{' '}
                    <span style={{ color: t.isDark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.8)' }}>
                      {c.text}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit(text);
            setText('');
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px calc(10px + env(safe-area-inset-bottom))',
            borderTop: `0.5px solid ${t.separator}`,
            background: surface,
          }}
        >
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Yorum ekle…"
            enterKeyHint="send"
            autoComplete="off"
            style={{
              flex: 1,
              minWidth: 0,
              height: 40,
              borderRadius: 20,
              border: `0.5px solid ${t.separator}`,
              background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              color: textColor,
              padding: '0 14px',
              fontSize: 16,
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Yorum gönder"
            style={{
              minWidth: 44,
              height: 44,
              border: 'none',
              background: 'none',
              color: text.trim() ? '#0095F6' : muted,
              fontWeight: 700,
              fontSize: 14,
              cursor: text.trim() ? 'pointer' : 'default',
            }}
          >
            Paylaş
          </button>
        </form>
      </div>
    </div>
  );

  return createPortal(sheet, getMobilePortalRoot());
}
