'use client';

import { useState } from 'react';
import { useAuthStore } from '../auth-store';
import { apiClient, toUserFriendlyApiError } from '@/lib/api-client';
import { setSessionToken } from '@/lib/session-token';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { invalidateTenantBrandQueries } from '@/lib/query-client-bridge';
import { SmartAgencyLogo } from '@/components/brand/SmartAgencyLogo';

interface LoginScreenProps {
  onSignup?: () => void;
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M3 3l18 18M10.58 10.58A2 2 0 0012 15a2 2 0 001.42-.58M9.88 4.24A10.94 10.94 0 0112 5c5.52 0 10 4.5 10 7a10.6 10.6 0 01-2.16 2.78M6.11 6.11A10.94 10.94 0 002 12c0 2.5 4.48 7 10 7 1.74 0 3.37-.4 4.79-1.08"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function resolveLoginErrorMessage(friendly: ReturnType<typeof toUserFriendlyApiError>): string {
  if (friendly.status === 401 || friendly.status === 403) {
    return 'E-posta veya şifre hatalı.';
  }
  if (friendly.status === 0) {
    const detail = (friendly.detail || '').toLowerCase();
    if (detail.includes('timed out') || detail.includes('timeout') || detail.includes('aborted')) {
      return 'Sunucu yanıt vermiyor. Lütfen birkaç saniye sonra tekrar deneyin.';
    }
    return 'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.';
  }
  if (friendly.status === 502 || friendly.status === 503 || friendly.status === 504) {
    return 'Hizmet geçici olarak kullanılamıyor. Lütfen kısa süre sonra tekrar deneyin.';
  }
  if (friendly.status === 500) {
    return process.env.NODE_ENV === 'development'
      ? 'Sunucu yanıt veremedi. Nexus API (5050) çalışıyor mu kontrol edin.'
      : 'Sunucu hatası oluştu. Lütfen daha sonra tekrar deneyin.';
  }
  return friendly.detail || friendly.title || 'Giriş yapılamadı.';
}

export function LoginScreen({ onSignup }: LoginScreenProps) {
  const { setUser } = useAuthStore();
  const { setWorkspace, setTenantFromSession } = useWorkspaceStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async (event?: React.FormEvent) => {
    event?.preventDefault();
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
      setError(resolveLoginErrorMessage(toUserFriendlyApiError(e, 'Giriş yapılamadı.')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="onboarding-shell onboarding-shell--login">
      <div className="onboarding-ambient" aria-hidden />

      <header className="onboarding-header onboarding-header--login">
        <SmartAgencyLogo variant="full" priority className="login-logo" />
      </header>

      <main className="onboarding-main onboarding-login-main">
        <h1 className="onboarding-title onboarding-title--step">Giriş Yap</h1>
        <p className="onboarding-lead onboarding-lead--step">
          Marka panelinize ve AI üretim ekibinize erişin.
        </p>

        <form className="onboarding-auth-form" onSubmit={handleLogin} noValidate>
          <div className="onboarding-fields">
            <label className="onboarding-field">
              <span className="onboarding-field-label">E-posta</span>
              <input
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="siz@firma.com"
                autoComplete="email"
                inputMode="email"
                enterKeyHint="next"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className={`onboarding-input${email.trim() ? ' onboarding-input--filled' : ''}${error ? ' onboarding-input--error' : ''}`}
              />
            </label>

            <label className="onboarding-field">
              <span className="onboarding-field-label">Şifre</span>
              <div className="auth-password-wrap">
                <input
                  type={showPass ? 'text' : 'password'}
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  enterKeyHint="go"
                  className={`onboarding-input auth-password-input${password.trim() ? ' onboarding-input--filled' : ''}${error ? ' onboarding-input--error' : ''}`}
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? 'Şifreyi gizle' : 'Şifreyi göster'}
                >
                  <EyeIcon open={showPass} />
                </button>
              </div>
            </label>
          </div>

          {error && <p className="onboarding-error">{error}</p>}

          <div className="onboarding-actions onboarding-actions--login">
            <button
              type="submit"
              disabled={loading}
              className={`onboarding-cta${loading ? ' onboarding-cta--loading' : ''}`}
            >
              {loading ? 'Giriş yapılıyor…' : 'Giriş Yap'}
            </button>
          </div>
        </form>
      </main>

      <footer className="onboarding-footer onboarding-footer--login">
        {onSignup && (
          <button type="button" onClick={onSignup} className="onboarding-login-link">
            Hesabınız yok mu? <span>Yeni hesap oluştur</span>
          </button>
        )}
        <p className="auth-legal-note">SmartAgency · Güvenli oturum</p>
      </footer>
    </div>
  );
}
