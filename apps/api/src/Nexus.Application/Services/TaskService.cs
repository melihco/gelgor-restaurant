using Nexus.Contracts.Dtos;
using TaskStatus = Nexus.Domain.Enums.TaskStatus;

namespace Nexus.Application.Services;

public interface ITaskService
{
    Task<List<TaskDto>> GetRecentTasksAsync(Guid tenantId, int limit = 80, CancellationToken cancellationToken = default);
    Task<List<TaskDto>> GetTasksByBriefAsync(Guid briefId, CancellationToken cancellationToken = default);
    Task<TaskDto?> GetTaskByIdAsync(Guid taskId, CancellationToken cancellationToken = default);
    Task<TaskDto> UpdateTaskStatusAsync(Guid taskId, TaskStatus newStatus, CancellationToken cancellationToken = default);
    Task<TaskDto> AssignTaskAsync(Guid taskId, Guid agentId, CancellationToken cancellationToken = default);
}
