using Nexus.Domain.Common;
using Nexus.Domain.Enums;

namespace Nexus.Domain.Entities;

public class SuggestedAction : TenantEntity
{
    public Guid ArtifactId { get; set; }
    public string ActionType { get; set; } = string.Empty;
    public IntegrationProvider Provider { get; set; }
    public Guid? IntegrationConnectionId { get; set; }
    public string TargetRef { get; set; } = string.Empty;
    public string Payload { get; set; } = "{}";
    public bool ApprovalRequired { get; set; } = true;
    public ActionStatus Status { get; set; } = ActionStatus.Pending;
    public Guid? ApprovedBy { get; set; }
    public DateTime? ApprovedAt { get; set; }

    public OutputArtifact? Artifact { get; set; }
    public IntegrationConnection? IntegrationConnection { get; set; }
    public ICollection<ExecutionJob> ExecutionJobs { get; set; } = new List<ExecutionJob>();
}
