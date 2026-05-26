using Nexus.Domain.Common;
using Nexus.Domain.Enums;

namespace Nexus.Domain.Entities;

public class SubscriptionAgent : BaseEntity
{
    public Guid SubscriptionId { get; set; }
    public AgentType AgentType { get; set; }
    public bool IsIncluded { get; set; }
    public bool IsAddOn { get; set; }
    public decimal MonthlyPrice { get; set; }

    public TenantSubscription? Subscription { get; set; }
}
