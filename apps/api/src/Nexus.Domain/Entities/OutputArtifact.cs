using Nexus.Domain.Common;
using Nexus.Domain.Enums;

namespace Nexus.Domain.Entities;

public class OutputArtifact : TenantEntity, ISoftDeletable
{
    public Guid TaskId { get; set; }
    public Guid? AgentRunId { get; set; }
    public ArtifactType ArtifactType { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public string ContentUrl { get; set; } = string.Empty;
    public string Metadata { get; set; } = "{}";
    public int Version { get; set; } = 1;
    public bool IsLatest { get; set; } = true;
    public ReviewStatus ReviewStatus { get; set; } = ReviewStatus.Pending;
    public bool IsDeleted { get; set; }
    public DateTime? DeletedAt { get; set; }

    public TaskItem? Task { get; set; }
    public AgentRun? AgentRun { get; set; }
    public ICollection<ReviewDecision> Reviews { get; set; } = new List<ReviewDecision>();
}
