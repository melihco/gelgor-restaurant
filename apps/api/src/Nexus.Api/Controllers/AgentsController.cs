using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Nexus.Application.Services;
using Nexus.Contracts.Dtos;
using Nexus.Contracts.Events;
using Nexus.Domain.Enums;
using TaskStatus = Nexus.Domain.Enums.TaskStatus;
using Nexus.Api.Hubs;
using Nexus.Api.Services;

namespace Nexus.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AgentsController : ControllerBase
{
    private readonly IAgentService _agentService;
    private readonly IUsageQuotaService _usageQuotaService;
    private readonly IHubContext<OfficeHub, IOfficeHubClient> _hubContext;
    private readonly IRequestContext _requestContext;
    private readonly IPermissionService _permissionService;

    public AgentsController(
        IAgentService agentService,
        IUsageQuotaService usageQuotaService,
        IHubContext<OfficeHub, IOfficeHubClient> hubContext,
        IRequestContext requestContext,
        IPermissionService permissionService)
    {
        _agentService = agentService;
        _usageQuotaService = usageQuotaService;
        _hubContext = hubContext;
        _requestContext = requestContext;
        _permissionService = permissionService;
    }

    [HttpGet]
    public async Task<ActionResult<List<AgentDto>>> GetAgents(CancellationToken cancellationToken)
    {
        var agents = await _agentService.GetAgentsByTenantAsync(_requestContext.TenantId, cancellationToken);
        return Ok(agents);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<AgentDetailDto>> GetAgentById(Guid id, CancellationToken cancellationToken)
    {
        var agent = await _agentService.GetAgentDetailAsync(id, _requestContext.TenantId, cancellationToken);
        if (agent == null)
            return NotFound();

        return Ok(agent);
    }

    [HttpPut("{id}/state")]
    public async Task<ActionResult<AgentDto>> UpdateAgentState(Guid id, UpdateAgentStateRequest request, CancellationToken cancellationToken)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.AgentsExecute, cancellationToken))
            return Forbid();

        var agent = await _agentService.UpdateAgentStateAsync(id, _requestContext.TenantId, request.NewState, cancellationToken);
        return Ok(agent);
    }

    [HttpPost("{id}/execute")]
    public async Task<ActionResult<AgentExecutionDto>> ExecuteAgent(Guid id, ExecuteAgentRequest request, CancellationToken cancellationToken)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.AgentsExecute, cancellationToken))
            return Forbid();

        var agentType = await _agentService.TryGetTenantAgentTypeAsync(id, _requestContext.TenantId, cancellationToken);
        if (!agentType.HasValue)
            return NotFound();

        var quota = await _usageQuotaService.EnsureAgentRunAllowedAsync(_requestContext.TenantId, cancellationToken: cancellationToken);
        if (!quota.Allowed)
            return StatusCode(StatusCodes.Status402PaymentRequired, quota);

        var tokenBudget = await _usageQuotaService.EnsureTokenBudgetAllowedAsync(_requestContext.TenantId, cancellationToken);
        if (!tokenBudget.Allowed)
            return StatusCode(StatusCodes.Status402PaymentRequired, tokenBudget);

        var entitlement = await _usageQuotaService.EnsureAgentTypeEntitledAsync(_requestContext.TenantId, agentType.Value, cancellationToken);
        if (!entitlement.Allowed)
            return StatusCode(StatusCodes.Status403Forbidden, entitlement);

        var result = await _agentService.ExecuteAgentAsync(id, _requestContext.TenantId, request, cancellationToken);
        await _usageQuotaService.RecordAgentRunAsync(_requestContext.TenantId, cancellationToken: CancellationToken.None);

        if (result.OfficeId != Guid.Empty)
        {
            await _hubContext.NotifyTaskStatusChanged(
                result.TenantId,
                result.OfficeId,
                new TaskStatusChangedEvent
                {
                    TaskId = result.TaskId,
                    Title = result.TaskTitle,
                    NewStatus = result.Status,
                    ChangedAt = DateTime.UtcNow
                });

            if (result.ArtifactId is Guid artifactId)
            {
                await _hubContext.NotifyOutputReady(
                    result.TenantId,
                    result.OfficeId,
                    new OutputReadyEvent
                    {
                        ArtifactId = artifactId,
                        TaskId = result.TaskId,
                        ArtifactType = result.ArtifactType?.ToString() ?? "GenericDocument",
                        Title = result.ArtifactTitle ?? result.TaskTitle,
                        CreatedAt = DateTime.UtcNow
                    });
            }
        }

        return Ok(result);
    }

    /// <summary>
    /// Marks an in-progress agent run/task as cancelled in the database and frees the agent.
    /// Does not terminate the external Python Crew process; use infra controls if a worker is truly stuck.
    /// </summary>
    [HttpPost("{id}/cancel-stuck-execution")]
    public async Task<ActionResult<CancelStuckExecutionResultDto>> CancelStuckExecution(
        Guid id,
        [FromQuery] Guid? agentRunId = null,
        [FromQuery] int minAgeMinutes = 10,
        [FromQuery] bool force = false,
        [FromBody] CancelStuckAgentExecutionRequest? body = null,
        CancellationToken cancellationToken = default)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.AgentsExecute, cancellationToken))
            return Forbid();

        var agentType = await _agentService.TryGetTenantAgentTypeAsync(id, _requestContext.TenantId, cancellationToken);
        if (!agentType.HasValue)
            return NotFound();

        var resolvedRunId = body?.AgentRunId ?? agentRunId;

        CancelStuckExecutionResultDto result;
        try
        {
            result = await _agentService.CancelStuckAgentExecutionAsync(
                id,
                _requestContext.TenantId,
                resolvedRunId,
                minAgeMinutes,
                force,
                cancellationToken);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }

        if (result.Cancelled && result.OfficeId != Guid.Empty && result.TaskId.HasValue)
        {
            await _hubContext.NotifyTaskStatusChanged(
                _requestContext.TenantId,
                result.OfficeId,
                new TaskStatusChangedEvent
                {
                    TaskId = result.TaskId.Value,
                    Title = result.TaskTitle,
                    NewStatus = TaskStatus.Cancelled,
                    ChangedAt = DateTime.UtcNow
                });

            var detail = await _agentService.GetAgentDetailAsync(id, _requestContext.TenantId, cancellationToken);
            if (detail != null)
            {
                await _hubContext.NotifyAgentStateChanged(
                    _requestContext.TenantId,
                    result.OfficeId,
                    new AgentStateChangedEvent
                    {
                        AgentId = id,
                        AgentName = detail.DisplayName,
                        NewState = AgentState.Idle,
                        ChangedAt = DateTime.UtcNow
                    });
            }
        }

        return Ok(result);
    }

    [HttpPost("workflows/growth-recovery/start")]
    public async Task<ActionResult<WorkflowStartResponse>> StartGrowthRecoveryWorkflow(CancellationToken cancellationToken)
    {
        if (!await _permissionService.HasPermissionAsync(Permissions.AgentsExecute, cancellationToken))
            return Forbid();

        AgentType[] workflowAgentTypes =
        {
            AgentType.AnalyticsAnalyst,
            AgentType.GoogleAdsAnalyst,
            AgentType.InstagramContentGenerator,
            AgentType.AiCeo,
        };
        var workflowEntitlement = await _usageQuotaService.EnsureAgentTypesEntitledAsync(_requestContext.TenantId, workflowAgentTypes, cancellationToken);
        if (!workflowEntitlement.Allowed)
            return StatusCode(StatusCodes.Status403Forbidden, workflowEntitlement);

        var quota = await _usageQuotaService.EnsureAgentRunAllowedAsync(_requestContext.TenantId, requestedUnits: 4, cancellationToken);
        if (!quota.Allowed)
            return StatusCode(StatusCodes.Status402PaymentRequired, quota);

        var tokenBudget = await _usageQuotaService.EnsureTokenBudgetAllowedAsync(_requestContext.TenantId, cancellationToken);
        if (!tokenBudget.Allowed)
            return StatusCode(StatusCodes.Status402PaymentRequired, tokenBudget);

        var result = await _agentService.StartGrowthWorkflowAsync(_requestContext.TenantId, cancellationToken);
        await _usageQuotaService.RecordAgentRunAsync(_requestContext.TenantId, units: Math.Max(1, result.Steps.Count), cancellationToken);

        if (result.Steps.Count > 0)
        {
            await _hubContext.NotifyTaskStatusChanged(
                _requestContext.TenantId,
                Guid.Empty,
                new TaskStatusChangedEvent
                {
                    TaskId = result.Steps[0].TaskId,
                    Title = result.Title,
                    NewStatus = result.Steps[0].Status,
                    ChangedAt = DateTime.UtcNow
                });
        }

        return Ok(result);
    }

    [HttpGet("office/{officeId}")]
    public async Task<ActionResult<List<AgentDto>>> GetAgentsByOffice(Guid officeId, CancellationToken cancellationToken)
    {
        var agents = await _agentService.GetAgentsByOfficeAsync(officeId, _requestContext.TenantId, cancellationToken);
        return Ok(agents);
    }
}
