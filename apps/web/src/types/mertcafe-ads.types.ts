export type MertcafeGoal = 'engagement' | 'reach' | 'traffic' | 'messages';

export interface MertcafeStatus {
  api_key?: string;
  instagram_connected: boolean;
  meta_ads_connected: boolean;
}

export interface MertcafeConnectMetaAdsParams {
  adsAccountId: string;
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
