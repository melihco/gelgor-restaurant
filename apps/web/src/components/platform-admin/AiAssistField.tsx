'use client';

import { useState } from 'react';
import { Loader2, Sparkles, Save } from 'lucide-react';
import Button from '@/tailadmin/components/ui/button/Button';
import Label from '@/tailadmin/components/form/Label';
import TextArea from '@/tailadmin/components/form/input/TextArea';
import Input from '@/tailadmin/components/form/input/InputField';
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
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <span className="font-mono text-[10px] text-gray-400">{field}</span>
      </div>
      <TextArea
        rows={rows}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          className="min-w-[200px] flex-1 text-xs"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="AI talimatı (opsiyonel): daha kısa yap, premium ton…"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={aiLoading || !value.trim()}
          onClick={() => void runAi()}
          startIcon={aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        >
          AI ile düzelt
        </Button>
      </div>
      {aiNote && (
        <p className={`mt-2 text-xs ${aiNote.includes('başarısız') || aiNote.includes('error') ? 'text-error-500' : 'text-success-600'}`}>
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
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900/95">
      <div className="text-xs text-gray-500 dark:text-gray-400">
        {dirty ? 'Kaydedilmemiş değişiklikler var' : 'Tüm alanlar kayıtlı'}
        {message && <span className="ml-2 text-gray-700 dark:text-gray-200">{message}</span>}
      </div>
      <Button
        size="sm"
        variant="primary"
        disabled={!dirty || saving}
        onClick={onSave}
        startIcon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      >
        Kaydet
      </Button>
    </div>
  );
}
