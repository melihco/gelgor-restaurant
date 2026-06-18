/**
 * Mertcafe / Meta publish auth — OAuth bağlıyken eski account_id göndermeyi önler.
 * "One or more accounts do not belong to this user" hatasının ana nedeni budur.
 */
import type { MertcafeStatus } from '@/types/mertcafe-ads.types';

export type MertcafePublishAuth = {
  useOAuthAccount: boolean;
  accountId?: string;
};

export type MertcafePublishReadiness = {
  ready: boolean;
  blocker?: string;
  code?: 'MISSING_API_KEY' | 'OAUTH_REQUIRED' | 'ACCOUNT_REQUIRED';
};

/** Feed / Outputs — same rules as POST /api/mertcafe/post. */
export function resolveMertcafePublishReadiness(
  status: Pick<
    MertcafeStatus,
    | 'has_tenant_api_key'
    | 'instagram_connected'
    | 'use_oauth_account'
    | 'publish_account_id'
    | 'oauth_account_id'
  >,
): MertcafePublishReadiness {
  if (!status.has_tenant_api_key) {
    return {
      ready: false,
      code: 'MISSING_API_KEY',
      blocker:
        'Bu tenant için Mertcafe API anahtarı yok. Marka → Ayarlar → Mertcafe → Tenant kaydı oluşturun.',
    };
  }

  const publishAuth = resolveMertcafePublishAuth(status);
  if (publishAuth.useOAuthAccount) {
    if (!status.instagram_connected) {
      return {
        ready: false,
        code: 'OAUTH_REQUIRED',
        blocker:
          'Instagram OAuth bağlı değil. Marka → Ayarlar → Mertcafe → «Farklı hesaba geç (OAuth)» ile @sunuevent hesabını bağlayın, ardından «OAuth senkronu».',
      };
    }
    return { ready: true };
  }

  if (!publishAuth.accountId) {
    return {
      ready: false,
      code: 'ACCOUNT_REQUIRED',
      blocker:
        'Yayın hesabı seçilmemiş. Ayarlar → Mertcafe → kayıtlı hesaplardan seçin veya OAuth senkronu yapın.',
    };
  }

  return { ready: true };
}

export function assertMertcafePublishReady(
  status: Parameters<typeof resolveMertcafePublishReadiness>[0],
): void {
  const gate = resolveMertcafePublishReadiness(status);
  if (!gate.ready) {
    throw new Error(gate.blocker || 'Mertcafe yayın yapılandırması eksik.');
  }
}

export function resolveMertcafePublishAuth(
  status: Pick<
    MertcafeStatus,
    'instagram_connected' | 'use_oauth_account' | 'publish_account_id' | 'oauth_account_id'
  >,
): MertcafePublishAuth {
  const publishId = String(status.publish_account_id ?? '').trim();
  const oauthId = String(status.oauth_account_id ?? '').trim();

  // Instagram OAuth aktif → bağlı hesabı kullan, eski manuel ID gönderme
  if (status.instagram_connected) {
    if (status.use_oauth_account || !publishId) {
      return { useOAuthAccount: true };
    }
    // Kayıtlı ID OAuth hesabıyla eşleşiyorsa yine OAuth yolu (account_id gereksiz)
    if (oauthId && publishId === oauthId) {
      return { useOAuthAccount: true };
    }
    // Eski / başka kullanıcıya ait account_id — OAuth'a düş
    return { useOAuthAccount: true };
  }

  if (status.use_oauth_account) {
    return { useOAuthAccount: true };
  }
  if (publishId) {
    return { useOAuthAccount: false, accountId: publishId };
  }
  return { useOAuthAccount: true };
}

/** Meta / Mertcafe hata metinlerini operatör için Türkçeleştir. */
export function humanizeMertcafePublishError(raw: string): string {
  const msg = raw.trim();
  if (!msg) return msg;
  if (/do not belong to this user/i.test(msg)) {
    return (
      'Instagram hesabı bu API anahtarıyla eşleşmiyor. ' +
      'Marka Ayarları → Mertcafe → OAuth senkronu yapın veya doğru yayın hesabını seçin.'
    );
  }
  if (/session has expired|invalid oauth/i.test(msg)) {
    return 'Instagram oturumu süresi dolmuş. Ayarlar’dan yeniden OAuth ile bağlanın.';
  }
  if (/aspect ratio|outside Instagram's allowed range|Crop it to 4:5/i.test(msg)) {
    return (
      'Görsel Instagram feed oranına uygun değil (story/reel formatı). ' +
      'Sistem otomatik kırpmayı denedi; tekrar paylaşın veya 4:5 feed görseli üretin.'
    );
  }
  return msg;
}
