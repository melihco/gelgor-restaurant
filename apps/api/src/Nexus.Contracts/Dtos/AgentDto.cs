using System.Text.Json;
using Nexus.Domain.Enums;
using TaskStatus = Nexus.Domain.Enums.TaskStatus;

namespace Nexus.Contracts.Dtos;

public record AgentDto(
    Guid Id,
    string Name,
    string DisplayName,
    string AvatarUrl,
    AgentType AgentType,
    AgentState State,
    bool IsEnabled,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record UpdateAgentStateRequest(
    Guid AgentId,
    AgentState NewState);

public record AgentDetailDto(
    Guid Id,
    string Name,
    string DisplayName,
    string AvatarUrl,
    string Description,
    AgentType AgentType,
    AgentState State,
    bool IsEnabled,
    Guid? CurrentTaskId,
    List<AgentCapabilityDto> Capabilities,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record AgentCapabilityDto(
    Guid Id,
    string Name,
    string Description,
    int Priority);

public record ExecuteAgentRequest(
    string? TaskType,
    JsonElement? InputData);

public record AgentExecutionDto(
    Guid TaskId,
    Guid AgentRunId,
    Guid? ArtifactId,
    Guid TenantId,
    Guid OfficeId,
    Guid AgentId,
    string AgentName,
    string TaskTitle,
    string? ArtifactTitle,
    ArtifactType? ArtifactType,
    TaskStatus Status,
    string Message);

public record WorkflowStepDto(
    Guid TaskId,
    string Title,
    AgentType AgentType,
    TaskStatus Status,
    Guid? DependsOnTaskId);

public record WorkflowStartResponse(
    Guid BriefId,
    string WorkflowType,
    string Title,
    List<WorkflowStepDto> Steps,
    string Message);

public record CancelStuckExecutionResultDto(
    bool Cancelled,
    string Message,
    Guid? TaskId,
    Guid? AgentRunId,
    Guid OfficeId,
    string TaskTitle);

/// <summary>Optional body for <c>POST .../cancel-stuck-execution</c>; when null, the active in-progress run for the agent is used.</summary>
public record CancelStuckAgentExecutionRequest(Guid? AgentRunId = null);
