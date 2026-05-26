using Microsoft.AspNetCore.SignalR;
using Nexus.Api.Hubs;
using Nexus.Application.Services;
using Nexus.Contracts.Events;

namespace Nexus.Api.Services;

public sealed class OfficeHubAgentRunProgressBroadcaster : IAgentRunProgressBroadcaster
{
    private readonly IHubContext<OfficeHub, IOfficeHubClient> _hubContext;

    public OfficeHubAgentRunProgressBroadcaster(IHubContext<OfficeHub, IOfficeHubClient> hubContext)
    {
        _hubContext = hubContext;
    }

    public ValueTask BroadcastAsync(
        Guid tenantId,
        Guid officeId,
        AgentRunProgressEvent evt,
        CancellationToken cancellationToken = default)
    {
        return new ValueTask(_hubContext.NotifyAgentRunProgress(tenantId, officeId, evt));
    }
}
