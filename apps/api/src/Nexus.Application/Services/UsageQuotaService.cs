using System.Collections.Generic;
using Nexus.Contracts.Dtos;
using Nexus.Domain.Enums;

namespace Nexus.Application.Services;

public record QuotaCheckResult(bool Allowed, string Code, string Message, int Used, int Limit);

public interface IUsageQuotaService
{
    Task<UsageQuotaSummaryDto> GetUsageSummaryAsync(Guid tenantId, CancellationToken cancellationToken = default);
    Task<QuotaCheckResult> EnsureAgentRunAllowedAsync(Guid tenantId, int requestedUnits = 1, CancellationToken cancellationToken = default);
    Task<QuotaCheckResult> EnsureTokenBudgetAllowedAsync(Guid tenantId, CancellationToken cancellationToken = default);
    Task RecordAgentRunAsync(Guid tenantId, int units = 1, CancellationToken cancellationToken = default);
    Task<QuotaCheckResult> EnsureProviderActionAllowedAsync(Guid tenantId, CancellationToken cancellationToken = default);
    Task<QuotaCheckResult> EnsureLiveProviderActionAllowedAsync(Guid tenantId, CancellationToken cancellationToken = default);

    /// <summary>Verifies the tenant's subscription package (<c>IncludedAgentTypes</c> JSON + add-ons) allows this agent type.</summary>
    Task<QuotaCheckResult> EnsureAgentTypeEntitledAsync(Guid tenantId, AgentType agentType, CancellationToken cancellationToken = default);

    /// <summary>Verifies all agent types can run under the tenant's subscription (e.g. multi-step workflows).</summary>
    Task<QuotaCheckResult> EnsureAgentTypesEntitledAsync(Guid tenantId, IReadOnlyCollection<AgentType> agentTypes, CancellationToken cancellationToken = default);
}
