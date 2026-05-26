using Nexus.Domain.Enums;
using TaskStatus = Nexus.Domain.Enums.TaskStatus;

namespace Nexus.Contracts.Events;

public class AgentStateChangedEvent
{
    public Guid AgentId { get; set; }
    public string AgentName { get; set; } = string.Empty;
    public AgentState NewState { get; set; }
    public DateTime ChangedAt { get; set; }
}

public class TaskStatusChangedEvent
{
    public Guid TaskId { get; set; }
    public string Title { get; set; } = string.Empty;
    public TaskStatus NewStatus { get; set; }
    public DateTime ChangedAt { get; set; }
}

public class NewNotificationEvent
{
    public Guid NotificationId { get; set; }
    public NotificationType Type { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

public class OutputReadyEvent
{
    public Guid ArtifactId { get; set; }
    public Guid TaskId { get; set; }
    public string ArtifactType { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

public class BriefDecomposedEvent
{
    public Guid BriefId { get; set; }
    public string BriefTitle { get; set; } = string.Empty;
    public int TaskCount { get; set; }
    public DateTime DecomposedAt { get; set; }
}

/// <summary>
/// Crew / LLM yürütmesi sürerken UI’nın executionLog ve süre bilgisini canlı güncellemesi için.
/// </summary>
public class AgentRunProgressEvent
{
    public Guid RunId { get; set; }
    public Guid TaskId { get; set; }
    public string TaskTitle { get; set; } = string.Empty;
    public string ExecutionLogJson { get; set; } = "{}";
    public DateTime At { get; set; }
}
