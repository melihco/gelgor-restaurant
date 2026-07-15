'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../theme-context';
import { useTenantBrandContext } from '../TenantBrandProvider';
import { useMobileStore } from '../mobile-store';
import { useAuthStore } from '../auth-store';
import { apiClient } from '@/lib/api-client';
import { logoutFromBrowser } from '@/lib/browser-logout';
import { buildMoreMenuGroups } from '../mobile-client-config';
import { summarizeMobileIntegrations } from '@/lib/mobile-integration-status';
import { IcoLogout } from '../Icons';
import { MobileStackHeader, ThemeToggleButton } from '../ui-primitives';

// Icon paths per menu item type — premium SVG, no emoji
const ITEM_ICONS: Record<string, string> = {
  'İçerik Planı':      'M4 22V3M4 4h14l-4 5 4 5H4',
  'Performans':        'M3 20h18M5 20V12M9 20V8M13 20V4M17 20V10',
  'Entegrasyonlar':    'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  'Bildirimler':       'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  'Kullanım & Plan':   'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  'Google Yorumları':  'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  'Reklamlar':         'M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z',
  'Web Trafiği':       'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
  'AI Aktivite':       'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  'AI Ajanlar':        'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  'Reels Studio':      'M15 10l-4 4 6 2-2-6zM3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  'Marka Kuralları':   'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 0 0 1.946-.806 3.42 3.42 0 0 1 4.438 0 3.42 3.42 0 0 0 1.946.806 3.42 3.42 0 0 1 3.138 3.138 3.42 3.42 0 0 0 .806 1.946 3.42 3.42 0 0 1 0 4.438 3.42 3.42 0 0 0-.806 1.946 3.42 3.42 0 0 1-3.138 3.138 3.42 3.42 0 0 0-1.946.806 3.42 3.42 0 0 1-4.438 0 3.42 3.42 0 0 0-1.946-.806 3.42 3.42 0 0 1-3.138-3.138 3.42 3.42 0 0 0-.806-1.946 3.42 3.42 0 0 1 0-4.438 3.42 3.42 0 0 0 .806-1.946 3.42 3.42 0 0 1 3.138-3.138z',
  'Story Şablonları':  'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM10 9l5 3-5 3V9z',
  'Canva Şablonları':  'M4 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM14 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1zM4 15a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM14 15a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z',
  'Çıktılar (ham)':    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
};

const FALLBACK_ICON = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';

function MenuItemIcon({ iconBg, label }: { iconBg: string; label: string }) {
  const path = ITEM_ICONS[label] ?? FALLBACK_ICON;
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke={iconBg} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden
    >
      <path d={path} />
    </svg>
  );
}

/**
 * Menu body (groups + logout + footer) without the stack header/hero.
 * Rendered both inside the Marka hub (brand logo tap) and the legacy
 * `more` stack screen (reachable from the Instagram profile hamburger).
 */
export function MoreMenuPanel({ horizontalPadding = 22 }: { horizontalPadding?: number }) {
  const { t } = useTheme();
  const { navigate, setTab } = useMobileStore();
  const { setUser } = useAuthStore();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logoutFromBrowser();
    } finally {
      setUser(null);
    }
  };

  const { data: integrationConnections = [] } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => apiClient.getIntegrations(),
    staleTime: 60_000,
  });
  const { connectedCount, total: integrationTotal } =
    summarizeMobileIntegrations(integrationConnections);

  const groups = buildMoreMenuGroups({
    connectedCount,
    integrationTotal,
  });

  const openMenuItem = (screen: Parameters<typeof navigate>[0]) => {
    if (screen === 'brand') {
      setTab('brand');
      return;
    }
    if (screen === 'missions') {
      setTab('missions');
      return;
    }
    navigate(screen);
  };

  return (
    <>
      {/* ─── Menu Groups ─────────────────────────────────────────────── */}
      {groups.map(group => (
        <div key={group.title} style={{ padding: `18px ${horizontalPadding}px 0` }}>

          {/* Section label */}
          <div className="sa-chrome-eyebrow" style={{ marginBottom: 10 }}>
            {group.title}
          </div>

          {/* Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {group.items.map((item) => (
              <button
                key={item.label}
                type="button"
                className="sa-chrome-menu-row"
                onClick={() => openMenuItem(item.screen)}
              >
                <div className="sa-chrome-icon-tile">
                  <MenuItemIcon iconBg={item.iconBg} label={item.label} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 600, color: t.textPrimary,
                    display: 'flex', alignItems: 'center', gap: 7,
                    letterSpacing: '-0.01em',
                  }}>
                    {item.label}
                    {item.badge !== undefined && (
                      <span style={{
                        fontSize: 9.5, padding: '2px 6px', borderRadius: 20,
                        background: t.warningDim, color: t.warning, fontWeight: 800,
                      }}>
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: t.textTertiary, marginTop: 1.5 }}>
                    {item.sub}
                  </div>
                </div>

                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke={t.textMuted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* ─── Logout ───────────────────────────────────────────────────── */}
      <div style={{ padding: `18px ${horizontalPadding}px 0` }}>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          style={{
            width: '100%', padding: '13px 16px', borderRadius: 16,
            cursor: loggingOut ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 12,
            background: t.dangerDim,
            border: `0.5px solid rgba(248,113,113,0.20)`,
            opacity: loggingOut ? 0.55 : 1,
            transition: 'opacity 160ms ease',
          }}
        >
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'rgba(248,113,113,0.12)',
            border: '0.5px solid rgba(248,113,113,0.20)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <IcoLogout size={15} color={t.danger} />
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: t.danger, letterSpacing: '-0.01em' }}>
            {loggingOut ? 'Çıkış yapılıyor…' : 'Çıkış Yap'}
          </span>
        </button>
      </div>

      {/* ─── Footer ───────────────────────────────────────────────────── */}
      <div style={{ padding: `24px ${horizontalPadding}px 0`, textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 14px', borderRadius: 20,
          background: t.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
          border: `0.5px solid ${t.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: t.accent, opacity: 0.6,
          }} />
          <span style={{ fontSize: 11, color: t.textMuted, fontWeight: 500 }}>
            Smart Agency · Müşteri paneli
          </span>
        </div>
      </div>
    </>
  );
}

export function MoreMenu() {
  const { t, toggle } = useTheme();
  const tenantBrand = useTenantBrandContext();
  const { goBack, setTab } = useMobileStore();
  const { user } = useAuthStore();

  const displayName = user?.displayName ?? tenantBrand.brandName ?? 'İşletme';
  const initials    = displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const email       = user?.email ?? 'Smart Agency müşteri paneli';

  const { data: integrationConnections = [] } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => apiClient.getIntegrations(),
    staleTime: 60_000,
  });
  const { items: integrations } = summarizeMobileIntegrations(integrationConnections);

  return (
    <div style={{
      minHeight: '100dvh',
      paddingBottom: 104,
    }}>
      <MobileStackHeader
        t={t}
        title="Menü"
        onBack={goBack}
        sticky
        right={<ThemeToggleButton t={t} onToggle={toggle} />}
      />

      {/* ─── Profile Header ─────────────────────────────────────────── */}
      <div className="sa-chrome-profile-hero" style={{
        padding: '16px 22px 22px',
      }}>

        {/* Avatar + name — tap opens Marka tab */}
        <button
          type="button"
          onClick={() => setTab('brand')}
          aria-label="Marka ayarlarını aç"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            marginBottom: 18,
            width: '100%',
            padding: 0,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <div style={{
            width: 52, height: 52, borderRadius: 16, flexShrink: 0,
            background: 'linear-gradient(135deg, #4D7088 0%, #6A8EA0 55%, #8AABBD 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 900, color: '#fff',
            boxShadow: '0 6px 22px rgba(77,112,136,0.38), inset 0 1px 0 rgba(255,255,255,0.18)',
            border: '0.5px solid rgba(138,171,189,0.35)',
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sa-chrome-text" style={{
              fontSize: 17, fontWeight: 800,
              letterSpacing: '-0.03em', lineHeight: 1.2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {displayName}
            </div>
            <div style={{ fontSize: 11.5, color: t.textTertiary, marginTop: 3 }}>{email}</div>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke={t.textMuted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {/* Integration status chips */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {integrations.map(intg => (
            <div key={intg.provider} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 20,
              background: intg.connected
                ? `${intg.color}10`
                : (t.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'),
              border: `0.5px solid ${intg.connected ? intg.color + '28' : t.separator}`,
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%',
                background: intg.connected ? intg.color : t.textMuted,
                display: 'inline-block',
                boxShadow: intg.connected ? `0 0 4px ${intg.color}80` : 'none',
              }} />
              <span style={{
                fontSize: 10.5, fontWeight: 600,
                color: intg.connected ? intg.color : t.textMuted,
              }}>
                {intg.shortLabel}
              </span>
            </div>
          ))}
        </div>
      </div>

      <MoreMenuPanel />
    </div>
  );
}
