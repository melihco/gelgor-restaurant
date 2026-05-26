using Nexus.Domain.Common;

namespace Nexus.Domain.Entities;

public class TaskDependency : BaseEntity
{
    public Guid TaskId { get; set; }
    public Guid DependsOnTaskId { get; set; }
    public bool IsSatisfied { get; set; }

    public TaskItem? Task { get; set; }
    public TaskItem? DependsOnTask { get; set; }
}
