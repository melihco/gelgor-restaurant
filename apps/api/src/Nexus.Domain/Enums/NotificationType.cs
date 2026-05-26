namespace Nexus.Domain.Enums;

public enum NotificationType
{
    TaskAssigned,
    TaskCompleted,
    TaskFailed,
    ApprovalRequired,
    ApprovalDecision,
    AgentStateChanged,
    BriefDecomposed,
    SystemAlert
}
