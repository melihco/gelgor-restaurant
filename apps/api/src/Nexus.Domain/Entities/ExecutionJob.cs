using Nexus.Domain.Common;
using Nexus.Domain.Enums;

namespace Nexus.Domain.Entities;

public class ExecutionJob : BaseEntity
{
    public Guid SuggestedActionId { get; set; }
    public ExecutionJobStatus Status { get; set; } = ExecutionJobStatus.Queued;
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public int RetryCount { get; set; }
    public string ErrorMessage { get; set; } = string.Empty;
    public string ProviderResponse { get; set; } = "{}";
    public bool Success { get; set; }
    public string ResultData { get; set; } = "{}";
    public string AuditLog { get; set; } = "{}";

    public SuggestedAction? SuggestedAction { get; set; }
}
