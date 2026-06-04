export type MertcafeGoal = 'engagement' | 'reach' | 'traffic' | 'messages';

export interface MertcafeSavedAccount {
  id: string;
  label?: string;
}

export interface MertcafeStatus {
  api_key?: string;
  instagram_connected: boolean;
  meta_ads_connected: boolean;
  /** Tenant-bound publish account (never another tenant's global env). */
  instagram_account_id?: string | null;
  publish_account_id?: string | null;
  oauth_account_id?: string | null;
  saved_accounts?: MertcafeSavedAccount[];
  workspace_id?: string | null;
  has_tenant_api_key?: boolean;
  has_publish_account?: boolean;
  is_tenant_ready?: boolean;
  api_key_source?: 'theme' | 'env_map' | 'global_fallback' | 'none';
  account_source?: 'theme' | 'env_map' | 'none';
  use_oauth_account?: boolean;
  instagram_username?: string | null;
}

export interface MertcafeProvisionResult {
  ok: boolean;
  workspace_id: string;
  api_key?: string;
  connect_ready?: boolean;
  auth_url_works?: boolean;
  auth_url?: string | null;
  replaced?: boolean;
  message?: string;
  theme?: Record<string, unknown> | null;
}

export interface MertcafeSetActiveAccountParams {
  workspaceId: string;
  accountId: string;
  label?: string;
  remember?: boolean;
}

export interface MertcafeInstagramConnect {
  auth_url: string;
  workspaceId?: string | null;
}

export interface MertcafeConnectMetaAdsParams {
  adsAccountId: string;
  workspaceId?: string;
}

export interface MertcafeBusinessSetupParams {
  workspaceId: string;
  businessName: string;
  menu: string;
  hours: string;
  address?: string;
  phone?: string;
  priceRange?: string;
  notes?: string;
}

export interface MertcafeBoostParams {
  postId: string;
  goal: MertcafeGoal;
  budget: number;
  durationDays: number;
}

export interface MertcafeAdCreateParams {
  imageUrl: string;
  headline: string;
  body: string;
  linkUrl?: string;
  goal: MertcafeGoal;
  budget: number;
  budgetType: 'daily' | 'lifetime';
  durationDays?: number;
  placement?: 'all' | 'instagram_feed' | 'instagram_story' | 'instagram_reels' | 'facebook_feed';
  countries?: string[];
  gender?: 'all' | 'male' | 'female';
  ageMin?: number;
  ageMax?: number;
  interests?: string[];
  callToAction?: 'LEARN_MORE' | 'SHOP_NOW' | 'CONTACT_US' | 'BOOK_TRAVEL' | 'MESSAGE_PAGE';
}
