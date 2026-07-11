'use client';

import React, { useRef, useState } from 'react';
import {
  motionProfileToThemeJson,
  parseMotionProfileFromTheme,
  type BrandMotionProfile,
  type StoryAudioMode,
} from '@/lib/brand-motion-profile';
import {
  STORY_MUSIC_CATEGORIES,
  STORY_MUSIC_OPTIONS,
  type StoryMusicOption,
} from '@/lib/story-audio-catalog';
import type { StoryMusicCategory } from '@/lib/story-music-tracks.generated';
import { STORY_VOICE_OPTIONS } from '@/lib/story-voice-catalog';
import type { T } from '@/app/mobile/_components/theme-context';

type ThemeRecord = Record<string, unknown>;

export function StoryAudioSettingsPanel({
  tenantId,
  theme,
  sector,
  t,
  onSaved,
}: {
  tenantId: string;
  theme: ThemeRecord;
  sector?: string;
  t: T;
  onSaved?: () => void;
}) {
  const profile = parseMotionProfileFromTheme(theme, { sector });
  const [audioMode, setAudioMode] = useState<StoryAudioMode>(
    profile.storyAudioMode ?? 'music_and_voice',
  );
  const [selectedMood, setSelectedMood] = useState(
    profile.storyAudioMood ?? STORY_MUSIC_OPTIONS[0]!.id,
  );
  const [selectedVoice, setSelectedVoice] = useState(
    profile.storyVoiceId ?? STORY_VOICE_OPTIONS[0]!.id,
  );
  const [saving, setSaving] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [voicePreviewLoading, setVoicePreviewLoading] = useState<string | null>(null);
  const [musicSearch, setMusicSearch] = useState('');
  const [musicCategory, setMusicCategory] = useState<StoryMusicCategory | 'all'>('all');
  const [musicPreviewLoading, setMusicPreviewLoading] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const filteredMusic: StoryMusicOption[] = STORY_MUSIC_OPTIONS.filter((opt) => {
    if (musicCategory !== 'all' && opt.category !== musicCategory) return false;
    const q = musicSearch.trim().toLowerCase();
    if (!q) return true;
    return opt.label.toLowerCase().includes(q) || opt.id.toLowerCase().includes(q)
      || opt.categoryLabel.toLowerCase().includes(q);
  });

  const save = async (patch: Partial<BrandMotionProfile>) => {
    if (!tenantId) return;
    setSaving(true);
    try {
      const base = parseMotionProfileFromTheme(theme, { sector });
      const next = { ...base, ...patch, operatorOverride: true };
      const motion_profile = motionProfileToThemeJson(next);
      await fetch(`/api/brand-context/${tenantId}/theme`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
        body: JSON.stringify({
          theme: {
            ...theme,
            motion_profile,
          },
        }),
      });
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  const stopPreview = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingId(null);
  };

  const playPreview = (id: string, previewPath: string) => {
    if (playingId === id) {
      stopPreview();
      setMusicPreviewLoading(null);
      return;
    }
    stopPreview();
    setMusicPreviewLoading(id);
    const src = previewPath.startsWith('http')
      ? previewPath
      : `${window.location.origin}${previewPath.startsWith('/') ? '' : '/'}${previewPath}`;
    const audio = new Audio(src);
    audioRef.current = audio;
    const clearLoading = () => setMusicPreviewLoading((cur) => (cur === id ? null : cur));
    audio.onended = () => {
      setPlayingId(null);
      clearLoading();
    };
    audio.onerror = () => {
      setPlayingId(null);
      clearLoading();
    };
    const startPlay = () => {
      clearLoading();
      setPlayingId(id);
      audio.play().catch(() => {
        setPlayingId(null);
        clearLoading();
      });
    };
    if (audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
      startPlay();
      return;
    }
    audio.addEventListener('canplay', startPlay, { once: true });
    audio.load();
  };

  const playVoicePreview = async (voiceId: string) => {
    if (playingId === `voice-${voiceId}`) {
      stopPreview();
      return;
    }
    stopPreview();
    setVoicePreviewLoading(voiceId);
    try {
      const res = await fetch('/api/story-audio/voice-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId, locale: profile.locale ?? 'tr' }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { playbackUrl?: string };
      if (!data.playbackUrl) return;
      const audio = new Audio(data.playbackUrl);
      audioRef.current = audio;
      setPlayingId(`voice-${voiceId}`);
      audio.play().catch(() => setPlayingId(null));
      audio.onended = () => setPlayingId(null);
    } finally {
      setVoicePreviewLoading(null);
    }
  };

  return (
    <div>
      <div style={{ fontSize: 12, color: t.textTertiary, lineHeight: 1.6, marginBottom: 14 }}>
        Story videolarında arka plan müziği ve caption seslendirme. Mission Hub üretimi bu ayarlara uyar.
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Ses modu
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {([
          { id: 'music_and_voice' as StoryAudioMode, label: 'Müzik + caption seslendirme', desc: 'Mission caption OpenAI TTS ile okunur; müzik alçalır.' },
          { id: 'music_only' as StoryAudioMode, label: 'Sadece müzik', desc: 'Ekranda metin; arka planda yalnızca seçilen müzik.' },
        ]).map((opt) => {
          const active = audioMode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={saving}
              onClick={() => {
                setAudioMode(opt.id);
                void save({ storyAudioMode: opt.id });
              }}
              style={{
                textAlign: 'left', padding: '12px 14px', borderRadius: 14, cursor: 'pointer',
                border: `0.5px solid ${active ? t.accentBorder : t.separator}`,
                background: active
                  ? (t.isDark ? 'rgba(124,58,237,0.12)' : 'rgba(124,58,237,0.08)')
                  : (t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                opacity: saving ? 0.7 : 1,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: active ? 700 : 600, color: active ? t.accent : t.textPrimary }}>
                {opt.label}
              </div>
              <div style={{ fontSize: 11, color: t.textMuted, marginTop: 3 }}>{opt.desc}</div>
            </button>
          );
        })}
      </div>

      {audioMode === 'music_and_voice' && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Ses tonu (TTS)
          </div>
          <div style={{ fontSize: 11, color: t.textTertiary, lineHeight: 1.5, marginBottom: 10 }}>
            Doğal konuşma hızı (0.92x) — story süresine uygun kısa metin; acele okuma yok. Önizleme ile dinleyin.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {STORY_VOICE_OPTIONS.map((opt) => {
              const active = selectedVoice === opt.id;
              const previewKey = `voice-${opt.id}`;
              const isPlaying = playingId === previewKey;
              const isLoading = voicePreviewLoading === opt.id;
              return (
                <div
                  key={opt.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12,
                    border: `0.5px solid ${active ? t.accentBorder : t.separator}`,
                    background: active
                      ? (t.isDark ? 'rgba(124,58,237,0.1)' : 'rgba(124,58,237,0.06)')
                      : 'transparent',
                  }}
                >
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => void playVoicePreview(opt.id)}
                    style={{
                      width: 36, height: 36, borderRadius: 999, border: 'none', cursor: 'pointer',
                      background: isPlaying ? t.accent : (t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
                      color: isPlaying ? '#fff' : t.textSecondary, fontSize: 14, flexShrink: 0,
                      opacity: isLoading ? 0.6 : 1,
                    }}
                    aria-label={`Önizle ${opt.label}`}
                  >
                    {isLoading ? '…' : isPlaying ? '■' : '▶'}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      setSelectedVoice(opt.id);
                      void save({ storyVoiceId: opt.id });
                    }}
                    style={{
                      flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: active ? 700 : 600, color: active ? t.accent : t.textPrimary }}>
                      {opt.label}
                      <span style={{ fontSize: 10, color: t.textMuted, marginLeft: 6 }}>{opt.gender}</span>
                    </div>
                    <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2, lineHeight: 1.4 }}>{opt.tone}</div>
                  </button>
                  {active && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#10B981' }}>Seçili</span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <div style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Arka plan müziği
      </div>
      <div style={{ fontSize: 11, color: t.textTertiary, lineHeight: 1.5, marginBottom: 10 }}>
        {STORY_MUSIC_OPTIONS.length} modern ve eğlenceli alternatif — dans, pop, synth, tropical ve daha fazlası.
      </div>
      <input
        type="search"
        value={musicSearch}
        onChange={(e) => setMusicSearch(e.target.value)}
        placeholder="Müzik ara… (house, neon, upbeat…)"
        style={{
          width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 12, marginBottom: 10,
          border: `0.5px solid ${t.separator}`, background: t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          color: t.textPrimary, fontSize: 13,
        }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => setMusicCategory('all')}
          style={{
            padding: '5px 10px', borderRadius: 999, fontSize: 11, cursor: 'pointer',
            border: `0.5px solid ${musicCategory === 'all' ? t.accentBorder : t.separator}`,
            background: musicCategory === 'all' ? (t.isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.1)') : 'transparent',
            color: musicCategory === 'all' ? t.accent : t.textMuted,
          }}
        >
          Tümü ({STORY_MUSIC_OPTIONS.length})
        </button>
        {STORY_MUSIC_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setMusicCategory(cat.id)}
            style={{
              padding: '5px 10px', borderRadius: 999, fontSize: 11, cursor: 'pointer',
              border: `0.5px solid ${musicCategory === cat.id ? t.accentBorder : t.separator}`,
              background: musicCategory === cat.id ? (t.isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.1)') : 'transparent',
              color: musicCategory === cat.id ? t.accent : t.textMuted,
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 10, color: t.textMuted, marginBottom: 8 }}>
        {filteredMusic.length} sonuç
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
        {filteredMusic.map((opt) => {
          const active = selectedMood === opt.id;
          const isPlaying = playingId === opt.id;
          const isLoading = musicPreviewLoading === opt.id;
          return (
            <div
              key={opt.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12,
                border: `0.5px solid ${active ? t.accentBorder : t.separator}`,
                background: active
                  ? (t.isDark ? 'rgba(59,130,246,0.1)' : 'rgba(59,130,246,0.06)')
                  : 'transparent',
              }}
            >
              <button
                type="button"
                disabled={isLoading}
                onClick={() => playPreview(opt.id, opt.previewPath)}
                style={{
                  width: 36, height: 36, borderRadius: 999, border: 'none', cursor: 'pointer',
                  background: isPlaying ? t.accent : (t.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
                  color: isPlaying ? '#fff' : t.textSecondary, fontSize: 14, flexShrink: 0,
                  opacity: isLoading ? 0.65 : 1,
                }}
                aria-label={`Önizle ${opt.label}`}
              >
                {isLoading ? '…' : isPlaying ? '■' : '▶'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setSelectedMood(opt.id);
                  void save({
                    storyAudioMood: opt.id,
                    audioMoodPool: [opt.id, ...profile.audioMoodPool.filter((m) => m !== opt.id)].slice(0, 4),
                  });
                }}
                style={{
                  flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: active ? 700 : 600, color: active ? t.accent : t.textPrimary }}>
                  {opt.label}
                </div>
                <div style={{ fontSize: 10, color: t.textMuted, marginTop: 2 }}>{opt.categoryLabel}</div>
              </button>
              {active && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#10B981' }}>Seçili</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
