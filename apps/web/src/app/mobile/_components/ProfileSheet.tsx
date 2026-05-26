'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from './theme-context';
import { useAuthStore } from './auth-store';
import { useMobileStore } from './mobile-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { IcoLogout, IcoChevronRight, IcoNotification } from './Icons';
import { apiClient } from '@/lib/api-client';
import { TokenWalletCard } from './TokenWalletCard';

interface ProfileSheetProps {
  onClose: () => void;
}

export function ProfileSheet({ onClose }: ProfileSheetProps) {
  const { t, toggle } = useTheme();
  const { user, setUser } = useAuthStore();
  const { navigate } = useMobileStore();
  const { tenantId } = useWorkspaceStore();
  const [loggingOut, setLoggingOut] = useState(false);

  const { data: usageCost } = useQuery({
    queryKey: ['usage-cost', tenantId],
    queryFn: () => apiClient.getWorkspaceUsageCost(tenantId!, 30),
    enabled: Boolean(tenantId),
    staleTime: 60_000,
  });

  const initials = user?.displayName
    ? user.displayName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : 'LB';

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await apiClient.logout();
    } finally {
      setUser(null);
      onClose();
    }
  };

  const menuItems = [
    {
      label: 'Bildirimler',
      sub: '3 okunmamış',
      icon: '◍',
      color: '#60a5fa',
      onTap: () => { navigate('notifications'); onClose(); },
    },
    {
      label: 'Ayarlar',
      sub: 'Entegrasyonlar & plan',
      icon: '⟳',
      color: '#34d399',
      onTap: () => { navigate('settings'); onClose(); },
    },
    {
      label: 'Plan & Kullanım',
      sub: 'Premium Plan',
      icon: '◇',
      color: '#a78bfa',
      onTap: () => { navigate('billing'); onClose(); },
    },
  ];

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  const sheet = (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          animation: 'fadeIn 200ms ease both',
        }}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
        background: t.isDark ? '#111116' : '#f2f2f7',
        borderRadius: '24px 24px 0 0',
        paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
        animation: 'slideUp 280ms cubic-bezier(0.4,0,0.2,1) both',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.3)',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, marginBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: t.isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }} />
        </div>

        {/* User card */}
        <div style={{ padding: '12px 24px 20px', borderBottom: `0.5px solid ${t.separator}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 16, flexShrink: 0,
              background: t.isDark
                ? 'linear-gradient(135deg, #7c3aed, #6366f1)'
                : 'linear-gradient(135deg, #7c3aed, #a78bfa)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 800, color: '#fff',
              boxShadow: '0 4px 12px rgba(124,58,237,0.3)',
            }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: t.textPrimary, marginBottom: 2 }}>
                {user?.displayName ?? 'Lokum Bodrum'}
              </div>
              <div style={{ fontSize: 13, color: t.textTertiary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email ?? 'lokumbodrum@example.com'}
              </div>
            </div>
            {/* Theme toggle */}
            <button
              onClick={toggle}
              style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                ...t.iconBtn,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: 16,
              }}
            >
              {t.isDark ? '☀' : '🌙'}
            </button>
          </div>
        </div>

        {usageCost?.token_wallet && (
          <div style={{ padding: '0 24px 16px' }}>
            <TokenWalletCard wallet={usageCost.token_wallet} compact t={t} />
          </div>
        )}

        {/* Menu items */}
        <div style={{ padding: '8px 24px' }}>
          {menuItems.map((item, i) => (
            <button
              key={item.label}
              onClick={item.onTap}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                width: '100%', padding: '14px 0', textAlign: 'left',
                background: 'transparent', cursor: 'pointer',
                borderBottom: i < menuItems.length - 1 ? `0.5px solid ${t.separator}` : 'none',
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: `${item.color}12`, border: `0.5px solid ${item.color}20`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, color: item.color, fontWeight: 600,
              }}>
                {item.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: t.textPrimary }}>{item.label}</div>
                <div style={{ fontSize: 12, color: t.textTertiary, marginTop: 1 }}>{item.sub}</div>
              </div>
              <IcoChevronRight size={14} color={t.textMuted} strokeWidth={2} />
            </button>
          ))}
        </div>

        {/* Logout */}
        <div style={{ padding: '8px 24px 0' }}>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            style={{
              width: '100%', padding: '15px 18px', borderRadius: 16,
              background: t.dangerDim, border: `0.5px solid ${t.danger}22`,
              cursor: loggingOut ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 12,
              opacity: loggingOut ? 0.6 : 1,
            }}
          >
            <IcoLogout size={18} color={t.danger} />
            <span style={{ fontSize: 15, fontWeight: 700, color: t.danger }}>
              {loggingOut ? 'Çıkış yapılıyor...' : 'Çıkış Yap'}
            </span>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </>
  );

  return createPortal(sheet, document.body);
}
