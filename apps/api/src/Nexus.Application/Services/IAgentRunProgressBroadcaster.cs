using Nexus.Contracts.Events;

namespace Nexus.Application.Services;

public interface IAgentRunProgressBroadcaster
{
    ValueTask BroadcastAsync(
        Guid tenantId,
        Guid officeId,
        AgentRunProgressEvent evt,
        CancellationToken cancellationToken = default);
}
