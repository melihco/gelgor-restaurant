'use client';
import { useState } from 'react';
import { useTheme } from '../theme-context';
import { useAuthStore } from '../auth-store';
import { apiClient, toUserFriendlyApiError } from '@/lib/api-client';
import { setSessionToken } from '@/lib/session-token';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { invalidateTenantBrandQueries } from '@/lib/query-client-bridge';
import { SmartAgencyLogo } from '@/components/brand/SmartAgencyLogo';

export function LoginScreen() {
  const { t } = useTheme();
  const { setUser } = useAuthStore();
  const { setWorkspace, setTenantFromSession } = useWorkspaceStore();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('E-posta ve şifre gerekli.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const session = await apiClient.login({ email: email.trim(), password });
      if (session.token) setSessionToken(session.token);
      if (session.tenantId && session.officeId) setWorkspace(session.tenantId, session.officeId);
      const me = await apiClient.getCurrentUserSecurity();
      const tenantId = me.tenantId || session.tenantId;
      if (tenantId) {
        setTenantFromSession(tenantId);
        invalidateTenantBrandQueries(tenantId);
      }
      setUser(me);
    } catch (e: unknown) {
      const friendly = toUserFriendlyApiError(e, 'Giriş yapılamadı.');
      if (friendly.status === 401 || friendly.status === 403) {
        setError('E-posta veya şifre hatalı.');
      } else if (friendly.status === 0) {
        setError('Sunucuya bağlanılamıyor. Nexus API (5050) çalışıyor mu?');
      } else {
        setError(friendly.detail || friendly.title);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      height: '100dvh', background: t.bg,
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'center',
      padding: '0 32px',
      transition: 'background 300ms',
    }}>
      {/* Logo */}
      <div style={{ marginBottom: 44, textAlign: 'center' }}>
        <SmartAgencyLogo
          variant="full"
          priority
          className="mx-auto block h-auto w-[220px] max-w-[min(220px,85vw)]"
        />
      </div>

      {/* Form */}
      <div style={{ width: '100%', maxWidth: 360 }}>
        {/* Email */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: t.labelColor, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: 7 }}>
            E-posta
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="ornek@sirket.com"
            autoComplete="email"
            style={{
              width: '100%', padding: '15px 16px', borderRadius: 14, outline: 'none', boxSizing: 'border-box',
              fontSize: 15,
              background: t.isDark ? 'rgba(255,255,255,0.05)' : '#fff',
              border: error
                ? `0.5px solid ${t.danger}`
                : `0.5px solid ${t.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)'}`,
              color: t.textPrimary,
              boxShadow: !t.isDark ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
            }}
          />
        </div>

        {/* Password */}
        <div style={{ marginBottom: error ? 10 : 20 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: t.labelColor, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: 7 }}>
            Şifre
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="••••••••"
              autoComplete="current-password"
              style={{
                width: '100%', padding: '15px 48px 15px 16px', borderRadius: 14, outline: 'none', boxSizing: 'border-box',
                fontSize: 15,
                background: t.isDark ? 'rgba(255,255,255,0.05)' : '#fff',
                border: error
                  ? `0.5px solid ${t.danger}`
                  : `0.5px solid ${t.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)'}`,
                color: t.textPrimary,
                boxShadow: !t.isDark ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
              }}
            />
            <button
              onClick={() => setShowPass(!showPass)}
              style={{
                position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 14, color: t.textMuted,
              }}
            >
              {showPass ? '🙈' : '👁'}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '10px 14px', borderRadius: 10, marginBottom: 16,
            background: t.dangerDim, border: `0.5px solid ${t.danger}25`,
            fontSize: 13, color: t.danger, lineHeight: 1.4,
          }}>
            {error}
          </div>
        )}

        {/* Login button */}
        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: '100%', padding: '17px', borderRadius: 16,
            fontSize: 16, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
            background: t.isDark
              ? 'linear-gradient(135deg, rgba(124,58,237,0.9), rgba(99,102,241,0.8))'
              : 'linear-gradient(135deg, #7c3aed, #6366f1)',
            border: 'none', color: '#fff',
            boxShadow: '0 4px 16px rgba(124,58,237,0.35)',
            opacity: loading ? 0.7 : 1,
            letterSpacing: '0.01em',
          }}
        >
          {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
          <div style={{ flex: 1, height: '0.5px', background: t.separator }} />
          <span style={{ fontSize: 11, color: t.textMuted }}>veya</span>
          <div style={{ flex: 1, height: '0.5px', background: t.separator }} />
        </div>

        {/* Demo fill */}
        <button
          onClick={() => { setEmail('info@sunuevent.com'); setPassword('SmartAgency2026!'); }}
          style={{
            width: '100%', padding: '14px', borderRadius: 14,
            fontSize: 13, fontWeight: 500, cursor: 'pointer',
            ...( t.isDark
              ? { background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.09)', color: t.textTertiary }
              : { background: 'rgba(0,0,0,0.04)', border: '0.5px solid rgba(0,0,0,0.08)', color: '#6b6b73' }
            ),
          }}
        >
          Demo bilgileriyle doldur
        </button>
      </div>

      {/* Footer */}
      <p style={{ position: 'absolute', bottom: 32, fontSize: 11, color: t.textMuted, textAlign: 'center' }}>
        SmartAgency AI · v2.4.1
      </p>
    </div>
  );
}
