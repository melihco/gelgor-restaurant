using Microsoft.EntityFrameworkCore;
using Nexus.Application.Interfaces;
using Nexus.Application.Services;
using Nexus.Contracts.Dtos;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;
using Nexus.Infrastructure.Data;
using TaskStatus = Nexus.Domain.Enums.TaskStatus;

namespace Nexus.Infrastructure.Services;

public class BriefService : IBriefService
{
    private readonly NexusDbContext _dbContext;
    private readonly IAiProvider _aiProvider;

    public BriefService(NexusDbContext dbContext, IAiProvider aiProvider)
    {
        _dbContext = dbContext;
        _aiProvider = aiProvider;
    }

    public async Task<List<BriefDto>> GetBriefsByTenantAsync(Guid tenantId, CancellationToken cancellationToken = default)
    {
        return await _dbContext.Briefs
            .Where(b => b.TenantId == tenantId)
            .OrderByDescending(b => b.CreatedAt)
            .Select(b => MapToDto(b))
            .ToListAsync(cancellationToken);
    }

    public async Task<BriefDto?> GetBriefByIdAsync(Guid briefId, Guid tenantId, CancellationToken cancellationToken = default)
    {
        // Tenant filter prevents IDOR — only briefs owned by the requesting tenant are returned.
        var brief = await _dbContext.Briefs
            .FirstOrDefaultAsync(b => b.Id == briefId && b.TenantId == tenantId, cancellationToken);

        return brief != null ? MapToDto(brief) : null;
    }

    public async Task<BriefDto> CreateBriefAsync(Guid tenantId, Guid userId, CreateBriefRequest request, CancellationToken cancellationToken = default)
    {
        var brief = new Brief
        {
            TenantId = tenantId,
            CreatedByUserId = userId,
            Title = request.Title,
            Description = request.Description,
            RawContent = request.RawContent,
            Status = BriefStatus.Draft,
            CreatedBy = userId,
            UpdatedBy = userId
        };

        _dbContext.Briefs.Add(brief);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return MapToDto(brief);
    }

    public async Task<BriefDto> SubmitBriefAsync(Guid briefId, Guid tenantId, CancellationToken cancellationToken = default)
    {
        // Tenant filter prevents cross-tenant submission attacks.
        var brief = await _dbContext.Briefs
            .FirstOrDefaultAsync(b => b.Id == briefId && b.TenantId == tenantId, cancellationToken)
            ?? throw new InvalidOperationException("Brief not found");

        brief.Status = BriefStatus.Decomposing;
        brief.SubmittedAt = DateTime.UtcNow;
        brief.UpdatedBy = Guid.Empty;

        await _dbContext.SaveChangesAsync(cancellationToken);

        _ = DecomposeBriefInBackgroundAsync(brief, cancellationToken);

        return MapToDto(brief);
    }

    private async Task DecomposeBriefInBackgroundAsync(Brief brief, CancellationToken cancellationToken)
    {
        try
        {
            var decomposeResult = await _aiProvider.DecomposeBriefAsync(brief, cancellationToken);

            brief.Status = BriefStatus.Decomposed;
            brief.DecomposedAt = DateTime.UtcNow;

            var tasks = new List<TaskItem>();
            var taskMap = new Dictionary<int, TaskItem>();

            for (int i = 0; i < decomposeResult.Tasks.Count; i++)
            {
                var taskDecomp = decomposeResult.Tasks[i];
                var task = new TaskItem
                {
                    BriefId = brief.Id,
                    TenantId = brief.TenantId,
                    Title = taskDecomp.Title,
                    Description = taskDecomp.Description,
                    AgentType = Enum.Parse<AgentType>(taskDecomp.AgentType),
                    Status = TaskStatus.Pending,
                    Priority = TaskPriority.Normal,
                    EstimatedDurationMinutes = taskDecomp.EstimatedMinutes,
                    CreatedBy = brief.UpdatedBy,
                    UpdatedBy = brief.UpdatedBy
                };

                tasks.Add(task);
                taskMap[i] = task;
            }

            await _dbContext.TaskItems.AddRangeAsync(tasks, cancellationToken);
            await _dbContext.SaveChangesAsync(cancellationToken);

            for (int i = 0; i < decomposeResult.Tasks.Count; i++)
            {
                var taskDecomp = decomposeResult.Tasks[i];
                foreach (var depIndex in taskDecomp.DependsOnTaskIndices)
                {
                    var dependency = new TaskDependency
                    {
                        TaskId = taskMap[i].Id,
                        DependsOnTaskId = taskMap[depIndex].Id,
                        IsSatisfied = false,
                        CreatedBy = brief.UpdatedBy,
                        UpdatedBy = brief.UpdatedBy
                    };

                    _dbContext.TaskDependencies.Add(dependency);
                }
            }

            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (Exception ex)
        {
            brief.Status = BriefStatus.Failed;
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
    }

    private static BriefDto MapToDto(Brief brief)
    {
        return new BriefDto(
            brief.Id,
            brief.Title,
            brief.Description,
            brief.Status,
            brief.CreatedAt,
            brief.UpdatedAt,
            brief.SubmittedAt,
            brief.DecomposedAt,
            brief.CompletedAt);
    }
}
