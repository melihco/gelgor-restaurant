using Nexus.Domain.Common;

namespace Nexus.Domain.Entities;

public class PackageDefinition : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public decimal MonthlyPrice { get; set; }
    public decimal YearlyPrice { get; set; }
    public int TaskLimitPerMonth { get; set; }
    public string IncludedAgentTypes { get; set; } = "[]";
    public string Features { get; set; } = "[]";
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsPopular { get; set; }

    public ICollection<TenantSubscription> Subscriptions { get; set; } = new List<TenantSubscription>();
}
