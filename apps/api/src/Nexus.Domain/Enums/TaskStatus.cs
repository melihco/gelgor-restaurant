namespace Nexus.Domain.Enums;

public enum TaskStatus
{
    Pending,
    Queued,
    InProgress,
    WaitingForDependency,
    WaitingForApproval,
    Approved,
    Rejected,
    RevisionRequested,
    Completed,
    Failed,
    Cancelled
}
