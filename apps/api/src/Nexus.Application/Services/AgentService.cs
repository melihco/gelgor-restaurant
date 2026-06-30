using Nexus.Contracts.Dtos;
using Nexus.Domain.Enums;

namespace Nexus.Application.Services;

public interface IAgentService
{
    Task<List<AgentDto>> GetAgentsByTenantAsync(Guid tenantId, CancellationToken cancellationToken = default);
    Task<List<AgentDto>> GetAgentsByOfficeAsync(Guid officeId, Guid tenantId, CancellationToken cancellationToken = default);
    Task<AgentType?> TryGetTenantAgentTypeAsync(Guid agentId, Guid tenantId, CancellationToken cancellationToken = default);
    Task<AgentDetailDto?> GetAgentDetailAsync(Guid agentId, Guid tenantId, CancellationToken cancellationToken = default);
    Task<AgentDto> UpdateAgentStateAsync(Guid agentId, Guid tenantId, AgentState newState, CancellationToken cancellationToken = default);
    Task<AgentExecutionDto> ExecuteAgentAsync(Guid agentId, Guid tenantId, ExecuteAgentRequest request, CancellationToken cancellationToken = default);
    Task<CancelStuckExecutionResultDto> CancelStuckAgentExecutionAsync(
        Guid agentId,
        Guid tenantId,
        Guid? agentRunId,
        int minAgeMinutes,
        bool force,
        CancellationToken cancellationToken = default);
    Task<WorkflowStartResponse> StartGrowthWorkflowAsync(Guid tenantId, CancellationToken cancellationToken = default);
}
