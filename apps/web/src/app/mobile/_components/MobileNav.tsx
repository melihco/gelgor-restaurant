'use client';
import { useMobileStore, NavTab } from './mobile-store';
import { useTheme } from './theme-context';

// ─── Native minimal tab icons (SVG paths) ─────────────────────────────
const TABS: { id: NavTab; label: string; active: string; idle: string }[] = [
  {
    id: 'home', label: 'Ana Sayfa',
    active: 'M4 10.5L12 3l8 7.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V10.5zM9 21V13h6v8',
    idle:   'M4 10.5L12 3l8 7.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V10.5zM9 21V13h6v8',
  },
  {
    id: 'content', label: 'Feed',
    active: 'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
    idle:   'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
  },
  { id: 'ai',      label: 'AI',      active: '', idle: '' }, // special
  {
    id: 'reviews', label: 'Yorumlar',
    active: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM8 10h8M8 14h5',
    idle:   'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM8 10h8M8 14h5',
  },
  {
    id: 'more', label: 'Keşfet',
    active: 'M4 6h16M4 12h16M4 18h7',
    idle:   'M4 6h16M4 12h16M4 18h7',
  },
];

export function MobileNav() {
  const { activeTab, setTab } = useMobileStore();
  const { t } = useTheme();

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
      background: t.navBg,
      backdropFilter: 'blur(40px) saturate(180%)',
      WebkitBackdropFilter: 'blur(40px) saturate(180%)',
      borderTop: `0.5px solid ${t.navBorder}`,
      paddingBottom: 'env(safe-area-inset-bottom, 6px)',
    }}>
      <div style={{ display: 'flex', height: 60, minHeight: 60 }}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const color = isActive ? t.navActiveColor : t.navIdleColor;

          return (
            <button key={tab.id} onClick={() => setTab(tab.id)} aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
              style={{
                flex: 1, minHeight: 44, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 4,
                border: 'none', background: 'transparent', cursor: 'pointer',
                padding: '6px 2px', position: 'relative',
              }}>
              {/* Top indicator */}
              {isActive && (
                <div style={{
                  position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                  width: 14, height: 2.5, borderRadius: '0 0 3px 3px',
                  background: t.navActiveColor,
                }} />
              )}

              {/* AI tab — filled star */}
              {tab.id === 'ai' ? (
                <div style={{ position: 'relative' }}>
                  {isActive && (
                    <div style={{
                      position: 'absolute', inset: -10, borderRadius: '50%',
                      background: `radial-gradient(circle, ${t.navActiveColor}20 0%, transparent 70%)`,
                      animation: 'breathe 2.4s ease-in-out infinite',
                    }} />
                  )}
                  <svg width="22" height="22" viewBox="0 0 24 24" fill={isActive ? color : 'none'} stroke={color} strokeWidth={isActive ? 0 : 1.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2c0 4.97-4.03 9-9 9 4.97 0 9 4.03 9 9 0-4.97 4.03-9 9-9-4.97 0-9-4.03-9-9z" />
                  </svg>
                </div>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color}
                  strokeWidth={isActive ? 2.1 : 1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d={tab.active} />
                </svg>
              )}

              <span style={{
                fontSize: 11, fontWeight: isActive ? 600 : 500,
                letterSpacing: '0.01em', lineHeight: 1.1,
                color: isActive ? t.navActiveColor : t.navIdleColor,
              }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
