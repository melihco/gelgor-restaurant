using Nexus.Domain.Common;
using Nexus.Domain.Enums;
using TaskStatus = Nexus.Domain.Enums.TaskStatus;

namespace Nexus.Domain.Entities;

public class AgentRun : TenantEntity
{
    public Guid AgentId { get; set; }
    public Guid TaskId { get; set; }
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; set; }
    public TaskStatus Status { get; set; } = TaskStatus.InProgress;
    public int TokensUsed { get; set; }
    public string ProviderModel { get; set; } = string.Empty;
    public string ErrorMessage { get; set; } = string.Empty;
    public string ExecutionLog { get; set; } = "{}";

    public Agent? Agent { get; set; }
    public TaskItem? Task { get; set; }
    public ICollection<OutputArtifact> Artifacts { get; set; } = new List<OutputArtifact>();
}
