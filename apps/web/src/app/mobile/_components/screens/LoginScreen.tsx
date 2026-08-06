'use client';

import { useState } from 'react';
import { useAuthStore } from '../auth-store';
import { apiClient, toUserFriendlyApiError } from '@/lib/api-client';
import { setSessionToken } from '@/lib/session-token';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { clearSessionScopedQueries, invalidateTenantBrandQueries } from '@/lib/query-client-bridge';
import { SmartAgencyLogo } from '@/components/brand/SmartAgencyLogo';
import { OnboardingChromeBackdrop } from '../OnboardingChrome';

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

type AuthView = 'login' | 'forgot' | 'reset';

export function LoginScreen({ onSignup }: LoginScreenProps) {
  const { setUser } = useAuthStore();
  const { setWorkspace, setTenantFromSession } = useWorkspaceStore();

  const [view, setView] = useState<AuthView>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('E-posta ve şifre gerekli.');
      return;
    }
    setLoading(true);
    setError('');
    setInfo('');
    try {
      // Drop stale JWT so a previous session cannot pollute login /me headers.
      setSessionToken(null);
      clearSessionScopedQueries();
      const session = await apiClient.login({ email: email.trim(), password });
      if (!session?.token) {
        setError('Giriş yanıtı geçersiz. Lütfen tekrar deneyin.');
        return;
      }
      setSessionToken(session.token);
      if (session.tenantId && session.officeId) setWorkspace(session.tenantId, session.officeId);
      const me = await apiClient.getCurrentUserSecurity();
      const tenantId = me.tenantId || session.tenantId;
      if (tenantId) {
        setTenantFromSession(tenantId);
        invalidateTenantBrandQueries(tenantId);
      }
      setUser(me);
    } catch (e: unknown) {
      setSessionToken(null);
      setError(resolveLoginErrorMessage(toUserFriendlyApiError(e, 'Giriş yapılamadı.')));
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!email.trim()) {
      setError('E-posta gerekli.');
      return;
    }
    setLoading(true);
    setError('');
    setInfo('');
    try {
      const res = await apiClient.forgotPassword(email.trim());
      setInfo(res.message || 'E-posta kayıtlıysa sıfırlama bağlantısı oluşturuldu.');
      if (res.resetToken) {
        setResetToken(res.resetToken);
        setView('reset');
        setInfo('Geliştirme ortamı: token alındı. Yeni şifrenizi girin.');
      }
    } catch (e: unknown) {
      setError(toUserFriendlyApiError(e, 'İstek gönderilemedi.').detail || 'İstek gönderilemedi.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!resetToken.trim() || password.trim().length < 8) {
      setError('Geçerli token ve en az 8 karakter şifre gerekli.');
      return;
    }
    setLoading(true);
    setError('');
    setInfo('');
    try {
      await apiClient.resetPassword(resetToken.trim(), password);
      setInfo('Şifreniz güncellendi. Giriş yapabilirsiniz.');
      setPassword('');
      setResetToken('');
      setView('login');
    } catch (e: unknown) {
      setError(toUserFriendlyApiError(e, 'Şifre güncellenemedi.').detail || 'Şifre güncellenemedi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="onboarding-shell onboarding-shell--login">
      <OnboardingChromeBackdrop showMark={false} />

      {/* Upper band — logo optically centers the top third */}
      <header className="login-brand-band">
        <SmartAgencyLogo variant="full" priority className="login-logo" />
      </header>

      <main className="login-main">
        <form
          className="login-form"
          onSubmit={view === 'login' ? handleLogin : view === 'forgot' ? handleForgot : handleReset}
          noValidate
        >
          <div className="onboarding-fields login-fields">
            {(view === 'login' || view === 'forgot') && (
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
                  enterKeyHint={view === 'forgot' ? 'send' : 'next'}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className={`onboarding-input${email.trim() ? ' onboarding-input--filled' : ''}${error ? ' onboarding-input--error' : ''}`}
                />
              </label>
            )}

            {view === 'reset' && (
              <label className="onboarding-field">
                <span className="onboarding-field-label">Sıfırlama kodu</span>
                <input
                  type="text"
                  name="resetToken"
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  placeholder="E-posta / destek kodu"
                  autoComplete="one-time-code"
                  enterKeyHint="next"
                  className={`onboarding-input${resetToken.trim() ? ' onboarding-input--filled' : ''}${error ? ' onboarding-input--error' : ''}`}
                />
              </label>
            )}

            {(view === 'login' || view === 'reset') && (
              <label className="onboarding-field">
                <span className="onboarding-field-label">{view === 'reset' ? 'Yeni şifre' : 'Şifre'}</span>
                <div className="auth-password-wrap">
                  <input
                    type={showPass ? 'text' : 'password'}
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete={view === 'reset' ? 'new-password' : 'current-password'}
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
            )}
          </div>

          {view === 'login' && (
            <div style={{ marginTop: 8, textAlign: 'right' }}>
              <button
                type="button"
                className="onboarding-login-link"
                style={{ minHeight: 44, fontSize: 14 }}
                onClick={() => {
                  setError('');
                  setInfo('');
                  setView('forgot');
                }}
              >
                Şifremi unuttum
              </button>
            </div>
          )}

          {error && <p className="onboarding-error login-error">{error}</p>}
          {info && !error && (
            <p className="login-error" style={{ color: '#86efac' }}>{info}</p>
          )}

          <div className="login-actions">
            <button
              type="submit"
              disabled={loading}
              className={`onboarding-cta${loading ? ' onboarding-cta--loading' : ''}`}
            >
              {loading
                ? 'Bekleyin…'
                : view === 'login'
                  ? 'Giriş yap'
                  : view === 'forgot'
                    ? 'Sıfırlama iste'
                    : 'Şifreyi güncelle'}
            </button>
            {view !== 'login' && (
              <button
                type="button"
                className="onboarding-login-link"
                style={{ marginTop: 12, minHeight: 44 }}
                onClick={() => {
                  setError('');
                  setInfo('');
                  setView('login');
                }}
              >
                Girişe dön
              </button>
            )}
          </div>
        </form>
      </main>

      <footer className="login-footer">
        {onSignup && view === 'login' && (
          <button type="button" onClick={onSignup} className="onboarding-login-link">
            Hesabınız yok mu? <span>Yeni hesap oluştur</span>
          </button>
        )}
        <p className="auth-legal-note">SmartAgency · Güvenli oturum</p>
      </footer>
    </div>
  );
}
