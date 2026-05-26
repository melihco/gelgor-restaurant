using Nexus.Domain.Common;
using Nexus.Domain.Enums;

namespace Nexus.Domain.Entities;

public class ProviderAccountMapping : TenantEntity
{
    public Guid IntegrationConnectionId { get; set; }
    public AgentType AgentType { get; set; }
    public bool IsActive { get; set; } = true;

    public IntegrationConnection? IntegrationConnection { get; set; }
}
