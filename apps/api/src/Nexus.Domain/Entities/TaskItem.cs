using Nexus.Domain.Common;
using Nexus.Domain.Enums;
using TaskStatus = Nexus.Domain.Enums.TaskStatus;

namespace Nexus.Domain.Entities;

public class TaskItem : TenantEntity, ISoftDeletable
{
    public Guid BriefId { get; set; }
    public Guid? ParentTaskId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public AgentType AgentType { get; set; }
    public TaskStatus Status { get; set; } = TaskStatus.Pending;
    public TaskPriority Priority { get; set; } = TaskPriority.Normal;
    public int EstimatedDurationMinutes { get; set; }
    public int? ActualDurationMinutes { get; set; }
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public string ErrorMessage { get; set; } = string.Empty;
    public int RetryCount { get; set; }
    public int MaxRetries { get; set; } = 3;
    public string Input { get; set; } = "{}";
    public string Output { get; set; } = "{}";
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }

    public Brief? Brief { get; set; }
    public TaskItem? ParentTask { get; set; }
    public ICollection<TaskItem> SubTasks { get; set; } = new List<TaskItem>();
    public ICollection<TaskDependency> Dependencies { get; set; } = new List<TaskDependency>();
    public ICollection<TaskDependency> DependentTasks { get; set; } = new List<TaskDependency>();
    public ICollection<TaskAssignment> Assignments { get; set; } = new List<TaskAssignment>();
    public ICollection<OutputArtifact> Artifacts { get; set; } = new List<OutputArtifact>();
    public ICollection<ReviewDecision> Reviews { get; set; } = new List<ReviewDecision>();
    public ICollection<AgentRun> AgentRuns { get; set; } = new List<AgentRun>();
}
