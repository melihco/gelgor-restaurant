using Nexus.Domain.Enums;
using TaskStatus = Nexus.Domain.Enums.TaskStatus;

namespace Nexus.Contracts.Dtos;

public record TaskDto(
    Guid Id,
    Guid BriefId,
    string Title,
    string Description,
    AgentType AgentType,
    TaskStatus Status,
    TaskPriority Priority,
    int EstimatedDurationMinutes,
    int? ActualDurationMinutes,
    string ErrorMessage,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    DateTime? StartedAt,
    DateTime? CompletedAt);

public record UpdateTaskStatusRequest(
    Guid TaskId,
    TaskStatus Status);

public record AssignTaskRequest(
    Guid TaskId,
    Guid AgentId);
