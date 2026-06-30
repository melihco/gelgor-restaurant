using Microsoft.EntityFrameworkCore;
using Nexus.Application.Common;
using Nexus.Application.Services;
using Nexus.Contracts.Dtos;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;
using Nexus.Infrastructure.Data;
using TaskStatus = Nexus.Domain.Enums.TaskStatus;

namespace Nexus.Infrastructure.Services;

public class TaskService : ITaskService
{
    private readonly NexusDbContext _dbContext;

    public TaskService(NexusDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<List<TaskDto>> GetRecentTasksAsync(Guid tenantId, int limit = 80, CancellationToken cancellationToken = default)
    {
        var safeLimit = Math.Clamp(limit, 1, 200);
        return await _dbContext.TaskItems
            .Where(t => t.TenantId == tenantId)
            .OrderByDescending(t => t.UpdatedAt)
            .ThenByDescending(t => t.CreatedAt)
            .Take(safeLimit)
            .Select(t => MapToDto(t))
            .ToListAsync(cancellationToken);
    }

    public async Task<List<TaskDto>> GetTasksByBriefAsync(Guid briefId, Guid tenantId, CancellationToken cancellationToken = default)
    {
        return await _dbContext.TaskItems
            .Where(t => t.BriefId == briefId && t.TenantId == tenantId)
            .OrderBy(t => t.CreatedAt)
            .Select(t => MapToDto(t))
            .ToListAsync(cancellationToken);
    }

    public async Task<TaskDto?> GetTaskByIdAsync(Guid taskId, Guid tenantId, CancellationToken cancellationToken = default)
    {
        var task = await _dbContext.TaskItems
            .FirstOrDefaultAsync(t => t.Id == taskId && t.TenantId == tenantId, cancellationToken);

        return task != null ? MapToDto(task) : null;
    }

    public async Task<TaskDto> UpdateTaskStatusAsync(Guid taskId, Guid tenantId, TaskStatus newStatus, CancellationToken cancellationToken = default)
    {
        var task = await _dbContext.TaskItems
            .FirstOrDefaultAsync(t => t.Id == taskId && t.TenantId == tenantId, cancellationToken)
            ?? throw new NotFoundException("Task not found");

        task.Status = newStatus;
        task.UpdatedBy = Guid.Empty;

        if (newStatus == TaskStatus.InProgress && !task.StartedAt.HasValue)
        {
            task.StartedAt = DateTime.UtcNow;
        }

        if (newStatus == TaskStatus.Completed || newStatus == TaskStatus.Failed || newStatus == TaskStatus.Cancelled)
        {
            task.CompletedAt = DateTime.UtcNow;
        }

        await _dbContext.SaveChangesAsync(cancellationToken);

        return MapToDto(task);
    }

    public async Task<TaskDto> AssignTaskAsync(Guid taskId, Guid tenantId, Guid agentId, CancellationToken cancellationToken = default)
    {
        var task = await _dbContext.TaskItems
            .FirstOrDefaultAsync(t => t.Id == taskId && t.TenantId == tenantId, cancellationToken)
            ?? throw new NotFoundException("Task not found");

        var agent = await _dbContext.Agents
            .FirstOrDefaultAsync(a => a.Id == agentId && a.TenantId == tenantId, cancellationToken)
            ?? throw new NotFoundException("Agent not found");

        var existingAssignment = await _dbContext.TaskAssignments
            .FirstOrDefaultAsync(ta => ta.TaskId == taskId && ta.AgentId == agentId, cancellationToken);

        if (existingAssignment == null)
        {
            var assignment = new TaskAssignment
            {
                TaskId = taskId,
                AgentId = agentId,
                Status = TaskStatus.Pending,
                CreatedBy = Guid.Empty,
                UpdatedBy = Guid.Empty
            };

            _dbContext.TaskAssignments.Add(assignment);
        }

        task.UpdatedBy = Guid.Empty;
        await _dbContext.SaveChangesAsync(cancellationToken);

        return MapToDto(task);
    }

    private static TaskDto MapToDto(TaskItem task)
    {
        return new TaskDto(
            task.Id,
            task.BriefId,
            task.Title,
            task.Description,
            task.AgentType,
            task.Status,
            task.Priority,
            task.EstimatedDurationMinutes,
            task.ActualDurationMinutes,
            task.ErrorMessage,
            task.CreatedAt,
            task.UpdatedAt,
            task.StartedAt,
            task.CompletedAt);
    }
}
