/**
 * Ergonomic accessors for the auto-generated Nexus customer API types.
 *
 * The underlying `nexus-api.d.ts` is generated from the .NET OpenAPI document
 * (see `scripts/generate-api-types.mjs`). Do not edit it by hand. Import the
 * helpers below instead of reaching into `components["schemas"][...]`:
 *
 *   import type { NexusSchema } from '@/lib/generated/nexus-schemas';
 *   type Usage = NexusSchema<'UsageQuotaSummaryDto'>;
 */
import type { components, operations, paths } from './nexus-api';

export type NexusSchemas = components['schemas'];

/** A single generated DTO by its OpenAPI schema name. */
export type NexusSchema<K extends keyof NexusSchemas> = NexusSchemas[K];

export type NexusOperations = operations;
export type NexusPaths = paths;
