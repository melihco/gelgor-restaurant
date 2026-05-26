using Nexus.Domain.Common;
using Nexus.Domain.Enums;
using TaskStatus = Nexus.Domain.Enums.TaskStatus;

namespace Nexus.Domain.Entities;

public class TaskAssignment : BaseEntity
{
    public Guid TaskId { get; set; }
    public Guid AgentId { get; set; }
    public DateTime AssignedAt { get; set; } = DateTime.UtcNow;
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public TaskStatus Status { get; set; } = TaskStatus.Pending;

    public TaskItem? Task { get; set; }
    public Agent? Agent { get; set; }
}
