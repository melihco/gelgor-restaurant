using Microsoft.AspNetCore.SignalR;
using Nexus.Contracts.Events;

namespace Nexus.Api.Hubs;

public class OfficeHub : Hub<IOfficeHubClient>
{
    public async Task JoinOffice(Guid tenantId, Guid officeId)
    {
        var groupName = $"office-{tenantId}-{officeId}";
        await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
    }

    public async Task LeaveOffice(Guid tenantId, Guid officeId)
    {
        var groupName = $"office-{tenantId}-{officeId}";
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        await base.OnDisconnectedAsync(exception);
    }
}

public interface IOfficeHubClient
{
    Task AgentStateChanged(AgentStateChangedEvent evt);
    Task TaskStatusChanged(TaskStatusChangedEvent evt);
    Task NewNotification(NewNotificationEvent evt);
    Task OutputReady(OutputReadyEvent evt);
    Task BriefDecomposed(BriefDecomposedEvent evt);
    Task AgentRunProgress(AgentRunProgressEvent evt);
}

public static class OfficeHubNotificationExtensions
{
    public static async Task NotifyAgentStateChanged(
        this IHubContext<OfficeHub, IOfficeHubClient> hubContext,
        Guid tenantId,
        Guid officeId,
        AgentStateChangedEvent evt)
    {
        var groupName = $"office-{tenantId}-{officeId}";
        await hubContext.Clients.Group(groupName).AgentStateChanged(evt);
    }

    public static async Task NotifyTaskStatusChanged(
        this IHubContext<OfficeHub, IOfficeHubClient> hubContext,
        Guid tenantId,
        Guid officeId,
        TaskStatusChangedEvent evt)
    {
        var groupName = $"office-{tenantId}-{officeId}";
        await hubContext.Clients.Group(groupName).TaskStatusChanged(evt);
    }

    public static async Task NotifyNewNotification(
        this IHubContext<OfficeHub, IOfficeHubClient> hubContext,
        Guid tenantId,
        Guid officeId,
        NewNotificationEvent evt)
    {
        var groupName = $"office-{tenantId}-{officeId}";
        await hubContext.Clients.Group(groupName).NewNotification(evt);
    }

    public static async Task NotifyOutputReady(
        this IHubContext<OfficeHub, IOfficeHubClient> hubContext,
        Guid tenantId,
        Guid officeId,
        OutputReadyEvent evt)
    {
        var groupName = $"office-{tenantId}-{officeId}";
        await hubContext.Clients.Group(groupName).OutputReady(evt);
    }

    public static async Task NotifyBriefDecomposed(
        this IHubContext<OfficeHub, IOfficeHubClient> hubContext,
        Guid tenantId,
        Guid officeId,
        BriefDecomposedEvent evt)
    {
        var groupName = $"office-{tenantId}-{officeId}";
        await hubContext.Clients.Group(groupName).BriefDecomposed(evt);
    }

    public static async Task NotifyAgentRunProgress(
        this IHubContext<OfficeHub, IOfficeHubClient> hubContext,
        Guid tenantId,
        Guid officeId,
        AgentRunProgressEvent evt)
    {
        var groupName = $"office-{tenantId}-{officeId}";
        await hubContext.Clients.Group(groupName).AgentRunProgress(evt);
    }
}
