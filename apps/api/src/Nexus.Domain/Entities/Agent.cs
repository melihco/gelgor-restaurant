using Nexus.Domain.Common;
using Nexus.Domain.Enums;

namespace Nexus.Domain.Entities;

public class Agent : TenantEntity, ISoftDeletable
{
    public Guid OfficeId { get; set; }
    public Guid? ZoneId { get; set; }
    public AgentType AgentType { get; set; }
    public string Name { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string AvatarUrl { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public AgentState State { get; set; } = AgentState.Idle;
    public bool IsEnabled { get; set; } = true;
    public decimal DeskPositionX { get; set; }
    public decimal DeskPositionY { get; set; }
    public decimal DeskPositionZ { get; set; }
    public Guid? CurrentTaskId { get; set; }
    public string Configuration { get; set; } = "{}";
    public string SystemPrompt { get; set; } = string.Empty;
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }

    public Office? Office { get; set; }
    public OfficeZone? Zone { get; set; }
    public TaskItem? CurrentTask { get; set; }
    public ICollection<AgentCapability> Capabilities { get; set; } = new List<AgentCapability>();
    public ICollection<TaskAssignment> TaskAssignments { get; set; } = new List<TaskAssignment>();
    public ICollection<AgentRun> Runs { get; set; } = new List<AgentRun>();
    public ICollection<AgentMemoryReference> MemoryReferences { get; set; } = new List<AgentMemoryReference>();
}
