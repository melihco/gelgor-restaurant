import type { ISODateString, UUID } from './common';
import type { BrandProfileSnapshot } from './brand';
import type { ProductionBrandContextSnapshot } from './production';

export interface ProductionIdeaContract {
  id: string;
  headline: string;
  caption: string;
  cta?: string;
  hashtags?: string[];
  contentType: string;
  mood?: string;
  strategicPurpose?: string;
  eventDetails?: Record<string, string>;
}

export interface MissionExecutionRequest {
  missionId: UUID;
  workspaceId: UUID;
  nodeKey: string;
  taskType: string;
  brand: BrandProfileSnapshot;
  productionContext?: ProductionBrandContextSnapshot;
  inputData: Record<string, unknown>;
  initiatedBy: 'system' | 'operator' | 'scheduler';
}

export interface ProductionJobRequest {
  workspaceId: UUID;
  missionId?: UUID;
  nodeKey?: string;
  brand: BrandProfileSnapshot;
  productionContext?: ProductionBrandContextSnapshot;
  ideas: ProductionIdeaContract[];
  requestedAt: ISODateString;
  requestedBy: 'system' | 'operator';
  flags?: {
    bundleCards?: boolean;
    force?: boolean;
  };
}
