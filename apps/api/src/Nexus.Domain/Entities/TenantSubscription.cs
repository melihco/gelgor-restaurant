using Nexus.Domain.Common;
using Nexus.Domain.Enums;

namespace Nexus.Domain.Entities;

public class TenantSubscription : TenantEntity
{
    public Guid PackageId { get; set; }
    public SubscriptionStatus Status { get; set; } = SubscriptionStatus.Trial;
    public DateTime CurrentPeriodStart { get; set; }
    public DateTime CurrentPeriodEnd { get; set; }
    public int TasksUsedThisPeriod { get; set; }
    public string ExternalSubscriptionId { get; set; } = string.Empty;

    public PackageDefinition? Package { get; set; }
    public ICollection<SubscriptionAgent> AddOnAgents { get; set; } = new List<SubscriptionAgent>();
}
