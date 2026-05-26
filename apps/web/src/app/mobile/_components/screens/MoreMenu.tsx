'use client';
import { useState } from 'react';
import { useTheme } from '../theme-context';
import { useMobileStore } from '../mobile-store';
import { useAuthStore } from '../auth-store';
import { apiClient } from '@/lib/api-client';
import {
  IcoLogout, IcoChevronRight,
} from '../Icons';
import type { T } from '../theme-context';
import type { MobileScreen } from '../mobile-store';

const integrations = [
  { name: 'Google Business', connected: true,  color: '#34d399' },
  { name: 'Instagram',       connected: true,  color: '#f472b6' },
  { name: 'Google Ads',      connected: true,  color: '#60a5fa' },
  { name: 'Google Analytics',connected: false, color: '#f59e0b' },
];

export function MoreMenu() {
  const { t, toggle } = useTheme();
  const { navigate } = useMobileStore();
  const { user, setUser } = useAuthStore();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try { await apiClient.logout(); } finally { setUser(null); }
  };

  const initials = (user?.displayName ?? 'LB')
    .split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  const connectedCount = integrations.filter((i) => i.connected).length;

  type NavItem = { label: string; sub: string; iconBg: string; iconText: string; screen: MobileScreen; badge?: string | number };

  const groups: { title: string; items: NavItem[] }[] = [
    {
      title: 'İçerik & Performans',
      items: [
        { label: 'Brand Constitution', sub: 'Marka kimliği ve kurallar',  iconBg: '#a78bfa', iconText: '◈', screen: 'brand'        },
        { label: 'Templates',          sub: 'Tasarım ailesi yönetimi',    iconBg: '#60a5fa', iconText: '⬢', screen: 'templates'    },
        { label: 'Insights',           sub: 'Sosyal medya performansı',   iconBg: '#34d399', iconText: '↗', screen: 'insights'     },
        { label: 'Web Trafiği',        sub: 'Google Analytics verileri',  iconBg: '#60a5fa', iconText: '🌐', screen: 'visitors'    },
        { label: 'Reklamlar',           sub: 'Meta & Google reklam yönetimi', iconBg: '#f59e0b', iconText: '📣', screen: 'ads'     },
      ],
    },
    {
      title: 'AI Operasyonları',
      items: [
        { label: 'Mission Hub',       sub: 'Otonom kampanya yönetimi',          iconBg: '#7c3aed', iconText: '✦', screen: 'missions',         },
        { label: 'Reels Studio',      sub: 'Fotoğraf + Prompt → AI Reels',      iconBg: '#f43f5e', iconText: '▶', screen: 'reels-studio',     },
        { label: 'Canva Şablonlarım', sub: 'Kendi brand template\'leriniz',     iconBg: '#00c4cc', iconText: '◧', screen: 'canva-templates',  },
        { label: 'Marka Kuralları',   sub: 'Öğrenme önerileri & onay',          iconBg: '#10b981', iconText: '◈', screen: 'brand-rules',      },
        { label: 'Agents',            sub: 'AI ajan durumu ve sağlık',           iconBg: '#a78bfa', iconText: '◉', screen: 'agents',           },
        { label: 'Notifications',     sub: 'Bildirimler ve uyarılar',            iconBg: '#60a5fa', iconText: '◍', screen: 'notifications', badge: 3 },
      ],
    },
    {
      title: 'Ayarlar',
      items: [
        {
          label: 'Entegrasyonlar',
          sub: `${connectedCount}/${integrations.length} bağlı`,
          iconBg: '#34d399', iconText: '⟳', screen: 'settings',
          badge: !integrations.every((i) => i.connected) ? '1' : undefined,
        },
        { label: 'Plan & Kullanım', sub: 'Abonelik ve kota detayları', iconBg: '#a78bfa', iconText: '◇', screen: 'billing' },
      ],
    },
  ];

  return (
    <div style={{ minHeight: '100dvh', background: t.bg, paddingBottom: 100, transition: 'background 300ms' }}>
      {/* Header / Brand card */}
      <div style={{ padding: '60px 24px 24px', borderBottom: `0.5px solid ${t.separator}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{
            width: 54, height: 54, borderRadius: 16,
            background: t.isDark ? 'linear-gradient(135deg,#7c3aed,#6366f1)' : 'linear-gradient(135deg,#7c3aed,#a78bfa)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 800, color: '#fff',
            boxShadow: '0 4px 12px rgba(124,58,237,0.3)',
          }}>
            {initials}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.02em' }}>{user?.displayName ?? 'Lokum Bodrum'}</div>
            <div style={{ fontSize: 12, color: t.textTertiary, marginTop: 2 }}>{user?.email ?? 'Workspace · Premium Plan'}</div>
          </div>
        </div>

        {/* Integration quick status */}
        <div style={{ display: 'flex', gap: 6 }}>
          {integrations.map((intg) => (
            <div key={intg.name} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 20,
              background: intg.connected ? `${intg.color}10` : (t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'),
              border: `0.5px solid ${intg.connected ? intg.color + '25' : t.separator}`,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: intg.connected ? intg.color : t.textMuted, display: 'inline-block' }} />
              <span style={{ fontSize: 10, color: intg.connected ? intg.color : t.textMuted, fontWeight: 500 }}>
                {intg.name.split(' ')[0]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Theme toggle */}
      <div style={{ padding: '16px 24px 0' }}>
        <button
          onClick={toggle}
          style={{
            width: '100%', padding: '14px 18px', borderRadius: 14, cursor: 'pointer',
            ...t.surfaceCard,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: t.accentDim, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>
              {t.isDark ? '☀' : '🌙'}
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: t.textPrimary }}>{t.isDark ? 'Light Moda Geç' : 'Dark Moda Geç'}</span>
          </div>
          <div style={{
            width: 44, height: 26, borderRadius: 13,
            background: t.isDark ? t.accent : 'rgba(0,0,0,0.1)',
            position: 'relative', transition: 'background 200ms',
          }}>
            <div style={{
              position: 'absolute', top: 3, left: t.isDark ? 21 : 3,
              width: 20, height: 20, borderRadius: '50%',
              background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              transition: 'left 200ms',
            }} />
          </div>
        </button>
      </div>

      {/* Menu groups */}
      {groups.map((group) => (
        <div key={group.title} style={{ padding: '20px 24px 0' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: t.labelColor, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>
            {group.title}
          </div>
          <div style={{ ...t.surfaceGroup }}>
            {group.items.map((item, i) => (
              <button
                key={item.label}
                onClick={() => navigate(item.screen)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 18px', width: '100%', textAlign: 'left', cursor: 'pointer',
                  background: 'transparent',
                  ...(i < group.items.length - 1 ? t.surfaceRow : {}),
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: `${item.iconBg}14`,
                  border: `0.5px solid ${item.iconBg}20`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, color: item.iconBg, fontWeight: 600,
                }}>
                  {item.iconText}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: t.textPrimary, display: 'flex', alignItems: 'center', gap: 7 }}>
                    {item.label}
                    {item.badge !== undefined && (
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 20, background: t.warningDim, color: t.warning, fontWeight: 700 }}>
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: t.textTertiary, marginTop: 1 }}>{item.sub}</div>
                </div>
                <IcoChevronRight size={14} color={t.textMuted} strokeWidth={2} />
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Logout */}
      <div style={{ padding: '20px 24px 0' }}>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          style={{
            width: '100%', padding: '14px 18px', borderRadius: 14,
            cursor: loggingOut ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 12,
            background: t.dangerDim, border: `0.5px solid ${t.danger}20`,
            opacity: loggingOut ? 0.6 : 1,
          }}
        >
          <IcoLogout size={16} color={t.danger} />
          <span style={{ fontSize: 14, fontWeight: 600, color: t.danger }}>
            {loggingOut ? 'Çıkış yapılıyor...' : 'Çıkış Yap'}
          </span>
        </button>
      </div>

      {/* Version */}
      <div style={{ padding: '20px 24px 0', textAlign: 'center' }}>
        <span style={{ fontSize: 11, color: t.textMuted }}>SmartAgency v2.4.1 · AI Creative OS</span>
      </div>
    </div>
  );
}
