export interface MetaAdAccount {
  id: string;
  name: string;
  currency: string;
  status: number;
  timezone?: string;
}

export interface BoostPostParams {
  workspaceId: string;
  artifactId: string;
  igMediaId?: string;
  caption: string;
  objective: 'OUTCOME_AWARENESS' | 'OUTCOME_ENGAGEMENT' | 'OUTCOME_TRAFFIC';
  budgetTl: number;
  durationDays: number;
  adAccountId?: string;
}

export interface BoostPostResult {
  campaignId: string;
  status: string;
  estimatedReach: number;
  message?: string;
}

export interface MetaCampaign {
  id: string;
  artifactId: string;
  campaignId: string;
  adsetId: string;
  adId: string;
  objective: string;
  budgetTl: number;
  durationDays: number;
  status: 'PAUSED' | 'ACTIVE' | 'COMPLETED' | string;
  estimatedReach: number;
  actualReach: number;
  spendTl: number;
  impressions: number;
  clicks: number;
  createdAt: string;
}
