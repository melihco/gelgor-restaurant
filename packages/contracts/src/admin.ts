import type { MoneyAmount, UsageCounter, UUID } from './common';

export interface PlatformTenantSummary {
  workspaceId: UUID;
  tenantId: UUID;
  tenantName: string;
  brandName?: string | null;
  packageName?: string | null;
  status: 'active' | 'trial' | 'suspended' | 'inactive' | string;
  usersCount?: number;
  artifactsCount?: number;
  activeMissionsCount?: number;
  lastActivityAt?: string | null;
}

export interface PlatformHealthSummary {
  agentRuns24h: number;
  failedAgentRuns24h: number;
  executionJobs24h: number;
  failedExecutionJobs24h: number;
  tokensUsed24h: number;
  providerFailureRate: number;
}

export interface PlatformUsageSummary {
  dailyAiCost?: MoneyAmount;
  monthlyAiCost?: MoneyAmount;
  tokenWallet?: UsageCounter;
  agentRuns?: UsageCounter;
  providerActions?: UsageCounter;
}

export interface PlatformAdminOverview {
  generatedAt: string;
  currentUser: {
    userId: UUID;
    tenantId: UUID;
    tenantName: string;
    role: string;
    displayName: string;
    email: string;
    permissions: string[];
  };
  health: PlatformHealthSummary;
  usage: PlatformUsageSummary;
  tenants: PlatformTenantSummary[];
}
