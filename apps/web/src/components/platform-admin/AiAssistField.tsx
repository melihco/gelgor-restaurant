'use client';

import { useState } from 'react';
import { Loader2, Sparkles, Save } from 'lucide-react';
import { aiImproveBrandText } from '@/lib/platform-admin-actions-client';

export function AiAssistField({
  workspaceId,
  field,
  label,
  value,
  onChange,
  rows = 4,
  placeholder,
}: {
  workspaceId: string;
  field: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const [instruction, setInstruction] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  async function runAi() {
    if (!value.trim() || aiLoading) return;
    setAiLoading(true);
    setAiNote(null);
    const result = await aiImproveBrandText({
      workspaceId,
      field,
      currentText: value,
      instruction: instruction.trim() || undefined,
    });
    setAiLoading(false);
    if ('error' in result) {
      setAiNote(result.error);
      return;
    }
    onChange(result.improvedText);
    setAiNote('AI önerisi uygulandı — kaydetmeyi unutmayın.');
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-white/50">{label}</label>
        <span className="font-mono text-[10px] text-white/30">{field}</span>
      </div>
      <textarea
        className="w-full resize-y rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-amber-400/40"
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          className="min-w-[200px] flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white outline-none"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="AI talimatı (opsiyonel): daha kısa yap, premium ton…"
        />
        <button
          type="button"
          disabled={aiLoading || !value.trim()}
          onClick={() => void runAi()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/35 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-100 disabled:opacity-40"
        >
          {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          AI ile düzelt
        </button>
      </div>
      {aiNote && (
        <p className={`mt-2 text-xs ${aiNote.includes('başarısız') || aiNote.includes('error') ? 'text-rose-300' : 'text-emerald-300/90'}`}>
          {aiNote}
        </p>
      )}
    </div>
  );
}

export function SaveBar({
  dirty,
  saving,
  onSave,
  message,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  message?: string | null;
}) {
  return (
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0a0b12]/95 p-4 backdrop-blur-md">
      <div className="text-xs text-white/45">
        {dirty ? 'Kaydedilmemiş değişiklikler var' : 'Tüm alanlar kayıtlı'}
        {message && <span className="ml-2 text-white/70">{message}</span>}
      </div>
      <button
        type="button"
        disabled={!dirty || saving}
        onClick={onSave}
        className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-100 disabled:opacity-40"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Kaydet
      </button>
    </div>
  );
}
