using Nexus.Domain.Common;
using Nexus.Domain.Enums;

namespace Nexus.Domain.Entities;

public class ReviewDecision : BaseEntity
{
    public Guid ArtifactId { get; set; }
    public Guid TaskId { get; set; }
    public Guid ReviewedByUserId { get; set; }
    public ReviewStatus Status { get; set; }
    public string Comment { get; set; } = string.Empty;

    public OutputArtifact? Artifact { get; set; }
    public TaskItem? Task { get; set; }
    public User? ReviewedByUser { get; set; }
}
