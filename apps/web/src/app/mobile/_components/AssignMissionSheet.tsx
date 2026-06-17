'use client';
/**
 * ASSIGN MISSION SHEET — Native mobile mission assignment.
 * Mirrors admin AssignTaskModal using getRuntimeAgentProfile + executeAgent API.
 */
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTheme } from './theme-context';
import { apiClient } from '@/lib/api-client';
import { getRuntimeAgentProfile } from '@/lib/agent-runtime';
import type { RuntimeTaskTemplate } from '@/lib/agent-runtime';
import { buildBrandAwareBrief } from './brand-brief-builder';

interface Props {
  agentId: string;
  agentName: string;
  agentTypeString: string;  // e.g. "BlogWriter", "AiCeo"
  agentColor: string;
  onClose: () => void;
}

const PRIORITY_COLOR: Record<string, string> = {
  low:      '#60A5FA',
  medium:   '#9DBECE',
  high:     '#F59E0B',
  critical: '#EF4444',
};

export function AssignMissionSheet({ agentId, agentName, agentTypeString, agentColor, onClose }: Props) {
  const { t } = useTheme();
  const queryClient = useQueryClient();

  const profile = getRuntimeAgentProfile(agentTypeString);
  const [selectedId, setSelectedId] = useState(profile.taskTemplates[0]?.id ?? '');
  const [customNote, setCustomNote] = useState('');
  const [execMode, setExecMode] = useState<'dry-run' | 'live'>('dry-run');

  const { data: companyProfile } = useQuery({
    queryKey: ['company-profile'],
    queryFn: () => apiClient.getCompanyProfile(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const [phase, setPhase] = useState<'pick' | 'running' | 'done' | 'error'>('pick');
  const [errorMsg, setErrorMsg] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    setSelectedId(profile.taskTemplates[0]?.id ?? '');
    setCustomNote('');
    setExecMode('dry-run');
    setPhase('pick');
    setErrorMsg('');
  }, [agentTypeString, profile.taskTemplates]);

  const selected: RuntimeTaskTemplate | null = profile.taskTemplates.find(t => t.id === selectedId) ?? profile.taskTemplates[0] ?? null;

  // Group templates
  const groups = profile.taskTemplates.reduce<Record<string, RuntimeTaskTemplate[]>>((acc, t) => {
    if (!acc[t.group]) acc[t.group] = [];
    acc[t.group]!.push(t);
    return acc;
  }, {});

  const executeMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Görev seçilmedi');
      setPhase('running');

      // Review tasks: customNote is the specific review text to respond to
      const isReviewTask = selected.taskType === 'single_review_response' || selected.taskType === 'review_analysis';
      const baseInput = selected.buildInput(isReviewTask ? (customNote || undefined) : undefined);

      // Brand-aware brief: enriches with brand identity, season, competitors, content pillars
      const brief = companyProfile
        ? buildBrandAwareBrief(companyProfile, selected.taskType, isReviewTask ? undefined : (customNote || undefined))
        : (customNote || '');

      return apiClient.executeAgent(agentId, {
        taskType: selected.taskType,
        inputData: {
          ...baseInput,
          brief,
          executionMode: execMode,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['operations-summary'] });
      queryClient.invalidateQueries({ queryKey: ['artifacts'] });
      setPhase('done');
      setTimeout(onClose, 1200);
    },
    onError: (err: any) => {
      const raw = err?.message ?? '';

      // Parse structured API errors (JSON embedded in message)
      let parsed: Record<string, unknown> | null = null;
      try {
        const jsonStart = raw.indexOf('{');
        if (jsonStart !== -1) parsed = JSON.parse(raw.slice(jsonStart));
      } catch { /* ignore */ }

      const code   = (parsed?.code   ?? '') as string;
      const apiMsg = (parsed?.message ?? '') as string;
      const detail = (parsed?.detail  ?? '') as string;

      if (code === 'agent_not_in_package') {
        setErrorMsg(`__package_limit__::${agentName}::${apiMsg}`);
      } else if (
        raw.includes('insufficient_quota') ||
        raw.includes('429') ||
        raw.includes('quota') ||
        detail.includes('insufficient_quota')
      ) {
        setErrorMsg('__openai_quota__');
      } else if (raw.includes('502') || raw.includes('BadGateway') || raw.includes('Crew orchestration failed')) {
        setErrorMsg('__crew_502__');
      } else {
        setErrorMsg(apiMsg || raw || 'Mission başlatılamadı.');
      }
      setPhase('error');
    },
  });

  if (!mounted) return null;
  if (!profile.supported) {
    return createPortal(
      <>
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }} />
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 501, background: t.isDark ? '#0D0D1A' : '#f2f2f7', borderRadius: '26px 26px 0 0', padding: '28px 24px', paddingBottom: 'max(28px, env(safe-area-inset-bottom))', animation: 'slideUp 280ms cubic-bezier(0.4,0,0.2,1) both' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚙</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.textPrimary, marginBottom: 8 }}>Görev atama henüz hazır değil</div>
            <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6, marginBottom: 24 }}>{profile.specialty}</div>
            <button onClick={onClose} style={{ padding: '12px 28px', borderRadius: 30, cursor: 'pointer', background: t.accentDim, border: `0.5px solid ${t.accentBorder}`, color: t.accent, fontSize: 14, fontWeight: 600 }}>Kapat</button>
          </div>
        </div>
      </>,
      document.body
    );
  }

  const initials = agentName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const sheet = (
    <>
      {/* Backdrop */}
      <div onClick={phase === 'pick' ? onClose : undefined} style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', animation: 'fadeIn 180ms ease both' }} />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 501,
        maxHeight: '92dvh', display: 'flex', flexDirection: 'column',
        background: t.isDark ? '#0D0D1A' : '#f2f2f7',
        borderRadius: '26px 26px 0 0',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        animation: 'slideUp 280ms cubic-bezier(0.4,0,0.2,1) both',
        boxShadow: '0 -12px 60px rgba(0,0,0,0.45)',
        border: t.isDark ? '0.5px solid rgba(255,255,255,0.06)' : 'none',
      }}>

        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, marginBottom: 4, flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: t.isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)' }} />
        </div>

        {/* ── HEADER ── */}
        <div style={{ padding: '8px 22px 14px', borderBottom: `0.5px solid ${t.separator}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 13, background: `${agentColor}18`, border: `1px solid ${agentColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: agentColor, flexShrink: 0 }}>
              {initials}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: t.textPrimary, letterSpacing: '-0.01em' }}>Mission Ata</div>
              <div style={{ fontSize: 12, color: agentColor, fontWeight: 500, marginTop: 1 }}>{agentName} · {profile.specialty.split('·')[0]?.trim() ?? profile.specialty}</div>
            </div>
            {/* Dry-run / Live toggle */}
            <div style={{ display: 'flex', borderRadius: 20, overflow: 'hidden', border: `0.5px solid ${t.separator}`, flexShrink: 0 }}>
              {(['dry-run', 'live'] as const).map(mode => (
                <button key={mode} onClick={() => setExecMode(mode)} disabled={phase !== 'pick'} style={{
                  padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none',
                  background: execMode === mode ? (mode === 'live' ? 'rgba(239,68,68,0.15)' : t.accentDim) : 'transparent',
                  color: execMode === mode ? (mode === 'live' ? '#EF4444' : t.accent) : t.textMuted,
                }}>
                  {mode === 'dry-run' ? '◎ Test' : '🚀 Canlı'}
                </button>
              ))}
            </div>
          </div>
          {execMode === 'live' && (
            <div style={{ marginTop: 8, padding: '6px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.07)', border: '0.5px solid rgba(239,68,68,0.18)', fontSize: 11, color: '#EF4444' }}>
              ⚠ Canlı mod — bu görev gerçek veri üretir ve platforma gönderebilir.
            </div>
          )}
          {companyProfile && (
            <div style={{ marginTop: 8, padding: '6px 12px', borderRadius: 8, background: t.isDark ? 'rgba(16,185,129,0.07)' : 'rgba(16,185,129,0.05)', border: '0.5px solid rgba(16,185,129,0.18)', fontSize: 11, color: t.live, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span>✦</span>
              <span>Marka bağlamı otomatik ekleniyor — {companyProfile.brandName}</span>
            </div>
          )}
        </div>

        {/* ── CONTENT (scrollable) ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 22px' }}>

          {/* Done / Error / Running states */}
          {phase === 'done' && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: t.successDim, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 26, color: t.success }}>✓</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: t.textPrimary, marginBottom: 6 }}>Mission başlatıldı!</div>
              <div style={{ fontSize: 13, color: t.textMuted }}>{agentName} çalışmaya başladı.</div>
            </div>
          )}

          {phase === 'running' && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', border: `3px solid ${t.separator}`, borderTop: `3px solid ${agentColor}`, animation: 'spinSlow 1s linear infinite', margin: '0 auto 16px' }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: t.textPrimary, marginBottom: 4 }}>Başlatılıyor...</div>
              <div style={{ fontSize: 13, color: t.textMuted }}>{selected?.label}</div>
            </div>
          )}

          {phase === 'error' && (() => {
            const isPackageLimit = errorMsg.startsWith('__package_limit__');
            if (isPackageLimit) {
              const [, agent, detail] = errorMsg.split('::');
              return (
                <div style={{ padding: '8px 0' }}>
                  {/* Package limit — premium upgrade card */}
                  <div style={{ padding: '18px', borderRadius: 18, background: t.isDark ? 'rgba(245,158,11,0.07)' : 'rgba(245,158,11,0.05)', border: '0.5px solid rgba(245,158,11,0.25)', marginBottom: 14 }}>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🔒</div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: t.textPrimary, marginBottom: 3 }}>Paket Yükseltme Gerekli</div>
                        <div style={{ fontSize: 12, color: '#F59E0B', fontWeight: 600 }}>{agent || agentName} bu paketin dışında</div>
                      </div>
                    </div>
                    <p style={{ fontSize: 13, color: t.textTertiary, lineHeight: 1.6, margin: 0 }}>
                      {detail || `${agent || agentName} ajanı mevcut paketinizde bulunmuyor. Daha fazla ajan için planınızı yükseltin.`}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { onClose(); }} style={{ flex: 1, padding: '12px', borderRadius: 14, cursor: 'pointer', background: 'linear-gradient(135deg,rgba(245,158,11,0.85),rgba(234,88,12,0.75))', border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                      ✦ Plan Yükselt
                    </button>
                    <button onClick={() => setPhase('pick')} style={{ flex: 1, padding: '12px', borderRadius: 14, cursor: 'pointer', background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', border: `0.5px solid ${t.separator}`, color: t.textTertiary, fontSize: 13 }}>
                      Geri Dön
                    </button>
                  </div>
                  <div style={{ marginTop: 10, fontSize: 12, color: t.textMuted, textAlign: 'center', lineHeight: 1.5 }}>
                    Aktif pakette bulunan ajanlar ile görev atayabilirsiniz.
                  </div>
                </div>
              );
            }
            // OpenAI quota exceeded
            if (errorMsg === '__openai_quota__') {
              return (
                <div style={{ padding: '8px 0' }}>
                  <div style={{ padding: '18px', borderRadius: 18, background: 'rgba(239,68,68,0.07)', border: '0.5px solid rgba(239,68,68,0.22)', marginBottom: 14 }}>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>⚡</div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: t.textPrimary, marginBottom: 3 }}>OpenAI Kotası Doldu</div>
                        <div style={{ fontSize: 12, color: t.danger, fontWeight: 600 }}>Error 429 · insufficient_quota</div>
                      </div>
                    </div>
                    <p style={{ fontSize: 13, color: t.textTertiary, lineHeight: 1.65, margin: 0 }}>
                      AI görevlerini çalıştırmak için kullanılan OpenAI API anahtarının bakiyesi dolmuş.
                      OpenAI hesabınızı kontrol edin ve <strong style={{ color: t.textSecondary }}>platform.openai.com/billing</strong> adresinden bakiye yükleyin.
                    </p>
                  </div>
                  <div style={{ padding: '12px 14px', borderRadius: 14, background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', border: `0.5px solid ${t.separator}`, marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: t.labelColor, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Çözüm Adımları</div>
                    {[
                      '1. platform.openai.com → Billing',
                      '2. Bakiye yükle veya ödeme yöntemini güncelle',
                      '3. .env dosyasında OPENAI_API_KEY kontrolü',
                      '4. Python servisini yeniden başlat',
                    ].map((step, i) => (
                      <div key={i} style={{ fontSize: 12, color: t.textTertiary, marginBottom: i < 3 ? 5 : 0 }}>{step}</div>
                    ))}
                  </div>
                  <button onClick={() => setPhase('pick')} style={{ width: '100%', padding: '13px', borderRadius: 14, cursor: 'pointer', background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', border: `0.5px solid ${t.separator}`, color: t.textTertiary, fontSize: 13 }}>
                    ← Geri Dön
                  </button>
                </div>
              );
            }

            // CrewAI / Python backend 502
            if (errorMsg === '__crew_502__') {
              return (
                <div style={{ padding: '8px 0' }}>
                  <div style={{ padding: '18px', borderRadius: 18, background: 'rgba(245,158,11,0.07)', border: '0.5px solid rgba(245,158,11,0.22)', marginBottom: 14 }}>
                    <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🔌</div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: t.textPrimary, marginBottom: 3 }}>AI Servisi Yanıt Vermiyor</div>
                        <div style={{ fontSize: 12, color: '#F59E0B', fontWeight: 600 }}>502 Bad Gateway · CrewAI</div>
                      </div>
                    </div>
                    <p style={{ fontSize: 13, color: t.textTertiary, lineHeight: 1.65, margin: 0 }}>
                      Python CrewAI servisi şu an erişilemiyor. Servis kapalı veya yeniden başlatılıyor olabilir.
                    </p>
                  </div>
                  <div style={{ padding: '12px 14px', borderRadius: 14, background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', border: `0.5px solid ${t.separator}`, marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: t.labelColor, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Çözüm</div>
                    <div style={{ fontSize: 12, color: t.textTertiary, lineHeight: 1.6 }}>
                      Terminal'de:{'\n'}
                      <code style={{ background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', padding: '2px 6px', borderRadius: 5, fontSize: 11 }}>./scripts/start-crew-backend.sh</code>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => executeMutation.mutate()} style={{ flex: 1, padding: '12px', borderRadius: 14, cursor: 'pointer', background: t.accentDim, border: `0.5px solid ${t.accentBorder}`, color: t.accent, fontSize: 13, fontWeight: 600 }}>Tekrar Dene</button>
                    <button onClick={() => setPhase('pick')} style={{ flex: 1, padding: '12px', borderRadius: 14, cursor: 'pointer', background: t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', border: `0.5px solid ${t.separator}`, color: t.textTertiary, fontSize: 13 }}>Geri Dön</button>
                  </div>
                </div>
              );
            }

            return (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>⚠</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.danger, marginBottom: 6 }}>Mission başlatılamadı</div>
                <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 20, lineHeight: 1.5 }}>{errorMsg}</div>
                <button onClick={() => setPhase('pick')} style={{ padding: '10px 24px', borderRadius: 30, cursor: 'pointer', background: t.accentDim, border: `0.5px solid ${t.accentBorder}`, color: t.accent, fontSize: 13, fontWeight: 600 }}>Tekrar Dene</button>
              </div>
            );
          })()}

          {phase === 'pick' && (
            <>
              {/* Task template groups */}
              {Object.entries(groups).map(([group, templates]) => (
                <div key={group} style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: t.labelColor, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>{group}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {templates.map(tmpl => {
                      const isSel = selectedId === tmpl.id;
                      const pColor = PRIORITY_COLOR[tmpl.priority] ?? t.textMuted;
                      return (
                        <button key={tmpl.id} onClick={() => setSelectedId(tmpl.id)} style={{
                          width: '100%', padding: '14px 15px', borderRadius: 16, cursor: 'pointer', textAlign: 'left',
                          background: isSel ? `${agentColor}12` : (t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'),
                          border: `0.5px solid ${isSel ? agentColor + '35' : t.separator}`,
                          position: 'relative', overflow: 'hidden',
                        }}>
                          {isSel && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderRadius: '0 2px 2px 0', background: agentColor }} />}
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                            <div style={{ fontSize: 14, fontWeight: isSel ? 700 : 600, color: isSel ? t.textPrimary : t.textSecondary, lineHeight: 1.25 }}>
                              {tmpl.label}
                            </div>
                            <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                              <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 20, background: `${pColor}14`, color: pColor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                {tmpl.priority}
                              </span>
                              <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 20, background: t.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', color: t.textMuted }}>
                                ~{tmpl.estimatedMin}dk
                              </span>
                            </div>
                          </div>
                          <div style={{ fontSize: 12, color: t.textTertiary, lineHeight: 1.45 }}>{tmpl.description}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Custom note */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: t.labelColor, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Özel Not (opsiyonel)
                </div>
                <textarea
                  value={customNote}
                  onChange={e => setCustomNote(e.target.value)}
                  placeholder={
                    selected?.taskType === 'single_review_response'
                      ? 'Yanıtlanacak müşteri yorumunu buraya yaz...'
                      : 'Operatör yönlendirmesi (opsiyonel) — brand brief otomatik ekleniyor'
                  }
                  rows={3}
                  style={{
                    width: '100%', padding: '12px 14px', borderRadius: 14, resize: 'none', outline: 'none', boxSizing: 'border-box', fontSize: 14, lineHeight: 1.55,
                    background: t.isDark ? 'rgba(255,255,255,0.05)' : '#fff',
                    border: `0.5px solid ${t.separator}`,
                    color: t.textPrimary,
                  }}
                />
              </div>
            </>
          )}
        </div>

        {/* ── EXECUTE BUTTON ── */}
        {phase === 'pick' && selected && (
          <div style={{ padding: '10px 22px 0', flexShrink: 0, borderTop: `0.5px solid ${t.separator}` }}>
            <button
              onClick={() => executeMutation.mutate()}
              disabled={executeMutation.isPending}
              style={{
                width: '100%', padding: '17px', borderRadius: 16, cursor: 'pointer',
                background: execMode === 'live'
                  ? 'linear-gradient(135deg,rgba(239,68,68,0.85),rgba(220,38,38,0.75))'
                  : `linear-gradient(135deg,${agentColor}cc,${agentColor}99)`,
                border: 'none', color: '#fff', fontSize: 15, fontWeight: 800,
                letterSpacing: '-0.01em',
                boxShadow: `0 4px 20px ${execMode === 'live' ? 'rgba(239,68,68,0.35)' : agentColor + '40'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {executeMutation.isPending ? (
                <><div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', animation: 'spinSlow 0.8s linear infinite' }} /> Başlatılıyor...</>
              ) : (
                <>{execMode === 'live' ? '🚀' : '⚡'} {selected.label} Mission'ı Başlat</>
              )}
            </button>
          </div>
        )}
      </div>
    </>
  );

  return createPortal(sheet, document.body);
}
