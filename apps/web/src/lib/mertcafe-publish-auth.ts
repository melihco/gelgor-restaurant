/**
 * Mertcafe / Meta publish auth — OAuth bağlıyken eski account_id göndermeyi önler.
 * "One or more accounts do not belong to this user" hatasının ana nedeni budur.
 */
import type { MertcafeStatus } from '@/types/mertcafe-ads.types';

export type MertcafePublishAuth = {
  useOAuthAccount: boolean;
  accountId?: string;
};

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
  return msg;
}
